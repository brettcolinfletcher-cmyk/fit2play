import {
  metricAggregate,
  sessionsChronological,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";

/** Raw session + metrics + hop rows for one athlete on the compare page. */
export type AthleteRawBundle = {
  sessions: ReportSessionRow[];
  metricsBySession: Map<string, ReportMetricRow[]>;
  hopTests: ReportHopTestRow[];
};

export type MetricGroup = "sprint" | "cod" | "jump" | "reactive" | "hop";

export type CompareMetricDef = {
  id: string;
  group: MetricGroup;
  label: string;
  unit: string;
  /** When true, used for the top-level multi-group Overview radar (Phase C). */
  isRepresentative?: boolean;
  betterDirection: "higher" | "lower";
  extract: (bundle: AthleteRawBundle) => Array<{ sessionDate: string; value: number }>;
};

function dateValue(
  s: ReportSessionRow,
  value: number | null
): { sessionDate: string; value: number } | null {
  if (!s.session_date || value == null || !Number.isFinite(value)) return null;
  return { sessionDate: s.session_date, value };
}

/**
 * Linear 1080 sprint allowlist (matches production `test_sub_type` values).
 * Excludes jump/power rows that still use `test_type = 1080_sprint`.
 * Mirrors SQL: ILIKE ANY ('Running%', 'Linear bilateral', '%10m%', '%20m%', '%40m%').
 */
function isLinearSprintSubType(testSubType: string | null | undefined): boolean {
  const raw = (testSubType ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.startsWith("running")) return true;
  if (lower === "linear bilateral") return true;
  if (lower.includes("10m")) return true;
  if (lower.includes("20m")) return true;
  if (lower.includes("40m")) return true;
  return false;
}

/** `test_type = 1080_sprint` and `test_sub_type` on the linear sprint allowlist. */
function linear1080SprintSessions(sessions: ReportSessionRow[]): ReportSessionRow[] {
  return sessionsChronological(
    sessions.filter((s) => {
      if ((s.test_type ?? "").toLowerCase() !== "1080_sprint") return false;
      return isLinearSprintSubType(s.test_sub_type);
    })
  );
}

function linearWithSubFilter(
  sessions: ReportSessionRow[],
  subPredicate: (subLc: string) => boolean
): ReportSessionRow[] {
  return linear1080SprintSessions(sessions).filter((s) =>
    subPredicate((s.test_sub_type ?? "").toLowerCase())
  );
}

function codSessions5105(sessions: ReportSessionRow[]): ReportSessionRow[] {
  return sessionsChronological(
    sessions.filter((s) => (s.test_sub_type ?? "").toLowerCase().includes("5-10-5"))
  );
}

function codSessions505(sessions: ReportSessionRow[]): ReportSessionRow[] {
  return sessionsChronological(
    sessions.filter((s) => (s.test_sub_type ?? "").toLowerCase().includes("5-0-5"))
  );
}

function cmjSessions(sessions: ReportSessionRow[]): ReportSessionRow[] {
  return sessionsChronological(
    sessions.filter((s) => (s.test_type ?? "").toLowerCase() === "force_plate_cmj")
  );
}

function djSessions(sessions: ReportSessionRow[]): ReportSessionRow[] {
  return sessionsChronological(
    sessions.filter((s) => (s.test_type ?? "").toLowerCase() === "force_plate_dj")
  );
}

/** Same rule as `ForcePlateDJSection.toContactMs`: values ≤25 treated as seconds → ms. */
function contactTimeMs(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw > 25) return raw;
  return raw * 1000;
}

/** CMJ jump height in cm from `fp_jump_height` (stored in metres). */
function cmjJumpHeightCm(
  map: Map<string, ReportMetricRow[]>,
  sessionId: string
): number | null {
  const m = metricAggregate(map, sessionId, "fp_jump_height", "max");
  if (m == null || !Number.isFinite(m)) return null;
  return m * 100;
}

/**
 * `hop_tests.test_type` values written by the staff hop entry UI
 * (`app/dashboard/athletes/[id]/hop-tests/page.tsx` and `HopTestsSection.tsx` TEST_OPTIONS).
 */
const HOP_TEST_TYPE_SLHD = "slhd";
const HOP_TEST_TYPE_THD = "thd";
const HOP_TEST_TYPE_THCOD = "thcod";
const HOP_TEST_TYPE_MEDIAL = "medial_hop";
const HOP_TEST_TYPE_LATERAL = "lateral_hop";

function hopLsiByTypes(
  hopTests: ReportHopTestRow[],
  types: Set<string>
): Array<{ sessionDate: string; value: number }> {
  const rows = hopTests.filter((h) => types.has(h.test_type));
  const byDay = new Map<string, { left: number | null; right: number | null }>();
  for (const r of rows) {
    const d = r.session_date?.slice(0, 10);
    if (!d) continue;
    const cur = byDay.get(d) ?? { left: null as number | null, right: null as number | null };
    const sd = (r.side ?? "").toLowerCase();
    if (sd === "left") cur.left = r.best_cm;
    else if (sd === "right") cur.right = r.best_cm;
    byDay.set(d, cur);
  }
  const out: Array<{ sessionDate: string; value: number }> = [];
  for (const [d, pair] of byDay) {
    if (
      pair.left != null &&
      pair.right != null &&
      Number.isFinite(pair.left) &&
      Number.isFinite(pair.right)
    ) {
      const hi = Math.max(pair.left, pair.right);
      if (hi > 0) {
        const lo = Math.min(pair.left, pair.right);
        const lsi = Math.round((lo / hi) * 1000) / 10;
        const sessionDate = `${d}T12:00:00.000Z`;
        out.push({ sessionDate, value: lsi });
      }
    }
  }
  out.sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());
  return out;
}

/**
 * Canonical compare-page metrics (Tier 1). All DB metric keys and protocol filters live here only.
 */
export const COMPARE_METRICS: CompareMetricDef[] = [
  // —— Sprint (linear 1080) ——
  {
    id: "sprint_top_speed",
    group: "sprint",
    label: "Top Speed",
    unit: "m/s",
    isRepresentative: true,
    betterDirection: "higher",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of linear1080SprintSessions(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "top_speed", "max");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "sprint_zero_to_five",
    group: "sprint",
    label: "5m Time",
    unit: "s",
    betterDirection: "lower",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of linear1080SprintSessions(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "split_5m_time", "min");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "sprint_max_acceleration",
    group: "sprint",
    label: "Max Acceleration",
    unit: "m/s²",
    betterDirection: "higher",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of linear1080SprintSessions(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "accel_max", "max");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "sprint_total_time_10m",
    group: "sprint",
    label: "10m Total Time",
    unit: "s",
    betterDirection: "lower",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of linearWithSubFilter(b.sessions, (sub) => sub.includes("10m"))) {
        const v = metricAggregate(b.metricsBySession, s.id, "total_time", "min");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "sprint_total_time_20m",
    group: "sprint",
    label: "20m Total Time",
    unit: "s",
    betterDirection: "lower",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of linearWithSubFilter(b.sessions, (sub) => sub.includes("20m"))) {
        const v = metricAggregate(b.metricsBySession, s.id, "total_time", "min");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "sprint_total_time_40m",
    group: "sprint",
    label: "40m Total Time",
    unit: "s",
    betterDirection: "lower",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of linearWithSubFilter(
        b.sessions,
        (sub) => sub.includes("40m") || sub.startsWith("running")
      )) {
        const v = metricAggregate(b.metricsBySession, s.id, "total_time", "min");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  // —— COD ——
  {
    id: "cod_total_time_5105",
    group: "cod",
    label: "5-10-5 Total Time",
    unit: "s",
    isRepresentative: true,
    betterDirection: "lower",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of codSessions5105(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "total_time", "min");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "cod_total_time_505",
    group: "cod",
    label: "5-0-5 Total Time",
    unit: "s",
    betterDirection: "lower",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of codSessions505(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "total_time", "min");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  // —— CMJ ——
  {
    id: "cmj_jump_height",
    group: "jump",
    label: "Jump Height",
    unit: "cm",
    isRepresentative: true,
    betterDirection: "higher",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of cmjSessions(b.sessions)) {
        const v = cmjJumpHeightCm(b.metricsBySession, s.id);
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "cmj_peak_propulsive_force",
    group: "jump",
    label: "Peak Propulsive Force",
    unit: "N",
    betterDirection: "higher",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of cmjSessions(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "fp_peak_propulsive_force", "max");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "cmj_peak_braking_force",
    group: "jump",
    label: "Peak Braking Force",
    unit: "N",
    betterDirection: "higher",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of cmjSessions(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "fp_peak_braking_force", "max");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "cmj_propulsive_impulse",
    group: "jump",
    label: "Propulsive Impulse",
    unit: "N·s",
    betterDirection: "higher",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of cmjSessions(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "fp_propulsive_impulse", "max");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  // —— DJ / reactive ——
  {
    id: "dj_rsi",
    group: "reactive",
    label: "RSI",
    unit: "RSI",
    isRepresentative: true,
    betterDirection: "higher",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of djSessions(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "fp_rsi_best", "max");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "dj_mrsi",
    group: "reactive",
    label: "mRSI",
    unit: "mRSI",
    betterDirection: "higher",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of djSessions(b.sessions)) {
        const v = metricAggregate(b.metricsBySession, s.id, "fp_mrsi", "max");
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  {
    id: "dj_contact_time",
    group: "reactive",
    label: "Contact Time",
    unit: "ms",
    betterDirection: "lower",
    extract: (b) => {
      const out: Array<{ sessionDate: string; value: number }> = [];
      for (const s of djSessions(b.sessions)) {
        const raw = metricAggregate(b.metricsBySession, s.id, "fp_contact_time", "min");
        const v = contactTimeMs(raw);
        const p = dateValue(s, v);
        if (p) out.push(p);
      }
      return out;
    },
  },
  // —— Hop LSI (`test_type` from hop-tests entry form) ——
  {
    id: "hop_lsi_slhd",
    group: "hop",
    label: "LSI (SLHD)",
    unit: "%",
    isRepresentative: true,
    betterDirection: "higher",
    extract: (b) => hopLsiByTypes(b.hopTests, new Set([HOP_TEST_TYPE_SLHD])),
  },
  {
    id: "hop_lsi_thd",
    group: "hop",
    label: "LSI (triple hop)",
    unit: "%",
    betterDirection: "higher",
    extract: (b) => hopLsiByTypes(b.hopTests, new Set([HOP_TEST_TYPE_THD])),
  },
  {
    id: "hop_lsi_thcod",
    group: "hop",
    label: "LSI (crossover)",
    unit: "%",
    betterDirection: "higher",
    extract: (b) => hopLsiByTypes(b.hopTests, new Set([HOP_TEST_TYPE_THCOD])),
  },
  {
    id: "hop_lsi_medial_hop",
    group: "hop",
    label: "LSI (medial hop)",
    unit: "%",
    betterDirection: "higher",
    extract: (b) => hopLsiByTypes(b.hopTests, new Set([HOP_TEST_TYPE_MEDIAL])),
  },
  {
    id: "hop_lsi_lateral_hop",
    group: "hop",
    label: "LSI (lateral hop)",
    unit: "%",
    betterDirection: "higher",
    extract: (b) => hopLsiByTypes(b.hopTests, new Set([HOP_TEST_TYPE_LATERAL])),
  },
];

const BY_ID = new Map(COMPARE_METRICS.map((m) => [m.id, m]));

export function compareMetricById(id: string): CompareMetricDef | undefined {
  return BY_ID.get(id);
}

export type CompareMetricId = (typeof COMPARE_METRICS)[number]["id"];

export const COMPARE_METRIC_ORDER: CompareMetricId[] = COMPARE_METRICS.map((m) => m.id);

export const COMPARE_METRIC_LABELS: Record<CompareMetricId, string> = Object.fromEntries(
  COMPARE_METRICS.map((m) => [m.id, m.label])
) as Record<CompareMetricId, string>;

export function compareMetricUnit(id: CompareMetricId): string {
  return BY_ID.get(id)?.unit ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase D: Left/Right comparison for 1080 sessions that carry per-leg metrics.
//
// Data model: 1080 motionGroups carry `side` (1=Left, 2=Right) → stored as
// metrics.side ('left' | 'right'). One session typically contains BOTH sides.
// Splits stay side=null. The practitioner records `sessions.lr_starting_leg`
// so the side labels can be verified against the athlete's anatomy.
//
// We expose LR data for ANY 1080 session that has both side='left' and
// side='right' rows for a given metric — not just Running (LR) test_sub_type.
// ─────────────────────────────────────────────────────────────────────────────

export type LRPoint = {
  sessionDate: string;
  t: number;
  /** The 1080 session this point came from. Lets us disambiguate same-day sessions. */
  sessionId: string;
  testSubType: string | null;
  left: number;
  right: number;
  /** Limb Symmetry Index: weaker/stronger × 100. */
  lsi: number;
  /** Asymmetry as |L−R| / max(|L|,|R|) × 100. Matches metricsLrDisplay.ts. */
  pctDiff: number;
  /** True when pctDiff exceeds the metric's redFlagPctDiff threshold. */
  flagged: boolean;
  /** Anatomical starting leg recorded by the practitioner. */
  lrStartingLeg: "left" | "right" | null;
  /** Whether the 1080 side labels were swapped at read time. */
  lrSideSwap: boolean;
};

export type CompareLRMetricDef = {
  id: string;
  /** Underlying DB metric key (in `metrics.key`). */
  metricKey: string;
  label: string;
  unit: string;
  /** Aggregation across reps of the same side within a session. */
  aggregate: "max" | "min";
  /** Whether higher per-leg values mean better performance (display hint). */
  betterDirection: "higher" | "lower";
  /** Asymmetry % above which a session is flagged for clinical review. */
  redFlagPctDiff: number;
};

export const COMPARE_LR_METRICS: CompareLRMetricDef[] = [
  {
    id: "lr_top_speed",
    metricKey: "top_speed",
    label: "Top Speed",
    unit: "m/s",
    aggregate: "max",
    betterDirection: "higher",
    redFlagPctDiff: 10,
  },
  {
    id: "lr_peak_force",
    metricKey: "peak_force",
    label: "Peak Force",
    unit: "N",
    aggregate: "max",
    betterDirection: "higher",
    redFlagPctDiff: 15,
  },
  {
    id: "lr_peak_power",
    metricKey: "peak_power",
    label: "Peak Power",
    unit: "W",
    aggregate: "max",
    betterDirection: "higher",
    redFlagPctDiff: 15,
  },
  {
    id: "lr_accel_max",
    metricKey: "accel_max",
    label: "Max Acceleration",
    unit: "m/s²",
    aggregate: "max",
    betterDirection: "higher",
    redFlagPctDiff: 15,
  },
];

const LR_BY_ID = new Map(COMPARE_LR_METRICS.map((m) => [m.id, m]));

export function compareLRMetricById(id: string): CompareLRMetricDef | undefined {
  return LR_BY_ID.get(id);
}

export type CompareLRMetricId = (typeof COMPARE_LR_METRICS)[number]["id"];

/** Aggregate metric values for one session filtered by side. */
function aggregateSessionSide(
  map: Map<string, ReportMetricRow[]>,
  sessionId: string,
  metricKey: string,
  side: "left" | "right",
  mode: "max" | "min" | "avg"
): number | null {
  const rows = map.get(sessionId) ?? [];
  const vals: number[] = [];
  for (const r of rows) {
    if (r.key !== metricKey) continue;
    if (r.side !== side) continue;
    if (r.value == null) continue;
    // Postgres `numeric` arrives as a string via PostgREST — coerce explicitly.
    const n = Number(r.value);
    if (!Number.isFinite(n)) continue;
    vals.push(n);
  }
  if (vals.length === 0) return null;
  if (mode === "max") return Math.max(...vals);
  if (mode === "min") return Math.min(...vals);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function lsiPercent(l: number, r: number): number | null {
  const hi = Math.max(l, r);
  if (hi <= 0 || !Number.isFinite(hi)) return null;
  const lo = Math.min(l, r);
  return Math.round((lo / hi) * 1000) / 10;
}

function pctDiffPercent(l: number, r: number): number | null {
  const m = Math.max(Math.abs(l), Math.abs(r));
  if (m === 0 || !Number.isFinite(m)) return null;
  return Math.round((Math.abs(l - r) / m) * 1000) / 10;
}

/**
 * For all 1080 sessions in the bundle, produce one LRPoint per session for this metric.
 * `repAggregate` (default = def.aggregate) controls how reps within a single session
 * are combined: "max" (best rep), "min" (best for time-like metrics), or "avg".
 *
 * Returns only sessions where BOTH sides yield a finite value.
 */
export function extractLRPoints(
  def: CompareLRMetricDef,
  bundle: AthleteRawBundle,
  repAggregate?: "max" | "min" | "avg"
): LRPoint[] {
  const mode = repAggregate ?? def.aggregate;
  const sess1080 = bundle.sessions.filter(
    (s) => (s.source ?? "").toLowerCase() === "1080" && s.session_date
  );

  const out: LRPoint[] = [];
  for (const s of sess1080) {
    const swap = s.lr_side_swap === true;
    // When swap is true, the metric rows tagged side='left' represent the anatomical right
    // leg, and vice versa. We swap at read time so the rest of the UI can treat the values
    // as anatomical left/right consistently.
    const leftSide: "left" | "right" = swap ? "right" : "left";
    const rightSide: "left" | "right" = swap ? "left" : "right";
    const left = aggregateSessionSide(bundle.metricsBySession, s.id, def.metricKey, leftSide, mode);
    const right = aggregateSessionSide(bundle.metricsBySession, s.id, def.metricKey, rightSide, mode);
    if (left == null || right == null) continue;
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    const lsi = lsiPercent(left, right);
    const pctDiff = pctDiffPercent(left, right);
    if (lsi == null || pctDiff == null) continue;
    out.push({
      sessionDate: s.session_date!,
      t: new Date(s.session_date!).getTime(),
      sessionId: s.id,
      testSubType: s.test_sub_type ?? null,
      left,
      right,
      lsi,
      pctDiff,
      flagged: pctDiff > def.redFlagPctDiff,
      lrStartingLeg: (s.lr_starting_leg ?? null) as "left" | "right" | null,
      lrSideSwap: swap,
    });
  }
  out.sort((a, b) => a.t - b.t || a.sessionId.localeCompare(b.sessionId));
  return out;
}

/** True if the bundle has at least one usable LR point on any LR metric (uses each def's default aggregate). */
export function hasAnyLRData(bundle: AthleteRawBundle): boolean {
  return COMPARE_LR_METRICS.some((def) => extractLRPoints(def, bundle).length > 0);
}
