"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import ZoomableChart from "@/components/charts/ZoomableChart";
import { formatDisplayDate } from "@/lib/dateDisplay";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Athlete = { id: string; first_name: string | null; last_name: string | null };
type Team = { id: string; name: string; sport: string | null };
type SessionRow = {
  id: string;
  athlete_id: string;
  created_at: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type: string | null;
};
type MetricRow = { session_id: string; key: string; value: number };
type ReportRow = {
  date: string;
  rawDate: string;
  topSpeed: number | null;
  totalTime: number | null;
  split5m: number | null;
  maxAcceleration: number | null;
  peakForce: number | null;
  peakPower: number | null;
};

type ViewMode = "individual" | "team" | "benchmark";

const TEAM_COLORS = [
  "#a3e635",
  "#60a5fa",
  "#f97316",
  "#34d399",
  "#f472b6",
  "#facc15",
  "#818cf8",
  "#fb7185",
];

const METRIC_DB_KEYS: Record<string, string> = {
  topSpeed: "top_speed",
  totalTime: "total_time",
  split5m: "split_5m_time",
  maxAcceleration: "accel_max",
};

function fmtDate(iso: string) {
  return formatDisplayDate(iso);
}
function athleteName(a: Athlete) {
  return `${a.last_name ?? ""}, ${a.first_name ?? ""}`.trim().replace(/^,\s*/, "");
}
function fmt(v: number | null, decimals = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(decimals);
}
function isSprintType(t: string | null) {
  if (!t) return false;
  return t === "1080_sprint" || t.startsWith("1080") || t.includes("sprint");
}

/** Sub-types to exclude — non-sprint protocols with no meaningful sprint metrics. */
function isLinearSubType(sub: string | null): boolean {
  if (!sub) return true;
  const s = sub.toLowerCase();
  if (s.includes("broad jump") || s.includes("unilat foot") || s.includes("jump - power")) return false;
  if (s.includes("single leg hop") || s.includes("triple hop")) return false;
  return true;
}

function parseSport(raw: string | null): { sport: string; level: string } {
  if (!raw) return { sport: "Unknown", level: "Unknown" };
  const match = raw.match(/^(.+?)\s*\((.+?)\)$/);
  if (match) return { sport: match[1].trim(), level: match[2].trim() };
  return { sport: raw.trim(), level: "Unknown" };
}

/** Keys where the best rep = minimum value (times). */
const MIN_KEYS = new Set(["total_time", "split_5m_time", "split_1m_time", "split_2m_time", "split_3m_time", "split_4m_time"]);

function sessionMetricsMap(
  sessionId: string,
  metricRows: MetricRow[]
): Record<string, number> {
  const mm: Record<string, number[]> = {};
  for (const m of metricRows) {
    if (m.session_id !== sessionId) continue;
    if (!mm[m.key]) mm[m.key] = [];
    mm[m.key]!.push(Number(m.value));
  }
  const out: Record<string, number> = {};
  for (const [key, vals] of Object.entries(mm)) {
    const finite = vals.filter(Number.isFinite);
    if (!finite.length) continue;
    out[key] = MIN_KEYS.has(key)
      ? Math.min(...finite)
      : Math.max(...finite);
  }
  return out;
}

function reportRowFromSession(s: SessionRow, mm: Record<string, number>): ReportRow {
  return {
    date: fmtDate(s.session_date ?? s.created_at),
    rawDate: s.session_date ?? s.created_at,
    topSpeed: mm.top_speed ?? null,
    totalTime: mm.total_time ?? null,
    split5m: mm.split_5m_time ?? null,
    maxAcceleration: mm.accel_max ?? null,
    peakForce: mm.peak_force ?? null,
    peakPower: mm.peak_power ?? null,
  };
}

function latestReportRow(
  athleteSessions: SessionRow[],
  athleteMetrics: MetricRow[]
): ReportRow | null {
  if (athleteSessions.length === 0) return null;
  const sorted = [...athleteSessions].sort((a, b) => {
    const da = a.session_date ?? a.created_at;
    const db = b.session_date ?? b.created_at;
    return da.localeCompare(db);
  });
  const latest = sorted[sorted.length - 1]!;
  const mm = sessionMetricsMap(latest.id, athleteMetrics);
  return reportRowFromSession(latest, mm);
}

const METRIC_CONFIG = [
  { key: "topSpeed", label: "Top Speed (m/s)", color: "#a3e635" },
  { key: "totalTime", label: "Total Time (s)", color: "#f97316" },
  { key: "split5m", label: "0–5 m Time (s)", color: "#60a5fa" },
  { key: "maxAcceleration", label: "Max Accel (m/s²)", color: "#34d399" },
];

export default function SprintReportPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [memberships, setMemberships] = useState<{ athlete_id: string; team_id: string }[]>(
    []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    new Set(METRIC_CONFIG.map((m) => m.key))
  );

  const [viewMode, setViewMode] = useState<ViewMode>("individual");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const [benchmarkSport, setBenchmarkSport] = useState<string | null>(null);
  const [benchmarkLevel, setBenchmarkLevel] = useState<string | null>(null);
  const [teamSessions, setTeamSessions] = useState<Record<string, SessionRow[]>>({});
  const [teamMetrics, setTeamMetrics] = useState<Record<string, MetricRow[]>>({});
  const [teamLoading, setTeamLoading] = useState(false);

  useEffect(() => {
    async function loadBase() {
      const [{ data: athleteData }, { data: teamsData }, { data: memberData }] =
        await Promise.all([
          supabase
            .from("athletes")
            .select("id, first_name, last_name")
            .order("last_name", { ascending: true }),
          supabase.from("teams").select("id, name, sport").order("name"),
          supabase.from("athlete_teams").select("athlete_id, team_id"),
        ]);
      const list = (athleteData ?? []) as Athlete[];
      setAthletes(list);
      setTeams((teamsData ?? []) as Team[]);
      setMemberships((memberData ?? []) as { athlete_id: string; team_id: string }[]);
      if (list.length > 0) setSelectedId(list[0].id);
    }
    void loadBase();
  }, []);

  const athleteTeamMap = useMemo(() => {
    const map = new Map<string, Team | null>();
    for (const a of athletes) {
      const m = memberships.find((x) => x.athlete_id === a.id);
      map.set(a.id, m ? (teams.find((t) => t.id === m.team_id) ?? null) : null);
    }
    return map;
  }, [athletes, teams, memberships]);

  const sportLevels = useMemo(() => {
    const seen = new Set<string>();
    const out: { sport: string; level: string; label: string }[] = [];
    for (const t of teams) {
      const { sport, level } = parseSport(t.sport);
      const key = `${sport}||${level}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ sport, level, label: `${sport} — ${level}` });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [teams]);

  const athleteColors = useMemo(() => {
    const map = new Map<string, string>();
    athletes.forEach((a, i) => map.set(a.id, TEAM_COLORS[i % TEAM_COLORS.length]!));
    return map;
  }, [athletes]);

  const benchmarkAthleteIds = useMemo(() => {
    return athletes
      .filter((a) => {
        const team = athleteTeamMap.get(a.id);
        if (!team) return false;
        const { sport, level } = parseSport(team.sport);
        if (benchmarkSport && sport !== benchmarkSport) return false;
        if (benchmarkLevel && level !== benchmarkLevel) return false;
        return true;
      })
      .map((a) => a.id);
  }, [athletes, athleteTeamMap, benchmarkSport, benchmarkLevel]);

  const loadAthletesSprintData = useCallback(async (athleteIds: string[]) => {
    setTeamLoading(true);
    const newSessions: Record<string, SessionRow[]> = {};
    const newMetrics: Record<string, MetricRow[]> = {};

    await Promise.all(
      athleteIds.map(async (aid) => {
        const { data: sessData } = await supabase
          .from("sessions")
          .select("id, athlete_id, created_at, session_date, test_type, test_sub_type")
          .eq("athlete_id", aid)
          .order("session_date", { ascending: true });
        const sprintSessions = ((sessData ?? []) as SessionRow[]).filter(
          (s) => isSprintType(s.test_type) && isLinearSubType(s.test_sub_type)
        );
        newSessions[aid] = sprintSessions;
        if (sprintSessions.length > 0) {
          const ids = sprintSessions.map((s) => s.id);
          const { data: mData } = await supabase
            .from("metrics")
            .select("session_id, key, value")
            .in("session_id", ids);
          newMetrics[aid] = (mData ?? []) as MetricRow[];
        } else {
          newMetrics[aid] = [];
        }
      })
    );

    setTeamSessions(newSessions);
    setTeamMetrics(newMetrics);
    setTeamLoading(false);
  }, []);

  const loadTeamData = useCallback(
    async (teamId: string) => {
      const teamAthletes = athletes.filter((a) => athleteTeamMap.get(a.id)?.id === teamId);
      await loadAthletesSprintData(teamAthletes.map((a) => a.id));
    },
    [athletes, athleteTeamMap, loadAthletesSprintData]
  );

  useEffect(() => {
    if (!selectedId || viewMode !== "individual") return;
    setLoading(true);
    async function load() {
      const { data: sessData } = await supabase
        .from("sessions")
        .select("id, athlete_id, created_at, session_date, test_type, test_sub_type")
        .eq("athlete_id", selectedId)
        .order("session_date", { ascending: true });
      const sprintSessions = ((sessData ?? []) as SessionRow[]).filter(
        (s) => isSprintType(s.test_type) && isLinearSubType(s.test_sub_type)
      );
      setSessions(sprintSessions);
      if (!sprintSessions.length) {
        setMetrics([]);
        setLoading(false);
        return;
      }
      const ids = sprintSessions.map((s) => s.id);
      const { data: mData } = await supabase
        .from("metrics")
        .select("session_id, key, value")
        .in("session_id", ids);
      setMetrics((mData ?? []) as MetricRow[]);
      setLoading(false);
    }
    void load();
  }, [selectedId, viewMode]);

  useEffect(() => {
    if (viewMode !== "benchmark" || benchmarkAthleteIds.length === 0) {
      if (viewMode === "benchmark") {
        setTeamSessions({});
        setTeamMetrics({});
      }
      return;
    }
    void loadAthletesSprintData(benchmarkAthleteIds);
  }, [viewMode, benchmarkAthleteIds, loadAthletesSprintData]);

  const reportRows = useMemo<ReportRow[]>(() => {
    // Collapse multiple sessions on the same date to one row (best values per metric)
    const byDate = new Map<string, ReportRow>();
    const chronological = [...sessions].sort((a, b) =>
      (a.session_date ?? a.created_at).localeCompare(b.session_date ?? b.created_at)
    );
    for (const s of chronological) {
      const d = (s.session_date ?? s.created_at).slice(0, 10);
      const m = sessionMetricsMap(s.id, metrics);
      const row = reportRowFromSession(s, m);
      const existing = byDate.get(d);
      if (!existing) {
        byDate.set(d, row);
      } else {
        // Merge: take best value per metric
        byDate.set(d, {
          ...existing,
          topSpeed: best(existing.topSpeed, row.topSpeed, false),
          totalTime: best(existing.totalTime, row.totalTime, true),
          split5m: best(existing.split5m, row.split5m, true),
          maxAcceleration: best(existing.maxAcceleration, row.maxAcceleration, false),
          peakForce: best(existing.peakForce, row.peakForce, false),
          peakPower: best(existing.peakPower, row.peakPower, false),
        });
      }
    }
    return [...byDate.values()];
  }, [sessions, metrics]);

  function best(
    a: number | null,
    b: number | null,
    lowerIsBetter: boolean
  ): number | null {
    if (a == null) return b;
    if (b == null) return a;
    return lowerIsBetter ? Math.min(a, b) : Math.max(a, b);
  }

  const avg = useMemo(() => {
    const cols = [
      "topSpeed",
      "totalTime",
      "split5m",
      "maxAcceleration",
      "peakForce",
      "peakPower",
    ] as (keyof ReportRow)[];
    const r: Record<string, number | null> = {};
    for (const c of cols) {
      const vals = reportRows
        .map((row) => row[c] as number | null)
        .filter((v): v is number => v != null);
      r[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return r;
  }, [reportRows]);

  const teamAthletes = useMemo(() => {
    if (!selectedTeamId) return [];
    return athletes.filter((a) => athleteTeamMap.get(a.id)?.id === selectedTeamId);
  }, [athletes, athleteTeamMap, selectedTeamId]);

  const teamChartData = useMemo(() => {
    if (viewMode !== "team" || !selectedTeamId) return [];
    const allDates = new Set<string>();
    for (const a of teamAthletes) {
      for (const s of teamSessions[a.id] ?? []) {
        if (s.session_date) allDates.add(s.session_date.slice(0, 10));
      }
    }
    const sortedDates = [...allDates].sort();
    return sortedDates.map((date) => {
      const point: Record<string, string | number | null> = { date: fmtDate(`${date}T12:00:00`) };
      for (const a of teamAthletes) {
        const sess = (teamSessions[a.id] ?? []).find(
          (s) => s.session_date?.slice(0, 10) === date
        );
        if (sess) {
          const mm = sessionMetricsMap(sess.id, teamMetrics[a.id] ?? []);
          point[`topSpeed_${a.id}`] = mm.top_speed ?? null;
          point[`totalTime_${a.id}`] = mm.total_time ?? null;
          point[`split5m_${a.id}`] = mm.split_5m_time ?? null;
          point[`maxAcceleration_${a.id}`] = mm.accel_max ?? null;
        }
      }
      return point;
    });
  }, [viewMode, selectedTeamId, teamAthletes, teamSessions, teamMetrics]);

  const benchmarkChartData = useMemo(() => {
    if (viewMode !== "benchmark" || benchmarkAthleteIds.length === 0) return [];
    const allDates = new Set<string>();
    for (const aid of benchmarkAthleteIds) {
      for (const s of teamSessions[aid] ?? []) {
        if (s.session_date) allDates.add(s.session_date.slice(0, 10));
      }
    }
    const sortedDates = [...allDates].sort();
    const active = METRIC_CONFIG.filter((m) => activeMetrics.has(m.key));

    return sortedDates.map((date) => {
      const point: Record<string, string | number | null> = { date: fmtDate(`${date}T12:00:00`) };
      for (const metric of active) {
        const values: number[] = [];
        for (const aid of benchmarkAthleteIds) {
          const sess = (teamSessions[aid] ?? []).find(
            (s) => s.session_date?.slice(0, 10) === date
          );
          if (sess) {
            const mm = sessionMetricsMap(sess.id, teamMetrics[aid] ?? []);
            const dbKey = METRIC_DB_KEYS[metric.key];
            const v = dbKey ? mm[dbKey] : undefined;
            if (v != null && Number.isFinite(v)) values.push(v);
          }
        }
        point[`${metric.key}_mean`] =
          values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

        if (selectedId && benchmarkAthleteIds.includes(selectedId)) {
          const sess = (teamSessions[selectedId] ?? []).find(
            (s) => s.session_date?.slice(0, 10) === date
          );
          if (sess) {
            const mm = sessionMetricsMap(sess.id, teamMetrics[selectedId] ?? []);
            const dbKey = METRIC_DB_KEYS[metric.key];
            point[`${metric.key}_selected`] = dbKey ? (mm[dbKey] ?? null) : null;
          }
        }
      }
      return point;
    });
  }, [
    viewMode,
    benchmarkAthleteIds,
    teamSessions,
    teamMetrics,
    activeMetrics,
    selectedId,
  ]);

  const benchmarkLatestComparison = useMemo(() => {
    if (viewMode !== "benchmark" || benchmarkAthleteIds.length === 0) return [];
    const active = METRIC_CONFIG.filter((m) => activeMetrics.has(m.key));
    const groupRows: ReportRow[] = [];
    for (const aid of benchmarkAthleteIds) {
      const row = latestReportRow(teamSessions[aid] ?? [], teamMetrics[aid] ?? []);
      if (row) groupRows.push(row);
    }
    const groupAvg: Record<string, number | null> = {};
    for (const m of active) {
      const key = m.key as keyof ReportRow;
      const vals = groupRows
        .map((r) => r[key] as number | null)
        .filter((v): v is number => v != null);
      groupAvg[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    const athleteRow =
      selectedId && benchmarkAthleteIds.includes(selectedId)
        ? latestReportRow(teamSessions[selectedId] ?? [], teamMetrics[selectedId] ?? [])
        : null;

    return active.map((m) => {
      const key = m.key as keyof ReportRow;
      const athleteVal = athleteRow ? (athleteRow[key] as number | null) : null;
      const groupVal = groupAvg[m.key] ?? null;
      let deltaPct: number | null = null;
      if (athleteVal != null && groupVal != null && groupVal !== 0) {
        deltaPct = ((athleteVal - groupVal) / groupVal) * 100;
      }
      const lowerBetter = m.key === "totalTime" || m.key === "split5m";
      let deltaColor = "text-slate-400";
      if (deltaPct != null) {
        const better = lowerBetter ? deltaPct < 0 : deltaPct > 0;
        deltaColor = better ? "text-emerald-400" : "text-red-400";
      }
      return {
        metric: m,
        athleteVal,
        groupVal,
        deltaPct,
        deltaColor,
        dp: m.key === "peakForce" || m.key === "peakPower" ? 0 : 2,
      };
    });
  }, [
    viewMode,
    benchmarkAthleteIds,
    activeMetrics,
    teamSessions,
    teamMetrics,
    selectedId,
  ]);

  function toggleMetric(key: string) {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else next.add(key);
      return next;
    });
  }

  const selectedAthlete = athletes.find((a) => a.id === selectedId);
  const benchmarkLabel = `${benchmarkSport ?? "All sports"} ${benchmarkLevel ?? "levels"}`;

  const metricPills = (
    <div className="flex flex-wrap gap-2">
      {METRIC_CONFIG.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => toggleMetric(m.key)}
          className={`rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-all ${
            activeMetrics.has(m.key)
              ? "border-transparent text-slate-950"
              : "border-slate-800 text-slate-400 hover:border-slate-600"
          }`}
          style={activeMetrics.has(m.key) ? { backgroundColor: m.color } : {}}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <div className="mx-auto max-w-7xl px-4 pt-8 pb-16">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">
            1080 Sprint — longitudinal report
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Individual trends, team overlays, and sport-level benchmarks.
          </p>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <aside className="w-full shrink-0 lg:w-56">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <h2 className="mb-3 px-1 text-xs uppercase tracking-wide text-slate-500">
                Athletes
              </h2>
              <div className="space-y-2">
                {[...teams, null].map((team) => {
                  const teamId = team?.id ?? "__none__";
                  const teamName = team?.name ?? "No team";
                  const teamAthletesList = athletes.filter((a) =>
                    team
                      ? athleteTeamMap.get(a.id)?.id === team.id
                      : !athleteTeamMap.get(a.id)
                  );
                  if (teamAthletesList.length === 0) return null;
                  const isCollapsed = collapsedTeams.has(teamId);

                  return (
                    <div key={teamId}>
                      <div className="flex items-center justify-between gap-1 px-1 py-1">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedTeams((prev) => {
                              const next = new Set(prev);
                              if (isCollapsed) next.delete(teamId);
                              else next.add(teamId);
                              return next;
                            })
                          }
                          className="flex flex-1 items-center gap-1 text-left text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
                        >
                          <span>{isCollapsed ? "▶" : "▼"}</span>
                          <span>{teamName}</span>
                        </button>
                        {team && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTeamId(team.id);
                              setViewMode("team");
                              void loadTeamData(team.id);
                            }}
                            className={`rounded px-1.5 py-0.5 text-[0.65rem] font-medium transition-colors ${
                              viewMode === "team" && selectedTeamId === team.id
                                ? "bg-lime-400/20 text-lime-300 ring-1 ring-lime-400/30"
                                : "text-slate-500 hover:text-lime-300"
                            }`}
                          >
                            Team view
                          </button>
                        )}
                      </div>
                      {!isCollapsed && (
                        <ul className="ml-2 space-y-0.5 border-l border-slate-800 pl-2">
                          {teamAthletesList.map((a) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(a.id);
                                  setViewMode("individual");
                                }}
                                className={`w-full rounded-lg px-2 py-1.5 text-left text-[0.8rem] font-medium transition-colors ${
                                  viewMode === "individual" && selectedId === a.id
                                    ? "bg-lime-400/10 text-lime-200 ring-1 ring-lime-400/30"
                                    : "text-slate-300 hover:bg-slate-800/60"
                                }`}
                              >
                                {athleteName(a)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setViewMode("benchmark")}
                  className={`w-full rounded-lg px-3 py-2 text-left text-[0.8rem] font-medium transition-colors ${
                    viewMode === "benchmark"
                      ? "bg-lime-400/10 text-lime-200 ring-1 ring-lime-400/30"
                      : "text-slate-400 hover:bg-slate-800/60"
                  }`}
                >
                  📊 Sport benchmark
                </button>
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-6">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["individual", "Individual"],
                  ["team", "Team"],
                  ["benchmark", "Benchmark"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === mode
                      ? "border-lime-400/40 bg-lime-400/15 text-lime-300"
                      : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {viewMode === "individual" && (
              <>
                {selectedAthlete && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[0.7rem] uppercase tracking-widest text-slate-500">
                        Viewing
                      </p>
                      <p className="text-lg font-semibold text-slate-50">
                        {selectedAthlete.first_name} {selectedAthlete.last_name}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1 text-[0.72rem] text-slate-300">
                      {reportRows.length} session{reportRows.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <p className="text-sm text-slate-400">Loading…</p>
                  </div>
                ) : reportRows.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-10 text-center">
                    <p className="text-sm text-slate-400">
                      No sprint sessions found for this athlete.
                    </p>
                  </div>
                ) : (
                  <>
                    {metricPills}

                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                      <h2 className="mb-4 text-xs uppercase tracking-wide text-slate-500">
                        Trend over time
                      </h2>
                      <ZoomableChart title="Trend over time" height={300}>
                        {(h) => (
                          <ResponsiveContainer width="100%" height={h}>
                            <LineChart data={reportRows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                              <XAxis
                                dataKey="date"
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                yAxisId="speed"
                                orientation="left"
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                                width={36}
                              />
                              <YAxis
                                yAxisId="time"
                                orientation="right"
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                                width={36}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "#0f172a",
                                  border: "1px solid #1e293b",
                                  borderRadius: 10,
                                  fontSize: 12,
                                  color: "#e2e8f0",
                                }}
                                labelStyle={{ color: "#a3e635", fontWeight: 600 }}
                              />
                              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                              {METRIC_CONFIG.filter((m) => activeMetrics.has(m.key)).map((m) => (
                                <Line
                                  key={m.key}
                                  yAxisId={
                                    m.key === "topSpeed" || m.key === "maxAcceleration"
                                      ? "speed"
                                      : "time"
                                  }
                                  type="monotone"
                                  dataKey={m.key}
                                  name={m.label}
                                  stroke={m.color}
                                  strokeWidth={2}
                                  dot={{ fill: m.color, r: 4 }}
                                  activeDot={{ r: 6 }}
                                  connectNulls
                                />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </ZoomableChart>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                      <table className="min-w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
                            <th className="py-3 pl-5 pr-4 font-medium">Date</th>
                            <th className="py-3 px-4 font-medium">Top Speed (m/s)</th>
                            <th className="py-3 px-4 font-medium">Total Time (s)</th>
                            <th className="py-3 px-4 font-medium">0–5 m Time (s)</th>
                            <th className="py-3 px-4 font-medium">Max Accel (m/s²)</th>
                            <th className="py-3 px-4 font-medium">Peak Force (N)</th>
                            <th className="py-3 pr-5 pl-4 font-medium">Peak Power (W)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {reportRows.map((row, i) => (
                            <tr key={i} className="transition-colors hover:bg-slate-800/40">
                              <td className="py-3 pl-5 pr-4 text-xs font-medium text-slate-200">
                                {row.date}
                              </td>
                              <MC value={row.topSpeed} avg={avg.topSpeed} lb={false} dp={2} />
                              <MC value={row.totalTime} avg={avg.totalTime} lb={true} dp={2} />
                              <MC value={row.split5m} avg={avg.split5m} lb={true} dp={2} />
                              <MC
                                value={row.maxAcceleration}
                                avg={avg.maxAcceleration}
                                lb={false}
                                dp={2}
                              />
                              <MC value={row.peakForce} avg={avg.peakForce} lb={false} dp={0} />
                              <MC value={row.peakPower} avg={avg.peakPower} lb={false} dp={0} />
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-700 bg-slate-900/60 text-[0.72rem] font-semibold text-slate-300">
                            <td className="py-3 pl-5 pr-4 text-slate-400">Average</td>
                            <td className="py-3 px-4 text-lime-300">{fmt(avg.topSpeed)}</td>
                            <td className="py-3 px-4">{fmt(avg.totalTime)}</td>
                            <td className="py-3 px-4">{fmt(avg.split5m)}</td>
                            <td className="py-3 px-4">{fmt(avg.maxAcceleration)}</td>
                            <td className="py-3 px-4">{fmt(avg.peakForce, 0)}</td>
                            <td className="py-3 pr-5 pl-4">{fmt(avg.peakPower, 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-[0.68rem] text-slate-500">
                      <span className="mr-2 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">
                        Green
                      </span>
                      better than average ·{" "}
                      <span className="mr-2 inline-block rounded bg-red-500/15 px-1.5 py-0.5 text-red-400">
                        Red
                      </span>
                      below average
                    </p>
                  </>
                )}
              </>
            )}

            {viewMode === "team" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-widest text-slate-500">
                      Team view
                    </p>
                    <p className="text-lg font-semibold text-slate-50">
                      {teams.find((t) => t.id === selectedTeamId)?.name ?? "—"}
                    </p>
                  </div>
                </div>

                {!selectedTeamId ? (
                  <p className="text-sm text-slate-500">
                    Select a team from the sidebar to view team trends.
                  </p>
                ) : teamLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <p className="text-sm text-slate-400">Loading team data…</p>
                  </div>
                ) : (
                  <>
                    {metricPills}

                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                      <h2 className="mb-4 text-xs uppercase tracking-wide text-slate-500">
                        Team — longitudinal
                      </h2>
                      {teamChartData.length === 0 ? (
                        <p className="py-12 text-center text-sm text-slate-500">
                          No sprint sessions for this team.
                        </p>
                      ) : (
                        <ZoomableChart title="Team — longitudinal" height={300}>
                          {(h) => (
                            <ResponsiveContainer width="100%" height={h}>
                              <LineChart
                                data={teamChartData}
                                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                  dataKey="date"
                                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis
                                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                                  axisLine={false}
                                  tickLine={false}
                                  width={36}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#0f172a",
                                    border: "1px solid #1e293b",
                                    borderRadius: 10,
                                    fontSize: 12,
                                  }}
                                  labelStyle={{ color: "#a3e635", fontWeight: 600 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                {METRIC_CONFIG.filter((m) => activeMetrics.has(m.key)).flatMap(
                                  (metric) =>
                                    teamAthletes.map((a) => (
                                      <Line
                                        key={`${metric.key}_${a.id}`}
                                        type="monotone"
                                        dataKey={`${metric.key}_${a.id}`}
                                        name={`${athleteName(a)} — ${metric.label}`}
                                        stroke={athleteColors.get(a.id) ?? "#a3e635"}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                        connectNulls
                                      />
                                    ))
                                )}
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </ZoomableChart>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                      <table className="min-w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
                            <th className="py-3 pl-5 pr-4 font-medium">Athlete</th>
                            {METRIC_CONFIG.filter((m) => activeMetrics.has(m.key)).map((m) => (
                              <th key={m.key} className="py-3 px-4 font-medium">
                                {m.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {teamAthletes.map((a) => {
                            const row = latestReportRow(
                              teamSessions[a.id] ?? [],
                              teamMetrics[a.id] ?? []
                            );
                            return (
                              <tr key={a.id} className="hover:bg-slate-800/40">
                                <td className="py-3 pl-5 pr-4 text-xs font-medium text-slate-200">
                                  {athleteName(a)}
                                </td>
                                {METRIC_CONFIG.filter((m) => activeMetrics.has(m.key)).map(
                                  (m) => (
                                    <td
                                      key={m.key}
                                      className="py-3 px-4 text-xs tabular-nums text-slate-200"
                                    >
                                      {row
                                        ? fmt(row[m.key as keyof ReportRow] as number | null, 2)
                                        : "—"}
                                    </td>
                                  )
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {viewMode === "benchmark" && (
              <>
                <div>
                  <p className="text-[0.7rem] uppercase tracking-widest text-slate-500">
                    Sport benchmark
                  </p>
                  <p className="text-lg font-semibold text-slate-50">Group comparison</p>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-[0.7rem] uppercase text-slate-500">Sport</label>
                    <select
                      value={benchmarkSport ?? ""}
                      onChange={(e) => setBenchmarkSport(e.target.value || null)}
                      className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">All sports</option>
                      {[...new Set(sportLevels.map((s) => s.sport))].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.7rem] uppercase text-slate-500">Level</label>
                    <select
                      value={benchmarkLevel ?? ""}
                      onChange={(e) => setBenchmarkLevel(e.target.value || null)}
                      className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">All levels</option>
                      {[...new Set(sportLevels.map((s) => s.level))].map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.7rem] uppercase text-slate-500">Athlete</label>
                    <select
                      value={selectedId ?? ""}
                      onChange={(e) => setSelectedId(e.target.value || null)}
                      className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">None (group average only)</option>
                      {athletes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {athleteName(a)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {teamLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <p className="text-sm text-slate-400">Loading benchmark data…</p>
                  </div>
                ) : benchmarkAthleteIds.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No athletes match the selected sport and level filters.
                  </p>
                ) : (
                  <>
                    {metricPills}

                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                      <h2 className="mb-4 text-xs uppercase tracking-wide text-slate-500">
                        Benchmark — longitudinal
                      </h2>
                      {benchmarkChartData.length === 0 ? (
                        <p className="py-12 text-center text-sm text-slate-500">
                          No sprint sessions in this benchmark group.
                        </p>
                      ) : (
                        <ZoomableChart title="Benchmark — longitudinal" height={300}>
                          {(h) => (
                            <ResponsiveContainer width="100%" height={h}>
                              <LineChart
                                data={benchmarkChartData}
                                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                  dataKey="date"
                                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis
                                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                                  axisLine={false}
                                  tickLine={false}
                                  width={36}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#0f172a",
                                    border: "1px solid #1e293b",
                                    borderRadius: 10,
                                    fontSize: 12,
                                  }}
                                  labelStyle={{ color: "#a3e635", fontWeight: 600 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                {METRIC_CONFIG.filter((m) => activeMetrics.has(m.key)).flatMap(
                                  (metric) => {
                                    const lines = [
                                      <Line
                                        key={`${metric.key}_mean`}
                                        type="monotone"
                                        dataKey={`${metric.key}_mean`}
                                        name={`${metric.label} — ${benchmarkLabel.trim()} avg`}
                                        stroke="#94a3b8"
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        dot={false}
                                        connectNulls
                                      />,
                                    ];
                                    if (selectedId && benchmarkAthleteIds.includes(selectedId)) {
                                      lines.push(
                                        <Line
                                          key={`${metric.key}_selected`}
                                          type="monotone"
                                          dataKey={`${metric.key}_selected`}
                                          name={`${metric.label} — ${athleteName(
                                            athletes.find((a) => a.id === selectedId)!
                                          )}`}
                                          stroke={athleteColors.get(selectedId) ?? "#a3e635"}
                                          strokeWidth={2}
                                          dot={{ r: 3 }}
                                          connectNulls
                                        />
                                      );
                                    }
                                    return lines;
                                  }
                                )}
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </ZoomableChart>
                      )}
                    </div>

                    {selectedId && benchmarkAthleteIds.includes(selectedId) && (
                      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                        <table className="min-w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
                              <th className="py-3 pl-5 pr-4 font-medium">Metric</th>
                              <th className="py-3 px-4 font-medium">Athlete (latest)</th>
                              <th className="py-3 px-4 font-medium">Group avg</th>
                              <th className="py-3 pr-5 pl-4 font-medium">Delta %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {benchmarkLatestComparison.map((row) => (
                              <tr key={row.metric.key}>
                                <td className="py-3 pl-5 pr-4 text-xs text-slate-300">
                                  {row.metric.label}
                                </td>
                                <td className="py-3 px-4 text-xs tabular-nums text-lime-300">
                                  {fmt(row.athleteVal, row.dp)}
                                </td>
                                <td className="py-3 px-4 text-xs tabular-nums text-slate-200">
                                  {fmt(row.groupVal, row.dp)}
                                </td>
                                <td
                                  className={`py-3 pr-5 pl-4 text-xs tabular-nums font-medium ${row.deltaColor}`}
                                >
                                  {row.deltaPct != null
                                    ? `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct.toFixed(1)}%`
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function MC({
  value,
  avg,
  lb,
  dp,
}: {
  value: number | null;
  avg: number | null | undefined;
  lb: boolean;
  dp: number;
}) {
  if (value == null || Number.isNaN(value))
    return <td className="py-3 px-4 text-xs text-slate-400">—</td>;
  let color = "text-slate-200";
  if (avg != null && !Number.isNaN(avg) && avg !== 0) {
    if (lb ? value < avg : value > avg) color = "text-emerald-400";
    else if (lb ? value > avg : value < avg) color = "text-red-400";
  }
  return (
    <td className={`py-3 px-4 text-xs tabular-nums font-medium ${color}`}>{value.toFixed(dp)}</td>
  );
}
