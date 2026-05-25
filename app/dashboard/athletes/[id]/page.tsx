"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardNav from "@/components/DashboardNav";
import DateRangeBar from "@/components/athletes/DateRangeBar";
import DynamometrySection from "@/components/athletes/DynamometrySection";
import ForcePlateCMJSection, {
  buildCmjDataPoints,
} from "@/components/athletes/ForcePlateCMJSection";
import ForcePlateDJSection, { buildDjDataPoints } from "@/components/athletes/ForcePlateDJSection";
import HopTestsSection from "@/components/athletes/HopTestsSection";
import LRStartingLegEditor from "@/components/athletes/LRStartingLegEditor";
import PdfExportModal from "@/components/athletes/PdfExportModal";
import SectionComment from "@/components/athletes/SectionComment";
import SectionJumpNav from "@/components/athletes/SectionJumpNav";
import TimepointSummary from "@/components/athletes/TimepointSummary";
import {
  buildHopTestBlocks,
  formatChartAxisDate,
  type ReportHopTestRow,
  type ReportSessionRow,
  type ReportMetricRow,
} from "@/lib/athleteReportData";
import {
  lrEligibleSessionsForAthlete,
  type LREligibleSession,
} from "@/lib/athleteCompareCharts";
import { formatDisplayDateTime } from "@/lib/dateDisplay";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

// ─── Labels ──────────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  fp_jump_height: "Jump Height",
  fp_jump_height_cm_best: "Jump Height",
  fp_rsi_best: "RSI",
  fp_mrsi: "mRSI",
  fp_flight_time: "Flight Time",
  fp_flight_time_s_best: "Flight Time",
  fp_contact_time: "Contact Time",
  fp_contact_time_s_best: "Contact Time",
  fp_peak_braking_force: "Peak Braking Force",
  fp_peak_propulsive_force: "Peak Propulsive Force",
  fp_avg_braking_velocity: "Avg Braking Velocity",
  fp_avg_propulsive_velocity: "Avg Propulsive Velocity",
  fp_landing_height: "Landing Height",
  fp_braking_impulse: "Braking Impulse",
  fp_propulsive_impulse: "Propulsive Impulse",
  fp_system_weight: "System Weight",
  fp_drop_height: "Drop Height",
  fp_spring_like_correlation: "Spring Like Correlation",
  fp_time_to_peak_braking_force: "Time to Peak Braking Force",
  fp_jump_momentum: "Jump Momentum",
  fp_peak_relative_braking_force: "Peak Relative Braking Force",
  fp_peak_relative_propulsive_force: "Peak Relative Propulsive Force",
  fp_avg_braking_force: "Avg Braking Force",
  fp_avg_relative_braking_force: "Avg Relative Braking Force",
  fp_relative_braking_impulse: "Relative Braking Impulse",
  fp_braking_net_impulse: "Braking Net Impulse",
  fp_relative_braking_net_impulse: "Relative Braking Net Impulse",
  fp_avg_propulsive_force: "Avg Propulsive Force",
  fp_avg_relative_propulsive_force: "Avg Relative Propulsive Force",
  fp_braking_phase: "Braking Phase",
  fp_propulsive_phase: "Propulsive Phase",
  fp_time_to_takeoff: "Time to Takeoff",
  fp_takeoff_velocity: "Takeoff Velocity",
  fp_peak_velocity: "Peak Velocity",
  fp_impact_peak: "Impact Peak",
  fp_stiffness: "Stiffness",
  fp_countermovement_depth: "CM Depth",
  fp_braking_rfd: "Braking RFD",
  fp_unweighting_phase: "Unweighting Phase",
  fp_peak_landing_force: "Peak Landing Force",
  fp_landing_stiffness: "Landing Stiffness",
  // 1080 keys
  top_speed: "Top Speed",
  peak_speed: "Peak Speed",
  peak_force: "Peak Force",
  peak_power: "Peak Power",
  peak_acceleration: "Peak Acceleration",
  avg_speed: "Avg Speed",
  avg_force: "Avg Force",
  avg_power: "Avg Power",
  avg_acceleration: "Avg Acceleration",
  total_distance: "Total Distance",
  total_time: "Total Time",
  accel_max: "Max Acceleration",
  decel_max: "Max Deceleration",
  decel_time: "Decel Time",
  top_speed_position: "Top Speed Position",
  external_load: "External Load",
  split_5m_time: "5m Split Time",
  split_5m_top_speed: "5m Top Speed",
  split_5m_max_force: "5m Max Force",
  split_10m_time: "10m Split Time",
  split_10m_top_speed: "10m Top Speed",
  split_20m_time: "20m Split Time",
};

function titleCaseWords(s: string): string {
  return s.split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function labelForMetricKey(key: string): string {
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  if (key.startsWith("fp_")) return titleCaseWords(key.slice(3).replace(/_/g, " "));
  return key.includes("_") ? key.replace(/_/g, " ") : key;
}

function formatMetricValue(value: number | null, key: string): string {
  if (value === null || value === undefined) return "—";
  const k = key.toLowerCase();
  if (k.includes("force") || k.includes("power") || k.includes("impulse")) {
    return Math.round(value).toString();
  }
  if (k.includes("speed") || k.includes("time") || k.includes("distance") ||
      k.includes("accel") || k.includes("decel") || k.includes("position")) {
    return value.toFixed(2);
  }
  if (k.includes("rsi") || k.includes("mrsi") || k.includes("height") ||
      k.includes("stiffness") || k.includes("correlation")) {
    return value.toFixed(3);
  }
  return value.toFixed(2);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Athlete = Record<string, unknown> & {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type SessionRow = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type: string | null;
  source: string | null;
  clinician_notes?: string | null;
  lr_starting_leg?: "left" | "right" | null;
  lr_side_swap?: boolean;
};

type MetricRow = {
  session_id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
  side?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bucket(source: string | null): "hawkins" | "1080" | "csv" {
  const s = (source ?? "").toLowerCase();
  if (s === "hawkins" || s === "hawkins_csv") return "hawkins";
  if (s === "1080" || s === "1080_csv") return "1080";
  return "csv";
}

function formatWhen(iso: string | null) {
  return formatDisplayDateTime(iso);
}

type HopTestDbRow = ReportHopTestRow;

function is1080Session(s: SessionRow): boolean {
  return bucket(s.source) === "1080";
}

function is505Session(s: SessionRow): boolean {
  return is1080Session(s) && (s.test_sub_type ?? "").includes("5-10-5");
}

function isLinearSprintSession(s: SessionRow): boolean {
  if (!is1080Session(s)) return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return !sub.includes("5-10-5") && !sub.includes("5-0-5") && !sub.includes("shuttle");
}

function metricAggregate(
  map: Map<string, MetricRow[]>,
  sessionId: string,
  key: string,
  mode: "max" | "min"
): number | null {
  const rows = map.get(sessionId)?.filter((r) => r.key === key && r.value != null) ?? [];
  if (rows.length === 0) return null;
  const vals = rows.map((r) => r.value!);
  return mode === "max" ? Math.max(...vals) : Math.min(...vals);
}

function sessionsChronological(sess: SessionRow[]): SessionRow[] {
  return [...sess].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });
}

// ─── Chart IDs ───────────────────────────────────────────────────────────────

type SprintChartId = "topSpeed" | "peakForce" | "peakPower" | "split5m";
type CodChartId = "topSpeed505" | "decelMax505" | "accelMax505";

const SPRINT_CHART_PILLS: { id: SprintChartId; label: string }[] = [
  { id: "topSpeed", label: "Top Speed" },
  { id: "peakForce", label: "Peak Force" },
  { id: "peakPower", label: "Peak Power" },
  { id: "split5m", label: "5m Split" },
];

const COD_CHART_PILLS: { id: CodChartId; label: string }[] = [
  { id: "topSpeed505", label: "Top Speed" },
  { id: "decelMax505", label: "Peak Deceleration" },
  { id: "accelMax505", label: "Peak Re-Acceleration" },
];

// ─── Shared chart styles ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(30 41 59)",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };

function xAxisProps(formatDate: (ts: number) => string) {
  return {
    dataKey: "t",
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as [string, string],
    tickFormatter: (ts: number) => formatDate(ts),
    stroke: "#64748b",
    tick: AXIS_TICK,
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AthleteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const staffOk = useRequireDashboardStaff();

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [metricsBySession, setMetricsBySession] = useState<Map<string, MetricRow[]>>(() => new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hopTests, setHopTests] = useState<HopTestDbRow[]>([]);
  const [sectionCommentBySection, setSectionCommentBySection] = useState<
    Record<string, string | null>
  >({});
  const [visibleSprintCharts, setVisibleSprintCharts] = useState<Set<SprintChartId>>(
    () => new Set(SPRINT_CHART_PILLS.map((p) => p.id))
  );
  const [visibleCodCharts, setVisibleCodCharts] = useState<Set<CodChartId>>(
    () => new Set(COD_CHART_PILLS.map((p) => p.id))
  );
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [lrPending, setLrPending] = useState<Set<string>>(() => new Set());
  const [lrSaveError, setLrSaveError] = useState<string | null>(null);

  function inRange(dateIso: string | null): boolean {
    if (!dateIso) return true;
    const d = dateIso.slice(0, 10);
    if (rangeStart && d < rangeStart) return false;
    if (rangeEnd && d > rangeEnd) return false;
    return true;
  }

  // ── Phase D-C: LR session editor wiring ─────────────────────────────────────

  const handleUpdateLrStartingLeg = useCallback(
    async (
      _athleteId: string,
      sessionId: string,
      value: "left" | "right" | null
    ) => {
      const pendKey = `leg:${id}:${sessionId}`;
      setLrPending((prev) => new Set(prev).add(pendKey));
      let previousValue: "left" | "right" | null | undefined;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          previousValue = (s.lr_starting_leg ?? null) as "left" | "right" | null;
          return { ...s, lr_starting_leg: value };
        })
      );
      const { error: upErr } = await supabase
        .from("sessions")
        .update({ lr_starting_leg: value })
        .eq("id", sessionId);
      setLrPending((prev) => {
        const next = new Set(prev);
        next.delete(pendKey);
        return next;
      });
      if (upErr) {
        setLrSaveError(`Could not save starting leg: ${upErr.message}`);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, lr_starting_leg: previousValue ?? null } : s
          )
        );
      } else {
        setLrSaveError(null);
      }
    },
    [id]
  );

  const handleUpdateLrSideSwap = useCallback(
    async (_athleteId: string, sessionId: string, value: boolean) => {
      const pendKey = `swap:${id}:${sessionId}`;
      setLrPending((prev) => new Set(prev).add(pendKey));
      let previousValue: boolean | undefined;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          previousValue = s.lr_side_swap === true;
          return { ...s, lr_side_swap: value };
        })
      );
      const { error: upErr } = await supabase
        .from("sessions")
        .update({ lr_side_swap: value })
        .eq("id", sessionId);
      setLrPending((prev) => {
        const next = new Set(prev);
        next.delete(pendKey);
        return next;
      });
      if (upErr) {
        setLrSaveError(`Could not save side swap: ${upErr.message}`);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, lr_side_swap: previousValue ?? false } : s
          )
        );
      } else {
        setLrSaveError(null);
      }
    },
    [id]
  );

  /** LR-eligible sessions for THIS athlete, wrapped in the Map shape the editor expects. */
  const lrSessionsByAthlete = useMemo(() => {
    if (!id) return new Map<string, LREligibleSession[]>();
    const bundle = {
      sessions: sessions as unknown as ReportSessionRow[],
      metricsBySession: metricsBySession as unknown as Map<string, ReportMetricRow[]>,
      hopTests: hopTests as unknown as ReportHopTestRow[],
    };
    const list = lrEligibleSessionsForAthlete(id, bundle);
    return new Map<string, LREligibleSession[]>([[id, list]]);
  }, [id, sessions, metricsBySession, hopTests]);

  const lrNameById = useMemo(() => {
    const m = new Map<string, string>();
    if (id && athlete) {
      const nm = `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() || "Athlete";
      m.set(id, nm);
    }
    return m;
  }, [id, athlete]);

  useEffect(() => {
    if (!staffOk || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: a, error: aErr } = await supabase.from("athletes").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (aErr || !a) { setError(aErr?.message ?? "Athlete not found"); setLoading(false); return; }

      const { data: s, error: sErr } = await supabase
        .from("sessions")
        .select("id, session_date, test_type, test_sub_type, source, clinician_notes, lr_starting_leg, lr_side_swap")
        .eq("athlete_id", id)
        .order("session_date", { ascending: false });

      if (cancelled) return;
      if (sErr) { setError(sErr.message); setLoading(false); return; }

      const sess = (s ?? []) as SessionRow[];
      setAthlete(a as Athlete);
      setSessions(sess);

      const sids = sess.map((x) => x.id);
      const map = new Map<string, MetricRow[]>();
      if (sids.length > 0) {
        const { data: mrows, error: mErr } = await supabase
          .from("metrics")
          .select("session_id, key, value, rep_index, side")
          .in("session_id", sids);

        if (cancelled) return;
        if (mErr) {
          setError(mErr.message);
          setLoading(false);
          return;
        }
        for (const row of (mrows ?? []) as MetricRow[]) {
          const list = map.get(row.session_id) ?? [];
          list.push(row);
          map.set(row.session_id, list);
        }
      }
      setMetricsBySession(map);

      const [hRes, cRes] = await Promise.all([
        supabase
          .from("hop_tests")
          .select("session_date, test_type, side, best_cm")
          .eq("athlete_id", id)
          .order("session_date", { ascending: true }),
        supabase
          .from("athlete_section_comments")
          .select("section, comment")
          .eq("athlete_id", id),
      ]);
      if (!cancelled) {
        if (!hRes.error) setHopTests((hRes.data ?? []) as HopTestDbRow[]);
        if (!cRes.error) {
          const next: Record<string, string | null> = {};
          for (const row of cRes.data ?? []) {
            const r = row as { section: string; comment: string | null };
            next[r.section] = r.comment;
          }
          setSectionCommentBySection(next);
        }
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [staffOk, id]);

  const grouped = useMemo(() => {
    const h: SessionRow[] = [], m: SessionRow[] = [], c: SessionRow[] = [];
    for (const s of sessions) {
      const b = bucket(s.source);
      if (b === "1080") m.push(s);
      else if (b === "csv") c.push(s);
      else h.push(s);
    }
    return { hawkins: h, motion1080: m, csv: c };
  }, [sessions]);

  const filteredSessions = useMemo(
    () => sessions.filter((s) => inRange(s.session_date)),
    [sessions, rangeStart, rangeEnd]
  );

  const filteredHopTests = useMemo(
    () => hopTests.filter((h) => inRange(h.session_date)),
    [hopTests, rangeStart, rangeEnd]
  );

  const has1080Charts = useMemo(
    () => filteredSessions.some((s) => bucket(s.source) === "1080"),
    [filteredSessions]
  );
  const has505 = filteredSessions.some(is505Session);
  const hasLinearSprint = filteredSessions.some(isLinearSprintSession);

  const hawkinsCsvSessions = useMemo(
    () =>
      sessionsChronological(
        filteredSessions.filter((s) => (s.source ?? "").toLowerCase() === "hawkins_csv")
      ),
    [filteredSessions]
  );

  const cmjSeries = useMemo(
    () => buildCmjDataPoints(hawkinsCsvSessions, metricsBySession),
    [hawkinsCsvSessions, metricsBySession]
  );

  const djSeries = useMemo(
    () => buildDjDataPoints(hawkinsCsvSessions, metricsBySession),
    [hawkinsCsvSessions, metricsBySession]
  );

  const hopTestBlocks = useMemo(
    () => buildHopTestBlocks(filteredHopTests),
    [filteredHopTests]
  );

  const sectionsWithData = useMemo(() => {
    const keys: string[] = ["summary"];
    if (has1080Charts && hasLinearSprint) keys.push("linear");
    if (has505) keys.push("cod");
    if (cmjSeries.length > 0) keys.push("cmj");
    if (djSeries.length > 0) keys.push("drop_jump");
    keys.push("hop_tests");
    return keys;
  }, [has1080Charts, hasLinearSprint, has505, cmjSeries.length, djSeries.length]);

  function sectionNote(section: string): string | null {
    return sectionCommentBySection[section] ?? null;
  }

  // ── Linear sprint trend data ──────────────────────────────────────────────────

  const trendTopSpeed = useMemo(() => {
    const sorted = sessionsChronological(filteredSessions.filter(isLinearSprintSession));
    const points: { t: number; label: string; v: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "top_speed", "max");
      if (v == null) continue;
      points.push({ t: new Date(s.session_date).getTime(), label: formatChartAxisDate(s.session_date), v });
    }
    return { points, enough: points.length >= 2 };
  }, [filteredSessions, metricsBySession]);

  const trendPeakForce = useMemo(() => {
    const sorted = sessionsChronological(filteredSessions.filter(isLinearSprintSession));
    const points: { t: number; label: string; v: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "peak_force", "max");
      if (v == null) continue;
      points.push({ t: new Date(s.session_date).getTime(), label: formatChartAxisDate(s.session_date), v });
    }
    return { points, enough: points.length >= 2 };
  }, [filteredSessions, metricsBySession]);

  const trendPeakPower = useMemo(() => {
    const sorted = sessionsChronological(filteredSessions.filter(isLinearSprintSession));
    const points: { t: number; label: string; v: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "peak_power", "max");
      if (v == null) continue;
      points.push({ t: new Date(s.session_date).getTime(), label: formatChartAxisDate(s.session_date), v });
    }
    return { points, enough: points.length >= 2 };
  }, [filteredSessions, metricsBySession]);

  const trendSplit5m = useMemo(() => {
    const sorted = sessionsChronological(filteredSessions.filter(isLinearSprintSession));
    const points: { t: number; label: string; v: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "split_5m_time", "min");
      if (v == null) continue;
      points.push({ t: new Date(s.session_date).getTime(), label: formatChartAxisDate(s.session_date), v });
    }
    return { points, enough: points.length >= 2 };
  }, [filteredSessions, metricsBySession]);

  // ── 5-10-5 COD trend data ─────────────────────────────────────────────────────

  const trend505TopSpeed = useMemo(() => {
    const sorted = sessionsChronological(filteredSessions.filter(is505Session));
    const points: { t: number; label: string; v: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "top_speed", "max");
      if (v == null) continue;
      points.push({ t: new Date(s.session_date).getTime(), label: formatChartAxisDate(s.session_date), v });
    }
    return { points, enough: points.length >= 2 };
  }, [filteredSessions, metricsBySession]);

  const trend505DecelMax = useMemo(() => {
    const sorted = sessionsChronological(filteredSessions.filter(is505Session));
    const points: { t: number; label: string; v: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "decel_max", "max");
      if (v == null) continue;
      points.push({ t: new Date(s.session_date).getTime(), label: formatChartAxisDate(s.session_date), v });
    }
    return { points, enough: points.length >= 2 };
  }, [filteredSessions, metricsBySession]);

  const trend505AccelMax = useMemo(() => {
    const sorted = sessionsChronological(filteredSessions.filter(is505Session));
    const points: { t: number; label: string; v: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "accel_max", "max");
      if (v == null) continue;
      points.push({ t: new Date(s.session_date).getTime(), label: formatChartAxisDate(s.session_date), v });
    }
    return { points, enough: points.length >= 2 };
  }, [filteredSessions, metricsBySession]);

  // ── Misc ─────────────────────────────────────────────────────────────────────

  const name = athlete ? `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() || "Athlete" : "";

  function toggleExpand(sid: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; });
  }
  function toggleSprintChart(cid: SprintChartId) {
    setVisibleSprintCharts((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  }
  function toggleCodChart(cid: CodChartId) {
    setVisibleCodCharts((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  }

  function renderSessionSection(list: SessionRow[]) {
    if (list.length === 0) return <p className="text-xs text-slate-500">No sessions.</p>;
    return (
      <div className="space-y-2">
        {list.map((s) => {
          const rows = metricsBySession.get(s.id) ?? [];
          const open = expanded.has(s.id);
          return (
            <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-900/50">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-900"
                onClick={() => toggleExpand(s.id)}
              >
                <span className="text-slate-200">{formatWhen(s.session_date)}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  {s.clinician_notes?.trim() ? (
                    <span className="text-slate-400" title="Has clinician note">
                      📝
                    </span>
                  ) : null}
                  <span>
                    {s.test_type ?? "—"}
                    {s.test_sub_type ? ` · ${s.test_sub_type}` : ""}
                    {" · "}
                    {rows.length} metrics
                  </span>
                </span>
              </button>
              {open && (
                <div className="border-t border-slate-800 px-3 py-2">
                  {rows.length === 0 ? (
                    <p className="text-xs text-slate-500">No metrics.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.key}-${r.rep_index ?? i}`} className="border-b border-slate-800/80">
                            <td className="py-1 pr-2 text-slate-400">
                              {labelForMetricKey(r.key)}
                              {r.rep_index != null ? ` (rep ${r.rep_index})` : ""}
                            </td>
                            <td className="py-1 text-right font-mono text-slate-200">
                              {formatMetricValue(r.value, r.key)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function Pills<T extends string>({
    pills, visible, toggle,
  }: {
    pills: { id: T; label: string }[];
    visible: Set<T>;
    toggle: (id: T) => void;
  }) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {pills.map(({ id, label }) => {
          const on = visible.has(id);
          return (
            <button key={id} type="button" onClick={() => toggle(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on ? "border-lime-400 bg-lime-400/15 text-lime-300"
                   : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"}`}>
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function ChartShell({ title, enough, children }: { title: string; enough: boolean; children: React.ReactNode }) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-xs font-medium text-slate-400">{title}</h3>
        {enough ? (
          <div className="h-64 w-full">{children}</div>
        ) : (
          <p className="py-16 text-center text-xs text-slate-500">Not enough data</p>
        )}
      </div>
    );
  }

  const tsFormatter = (ts: number) => formatChartAxisDate(new Date(ts).toISOString());
  const labelFormatter = (_: unknown, payload: { payload?: { label?: string } }[]) =>
    payload[0]?.payload?.label ?? "";

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-4xl px-4 pt-8 pb-20">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/athletes" className="text-xs text-slate-400 hover:text-lime-300">← Athletes</Link>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPdfModalOpen(true)}
              className="text-xs text-slate-400 hover:text-lime-300"
            >
              Export PDF
            </button>
            <Link href={`/dashboard/athletes/${id}/edit`} className="text-xs text-lime-300 hover:underline">
              Edit
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-rose-400">{error}</p>
        ) : athlete ? (
          <>
            {/* ── Athlete header ── */}
            <header className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-lime-400/10">
              <h1 className="text-xl font-semibold text-slate-50">{name}</h1>
              <dl className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                {([
                  ["Team", athlete.team],
                  ["Sport", athlete.primary_sport],
                  ["Email", athlete.email],
                  ["Height", athlete.height_cm != null ? `${athlete.height_cm} cm` : null],
                  ["Weight", athlete.weight_kg != null ? `${athlete.weight_kg} kg` : null],
                  ["Dominant", (athlete.dominant_leg || athlete.dominant_hand) ? `${athlete.dominant_leg ?? "—"} / ${athlete.dominant_hand ?? "—"}` : null],
                ] as [string, unknown][]).filter(([, val]) => val != null && val !== "").map(([label, val]) => (
                  <div key={String(label)}>
                    <dt className="text-xs uppercase text-slate-500">{String(label)}</dt>
                    <dd className="text-slate-200">{String(val)}</dd>
                  </div>
                ))}
                {(athlete.notes as string) && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase text-slate-500">Notes</dt>
                    <dd className="whitespace-pre-wrap text-slate-300">{athlete.notes as string}</dd>
                  </div>
                )}
              </dl>
            </header>

            <SectionJumpNav sectionsWithData={sectionsWithData} />

            <DateRangeBar
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onChange={(s, e) => {
                setRangeStart(s);
                setRangeEnd(e);
              }}
            />

            <TimepointSummary
              sessions={filteredSessions}
              metricsBySession={metricsBySession}
              hopTests={filteredHopTests}
            />

            <PdfExportModal
              open={pdfModalOpen}
              onClose={() => setPdfModalOpen(false)}
              athlete={athlete}
              sessions={filteredSessions}
              metricsBySession={metricsBySession}
              hopTests={filteredHopTests}
              sectionComments={sectionCommentBySection}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
            />

            {/* ── Linear sprint trends (1080) ── */}
            {has1080Charts && hasLinearSprint && (
              <section id="linear" className="scroll-mt-28 mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
                  Sprint trends — Linear
                </h2>
                <Pills pills={SPRINT_CHART_PILLS} visible={visibleSprintCharts} toggle={toggleSprintChart} />
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {visibleSprintCharts.has("topSpeed") && (
                    <ChartShell title="Top speed over time (best rep)" enough={trendTopSpeed.enough}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendTopSpeed.points}>
                          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                          <XAxis {...xAxisProps(tsFormatter)} />
                          <YAxis stroke="#64748b" tick={AXIS_TICK} tickFormatter={(v) => Number(v).toFixed(1)}
                            label={{ value: "m/s", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={labelFormatter as any}
                            formatter={(v: number | string) => [typeof v === "number" ? v.toFixed(2) : v, "Top Speed"]} />
                          <Line type="monotone" dataKey="v" name="Top Speed" stroke="#84cc16" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartShell>
                  )}
                  {visibleSprintCharts.has("peakForce") && (
                    <ChartShell title="Peak force over time (best rep)" enough={trendPeakForce.enough}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendPeakForce.points}>
                          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                          <XAxis {...xAxisProps(tsFormatter)} />
                          <YAxis stroke="#64748b" tick={AXIS_TICK} tickFormatter={(v) => Math.round(Number(v)).toString()}
                            label={{ value: "N", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={labelFormatter as any}
                            formatter={(v: number | string) => [typeof v === "number" ? Math.round(v) : v, "Peak Force"]} />
                          <Line type="monotone" dataKey="v" name="Peak Force" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartShell>
                  )}
                  {visibleSprintCharts.has("peakPower") && (
                    <ChartShell title="Peak power over time (best rep)" enough={trendPeakPower.enough}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendPeakPower.points}>
                          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                          <XAxis {...xAxisProps(tsFormatter)} />
                          <YAxis stroke="#64748b" tick={AXIS_TICK} tickFormatter={(v) => Math.round(Number(v)).toString()}
                            label={{ value: "W", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={labelFormatter as any}
                            formatter={(v: number | string) => [typeof v === "number" ? Math.round(v) : v, "Peak Power"]} />
                          <Line type="monotone" dataKey="v" name="Peak Power" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartShell>
                  )}
                  {visibleSprintCharts.has("split5m") && (
                    <ChartShell title="5m split time over time (best rep)" enough={trendSplit5m.enough}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendSplit5m.points}>
                          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                          <XAxis {...xAxisProps(tsFormatter)} />
                          <YAxis stroke="#64748b" tick={AXIS_TICK} tickFormatter={(v) => Number(v).toFixed(2)}
                            label={{ value: "s", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={labelFormatter as any}
                            formatter={(v: number | string) => [typeof v === "number" ? v.toFixed(2) : v, "5m Split"]} />
                          <Line type="monotone" dataKey="v" name="5m Split" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartShell>
                  )}
                </div>
                <SectionComment
                  athleteId={id}
                  section="linear"
                  initialComment={sectionNote("linear")}
                />
              </section>
            )}

            {/* ── 5-10-5 COD trends ── */}
            {has505 && (
              <section id="cod" className="scroll-mt-28 mt-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
                  COD trends — 5-10-5
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Best rep per session. Top speed and peak re-acceleration higher is better; peak deceleration higher indicates greater braking capacity.
                </p>
                <Pills pills={COD_CHART_PILLS} visible={visibleCodCharts} toggle={toggleCodChart} />
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {visibleCodCharts.has("topSpeed505") && (
                    <ChartShell title="Top speed — 5-10-5 (best rep)" enough={trend505TopSpeed.enough}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trend505TopSpeed.points}>
                          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                          <XAxis {...xAxisProps(tsFormatter)} />
                          <YAxis stroke="#64748b" tick={AXIS_TICK} tickFormatter={(v) => Number(v).toFixed(1)}
                            label={{ value: "m/s", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={labelFormatter as any}
                            formatter={(v: number | string) => [typeof v === "number" ? v.toFixed(2) : v, "Top Speed"]} />
                          <Line type="monotone" dataKey="v" name="Top Speed" stroke="#84cc16" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartShell>
                  )}
                  {visibleCodCharts.has("decelMax505") && (
                    <ChartShell title="Peak deceleration — 5-10-5 (best rep)" enough={trend505DecelMax.enough}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trend505DecelMax.points}>
                          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                          <XAxis {...xAxisProps(tsFormatter)} />
                          <YAxis stroke="#64748b" tick={AXIS_TICK} tickFormatter={(v) => Number(v).toFixed(1)}
                            label={{ value: "m/s²", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={labelFormatter as any}
                            formatter={(v: number | string) => [typeof v === "number" ? v.toFixed(2) : v, "Peak Decel"]} />
                          <Line type="monotone" dataKey="v" name="Peak Decel" stroke="#f43f5e" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartShell>
                  )}
                  {visibleCodCharts.has("accelMax505") && (
                    <ChartShell title="Peak re-acceleration — 5-10-5 (best rep)" enough={trend505AccelMax.enough}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trend505AccelMax.points}>
                          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                          <XAxis {...xAxisProps(tsFormatter)} />
                          <YAxis stroke="#64748b" tick={AXIS_TICK} tickFormatter={(v) => Number(v).toFixed(1)}
                            label={{ value: "m/s²", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={labelFormatter as any}
                            formatter={(v: number | string) => [typeof v === "number" ? v.toFixed(2) : v, "Peak Accel"]} />
                          <Line type="monotone" dataKey="v" name="Peak Accel" stroke="#fbbf24" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartShell>
                  )}
                </div>
                <SectionComment
                  athleteId={id}
                  section="cod"
                  initialComment={sectionNote("cod")}
                />
              </section>
            )}

            {cmjSeries.length > 0 && (
              <ForcePlateCMJSection
                athleteId={id}
                data={cmjSeries}
                sectionComment={sectionNote("cmj")}
              />
            )}

            {djSeries.length > 0 && (
              <ForcePlateDJSection
                athleteId={id}
                data={djSeries}
                sectionComment={sectionNote("drop_jump")}
              />
            )}

            <HopTestsSection
              athleteId={id}
              blocks={hopTestBlocks}
              sectionComment={sectionNote("hop_tests")}
              onHopTestSaved={async () => {
                const { data } = await supabase
                  .from("hop_tests")
                  .select("session_date, test_type, side, best_cm")
                  .eq("athlete_id", id)
                  .order("session_date", { ascending: true });
                if (data) setHopTests(data as HopTestDbRow[]);
              }}
            />

            <DynamometrySection
              athleteId={id}
              sectionComment={sectionNote("dynamometry")}
            />

            {/* ── LR session settings (Phase D-C) ── */}
            {lrSessionsByAthlete.get(id)?.length ? (
              <section id="lr_settings" className="scroll-mt-28 mt-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
                  Left/Right session settings
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Record the anatomical starting leg and (if needed) flip the 1080 L/R labels for each
                  Left-Right protocol session.
                </p>
                {lrSaveError ? (
                  <p className="mt-2 text-xs text-rose-400">{lrSaveError}</p>
                ) : null}
                <LRStartingLegEditor
                  athleteIds={[id]}
                  nameById={lrNameById}
                  sessionsByAthlete={lrSessionsByAthlete}
                  onSaveLeg={handleUpdateLrStartingLeg}
                  onSaveSwap={handleUpdateLrSideSwap}
                  pending={lrPending}
                  title="LR sessions"
                />
              </section>
            ) : null}

            {/* ── Sessions ── */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
                Sessions
              </h2>
              <Link
                href={`/dashboard/athletes/${id}/hop-tests`}
                className="text-xs text-lime-300/90 hover:text-lime-300 hover:underline"
              >
                Hop tests →
              </Link>
            </div>
            <div className="mt-4 space-y-8">
              {grouped.hawkins.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-400">Hawkins</h3>
                  {renderSessionSection(grouped.hawkins)}
                </div>
              )}
              {grouped.motion1080.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-400">1080 Motion</h3>
                  {renderSessionSection(grouped.motion1080)}
                </div>
              )}
              {grouped.csv.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-400">CSV uploads</h3>
                  {renderSessionSection(grouped.csv)}
                </div>
              )}
              {sessions.length === 0 && (
                <p className="text-xs text-slate-500">No sessions recorded yet.</p>
              )}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
