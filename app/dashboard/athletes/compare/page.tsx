"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AthleteCompareChartPanel, {
  type AthleteRawBundle,
} from "@/components/athletes/AthleteCompareChartPanel";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import {
  computeBestInRangeData,
  type BestInRangeData,
  type BestRow,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import { buildAthleteVsAthleteSections } from "@/lib/athleteVsAthleteComparison";
import { normalizeReportMetricRow } from "@/lib/metricKeyNormalise";
import { supabase } from "@/lib/supabaseClient";

type AthleteOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type TeamOption = {
  id: string;
  name: string;
};

type InjuryRow = {
  id: string;
  athlete_id: string;
  body_region: string | null;
  date_injured: string | null;
  date_rtp: string | null;
};

type CompareMode = "aa" | "at" | "tt";

const LINEAR_METRIC_ORDER = ["Top Speed", "Peak Force", "Peak Power", "5m Split"] as const;
const CMJ_METRIC_ORDER = [
  "Jump Height",
  "Propulsive Impulse",
  "Braking Impulse",
  "Peak Propulsive Force",
  "Peak Braking Force",
  "mRSI",
] as const;
const DJ_METRIC_ORDER = ["RSI", "Jump Height", "Contact Time"] as const;

function displayName(a: Pick<AthleteOption, "first_name" | "last_name">): string {
  const n = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  return n || "Athlete";
}

function regionKey(r: string | null | undefined): string {
  return (r ?? "").trim().toLowerCase();
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function unionWindowsForRegion(injuries: InjuryRow[], regionNorm: string): { start: string; end: string }[] {
  return injuries
    .filter((i) => regionKey(i.body_region) === regionNorm && i.date_injured)
    .map((i) => ({
      start: i.date_injured!.slice(0, 10),
      end: (i.date_rtp ?? todayYmd()).slice(0, 10),
    }));
}

function sessionInAnyWindow(sessionDate: string | null, windows: { start: string; end: string }[]): boolean {
  if (!sessionDate || windows.length === 0) return false;
  const d = sessionDate.slice(0, 10);
  return windows.some((w) => d >= w.start && d <= w.end);
}

function commonBodyRegionLabels(injA: InjuryRow[], injB: InjuryRow[]): string[] {
  const keysB = new Set(injB.map((i) => regionKey(i.body_region)).filter(Boolean));
  const map = new Map<string, string>();
  for (const i of injA) {
    const k = regionKey(i.body_region);
    if (!k || !keysB.has(k)) continue;
    if (!map.has(k)) map.set(k, (i.body_region ?? "").trim());
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

/** Mirrors parsing in athleteVsAthleteComparison for delta math on aggregated strings. */
function parseNumericFromBestDisplay(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!t || t === "—") return null;
  const m = t.match(/-?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function meanNullable(nums: number[]): number | null {
  const f = nums.filter((n) => n != null && Number.isFinite(n));
  if (f.length === 0) return null;
  return f.reduce((a, b) => a + b, 0) / f.length;
}

function formatTeamLinear(metric: string, mean: number): string {
  if (metric === "Top Speed") return `${mean.toFixed(2)} m/s (avg)`;
  if (metric === "Peak Force") return `${Math.round(mean)} N (avg)`;
  if (metric === "Peak Power") return `${Math.round(mean)} W (avg)`;
  if (metric === "5m Split") return `${mean.toFixed(2)} s (avg)`;
  return `${mean.toFixed(2)} (avg)`;
}

function formatTeamCmj(metric: string, mean: number): string {
  if (metric === "Jump Height") return `${mean.toFixed(1)} cm (avg)`;
  if (metric === "Propulsive Impulse" || metric === "Braking Impulse") return `${mean.toFixed(1)} N·s (avg)`;
  if (metric === "Peak Propulsive Force" || metric === "Peak Braking Force") return `${Math.round(mean)} N (avg)`;
  if (metric === "mRSI") return `${mean.toFixed(3)} (avg)`;
  return `${mean.toFixed(2)} (avg)`;
}

function formatTeamDj(metric: string, mean: number): string {
  if (metric === "RSI") return `${mean.toFixed(3)} (avg)`;
  if (metric === "Jump Height") return `${mean.toFixed(1)} cm (avg)`;
  if (metric === "Contact Time") return `${mean.toFixed(1)} ms (avg)`;
  return `${mean.toFixed(2)} (avg)`;
}

function collectMetricMeans(rowsPerAthlete: BestRow[][]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const rows of rowsPerAthlete) {
    for (const r of rows) {
      const n = parseNumericFromBestDisplay(r.best);
      if (n == null) continue;
      const arr = map.get(r.metric) ?? [];
      arr.push(n);
      map.set(r.metric, arr);
    }
  }
  return map;
}

function aggregateBestRows(
  sources: BestInRangeData[],
  key: "linear" | "cmj" | "dj",
  order: readonly string[],
  fmt: (metric: string, mean: number) => string
): BestRow[] {
  const rowsPerAthlete = sources.map((s) => s[key]);
  const means = collectMetricMeans(rowsPerAthlete);
  const out: BestRow[] = [];
  for (const metric of order) {
    const vals = means.get(metric);
    const m = vals?.length ? meanNullable(vals) : null;
    if (m == null) continue;
    out.push({ metric, best: fmt(metric, m), date: "—" });
  }
  return out;
}

function aggregateHopRows(sources: BestInRangeData[]): { test: string; best: string; date: string }[] {
  const rowsPerAthlete = sources.map((s) => s.hop);
  const byTest = new Map<string, number[]>();
  for (const rows of rowsPerAthlete) {
    for (const r of rows) {
      const n = parseNumericFromBestDisplay(r.best);
      if (n == null) continue;
      const arr = byTest.get(r.test) ?? [];
      arr.push(n);
      byTest.set(r.test, arr);
    }
  }
  const out: { test: string; best: string; date: string }[] = [];
  for (const [test, vals] of byTest) {
    const m = meanNullable(vals);
    if (m == null) continue;
    out.push({ test, best: `${m.toFixed(1)}% (avg)`, date: "—" });
  }
  out.sort((a, b) => a.test.localeCompare(b.test));
  return out;
}

function aggregateBestInRangeData(sources: BestInRangeData[]): BestInRangeData {
  if (sources.length === 0) return { linear: [], cmj: [], dj: [], hop: [] };
  const hasCmj = sources.some((s) => s.cmj.length > 0);
  const hasDj = sources.some((s) => s.dj.length > 0);
  return {
    linear: aggregateBestRows(sources, "linear", LINEAR_METRIC_ORDER, formatTeamLinear),
    cmj: hasCmj ? aggregateBestRows(sources, "cmj", CMJ_METRIC_ORDER, formatTeamCmj) : [],
    dj: hasDj ? aggregateBestRows(sources, "dj", DJ_METRIC_ORDER, formatTeamDj) : [],
    hop: aggregateHopRows(sources),
  };
}

async function fetchMetricsMap(sessionIds: string[]): Promise<Map<string, ReportMetricRow[]>> {
  const map = new Map<string, ReportMetricRow[]>();
  if (sessionIds.length === 0) return map;
  const { data: mrows, error } = await supabase
    .from("metrics")
    .select("session_id, key, value, rep_index, side")
    .in("session_id", sessionIds);
  if (error) throw new Error(error.message);
  for (const row of (mrows ?? []) as ReportMetricRow[]) {
    const list = map.get(row.session_id) ?? [];
    list.push(normalizeReportMetricRow(row));
    map.set(row.session_id, list);
  }
  return map;
}

async function loadAthleteRawBundle(
  athleteId: string,
  injuryCtx: { injuries: InjuryRow[]; region: string } | null
): Promise<AthleteRawBundle> {
  const sessRes = await supabase
    .from("sessions")
    .select("id, session_date, test_type, test_sub_type, source, lr_starting_leg")
    .eq("athlete_id", athleteId)
    .order("session_date", { ascending: true });
  if (sessRes.error) throw new Error(sessRes.error.message);
  let sessions = (sessRes.data ?? []) as ReportSessionRow[];
  if (injuryCtx) {
    const rk = regionKey(injuryCtx.region);
    const w = unionWindowsForRegion(injuryCtx.injuries, rk);
    sessions = sessions.filter((s) => sessionInAnyWindow(s.session_date, w));
  }

  const sessionIds = sessions.map((s) => s.id);
  const [metricsMap, hopRes] = await Promise.all([
    fetchMetricsMap(sessionIds),
    supabase
      .from("hop_tests")
      .select("session_date, test_type, side, best_cm")
      .eq("athlete_id", athleteId)
      .order("session_date", { ascending: true }),
  ]);
  if (hopRes.error) throw new Error(hopRes.error.message);
  let hops = (hopRes.data ?? []) as ReportHopTestRow[];
  if (injuryCtx) {
    const rk = regionKey(injuryCtx.region);
    const w = unionWindowsForRegion(injuryCtx.injuries, rk);
    hops = hops.filter((h) => sessionInAnyWindow(h.session_date, w));
  }
  return { sessions, metricsBySession: metricsMap, hopTests: hops };
}

async function loadAthleteBestBundle(
  athleteId: string,
  injuryCtx: { injuries: InjuryRow[]; region: string } | null
): Promise<BestInRangeData> {
  const raw = await loadAthleteRawBundle(athleteId, injuryCtx);
  return computeBestInRangeData(raw.sessions, raw.metricsBySession, raw.hopTests);
}

async function loadTeamData(teamId: string): Promise<BestInRangeData> {
  const { data, error } = await supabase.from("athlete_teams").select("athlete_id").eq("team_id", teamId);
  if (error) throw new Error(error.message);
  const athleteIds = [
    ...new Set(
      (data ?? [])
        .map((r: { athlete_id: string }) => r.athlete_id)
        .filter((id: string | undefined): id is string => Boolean(id))
    ),
  ];
  if (athleteIds.length === 0) return { linear: [], cmj: [], dj: [], hop: [] };
  const bundles = await Promise.all(athleteIds.map((id) => loadAthleteBestBundle(id, null)));
  return aggregateBestInRangeData(bundles);
}

export default function AthleteComparePage() {
  const staffOk = useRequireDashboardStaff();
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [compareMode, setCompareMode] = useState<CompareMode>("aa");
  const [athleteAId, setAthleteAId] = useState<string>("");
  const [athleteBId, setAthleteBId] = useState<string>("");
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [injuryFilter, setInjuryFilter] = useState(false);
  const [bodyRegion, setBodyRegion] = useState<string>("");
  const [injuriesA, setInjuriesA] = useState<InjuryRow[]>([]);
  const [injuriesB, setInjuriesB] = useState<InjuryRow[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [sections, setSections] = useState<ReturnType<typeof buildAthleteVsAthleteSections>>([]);
  const [compared, setCompared] = useState(false);
  const [chartAthleteIds, setChartAthleteIds] = useState<string[]>([]);
  const [chartBundles, setChartBundles] = useState<Map<string, AthleteRawBundle>>(() => new Map());
  const [chartLoadError, setChartLoadError] = useState<string | null>(null);
  const chartBundlesRef = useRef(chartBundles);
  chartBundlesRef.current = chartBundles;

  useEffect(() => {
    if (!staffOk) return;
    let cancelled = false;
    (async () => {
      setLoadingAthletes(true);
      const { data, error: e } = await supabase
        .from("athletes")
        .select("id, first_name, last_name")
        .order("last_name", { ascending: true });
      if (cancelled) return;
      if (e) {
        setError(e.message);
        setLoadingAthletes(false);
        return;
      }
      setAthletes((data ?? []) as AthleteOption[]);
      setLoadingAthletes(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk]);

  useEffect(() => {
    if (!staffOk) return;
    let cancelled = false;
    (async () => {
      setLoadingTeams(true);
      const { data, error: e } = await supabase.from("teams").select("id, name").order("name", { ascending: true });
      if (cancelled) return;
      if (e) {
        setError((prev) => prev ?? e.message);
        setLoadingTeams(false);
        return;
      }
      setTeams((data ?? []) as TeamOption[]);
      setLoadingTeams(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk]);

  const loadInjuries = useCallback(async (aId: string, bId: string) => {
    if (!aId || !bId) {
      setInjuriesA([]);
      setInjuriesB([]);
      setBodyRegion("");
      return;
    }
    const [ia, ib] = await Promise.all([
      supabase.from("injuries").select("id, athlete_id, body_region, date_injured, date_rtp").eq("athlete_id", aId),
      supabase.from("injuries").select("id, athlete_id, body_region, date_injured, date_rtp").eq("athlete_id", bId),
    ]);
    setInjuriesA((ia.data ?? []) as InjuryRow[]);
    setInjuriesB((ib.data ?? []) as InjuryRow[]);
    setBodyRegion("");
  }, []);

  useEffect(() => {
    if (!staffOk || !injuryFilter || compareMode !== "aa") return;
    if (!athleteAId || !athleteBId) return;
    void loadInjuries(athleteAId, athleteBId);
  }, [staffOk, injuryFilter, compareMode, athleteAId, athleteBId, loadInjuries]);

  const commonRegions = useMemo(
    () => commonBodyRegionLabels(injuriesA, injuriesB),
    [injuriesA, injuriesB]
  );

  const injuryWarning =
    compareMode === "aa" && injuryFilter && athleteAId && athleteBId && commonRegions.length === 0;

  const runCompare = useCallback(async () => {
    setError(null);
    setCompared(false);
    setSections([]);

    if (compareMode === "aa") {
      if (!athleteAId || !athleteBId) {
        setError("Select both athletes.");
        return;
      }
      if (athleteAId === athleteBId) {
        setError("Choose two different athletes.");
        return;
      }
    } else if (compareMode === "at") {
      if (!athleteAId || !teamBId) {
        setError("Select an athlete (Side A) and a team (Side B).");
        return;
      }
    } else {
      if (!teamAId || !teamBId) {
        setError("Select both teams.");
        return;
      }
      if (teamAId === teamBId) {
        setError("Choose two different teams.");
        return;
      }
    }

    let injA: InjuryRow[] = [];
    let injB: InjuryRow[] = [];
    if (compareMode === "aa" && injuryFilter) {
      const [ia, ib] = await Promise.all([
        supabase
          .from("injuries")
          .select("id, athlete_id, body_region, date_injured, date_rtp")
          .eq("athlete_id", athleteAId),
        supabase
          .from("injuries")
          .select("id, athlete_id, body_region, date_injured, date_rtp")
          .eq("athlete_id", athleteBId),
      ]);
      injA = (ia.data ?? []) as InjuryRow[];
      injB = (ib.data ?? []) as InjuryRow[];
      setInjuriesA(injA);
      setInjuriesB(injB);
      const regions = commonBodyRegionLabels(injA, injB);
      if (regions.length === 0) {
        setError("No matching injury history found for both athletes.");
        return;
      }
      if (!bodyRegion.trim() || !regions.includes(bodyRegion)) {
        setError("Select a body region for the injury filter.");
        return;
      }
    }

    setCompareLoading(true);
    try {
      const aOpt = athletes.find((x) => x.id === athleteAId);
      const bOpt = athletes.find((x) => x.id === athleteBId);
      const teamAOpt = teams.find((t) => t.id === teamAId);
      const teamBOpt = teams.find((t) => t.id === teamBId);

      if (compareMode === "aa") {
        setNameA(aOpt ? displayName(aOpt) : "");
        setNameB(bOpt ? displayName(bOpt) : "");
      } else if (compareMode === "at") {
        setNameA(aOpt ? displayName(aOpt) : "");
        setNameB(teamBOpt?.name ?? "Team");
      } else {
        setNameA(teamAOpt?.name ?? "Team");
        setNameB(teamBOpt?.name ?? "Team");
      }

      let bestA: BestInRangeData;
      let bestB: BestInRangeData;

      if (compareMode === "aa") {
        const injuryA =
          injuryFilter && bodyRegion.trim()
            ? { injuries: injA, region: bodyRegion }
            : null;
        const injuryB =
          injuryFilter && bodyRegion.trim()
            ? { injuries: injB, region: bodyRegion }
            : null;
        const [rawA, rawB] = await Promise.all([
          loadAthleteRawBundle(athleteAId, injuryA),
          loadAthleteRawBundle(athleteBId, injuryB),
        ]);
        bestA = computeBestInRangeData(rawA.sessions, rawA.metricsBySession, rawA.hopTests);
        bestB = computeBestInRangeData(rawB.sessions, rawB.metricsBySession, rawB.hopTests);
        setChartBundles(
          new Map<string, AthleteRawBundle>([
            [athleteAId, rawA],
            [athleteBId, rawB],
          ])
        );
        setChartAthleteIds([athleteAId, athleteBId]);
        setChartLoadError(null);
      } else if (compareMode === "at") {
        setChartAthleteIds([]);
        setChartBundles(new Map());
        [bestA, bestB] = await Promise.all([
          loadAthleteBestBundle(athleteAId, null),
          loadTeamData(teamBId),
        ]);
      } else {
        setChartAthleteIds([]);
        setChartBundles(new Map());
        [bestA, bestB] = await Promise.all([loadTeamData(teamAId), loadTeamData(teamBId)]);
      }

      setSections(buildAthleteVsAthleteSections(bestA, bestB));
      setCompared(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setCompareLoading(false);
    }
  }, [
    athleteAId,
    athleteBId,
    athletes,
    bodyRegion,
    compareMode,
    injuryFilter,
    teamAId,
    teamBId,
    teams,
  ]);

  useEffect(() => {
    if (chartAthleteIds.length === 0) return;
    setChartBundles((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const k of [...next.keys()]) {
        if (!chartAthleteIds.includes(k)) {
          next.delete(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [chartAthleteIds]);

  useEffect(() => {
    if (!compared || compareMode !== "aa" || injuryFilter) return;
    if (chartAthleteIds.length < 2 || chartAthleteIds.length > 6) return;
    let cancelled = false;
    (async () => {
      const missing = chartAthleteIds.filter((id) => !chartBundlesRef.current.has(id));
      if (missing.length === 0) return;
      setChartLoadError(null);
      try {
        const pairs = await Promise.all(
          missing.map(async (id) => [id, await loadAthleteRawBundle(id, null)] as const)
        );
        if (cancelled) return;
        setChartBundles((prev) => {
          const next = new Map(prev);
          for (const [id, raw] of pairs) next.set(id, raw);
          return next;
        });
      } catch (e) {
        if (!cancelled) setChartLoadError(e instanceof Error ? e.message : "Chart load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chartAthleteIds, compared, compareMode, injuryFilter]);

  const toggleChartAthlete = useCallback((id: string) => {
    setChartAthleteIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }, []);

  /** Phase D-B: optimistic save for sessions.lr_starting_leg from the LR editor. */
  const handleUpdateLrStartingLeg = useCallback(
    async (
      athleteId: string,
      sessionId: string,
      value: "left" | "right" | null
    ) => {
      let previousValue: "left" | "right" | null | undefined;
      setChartBundles((prev) => {
        const cur = prev.get(athleteId);
        if (!cur) return prev;
        const nextSessions = cur.sessions.map((s) => {
          if (s.id !== sessionId) return s;
          previousValue = (s.lr_starting_leg ?? null) as "left" | "right" | null;
          return { ...s, lr_starting_leg: value };
        });
        const next = new Map(prev);
        next.set(athleteId, { ...cur, sessions: nextSessions });
        return next;
      });
      const { error: upErr } = await supabase
        .from("sessions")
        .update({ lr_starting_leg: value })
        .eq("id", sessionId);
      if (upErr) {
        setChartLoadError(`Could not save starting leg: ${upErr.message}`);
        // Revert
        setChartBundles((prev) => {
          const cur = prev.get(athleteId);
          if (!cur) return prev;
          const nextSessions = cur.sessions.map((s) =>
            s.id === sessionId ? { ...s, lr_starting_leg: previousValue ?? null } : s
          );
          const next = new Map(prev);
          next.set(athleteId, { ...cur, sessions: nextSessions });
          return next;
        });
      } else {
        setChartLoadError(null);
      }
    },
    []
  );

  const modePill = (mode: CompareMode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setCompareMode(mode);
        setCompared(false);
        setSections([]);
        setChartAthleteIds([]);
        setChartBundles(new Map());
        setError(null);
      }}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        compareMode === mode
          ? "bg-lime-500/25 text-lime-200 ring-1 ring-lime-500/50"
          : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  const tableWrap = "mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/50";
  const controlsDisabled = compareLoading || loadingAthletes || loadingTeams;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-20">
        <h1 className="text-xl font-semibold uppercase tracking-wide text-lime-300">
          Athlete comparison
        </h1>

        <div className="mt-6 flex flex-wrap gap-2">
          {modePill("aa", "Athlete vs Athlete")}
          {modePill("at", "Athlete vs Team")}
          {modePill("tt", "Team vs Team")}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {compareMode === "aa" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400">Athlete A</label>
                <select
                  value={athleteAId}
                  onChange={(e) => setAthleteAId(e.target.value)}
                  disabled={controlsDisabled}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  <option value="">—</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {displayName(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Athlete B</label>
                <select
                  value={athleteBId}
                  onChange={(e) => setAthleteBId(e.target.value)}
                  disabled={controlsDisabled}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  <option value="">—</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {displayName(a)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : compareMode === "at" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400">Athlete (Side A)</label>
                <select
                  value={athleteAId}
                  onChange={(e) => setAthleteAId(e.target.value)}
                  disabled={controlsDisabled}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  <option value="">—</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {displayName(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Team (Side B)</label>
                <select
                  value={teamBId}
                  onChange={(e) => setTeamBId(e.target.value)}
                  disabled={controlsDisabled}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400">Team (Side A)</label>
                <select
                  value={teamAId}
                  onChange={(e) => setTeamAId(e.target.value)}
                  disabled={controlsDisabled}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Team (Side B)</label>
                <select
                  value={teamBId}
                  onChange={(e) => setTeamBId(e.target.value)}
                  disabled={controlsDisabled}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {compareMode === "aa" ? (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={injuryFilter}
                onChange={(e) => {
                  setInjuryFilter(e.target.checked);
                  if (!e.target.checked) setBodyRegion("");
                }}
                disabled={controlsDisabled}
                className="rounded border-slate-600 bg-slate-950 text-lime-500 disabled:opacity-50"
              />
              Injury filter
            </label>
            {injuryFilter ? (
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-400">Body region</label>
                <select
                  value={bodyRegion}
                  onChange={(e) => setBodyRegion(e.target.value)}
                  disabled={commonRegions.length === 0 || controlsDisabled}
                  className="mt-1 w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  <option value="">— Select —</option>
                  {commonRegions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {injuryWarning ? (
                  <p className="mt-2 text-xs text-amber-300/90">
                    No matching injury history found for both athletes.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void runCompare()}
          disabled={controlsDisabled}
          className="mt-6 rounded-full border border-lime-500/50 bg-lime-500/15 px-6 py-2 text-sm font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50"
        >
          {compareLoading ? "Comparing…" : "Compare"}
        </button>

        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

        {compared && !error ? (
          <div className="mt-10 space-y-8">
            {sections.length === 0 ? (
              <p className="text-sm text-slate-500">No overlapping comparison data for these selections.</p>
            ) : (
              sections.map((sec) => (
                <div key={sec.id}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {sec.title}
                  </h2>
                  <div className={tableWrap}>
                    <table className="w-full min-w-[420px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                          <th className="px-3 py-2 font-medium">Metric</th>
                          <th className="px-3 py-2 font-medium">{nameA || "Side A"}</th>
                          <th className="px-3 py-2 font-medium">{nameB || "Side B"}</th>
                          <th className="px-3 py-2 font-medium">Δ</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        {sec.rows.map((row) => (
                          <tr key={row.label} className="border-b border-slate-800/80">
                            <td className="px-3 py-2 text-slate-400">{row.label}</td>
                            <td className="px-3 py-2 font-mono">{row.va}</td>
                            <td className="px-3 py-2 font-mono">{row.vb}</td>
                            <td className={`px-3 py-2 font-mono ${row.delta.className}`}>{row.delta.text}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}

            {compareMode === "aa" && chartAthleteIds.length > 6 ? (
              <p className="text-xs text-slate-500">
                Comparison charts are most readable with 2–6 athletes. Showing table only.
              </p>
            ) : null}

            {compareMode === "aa" && chartAthleteIds.length >= 2 && chartAthleteIds.length <= 6 ? (
              <>
                {!injuryFilter ? (
                  <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                    <p className="text-xs font-medium text-slate-400">Athletes in charts</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {athletes.map((a) => (
                        <label key={a.id} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={chartAthleteIds.includes(a.id)}
                            onChange={() => toggleChartAthlete(a.id)}
                            className="rounded border-slate-600 bg-slate-950 text-lime-500"
                          />
                          {displayName(a)}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                {chartLoadError ? <p className="mt-2 text-xs text-rose-400">{chartLoadError}</p> : null}
                {chartAthleteIds.every((id) => chartBundles.has(id)) ? (
                  <AthleteCompareChartPanel
                    athletes={athletes}
                    bundles={chartBundles}
                    athleteIdsOrdered={chartAthleteIds}
                    onUpdateLrStartingLeg={handleUpdateLrStartingLeg}
                  />
                ) : (
                  <p className="mt-6 text-xs text-slate-500">Loading comparison charts…</p>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
