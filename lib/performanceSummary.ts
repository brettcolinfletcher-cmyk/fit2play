import {
  bucket,
  formatChartAxisDate,
  isLinearSprintSession,
  metricAggregate,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/reportCore";

/** Legacy 3-state read, kept for anything that only needs pass/warn/fail. */
export type SummaryStatus = "pass" | "warn" | "fail" | "no_data";

/** 5-point qualitative read against target, e.g. for a "how's this athlete tracking" badge. */
export type SummaryTier = "needs_work" | "developing" | "building" | "good" | "excellent" | "no_data";

export type SummaryMetric = {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  displayValue: string;
  target: number;
  targetLabel: string;
  /** value/target normalised so >=1 always means "at or beyond target", regardless of direction. Null when no data. */
  ratio: number | null;
  status: SummaryStatus;
  tier: SummaryTier;
  tierLabel: string;
  /** Short date only, e.g. "12 Aug 2026" — for per-row display when sources differ within a category. */
  sourceDate: string | null;
  /** Full "Test sub-type · date" — for a once-per-category subtitle when every metric shares one source. */
  sourceLabel: string | null;
};

export type SummaryCategory = {
  id: string;
  label: string;
  /** Set when every metric in this category was pulled from the same session — show once, not per row. */
  commonSourceLabel: string | null;
  metrics: SummaryMetric[];
};

export type Direction = "higher" | "lower";

export type MetricTarget = {
  target: number;
  direction: Direction;
};

/**
 * Canonical registry of every metric the Performance Summary can show —
 * id, label, unit, decimal places, direction, and a starter default target.
 * This is the single source of truth for both the dashboard and the target
 * profile editor (so the editor always has a full row list to render, even
 * before a clinic has customised anything).
 *
 * Defaults are generic placeholder thresholds, NOT validated clinical
 * cutoffs — a starting point to tune per population/sport, not a diagnosis.
 * They're mirrored in the `performance_targets` "Default" profile seed row
 * (supabase/migrations) — keep the two in sync if you change one.
 */
export const METRIC_REGISTRY: {
  id: string;
  categoryId: string;
  categoryLabel: string;
  label: string;
  unit: string;
  decimals: number;
  direction: Direction;
  defaultTarget: number;
}[] = [
  { id: "cmj_jump_height", categoryId: "cmj", categoryLabel: "CMJ", label: "Jump Height", unit: "cm", decimals: 1, direction: "higher", defaultTarget: 30 },
  { id: "cmj_conc_peak_force", categoryId: "cmj", categoryLabel: "CMJ", label: "Conc. Peak Force", unit: "N", decimals: 0, direction: "higher", defaultTarget: 1500 },
  { id: "cmj_propulsive_impulse", categoryId: "cmj", categoryLabel: "CMJ", label: "Propulsive Impulse", unit: "N·s", decimals: 0, direction: "higher", defaultTarget: 220 },
  { id: "power_cmj_peak_power", categoryId: "power", categoryLabel: "Power", label: "CMJ Peak Power", unit: "W", decimals: 0, direction: "higher", defaultTarget: 3500 },
  { id: "power_cmj_rsi_mod", categoryId: "power", categoryLabel: "Power", label: "CMJ RSI (mod)", unit: "", decimals: 2, direction: "higher", defaultTarget: 0.35 },
  { id: "power_1080_peak_power", categoryId: "power", categoryLabel: "Power", label: "1080 Peak Power", unit: "W", decimals: 0, direction: "higher", defaultTarget: 500 },
  { id: "speed_40m", categoryId: "speed", categoryLabel: "Speed", label: "1080 40m Sprint", unit: "s", decimals: 2, direction: "lower", defaultTarget: 5.6 },
  { id: "accel_5m", categoryId: "accel", categoryLabel: "Accel", label: "1080 5m Sprint Time", unit: "s", decimals: 2, direction: "lower", defaultTarget: 1.05 },
  { id: "accel_10m", categoryId: "accel", categoryLabel: "Accel", label: "1080 10m Sprint Time", unit: "s", decimals: 2, direction: "lower", defaultTarget: 1.85 },
  { id: "accel_505_max_accel", categoryId: "accel", categoryLabel: "Accel", label: "5-0-5 Max Accel", unit: "m/s²", decimals: 2, direction: "higher", defaultTarget: 5.0 },
  { id: "decel_cmj_rfd", categoryId: "decel", categoryLabel: "Decel", label: "CMJ Ecc. Decel RFD", unit: "N/s", decimals: 0, direction: "higher", defaultTarget: 4000 },
  { id: "decel_505_max_decel", categoryId: "decel", categoryLabel: "Decel", label: "1080 5-0-5 Max Decel", unit: "m/s²", decimals: 2, direction: "higher", defaultTarget: 5.0 },
  { id: "cod_505_total_time", categoryId: "cod", categoryLabel: "Change of Direction", label: "5-0-5 Total Time", unit: "s", decimals: 2, direction: "lower", defaultTarget: 2.5 },
  { id: "strength_hip_abduction", categoryId: "strength", categoryLabel: "Strength (Isometric)", label: "Hip Abduction", unit: "N", decimals: 0, direction: "higher", defaultTarget: 200 },
  { id: "strength_hip_adduction", categoryId: "strength", categoryLabel: "Strength (Isometric)", label: "Hip Adduction", unit: "N", decimals: 0, direction: "higher", defaultTarget: 200 },
  { id: "strength_knee_extension", categoryId: "strength", categoryLabel: "Strength (Isometric)", label: "Knee Extension", unit: "N", decimals: 0, direction: "higher", defaultTarget: 300 },
  { id: "strength_knee_flexion", categoryId: "strength", categoryLabel: "Strength (Isometric)", label: "Knee Flexion", unit: "N", decimals: 0, direction: "higher", defaultTarget: 200 },
];

const METRIC_BY_ID = new Map(METRIC_REGISTRY.map((m) => [m.id, m]));

/**
 * Canonical HHD movements the Strength card groups by. Real Hawkins
 * test_sub_type strings are inconsistent — e.g. "TS Isometric Test-Abduction:1",
 * "TS Isometric Test-Abduction-Right:1", and "TS Isometric Test-hip supine
 * adduction:1" have all been seen for the same two movements — so matching
 * is done by keyword rather than parseHhdMovement's exact-token output
 * (which is used elsewhere for free-text display, not canonical grouping).
 */
const STRENGTH_MOVEMENTS: { metricId: string; keywords: string[] }[] = [
  { metricId: "strength_hip_abduction", keywords: ["abduction"] },
  { metricId: "strength_hip_adduction", keywords: ["adduction"] },
  { metricId: "strength_knee_extension", keywords: ["knee", "extension"] },
  { metricId: "strength_knee_flexion", keywords: ["knee", "flexion"] },
];

function matchesStrengthMovement(subType: string | null | undefined, keywords: string[]): boolean {
  const s = (subType ?? "").toLowerCase();
  return keywords.every((k) => s.includes(k));
}

export const TIER_LABELS: Record<SummaryTier, string> = {
  needs_work: "Needs Work",
  developing: "Developing",
  building: "Building",
  good: "Good",
  excellent: "Excellent",
  no_data: "No data",
};

// Ratio thresholds are of "how close to / past target", normalised so that
// >=1 always means "at or beyond target" regardless of higher/lower-better.
function tierForRatio(ratio: number | null): SummaryTier {
  if (ratio == null || !Number.isFinite(ratio)) return "no_data";
  if (ratio >= 1.1) return "excellent";
  if (ratio >= 1.0) return "good";
  if (ratio >= 0.9) return "building";
  if (ratio >= 0.75) return "developing";
  return "needs_work";
}

function statusForTier(tier: SummaryTier): SummaryStatus {
  if (tier === "no_data") return "no_data";
  if (tier === "excellent" || tier === "good") return "pass";
  if (tier === "building") return "warn";
  return "fail";
}

function fmt(value: number | null, decimals: number, unit: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}

function ratioOf(value: number | null, target: number, direction: Direction): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return direction === "higher" ? value / target : target / value;
}

function is505Session(s: ReportSessionRow): boolean {
  if (bucket(s.source) !== "1080") return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return sub.includes("5-0-5") || sub.includes("5-10-5");
}

function isTenMAccelSession(s: ReportSessionRow): boolean {
  if (bucket(s.source) !== "1080") return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return sub.includes("10m acceleration");
}

function latestSessionOf(
  sessions: ReportSessionRow[],
  predicate: (s: ReportSessionRow) => boolean
): ReportSessionRow | null {
  let best: ReportSessionRow | null = null;
  let bestTime = -Infinity;
  for (const s of sessions) {
    if (!predicate(s) || !s.session_date) continue;
    const t = new Date(s.session_date).getTime();
    if (t >= bestTime) {
      bestTime = t;
      best = s;
    }
  }
  return best;
}

/**
 * Most recent session matching `predicate` that actually has a value for
 * `key` — lets us skip past sessions where a given split/metric wasn't
 * captured instead of just taking the single latest session of that type.
 */
function latestSessionWithMetric(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  predicate: (s: ReportSessionRow) => boolean,
  key: string
): ReportSessionRow | null {
  const candidates = sessions
    .filter((s) => predicate(s) && s.session_date)
    .sort((a, b) => new Date(b.session_date!).getTime() - new Date(a.session_date!).getTime());
  for (const s of candidates) {
    if (metricAggregate(metricsBySession, s.id, key, "min") != null) return s;
  }
  return null;
}

// The 1080 device doesn't tag sessions with a fixed test distance — "40m
// sprint" sessions are best identified by the actual distance recorded
// (total_distance), tolerating a device stopping a metre or two short/long
// of the configured 40m. But several synced sessions never got a
// total_distance metric captured at all, so as a fallback we accept a
// "Linear bilateral" / "Running (LR)" session by name alone (these are the
// two 1080 protocols actually used for a full-length sprint, per Brett).
const FORTY_M_TOLERANCE = 5;
const FORTY_M_SUB_TYPE_FALLBACKS = ["linear bilateral", "running (lr)"];

function latest40mSession(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>
): ReportSessionRow | null {
  const candidates = sessions
    .filter((s) => isLinearSprintSession(s) && s.session_date)
    .sort((a, b) => new Date(b.session_date!).getTime() - new Date(a.session_date!).getTime());

  for (const s of candidates) {
    const dist = metricAggregate(metricsBySession, s.id, "total_distance", "max");
    if (dist != null && Math.abs(dist - 40) <= FORTY_M_TOLERANCE) return s;
  }

  // Fallback: no session had a confirmed ~40m distance reading (sync gap) —
  // take the latest by-name match that actually has a time to show.
  for (const s of candidates) {
    const sub = (s.test_sub_type ?? "").toLowerCase();
    if (!FORTY_M_SUB_TYPE_FALLBACKS.some((name) => sub.includes(name))) continue;
    if (metricAggregate(metricsBySession, s.id, "total_time", "min") != null) return s;
  }

  return null;
}

/** Strips Hawkins' rep-count suffix, e.g. "Countermovement Jump:4" → "Countermovement Jump". */
function cleanSubType(sub: string | null | undefined): string {
  return (sub ?? "").replace(/:\d+$/, "").trim();
}

function sourceDate(s: ReportSessionRow | null): string | null {
  if (!s || !s.session_date) return null;
  return formatChartAxisDate(s.session_date);
}

function sourceLabel(s: ReportSessionRow | null): string | null {
  if (!s || !s.session_date) return null;
  const sub = cleanSubType(s.test_sub_type);
  return `${sub || "Session"} · ${formatChartAxisDate(s.session_date)}`;
}

/**
 * Latest isometric session(s) for a given HHD movement — returns the max
 * peak_force per side recorded on the most recent test date for that
 * movement, plus a representative session for the source label.
 */
function latestIsoForMovement(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  keywords: string[]
): { left: number | null; right: number | null; source: ReportSessionRow | null } {
  const matching = sessions.filter(
    (s) => s.test_type === "force_plate_isometric" && matchesStrengthMovement(s.test_sub_type, keywords)
  );

  let latestDate: string | null = null;
  for (const s of matching) {
    if (!s.session_date) continue;
    const d = s.session_date.slice(0, 10);
    if (!latestDate || d > latestDate) latestDate = d;
  }
  if (!latestDate) return { left: null, right: null, source: null };

  const onDate = matching.filter((s) => s.session_date && s.session_date.slice(0, 10) === latestDate);
  let left: number | null = null;
  let right: number | null = null;
  for (const s of onDate) {
    const rows = metricsBySession.get(s.id) ?? [];
    for (const r of rows) {
      if (r.key !== "peak_force" || r.value == null || !Number.isFinite(r.value)) continue;
      const side = (r.side ?? "").toLowerCase();
      if (side === "left") left = left == null ? r.value : Math.max(left, r.value);
      if (side === "right") right = right == null ? r.value : Math.max(right, r.value);
    }
  }
  return { left, right, source: onDate[0] ?? null };
}

export function computePerformanceSummary(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  targetOverrides?: Record<string, MetricTarget>
): SummaryCategory[] {
  function resolveTarget(id: string): { target: number; direction: Direction } {
    const override = targetOverrides?.[id];
    if (override) return override;
    const def = METRIC_BY_ID.get(id);
    return { target: def?.defaultTarget ?? 0, direction: def?.direction ?? "higher" };
  }

  function metric(id: string, value: number | null, source: ReportSessionRow | null): SummaryMetric {
    const def = METRIC_BY_ID.get(id);
    if (!def) throw new Error(`Unknown performance summary metric id: ${id}`);
    const { target, direction } = resolveTarget(id);
    const ratio = ratioOf(value, target, direction);
    const tier = tierForRatio(ratio);
    return {
      id,
      label: def.label,
      unit: def.unit,
      value,
      displayValue: fmt(value, def.decimals, def.unit),
      target,
      targetLabel: `${direction === "higher" ? "≥" : "≤"} ${target}${def.unit ? ` ${def.unit}` : ""}`,
      ratio,
      status: statusForTier(tier),
      tier,
      tierLabel: TIER_LABELS[tier],
      sourceDate: sourceDate(source),
      sourceLabel: sourceLabel(source),
    };
  }

  /** L/R pair as one metric row — tier/ratio driven by the weaker (limiting) side. */
  function metricLR(
    id: string,
    left: number | null,
    right: number | null,
    source: ReportSessionRow | null
  ): SummaryMetric {
    const def = METRIC_BY_ID.get(id);
    if (!def) throw new Error(`Unknown performance summary metric id: ${id}`);
    const { target, direction } = resolveTarget(id);
    const weaker = left != null && right != null ? Math.min(left, right) : left ?? right ?? null;
    const ratio = ratioOf(weaker, target, direction);
    const tier = tierForRatio(ratio);
    const lStr = left != null ? left.toFixed(def.decimals) : "—";
    const rStr = right != null ? right.toFixed(def.decimals) : "—";
    const displayValue = left == null && right == null ? "—" : `L ${lStr} · R ${rStr}${def.unit ? ` ${def.unit}` : ""}`;
    return {
      id,
      label: def.label,
      unit: def.unit,
      value: weaker,
      displayValue,
      target,
      targetLabel: `${direction === "higher" ? "≥" : "≤"} ${target}${def.unit ? ` ${def.unit}` : ""} (weaker side)`,
      ratio,
      status: statusForTier(tier),
      tier,
      tierLabel: TIER_LABELS[tier],
      sourceDate: sourceDate(source),
      sourceLabel: sourceLabel(source),
    };
  }

  function withCommonSource(id: string, label: string, metrics: SummaryMetric[]): SummaryCategory {
    const labels = new Set(metrics.map((m) => m.sourceLabel).filter((s): s is string => s != null));
    const commonSourceLabel = labels.size === 1 ? [...labels][0]! : null;
    return { id, label, commonSourceLabel, metrics };
  }

  const cmjSession = latestSessionOf(
    sessions,
    (s) => bucket(s.source) === "hawkins" && s.test_type === "force_plate_cmj"
  );
  const codSession = latestSessionOf(sessions, is505Session);
  const tenMSession = latestSessionOf(sessions, isTenMAccelSession);
  const fortyMSession = latest40mSession(sessions, metricsBySession);
  const fiveMSession = latestSessionWithMetric(
    sessions,
    metricsBySession,
    (s) => bucket(s.source) === "1080",
    "split_5m_time"
  );
  const peakPowerSession = latestSessionWithMetric(
    sessions,
    metricsBySession,
    (s) => bucket(s.source) === "1080",
    "peak_power"
  );

  const cmj = (key: string) =>
    cmjSession ? metricAggregate(metricsBySession, cmjSession.id, key, "max") : null;
  const codMax = (key: string) =>
    codSession ? metricAggregate(metricsBySession, codSession.id, key, "max") : null;
  const codMin = (key: string) =>
    codSession ? metricAggregate(metricsBySession, codSession.id, key, "min") : null;

  // fp_jump_height is stored in metres (matches the CMJ chart / hero tile
  // elsewhere in the app) — convert to cm for display, same as
  // buildCmjDataPoints in ForcePlateCMJSection.
  const jumpHeightM = cmj("fp_jump_height");
  const jumpHeightCm = jumpHeightM != null && Number.isFinite(jumpHeightM) ? jumpHeightM * 100 : null;

  const categories: SummaryCategory[] = [
    withCommonSource("cmj", "CMJ", [
      metric("cmj_jump_height", jumpHeightCm, cmjSession),
      metric("cmj_conc_peak_force", cmj("fp_peak_propulsive_force"), cmjSession),
      metric("cmj_propulsive_impulse", cmj("fp_propulsive_impulse"), cmjSession),
    ]),
    withCommonSource("power", "Power", [
      metric("power_cmj_peak_power", cmj("fp_peak_propulsive_power"), cmjSession),
      metric("power_cmj_rsi_mod", cmj("fp_mrsi"), cmjSession),
      metric(
        "power_1080_peak_power",
        peakPowerSession ? metricAggregate(metricsBySession, peakPowerSession.id, "peak_power", "max") : null,
        peakPowerSession
      ),
    ]),
    withCommonSource("speed", "Speed", [
      metric(
        "speed_40m",
        fortyMSession ? metricAggregate(metricsBySession, fortyMSession.id, "total_time", "min") : null,
        fortyMSession
      ),
    ]),
    withCommonSource("accel", "Accel", [
      metric(
        "accel_5m",
        fiveMSession ? metricAggregate(metricsBySession, fiveMSession.id, "split_5m_time", "min") : null,
        fiveMSession
      ),
      metric(
        "accel_10m",
        tenMSession ? metricAggregate(metricsBySession, tenMSession.id, "total_time", "min") : null,
        tenMSession
      ),
      metric("accel_505_max_accel", codMax("accel_max"), codSession),
    ]),
    withCommonSource("decel", "Decel", [
      metric("decel_cmj_rfd", cmj("fp_braking_rfd"), cmjSession),
      metric("decel_505_max_decel", codMax("decel_max"), codSession),
    ]),
    withCommonSource("cod", "Change of Direction", [
      // TODO: Brett asked for this "corrected for distance" — the exact
      // correction formula wasn't specified, so this is the raw 1080
      // total_time for now. Confirm what "corrected" should mean
      // (e.g. normalised against the session's recorded total_distance)
      // and adjust here.
      metric("cod_505_total_time", codMin("total_time"), codSession),
    ]),
    withCommonSource(
      "strength",
      "Strength (Isometric)",
      STRENGTH_MOVEMENTS.map(({ metricId, keywords }) => {
        const { left, right, source } = latestIsoForMovement(sessions, metricsBySession, keywords);
        return metricLR(metricId, left, right, source);
      })
    ),
  ];

  return categories;
}
