"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTypeToggle, { type ChartType } from "@/components/athletes/ChartTypeToggle";
import DashboardNav from "@/components/DashboardNav";
import DateRangeBar from "@/components/athletes/DateRangeBar";
import DynamometrySection from "@/components/athletes/DynamometrySection";
import ForcePlateCMJSection, {
  buildCmjDataPoints,
} from "@/components/athletes/ForcePlateCMJSection";
import ForcePlateDJSection, { buildDjDataPoints } from "@/components/athletes/ForcePlateDJSection";
import ForcePlateSingleLegDJSection, {
  buildSingleLegDjSeries,
} from "@/components/athletes/ForcePlateSingleLegDJSection";
import HopTestsSection from "@/components/athletes/HopTestsSection";
import LRStartingLegEditor from "@/components/athletes/LRStartingLegEditor";
import PdfExportModal from "@/components/athletes/PdfExportModal";
import SectionComment from "@/components/athletes/SectionComment";
import SectionJumpNav from "@/components/athletes/SectionJumpNav";
import SnapshotHeader from "@/components/athletes/SnapshotHeader";
import PerformanceSummaryGrid from "@/components/athletes/PerformanceSummaryGrid";
import SprintPerformanceCharts from "@/components/athletes/SprintPerformanceCharts";
import TimepointSummary from "@/components/athletes/TimepointSummary";
import AthleteRingPanel from "@/components/AthleteRingPanel";
import AthleteTestSummary from "@/components/AthleteTestSummary";
import AthleteIdentityCard from "@/components/athletes/AthleteIdentityCard";
import SessionDetailByDate from "@/components/athletes/SessionDetailByDate";
import ZoomableChart from "@/components/charts/ZoomableChart";
import {
  buildHopTestBlocks,
  formatChartAxisDate,
  isLinearSprintSession,
  type ReportHopTestRow,
  type ReportSessionRow,
  type ReportMetricRow,
} from "@/lib/athleteReportData";
import { groupSessionsByDate } from "@/lib/sessionDateGroups";
import {
  lrEligibleSessionsForAthlete,
  type LREligibleSession,
} from "@/lib/athleteCompareCharts";
import { formatDisplayDateTime } from "@/lib/dateDisplay";
import {
  ALL_CRITERIA,
  fetchReportCriteria,
  fetchReportVisibility,
  setClinicDefault,
  setReportCriterion,
  setReportCutoff,
  setReportVisibility,
  type CriteriaResolver,
  type ReportVisibility,
} from "@/lib/reportSections";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";
import ReportBuilder from "@/components/athletes/ReportBuilder";
import {
  CHART_AXIS_LINE,
  CHART_AXIS_TICK,
  CHART_GRID,
  CHART_REFERENCE_STROKE,
  CHART_TOOLTIP_STYLE,
  ChartDefs,
} from "@/components/athletes/chartTheme";

const ALL_VISIBLE: ReportVisibility = {
  isSectionVisible: () => true,
  isSubtestVisible: () => true,
  raw: new Map(),
};

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
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return is1080Session(s) && (sub.includes("5-10-5") || sub.includes("5-0-5"));
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

// ─── Sprint / COD metric pickers ─────────────────────────────────────────────

type SprintChartId = "topSpeed" | "peakForce" | "peakPower" | "split5m";
type CodChartId = "topSpeed505" | "decelMax505" | "accelMax505";

const SPRINT_METRICS = [
  { key: "topSpeed", label: "Top Speed", unit: "m/s" },
  { key: "peakForce", label: "Peak Force", unit: "N" },
  { key: "peakPower", label: "Peak Power", unit: "W" },
  { key: "split5m", label: "5m Split Time", unit: "s" },
] as const;

const SPRINT_DEFAULT = new Set<string>(["topSpeed", "peakForce", "peakPower"]);

const COD_METRICS = [
  { key: "topSpeed505", label: "Top Speed", unit: "m/s" },
  { key: "decelMax505", label: "Peak Deceleration", unit: "m/s²" },
  { key: "accelMax505", label: "Peak Re-Acceleration", unit: "m/s²" },
] as const;

const COD_DEFAULT = new Set<string>(["topSpeed505", "decelMax505", "accelMax505"]);

type MetricDef = { key: string; label: string; unit: string };

function MetricPicker({
  metrics,
  defaultSelected,
  selected,
  onChange,
}: {
  metrics: readonly MetricDef[];
  defaultSelected: Set<string>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800"
      >
        Metrics ({selected.size}) ▼
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {metrics.map((m) => {
              const checked = selected.has(m.key);
              return (
                <li key={m.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(selected);
                        if (checked) next.delete(m.key);
                        else next.add(m.key);
                        onChange(next);
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 bg-white accent-lime-500"
                    />
                    <span>{m.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => onChange(new Set(defaultSelected))}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded bg-lime-400/20 px-2 py-1 text-xs font-medium text-lime-300 ring-1 ring-lime-500/40 hover:bg-lime-400/30"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Shared chart styles ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = CHART_TOOLTIP_STYLE;

const AXIS_TICK = CHART_AXIS_TICK;

function formatTrendValue(key: string, v: number): string {
  if (key === "peakForce" || key === "peakPower") return String(Math.round(v));
  if (key === "split5m" || key === "topSpeed" || key === "topSpeed505") return v.toFixed(2);
  return v.toFixed(2);
}

function ChartShell({
  title,
  enough,
  chartType,
  points,
  metricKey,
  unit,
}: {
  title: string;
  enough: boolean;
  chartType: ChartType;
  points: { label: string; v: number }[];
  metricKey: string;
  unit: string;
}) {
  const showChart = chartType === "bar" ? points.length >= 1 : enough;
  return (
    <div>
      <p className="mb-2 text-xs text-slate-400">{title}</p>
      {showChart ? (
        <ZoomableChart title={title} height={220} className="w-full rounded-xl border border-slate-200 bg-white">
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              {chartType === "bar" ? (
                <BarChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  {ChartDefs}
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={CHART_AXIS_LINE} />
                  <YAxis tick={AXIS_TICK} width={48} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#a3e635" }}
                    formatter={(v: number | string) => {
                      const n = typeof v === "number" ? v : Number(v);
                      const text = Number.isFinite(n) ? formatTrendValue(metricKey, n) : String(v);
                      return [unit ? `${text} ${unit}` : text, title];
                    }}
                  />
                  {points.length > 0 && (
                    <ReferenceLine
                      y={points[0]!.v}
                      stroke={CHART_REFERENCE_STROKE}
                      strokeDasharray="4 4"
                    />
                  )}
                  <Bar dataKey="v" fill="url(#f2pBar)" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              ) : (
                <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={CHART_AXIS_LINE} />
                  <YAxis tick={AXIS_TICK} width={48} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#a3e635" }}
                    formatter={(v: number | string) => {
                      const n = typeof v === "number" ? v : Number(v);
                      const text = Number.isFinite(n) ? formatTrendValue(metricKey, n) : String(v);
                      return [unit ? `${text} ${unit}` : text, title];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="#a3e635"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={{ fill: "#a3e635", r: 2.5, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </ZoomableChart>
      ) : (
        <p className="py-12 text-center text-xs text-slate-500">Not enough data</p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AthleteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const staffOk = useRequireDashboardStaff();

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [metricsBySession, setMetricsBySession] = useState<Map<string, MetricRow[]>>(() => new Map());
  const [perfMetricLatest, setPerfMetricLatest] = useState<Record<string, number>>({});
  const [perfMetricPrev, setPerfMetricPrev] = useState<Record<string, number>>({});
  const [perfMetricSides, setPerfMetricSides] = useState<Record<string, number>>({});
  const [perfIsoLatest, setPerfIsoLatest] = useState<
    | {
        kneeExtension: { left: number | null; right: number | null };
        kneeFlexion: { left: number | null; right: number | null };
        hipAbduction: { left: number | null; right: number | null };
      }
    | undefined
  >(undefined);
  const [perfDataLoading, setPerfDataLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hopTests, setHopTests] = useState<HopTestDbRow[]>([]);
  const [sectionCommentBySection, setSectionCommentBySection] = useState<
    Record<string, string | null>
  >({});
  const [visibleSprintCharts, setVisibleSprintCharts] = useState<Set<string>>(
    () => new Set(SPRINT_DEFAULT)
  );
  const [visibleCodCharts, setVisibleCodCharts] = useState<Set<string>>(
    () => new Set(COD_DEFAULT)
  );
  const [sprintChartType, setSprintChartType] = useState<ChartType>("bar");
  const [codChartType, setCodChartType] = useState<ChartType>("bar");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [lrPending, setLrPending] = useState<Set<string>>(() => new Set());
  const [lrSaveError, setLrSaveError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ReportVisibility>(ALL_VISIBLE);
  const [criteria, setCriteria] = useState<CriteriaResolver>(ALL_CRITERIA);

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

  const reloadVisibility = useCallback(async () => {
    if (!id) return;
    setVisibility(await fetchReportVisibility(id));
  }, [id]);

  const reloadCriteria = useCallback(async () => {
    if (!id) return;
    setCriteria(await fetchReportCriteria(id));
  }, [id]);

  const handleReportToggle = useCallback(
    async (section: string, subKey: string, visible: boolean) => {
      if (!id) return;
      await setReportVisibility({ athleteId: id, section, subKey, visible });
      await reloadVisibility();
    },
    [id, reloadVisibility]
  );

  const handleSetCriterion = useCallback(
    async (section: string, subKey: string, isCriterion: boolean) => {
      if (!id) return;
      await setReportCriterion({ athleteId: id, section, subKey, isCriterion });
      await reloadCriteria();
    },
    [id, reloadCriteria]
  );

  const handleSetCutoff = useCallback(
    async (section: string, subKey: string, lsiPass: number | null) => {
      if (!id) return;
      await setReportCutoff({ athleteId: id, section, subKey, lsiPass });
      await reloadCriteria();
    },
    [id, reloadCriteria]
  );

  const handleSetClinicDefault = useCallback(
    async (
      section: string,
      subKey: string,
      lsiPass: number,
      isCriterion: boolean
    ) => {
      await setClinicDefault({ section, subKey, lsiPass, isCriterion });
      await reloadCriteria();
    },
    [reloadCriteria]
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

      const vis = await fetchReportVisibility(id);
      if (!cancelled) setVisibility(vis);

      const c = await fetchReportCriteria(id);
      if (!cancelled) setCriteria(c);

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

  // Athlete's dashboard mode: 'rtp' (exit-criteria/LSI gauges, date-filtered,
  // editable cutoffs) or 'performance' (fixed composite 6-quality score, same
  // as the athlete's own login). Set per-athlete on the edit page.
  const dashboardMode: "rtp" | "performance" =
    String((athlete as Record<string, unknown> | null)?.dashboard_mode ?? "rtp") === "performance"
      ? "performance"
      : "rtp";

  // Performance-mode score data comes from a different pipeline (RPC-backed,
  // not date-filtered) than the RTP gauges above, so it's fetched separately
  // and only when this athlete is actually in performance mode.
  useEffect(() => {
    if (!staffOk || !id || dashboardMode !== "performance") return;
    let cancelled = false;
    (async () => {
      setPerfDataLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/athlete-dashboard/${id}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setPerfDataLoading(false);
        return;
      }
      setPerfMetricLatest((json.metricLatest as Record<string, number>) ?? {});
      setPerfMetricPrev((json.metricPrev as Record<string, number>) ?? {});
      setPerfMetricSides((json.metricSides as Record<string, number>) ?? {});

      const fpTrendMetrics = (json.fpTrendMetrics as {
        session_date: string;
        test_type: string;
        test_sub_type: string | null;
        key: string;
        value: string;
        side: string | null;
      }[]) ?? [];
      const isoRows = fpTrendMetrics.filter((r) => r.test_type === "force_plate_isometric");
      const latestDate = isoRows.length
        ? [...new Set(isoRows.map((r) => r.session_date.slice(0, 10)))].sort().at(-1)
        : null;
      if (latestDate) {
        const day = isoRows.filter((r) => r.session_date.slice(0, 10) === latestDate);
        const getSide = (subKeyword: string, side: string): number | null => {
          const r = day.find(
            (x) =>
              (x.test_sub_type ?? "").toLowerCase().includes(subKeyword) &&
              x.key === "peak_force" &&
              x.side === side
          );
          return r ? Number(r.value) : null;
        };
        setPerfIsoLatest({
          kneeExtension: { left: getSide("knee extension", "left"), right: getSide("knee extension", "right") },
          kneeFlexion: { left: getSide("knee flexion", "left"), right: getSide("knee flexion", "right") },
          hipAbduction: { left: getSide("hip abduction", "left"), right: getSide("hip abduction", "right") },
        });
      } else {
        setPerfIsoLatest(undefined);
      }
      setPerfDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk, id, dashboardMode]);

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
  const hasLinearSprint = filteredSessions.some((s) => isLinearSprintSession(s, metricsBySession));
  // The COD protocol actually recorded (5-0-5 vs 5-10-5) varies by athlete/device —
  // derive the label from the real test_sub_type instead of hardcoding one.
  const codProtocolLabel = useMemo(() => {
    const sample = filteredSessions.find(is505Session);
    const sub = (sample?.test_sub_type ?? "").toLowerCase();
    if (sub.includes("5-10-5")) return "5-10-5";
    if (sub.includes("5-0-5")) return "5-0-5";
    return "COD";
  }, [filteredSessions]);

  const hawkinsSessions = useMemo(
    () =>
      sessionsChronological(
        filteredSessions.filter((s) => bucket(s.source) === "hawkins")
      ),
    [filteredSessions]
  );

  const cmjSeries = useMemo(
    () => buildCmjDataPoints(hawkinsSessions, metricsBySession),
    [hawkinsSessions, metricsBySession]
  );

  const djSeries = useMemo(
    () => buildDjDataPoints(hawkinsSessions, metricsBySession),
    [hawkinsSessions, metricsBySession]
  );

  const slDjSeries = useMemo(
    () => buildSingleLegDjSeries(hawkinsSessions, metricsBySession),
    [hawkinsSessions, metricsBySession]
  );

  const hopTestBlocks = useMemo(
    () => buildHopTestBlocks(filteredHopTests),
    [filteredHopTests]
  );

  const sectionsWithData = useMemo(() => {
    const keys: string[] = ["summary"];
    if (has1080Charts && hasLinearSprint && visibility.isSectionVisible("linear"))
      keys.push("linear");
    if (has505 && visibility.isSectionVisible("cod")) keys.push("cod");
    if (cmjSeries.length > 0 && visibility.isSectionVisible("cmj")) keys.push("cmj");
    if (djSeries.length > 0 && visibility.isSectionVisible("drop_jump"))
      keys.push("drop_jump");
    if (slDjSeries.length > 0 && visibility.isSectionVisible("drop_jump_single"))
      keys.push("drop_jump_single");
    if (visibility.isSectionVisible("hop_tests")) keys.push("hop_tests");
    return keys;
  }, [
    has1080Charts,
    hasLinearSprint,
    has505,
    cmjSeries.length,
    djSeries.length,
    slDjSeries.length,
    visibility,
  ]);

  function sectionNote(section: string): string | null {
    return sectionCommentBySection[section] ?? null;
  }

  // ── Linear sprint trend data ──────────────────────────────────────────────────
  // Grouped by calendar date first (see lib/sessionDateGroups) so two sessions
  // recorded the same day — re-tests, a warm-up rep, per-leg sessions, etc. —
  // collapse to a single point (the day's best effort by top speed) instead of
  // plotting twice on the same date. The "Session detail" list below the chart
  // grid lets you click that date to see every session recorded that day.

  const linearSessionsForTrend = useMemo(
    () =>
      filteredSessions.filter(
        (s) =>
          isLinearSprintSession(s, metricsBySession) &&
          visibility.isSubtestVisible("linear", s.test_sub_type ?? "")
      ),
    [filteredSessions, metricsBySession, visibility]
  );

  const linearDateGroups = useMemo(
    () =>
      groupSessionsByDate(linearSessionsForTrend, (s) =>
        metricAggregate(metricsBySession, s.id, "top_speed", "max")
      ),
    [linearSessionsForTrend, metricsBySession]
  );

  const trendFromDateGroups = useCallback(
    (groups: ReturnType<typeof groupSessionsByDate<SessionRow>>, key: string, mode: "max" | "min") => {
      const points: { t: number; label: string; v: number }[] = [];
      for (const g of groups) {
        const v = metricAggregate(metricsBySession, g.best.id, key, mode);
        if (v == null) continue;
        points.push({
          t: new Date(g.date).getTime(),
          label: formatChartAxisDate(g.best.session_date),
          v,
        });
      }
      return { points, enough: points.length >= 2 };
    },
    [metricsBySession]
  );

  const trendTopSpeed = useMemo(
    () => trendFromDateGroups(linearDateGroups, "top_speed", "max"),
    [linearDateGroups, trendFromDateGroups]
  );

  const trendPeakForce = useMemo(
    () => trendFromDateGroups(linearDateGroups, "peak_force", "max"),
    [linearDateGroups, trendFromDateGroups]
  );

  const trendPeakPower = useMemo(
    () => trendFromDateGroups(linearDateGroups, "peak_power", "max"),
    [linearDateGroups, trendFromDateGroups]
  );

  const trendSplit5m = useMemo(
    () => trendFromDateGroups(linearDateGroups, "split_5m_time", "min"),
    [linearDateGroups, trendFromDateGroups]
  );

  // ── 5-10-5 COD trend data ─────────────────────────────────────────────────────

  const codSessionsForTrend = useMemo(
    () =>
      filteredSessions.filter(
        (s) => is505Session(s) && visibility.isSubtestVisible("cod", s.test_sub_type ?? "")
      ),
    [filteredSessions, visibility]
  );

  const codDateGroups = useMemo(
    () =>
      groupSessionsByDate(codSessionsForTrend, (s) =>
        metricAggregate(metricsBySession, s.id, "top_speed", "max")
      ),
    [codSessionsForTrend, metricsBySession]
  );

  const trend505TopSpeed = useMemo(
    () => trendFromDateGroups(codDateGroups, "top_speed", "max"),
    [codDateGroups, trendFromDateGroups]
  );

  const trend505DecelMax = useMemo(
    () => trendFromDateGroups(codDateGroups, "decel_max", "max"),
    [codDateGroups, trendFromDateGroups]
  );

  const trend505AccelMax = useMemo(
    () => trendFromDateGroups(codDateGroups, "accel_max", "max"),
    [codDateGroups, trendFromDateGroups]
  );

  // ── Misc ─────────────────────────────────────────────────────────────────────

  const name = athlete ? `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() || "Athlete" : "";

  function toggleExpand(sid: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; });
  }
  function renderSessionSection(list: SessionRow[]) {
    if (list.length === 0) return <p className="text-xs text-slate-500">No sessions.</p>;
    return (
      <div className="space-y-2">
        {list.map((s) => {
          const rows = metricsBySession.get(s.id) ?? [];
          const open = expanded.has(s.id);
          return (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => toggleExpand(s.id)}
              >
                <span className="text-slate-700">{formatWhen(s.session_date)}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
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
                <div className="border-t border-slate-100 px-3 py-2">
                  {rows.length === 0 ? (
                    <p className="text-xs text-slate-400">No metrics.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.key}-${r.rep_index ?? i}`} className="border-b border-slate-100">
                            <td className="py-1 pr-2 text-slate-500">
                              {labelForMetricKey(r.key)}
                              {r.rep_index != null ? ` (rep ${r.rep_index})` : ""}
                            </td>
                            <td className="py-1 text-right font-mono text-slate-700">
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

  function renderTrendSessionSummary(s: SessionRow) {
    const rows = metricsBySession.get(s.id) ?? [];
    return (
      <span className="text-slate-600">
        {s.test_sub_type ?? s.test_type ?? "Session"}
        <span className="ml-2 text-slate-400">{rows.length} metrics</span>
      </span>
    );
  }

  function renderTrendSessionDetail(s: SessionRow) {
    const rows = metricsBySession.get(s.id) ?? [];
    if (rows.length === 0) return <p className="text-xs text-slate-400">No metrics.</p>;
    return (
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.key}-${r.rep_index ?? i}`} className="border-b border-slate-100 last:border-0">
              <td className="py-1 pr-2 text-slate-500">
                {labelForMetricKey(r.key)}
                {r.rep_index != null ? ` (rep ${r.rep_index})` : ""}
              </td>
              <td className="py-1 text-right font-mono text-slate-700">
                {formatMetricValue(r.value, r.key)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const sprintTrendByKey: Record<
    SprintChartId,
    { points: { t: number; label: string; v: number }[]; enough: boolean }
  > = {
    topSpeed: trendTopSpeed,
    peakForce: trendPeakForce,
    peakPower: trendPeakPower,
    split5m: trendSplit5m,
  };

  const codTrendByKey: Record<
    CodChartId,
    { points: { t: number; label: string; v: number }[]; enough: boolean }
  > = {
    topSpeed505: trend505TopSpeed,
    decelMax505: trend505DecelMax,
    accelMax505: trend505AccelMax,
  };

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
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
            {dashboardMode === "performance" ? (
              <div className="mt-6 space-y-6">
                <AthleteIdentityCard athlete={athlete} />
                <AthleteRingPanel metricLatest={perfMetricLatest} metricPrev={perfMetricPrev} />
                {perfDataLoading ? (
                  <p className="text-xs text-slate-400">Loading performance data…</p>
                ) : null}
                <AthleteTestSummary
                  metricLatest={perfMetricLatest}
                  metricPrev={perfMetricPrev}
                  metricSides={perfMetricSides}
                  sectionComments={sectionCommentBySection as Record<string, string>}
                  isoLatest={perfIsoLatest}
                />
              </div>
            ) : (
              <SnapshotHeader
                athlete={athlete}
                sessions={filteredSessions}
                metricsBySession={metricsBySession}
                hopTests={filteredHopTests}
                visibility={visibility}
                criteria={criteria}
              />
            )}

            <div className="mt-6">
              <PerformanceSummaryGrid
                athleteId={id}
                targetProfileId={(athlete?.target_profile_id as string | null) ?? null}
                sessions={filteredSessions}
                metricsBySession={metricsBySession}
                sectionComment={sectionNote("performance_summary")}
                onProfileChange={(pid) =>
                  setAthlete((a) => (a ? { ...a, target_profile_id: pid } : a))
                }
              />
            </div>

            <div className="mt-6">
              <SprintPerformanceCharts athleteId={id} />
            </div>

            <SectionJumpNav sectionsWithData={sectionsWithData} />

            <ReportBuilder
              sessions={filteredSessions}
              visibility={visibility}
              criteria={criteria}
              hopTests={filteredHopTests}
              onToggle={handleReportToggle}
              onSetCriterion={handleSetCriterion}
              onSetCutoff={handleSetCutoff}
              onSetClinicDefault={handleSetClinicDefault}
            />

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
              visibility={visibility}
              criteria={criteria}
            />

            {/* ── Linear sprint trends (1080) ── */}
            {has1080Charts && hasLinearSprint && visibility.isSectionVisible("linear") && (
              <section id="linear" className="scroll-mt-28 mt-8">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
                    Sprint trends — Linear
                  </h2>
                  <div className="flex items-center gap-2">
                    <ChartTypeToggle value={sprintChartType} onChange={setSprintChartType} />
                    <MetricPicker
                      metrics={SPRINT_METRICS}
                      defaultSelected={SPRINT_DEFAULT}
                      selected={visibleSprintCharts}
                      onChange={setVisibleSprintCharts}
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {SPRINT_METRICS.filter((m) => visibleSprintCharts.has(m.key)).map((metric) => {
                    const trend = sprintTrendByKey[metric.key as SprintChartId];
                    const title = `${metric.label} over time (best rep)`;
                    return (
                      <ChartShell
                        key={metric.key}
                        title={title}
                        enough={trend.enough}
                        chartType={sprintChartType}
                        points={trend.points}
                        metricKey={metric.key}
                        unit={metric.unit}
                      />
                    );
                  })}
                </div>
                <SessionDetailByDate
                  title="Session detail"
                  groups={linearDateGroups}
                  renderSummary={renderTrendSessionSummary}
                  renderDetail={renderTrendSessionDetail}
                />
                <SectionComment
                  athleteId={id}
                  section="linear"
                  initialComment={sectionNote("linear")}
                />
              </section>
            )}

            {/* ── COD trends (5-0-5 / 5-10-5) ── */}
            {has505 && visibility.isSectionVisible("cod") && (
              <section id="cod" className="scroll-mt-28 mt-10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
                      COD trends — {codProtocolLabel}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Best rep per session. Top speed and peak re-acceleration higher is better; peak
                      deceleration higher indicates greater braking capacity.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ChartTypeToggle value={codChartType} onChange={setCodChartType} />
                    <MetricPicker
                      metrics={COD_METRICS}
                      defaultSelected={COD_DEFAULT}
                      selected={visibleCodCharts}
                      onChange={setVisibleCodCharts}
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {COD_METRICS.filter((m) => visibleCodCharts.has(m.key)).map((metric) => {
                    const trend = codTrendByKey[metric.key as CodChartId];
                    const title = `${metric.label} — ${codProtocolLabel} (best rep)`;
                    return (
                      <ChartShell
                        key={metric.key}
                        title={title}
                        enough={trend.enough}
                        chartType={codChartType}
                        points={trend.points}
                        metricKey={metric.key}
                        unit={metric.unit}
                      />
                    );
                  })}
                </div>
                <SessionDetailByDate
                  title="Session detail"
                  groups={codDateGroups}
                  renderSummary={renderTrendSessionSummary}
                  renderDetail={renderTrendSessionDetail}
                />
                <SectionComment
                  athleteId={id}
                  section="cod"
                  initialComment={sectionNote("cod")}
                />
              </section>
            )}

            {cmjSeries.length > 0 && visibility.isSectionVisible("cmj") && (
              <ForcePlateCMJSection
                athleteId={id}
                data={cmjSeries}
                sessions={hawkinsSessions}
                metricsBySession={metricsBySession}
                sectionComment={sectionNote("cmj")}
              />
            )}

            {djSeries.length > 0 && visibility.isSectionVisible("drop_jump") && (
              <ForcePlateDJSection
                athleteId={id}
                data={djSeries}
                sessions={hawkinsSessions}
                metricsBySession={metricsBySession}
                sectionComment={sectionNote("drop_jump")}
              />
            )}

            {slDjSeries.length > 0 && visibility.isSectionVisible("drop_jump_single") && (
              <ForcePlateSingleLegDJSection
                athleteId={id}
                data={slDjSeries}
                sectionComment={sectionNote("drop_jump_single")}
              />
            )}

            {visibility.isSectionVisible("hop_tests") && (
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
            )}

            {visibility.isSectionVisible("dynamometry") && (
              <DynamometrySection
                athleteId={id}
                sectionComment={sectionNote("dynamometry")}
                dateFrom={rangeStart ? new Date(rangeStart) : null}
                dateTo={rangeEnd ? new Date(rangeEnd) : null}
                visibility={visibility}
              />
            )}

            {/* ── LR session settings (Phase D-C) ── */}
            {lrSessionsByAthlete.get(id)?.length && visibility.isSectionVisible("lr_settings") ? (
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

            {/* ── Sessions (collapsed by default so a long history doesn't dominate the page) ── */}
            <details className="group mt-10">
              <summary className="flex cursor-pointer items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
                    Sessions
                  </h2>
                  <span className="text-xs text-slate-500">({sessions.length})</span>
                </span>
                <span className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 group-hover:border-slate-300">
                  View
                  <span className="transition-transform group-open:rotate-180">▾</span>
                </span>
              </summary>
              <div className="mt-4 flex justify-end">
                <Link
                  href={`/dashboard/athletes/${id}/hop-tests`}
                  className="text-xs text-lime-300/90 hover:text-lime-300 hover:underline"
                >
                  Hop tests →
                </Link>
              </div>
              <div className="mt-2 max-h-[640px] space-y-8 overflow-y-auto pr-2">
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
            </details>
          </>
        ) : null}
      </section>
    </main>
  );
}
