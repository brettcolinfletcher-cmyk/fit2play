import {
  bucket,
  formatChartAxisDate,
  is1080Session,
  isLinearSprintSession,
  latestDayMetricAggregate,
  latestDayRepAggregate,
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
  // Added Oct 2026 for the SS WA U13 squad, who ran a 30m sprint. PLACEHOLDER
  // target (the 40m default scaled by 30/40): set a real one per population in
  // the Targets page. The Speed card only shows the distance(s) actually tested.
  { id: "speed_30m", categoryId: "speed", categoryLabel: "Speed", label: "1080 30m Sprint", unit: "s", decimals: 2, direction: "lower", defaultTarget: 4.2 },
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
  // Added Aug 2026 for Brett's new "TS Iso Test Groin Squeeze" Hawkins tag —
  // no prior data to derive a clinical target from, so this mirrors the
  // hip abduction/adduction default (200N). Adjust once real readings come in.
  { id: "strength_groin_squeeze", categoryId: "strength", categoryLabel: "Strength (Isometric)", label: "Groin Squeeze", unit: "N", decimals: 0, direction: "higher", defaultTarget: 200 },
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
const STRENGTH_MOVEMENTS: { metricId: string; keywords: string[]; bilateral?: boolean }[] = [
  { metricId: "strength_hip_abduction", keywords: ["abduction"] },
  { metricId: "strength_hip_adduction", keywords: ["adduction"] },
  { metricId: "strength_knee_extension", keywords: ["knee", "extension"] },
  { metricId: "strength_knee_flexion", keywords: ["knee", "flexion"] },
  // "TS Iso Test Groin Squeeze" — bilateral test, no left/right tag on the
  // Hawkins side, so it's displayed as a single value, not L/R.
  { metricId: "strength_groin_squeeze", keywords: ["groin"], bilateral: true },
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
export function tierForRatio(ratio: number | null): SummaryTier {
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

export function ratioOf(value: number | null, target: number, direction: Direction): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return direction === "higher" ? value / target : target / value;
}

/**
 * Resolve a metric's target + direction: the clinic's per-profile override
 * if one exists, else the registry default. Shared by computePerformanceSummary
 * and the PDF's Key Findings tier badges (lib/pdfReportChartData.ts) so both
 * "how's this athlete tracking against target" reads use the exact same
 * Needs Work/Developing/Building/Good/Excellent scale and the exact same
 * target value — not two badge systems disagreeing on the same metric.
 */
export function resolveMetricTarget(
  id: string,
  targetOverrides?: Record<string, MetricTarget>
): { target: number; direction: Direction } {
  const override = targetOverrides?.[id];
  if (override) return override;
  const def = METRIC_BY_ID.get(id);
  return { target: def?.defaultTarget ?? 0, direction: def?.direction ?? "higher" };
}

function isTenMAccelSession(s: ReportSessionRow): boolean {
  if (bucket(s.source) !== "1080") return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return sub.includes("10m acceleration");
}

// The 1080 device doesn't reliably tag sessions with a fixed test distance
// or an accurate protocol name — Brett confirmed one athlete's real 40m
// Running (LR) test synced in with test_sub_type "5-0-5 Assisted start"
// (the sync takes exerciseName from the first rep in the raw payload, which
// doesn't represent the whole session when multiple efforts were recorded
// together). A whole-session min/max aggregate on total_time was also
// pairing a 40m distance reading from one rep with a total_time from an
// unrelated rep — physically impossible speeds. So instead of trusting
// test_sub_type or aggregating across a whole session, we group each
// session's rows by (rep_index, side) and only accept a total_time that's
// paired with a total_distance within tolerance of 40 IN THAT SAME GROUP.
const FORTY_M_TOLERANCE = 5;
const THIRTY_M_TOLERANCE = 3;
const FORTY_M_SUB_TYPE_FALLBACKS = ["linear bilateral", "running (lr)"];

/** (rep_index, side) groups from one session's rows with a confirmed
 * total_distance/total_time pair at the given test distance (± tolerance) —
 * see findSprintBySide's comment above. */
function sprintGroupsForSession(
  rows: ReportMetricRow[],
  distance: number,
  tolerance: number
): { time: number; side: string | null }[] {
  const groups = new Map<string, { distance: number | null; time: number | null; side: string | null }>();
  for (const r of rows) {
    if ((r.key !== "total_distance" && r.key !== "total_time") || r.value == null || !Number.isFinite(r.value)) {
      continue;
    }
    const gKey = `${r.rep_index ?? "x"}|${r.side ?? ""}`;
    const g = groups.get(gKey) ?? { distance: null, time: null, side: r.side ?? null };
    if (r.key === "total_distance") g.distance = g.distance == null ? r.value : Math.max(g.distance, r.value);
    if (r.key === "total_time") g.time = g.time == null ? r.value : Math.max(g.time, r.value);
    groups.set(gKey, g);
  }
  const out: { time: number; side: string | null }[] = [];
  for (const g of groups.values()) {
    if (g.distance == null || g.time == null || Math.abs(g.distance - distance) > tolerance) continue;
    out.push({ time: g.time, side: g.side });
  }
  return out;
}

function findSprintBySide(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  distance: number,
  tolerance: number,
  allowNameFallback: boolean
): { left: number | null; right: number | null; source: ReportSessionRow | null } {
  const candidates = sessions
    .filter((s) => bucket(s.source) === "1080" && s.session_date)
    .sort((a, b) => new Date(b.session_date!).getTime() - new Date(a.session_date!).getTime());

  // Find the most recent date with ANY session containing a confirmed ~40m
  // group, then pool matches from every session recorded that SAME date —
  // not just the first session encountered — so a genuine same-day re-test
  // with a better time isn't silently discarded (same bug class as
  // latestSessionOf elsewhere in this file: picking one arbitrary session
  // on a same-day tie instead of considering all of them).
  let matchDate: string | null = null;
  for (const s of candidates) {
    if (sprintGroupsForSession(metricsBySession.get(s.id) ?? [], distance, tolerance).length > 0) {
      matchDate = s.session_date!.slice(0, 10);
      break;
    }
  }

  if (matchDate) {
    let left: number | null = null;
    let right: number | null = null;
    let bilateral: number | null = null;
    let source: ReportSessionRow | null = null;
    for (const s of candidates) {
      if (s.session_date!.slice(0, 10) !== matchDate) continue;
      for (const g of sprintGroupsForSession(metricsBySession.get(s.id) ?? [], distance, tolerance)) {
        source = source ?? s;
        const side = (g.side ?? "").toLowerCase();
        if (side === "left") left = left == null ? g.time : Math.min(left, g.time);
        else if (side === "right") right = right == null ? g.time : Math.min(right, g.time);
        else bilateral = bilateral == null ? g.time : Math.min(bilateral, g.time);
      }
    }
    return { left: left ?? bilateral, right, source };
  }

  // Fallback (40m only): no session had any rep/side group with a confirmed
  // distance reading AT ALL (a true sync gap) — take the latest by-name match
  // instead. A session that DID record distances but none near this test
  // distance is skipped: its distances already say it isn't this test, and
  // reading its fastest rep instead would show e.g. a 5-0-5 time as a sprint.
  if (allowNameFallback) {
    for (const s of candidates) {
      if (!isLinearSprintSession(s, metricsBySession)) continue;
      const rows = metricsBySession.get(s.id) ?? [];
      if (rows.some((r) => r.key === "total_distance" && r.value != null && Number.isFinite(r.value))) continue;
      const sub = (s.test_sub_type ?? "").toLowerCase();
      if (!FORTY_M_SUB_TYPE_FALLBACKS.some((name) => sub.includes(name))) continue;
      const t = metricAggregate(metricsBySession, s.id, "total_time", "min");
      if (t != null) return { left: t, right: null, source: s };
    }
  }

  return { left: null, right: null, source: null };
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
): { left: number | null; right: number | null; both: number | null; source: ReportSessionRow | null } {
  const matching = sessions.filter(
    (s) => s.test_type === "force_plate_isometric" && matchesStrengthMovement(s.test_sub_type, keywords)
  );

  let latestDate: string | null = null;
  for (const s of matching) {
    if (!s.session_date) continue;
    const d = s.session_date.slice(0, 10);
    if (!latestDate || d > latestDate) latestDate = d;
  }
  if (!latestDate) return { left: null, right: null, both: null, source: null };

  const onDate = matching.filter((s) => s.session_date && s.session_date.slice(0, 10) === latestDate);
  let left: number | null = null;
  let right: number | null = null;
  // Bilateral tests (e.g. "TS Iso Test Groin Squeeze") aren't tagged
  // left/right at all — hawkinsAthleteSide only ever returns "left"/
  // "right"/null, so these rows land here with side null. Tracked
  // separately so a bilateral movement doesn't silently show "—".
  let both: number | null = null;
  for (const s of onDate) {
    const rows = metricsBySession.get(s.id) ?? [];
    for (const r of rows) {
      if (r.key !== "peak_force" || r.value == null || !Number.isFinite(r.value)) continue;
      const side = (r.side ?? "").toLowerCase();
      if (side === "left") left = left == null ? r.value : Math.max(left, r.value);
      else if (side === "right") right = right == null ? r.value : Math.max(right, r.value);
      else both = both == null ? r.value : Math.max(both, r.value);
    }
  }
  return { left, right, both, source: onDate[0] ?? null };
}

export function computePerformanceSummary(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  targetOverrides?: Record<string, MetricTarget>
): SummaryCategory[] {
  const resolveTarget = (id: string) => resolveMetricTarget(id, targetOverrides);

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
    // "Weaker" side is whichever value is further from the target — for a
    // higher-is-better metric (force) that's the min; for a lower-is-better
    // metric (sprint time) the worse side is the *larger* value.
    const weaker =
      left != null && right != null
        ? direction === "higher"
          ? Math.min(left, right)
          : Math.max(left, right)
        : left ?? right ?? null;
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

  // Every metric below is pulled from the athlete's most recent TESTING DAY
  // for that modality — pooled across every session recorded that day, not
  // read off one arbitrarily-picked session. Same-day duplicate sessions are
  // common (re-tests, warm-up vs. main effort, one session per rep) and a
  // single-session pick silently discards whichever session lost the tie,
  // even when it held the athlete's actual best numbers. See
  // latestDayMetricAggregate's doc comment in lib/reportCore.ts.
  const isCmjSession = (s: ReportSessionRow) =>
    bucket(s.source) === "hawkins" && s.test_type === "force_plate_cmj";

  const cmj = (key: string) => latestDayMetricAggregate(sessions, metricsBySession, isCmjSession, key, "max");
  // 5-0-5 efforts are identified per REP (classify1080Reps in reportCore), not
  // per session: one 1080 session can hold a 30m sprint set AND a 5-0-5 set
  // under a single label, and reading the whole session as a 5-0-5 showed the
  // 30m sprint time as the 5-0-5 time.
  const codRep = (key: string, mode: "max" | "min", side?: "left" | "right" | "untagged") =>
    latestDayRepAggregate(sessions, metricsBySession, is1080Session, key, mode, "cod", side);
  const codLeft = codRep("total_time", "min", "left");
  const codRight = codRep("total_time", "min", "right");
  const codUntagged = codRep("total_time", "min", "untagged");
  const codAccelMax = codRep("accel_max", "max");
  const codDecelMax = codRep("decel_max", "max");
  const tenM = latestDayMetricAggregate(sessions, metricsBySession, isTenMAccelSession, "total_time", "min");
  // 5m split: left on the original whole-session min. Split rows are numbered
  // independently of the main per-rep metrics in mixed sessions (confirmed on
  // real data), so a per-rep 5-0-5 filter would wrongly drop them.
  const fiveM = latestDayMetricAggregate(sessions, metricsBySession, is1080Session, "split_5m_time", "min");
  const peakPower1080 = latestDayMetricAggregate(sessions, metricsBySession, is1080Session, "peak_power", "max");
  const fortyM = findSprintBySide(sessions, metricsBySession, 40, FORTY_M_TOLERANCE, true);
  const thirtyM = findSprintBySide(sessions, metricsBySession, 30, THIRTY_M_TOLERANCE, false);

  // Speed card: only the distance(s) actually tested. If neither was, keep the
  // 40m row so the card still reads as "not tested" rather than disappearing.
  const has40 = fortyM.left != null || fortyM.right != null;
  const has30 = thirtyM.left != null || thirtyM.right != null;
  const speedMetrics: SummaryMetric[] = [];
  if (has40 || !has30) speedMetrics.push(metricLR("speed_40m", fortyM.left, fortyM.right, fortyM.source));
  if (has30) speedMetrics.push(metricLR("speed_30m", thirtyM.left, thirtyM.right, thirtyM.source));

  // 5-0-5 total time: leg-tagged entry times (L/R) when the athlete has them;
  // otherwise the untagged per-rep time (e.g. the SS WA squad, whose 5-0-5
  // reps carry no leg tag). Whichever is from the later test day wins; a tie
  // goes to the leg-tagged read.
  const codTaggedSource = codLeft.source ?? codRight.source;
  const codTaggedDate = codTaggedSource?.session_date?.slice(0, 10) ?? null;
  const codUntaggedDate = codUntagged.source?.session_date?.slice(0, 10) ?? null;
  const useUntaggedCod =
    codUntagged.value != null &&
    (codTaggedDate == null || (codUntaggedDate != null && codUntaggedDate > codTaggedDate));
  const codMetric = useUntaggedCod
    ? metric("cod_505_total_time", codUntagged.value, codUntagged.source)
    : metricLR("cod_505_total_time", codLeft.value, codRight.value, codTaggedSource);

  // fp_jump_height is stored in metres (matches the CMJ chart / hero tile
  // elsewhere in the app) — convert to cm for display, same as
  // buildCmjDataPoints in ForcePlateCMJSection.tsx. Falls back to
  // fp_jump_height_cm_best (already in cm) when the metres key is absent,
  // same fallback buildCmjDataPoints uses.
  const jumpHeightM = cmj("fp_jump_height");
  const jumpHeightCmBest = cmj("fp_jump_height_cm_best");
  const jumpHeightCm =
    jumpHeightM.value != null && Number.isFinite(jumpHeightM.value)
      ? jumpHeightM.value * 100
      : jumpHeightCmBest.value;
  const jumpHeightSource = jumpHeightM.value != null ? jumpHeightM.source : jumpHeightCmBest.source;

  const peakPropForce = cmj("fp_peak_propulsive_force");
  const propulsiveImpulse = cmj("fp_propulsive_impulse");
  const peakPropPower = cmj("fp_peak_propulsive_power");
  const mrsi = cmj("fp_mrsi");
  const brakingRfd = cmj("fp_braking_rfd");

  const categories: SummaryCategory[] = [
    withCommonSource("cmj", "CMJ", [
      metric("cmj_jump_height", jumpHeightCm, jumpHeightSource),
      metric("cmj_conc_peak_force", peakPropForce.value, peakPropForce.source),
      metric("cmj_propulsive_impulse", propulsiveImpulse.value, propulsiveImpulse.source),
    ]),
    withCommonSource("power", "Power", [
      metric("power_cmj_peak_power", peakPropPower.value, peakPropPower.source),
      metric("power_cmj_rsi_mod", mrsi.value, mrsi.source),
      metric("power_1080_peak_power", peakPower1080.value, peakPower1080.source),
    ]),
    withCommonSource("speed", "Speed", speedMetrics),
    withCommonSource("accel", "Accel", [
      metric("accel_5m", fiveM.value, fiveM.source),
      metric("accel_10m", tenM.value, tenM.source),
      metric("accel_505_max_accel", codAccelMax.value, codAccelMax.source),
    ]),
    withCommonSource("decel", "Decel", [
      metric("decel_cmj_rfd", brakingRfd.value, brakingRfd.source),
      metric("decel_505_max_decel", codDecelMax.value, codDecelMax.source),
    ]),
    withCommonSource("cod", "Change of Direction", [
      // TODO: Brett asked for this "corrected for distance" — the exact
      // correction formula wasn't specified, so this is the raw 1080
      // total_time for now. Confirm what "corrected" should mean
      // (e.g. normalised against the session's recorded total_distance)
      // and adjust here.
      // Weaker-side entry time when leg-tagged, else the untagged per-rep
      // time — see codMetric above. Leg-tagged total_time rows can sit beside
      // ambiguous untagged sub-split readings from the same rep, which is why
      // the tagged read is preferred whenever it's as recent.
      codMetric,
    ]),
    withCommonSource(
      "strength",
      "Strength (Isometric)",
      STRENGTH_MOVEMENTS.map(({ metricId, keywords, bilateral }) => {
        const { left, right, both, source } = latestIsoForMovement(sessions, metricsBySession, keywords);
        return bilateral ? metric(metricId, both, source) : metricLR(metricId, left, right, source);
      })
    ),
  ];

  return categories;
}
