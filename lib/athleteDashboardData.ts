/** Normalize athlete_session_summary rows (column names may be camelCase or snake_case). */

export type NormalizedSession = {
  sessionId: string;
  createdAt: string;
  sessionDate: string | null;
  testType: string | null;
  testSubType: string | null;
  fileName: string | null;
  peakSpeed: number | null;
  split10m: number | null;
  split20m: number | null;
  split05m: number | null;
  totalTime: number | null;
  maxAcceleration: number | null;
  maxDeceleration: number | null;
  jumpHeightCm: number | null;
  rsi: number | null;
  fpConcentricImpulse: number | null;
  fpEccentricImpulse: number | null;
  fpPeakBrakingForce: number | null;
  fpPeakPropulsiveForce: number | null;
  isometricPeakForce: number | null;
  isometricRfd: number | null;
  dynoPeakForce: number | null;
  dynoRfd: number | null;
  /** Normalized from view or metrics keys */
  dynoAsymmetryPct: number | null;
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

function pickNum(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function pickStr(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    if (typeof v === "string") return v;
  }
  return null;
}

function firstKeyMatchingNum(
  row: Record<string, unknown>,
  predicate: (lowerKey: string) => boolean
): number | null {
  for (const key of Object.keys(row)) {
    if (!predicate(key.toLowerCase())) continue;
    const n = pickNum(row, [key]);
    if (n != null) return n;
  }
  return null;
}

export function normalizeSessionRow(raw: Record<string, unknown>): NormalizedSession | null {
  const sessionId = pickStr(raw, ["session_id", "sessionId", "id"]);
  const createdAt = pickStr(raw, ["created_at", "createdAt"]);
  if (!sessionId || !createdAt) return null;

  return {
    sessionId,
    createdAt,
    sessionDate: pickStr(raw, ["session_date", "sessionDate"]),
    testType: pickStr(raw, ["test_type", "testType"]),
    testSubType: pickStr(raw, ["test_sub_type", "testSubType"]),
    fileName: pickStr(raw, ["file_name", "fileName"]),
    peakSpeed: pickNum(raw, ["peakSpeed", "peak_speed", "topSpeed", "top_speed"]),
    split10m: pickNum(raw, ["split10m", "split_10m"]),
    split20m: pickNum(raw, ["split20m", "split_20m"]),
    split05m: pickNum(raw, ["split05m", "split_0_5m", "split5m", "split_5m"]),
    totalTime: pickNum(raw, ["total_time", "totalTime", "time_s", "Time [s]"]),
    maxAcceleration: pickNum(raw, [
      "max_acceleration",
      "maxAcceleration",
      "MaxAcceleration",
    ]),
    maxDeceleration: pickNum(raw, [
      "max_deceleration",
      "maxDeceleration",
      "MaxDeceleration",
    ]),
    jumpHeightCm: pickNum(raw, [
      "fp_jump_height_cm_best",
      "jump_height_cm",
      "jumpHeightCm",
      "jump_height",
    ]),
    rsi: pickNum(raw, ["fp_rsi_best", "rsi", "fpRsiBest"]),
    fpConcentricImpulse: pickNum(raw, [
      "fp_concentric_impulse",
      "fpConcentricImpulse",
    ]),
    fpEccentricImpulse: pickNum(raw, [
      "fp_eccentric_impulse",
      "fpEccentricImpulse",
    ]),
    fpPeakBrakingForce: pickNum(raw, [
      "fp_peak_braking_force",
      "fpPeakBrakingForce",
    ]),
    fpPeakPropulsiveForce: pickNum(raw, [
      "fp_peak_propulsive_force",
      "fpPeakPropulsiveForce",
    ]),
    isometricPeakForce: pickNum(raw, [
      "isometric_peak_force",
      "isometricPeakForce",
      "fp_peak_force_n_best",
    ]),
    isometricRfd: pickNum(raw, ["isometric_rfd", "isometricRfd"]),
    dynoPeakForce:
      pickNum(raw, ["dyno_peak_force", "dynoPeakForce"]) ??
      firstKeyMatchingNum(
        raw,
        (k) => k.startsWith("dyno_") && k.includes("peak_force")
      ),
    dynoRfd:
      pickNum(raw, ["dyno_rfd", "dynoRfd"]) ??
      firstKeyMatchingNum(
        raw,
        (k) => k.startsWith("dyno_") && k.includes("rfd")
      ),
    dynoAsymmetryPct: pickNum(raw, [
      "dyno_asymmetry_pct",
      "dynoAsymmetryPct",
    ]),
  };
}

/**
 * Interim readiness (0–100) composited from the metrics actually captured:
 * sprint peak speed, CMJ jump height, and CMJ reactive strength. Each is scored
 * against a rehab-appropriate target band and averaged over whatever is present.
 * NOTE: interim — to be replaced by the norm-weighted per-test scoring.
 */
export function computeReadinessScore(
  peakSpeed: number | null,
  jumpHeightCm: number | null,
  rsi: number | null
): number | null {
  const parts: number[] = [];
  if (peakSpeed != null) parts.push(clamp((peakSpeed - 5) / 2.5, 0, 1));
  if (jumpHeightCm != null) parts.push(clamp((jumpHeightCm - 15) / 15, 0, 1));
  if (rsi != null) parts.push(clamp((rsi - 0.2) / 0.3, 0, 1));
  if (!parts.length) return null;
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
}

export function readinessLabel(score: number): "High" | "Moderate" | "Low" {
  if (score >= 80) return "High";
  if (score >= 60) return "Moderate";
  return "Low";
}

export function readinessRingColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

type Components = {
  speedScore: number;
  splitScore: number;
  consistency: number | null;
};

export function readinessComponents(
  peakSpeed: number | null,
  split20m: number | null,
  repPeakSpeeds: number[] | null
): Components | null {
  if (peakSpeed == null || split20m == null) return null;
  const speedScore = clamp((peakSpeed - 5) / 4, 0, 1);
  const splitScore = clamp((4.5 - split20m) / 1.5, 0, 1);
  let consistency: number | null = null;
  if (repPeakSpeeds && repPeakSpeeds.length >= 2) {
    const sd = stdDev(repPeakSpeeds);
    const m = mean(repPeakSpeeds);
    consistency = m > 0 ? clamp(1 - sd / m, 0, 1) : null;
  }
  return { speedScore, splitScore, consistency };
}

/** 2–3 short bullets explaining drivers of the readiness score. */
export function readinessBullets(
  score: number | null,
  v: { peakSpeed: number | null; jumpHeightCm: number | null; rsi: number | null }
): string[] {
  if (score == null) {
    return [
      "No sprint or jump data yet — add a session to unlock readiness.",
    ];
  }
  const out: string[] = [];
  if (v.peakSpeed != null) {
    out.push(
      v.peakSpeed >= 7
        ? "Sprint speed is in a strong band."
        : "Sprint speed is building toward target."
    );
  }
  if (v.jumpHeightCm != null) {
    out.push(
      v.jumpHeightCm >= 28
        ? "Jump height is tracking well."
        : "Jump height is still developing."
    );
  }
  if (v.rsi != null) {
    out.push(
      v.rsi >= 0.45
        ? "Reactive strength is progressing nicely."
        : "Reactive strength has room to build."
    );
  }
  return out.slice(0, 3);
}

export function pctChange(
  current: number | null,
  previous: number | null
): number | null {
  if (
    current == null ||
    previous == null ||
    previous === 0 ||
    Number.isNaN(current) ||
    Number.isNaN(previous)
  ) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

/** Metric keys where a lower numeric value is better (sprint times, total time). */
export const LOWER_IS_BETTER_METRIC_KEYS = new Set([
  "split10m",
  "split_10m",
  "split20m",
  "split_20m",
  "split5m",
  "split_5m",
  "split05m",
  "split_0_5m",
  "total_time",
  "totalTime",
  "time_s",
]);

/**
 * Percent change for metrics where lower raw values are better (e.g. split times in seconds).
 * Faster (current &lt; previous) yields a positive %; slower yields negative.
 */
export function pctChangeLowerIsBetter(
  current: number | null,
  previous: number | null
): number | null {
  if (
    current == null ||
    previous == null ||
    Number.isNaN(current) ||
    Number.isNaN(previous)
  ) {
    return null;
  }
  if (Math.abs(previous) < 1e-12) return null;
  return ((previous - current) / previous) * 100;
}

/** Reference line on sprint charts — rehab-appropriate target */
export const BENCHMARK_PEAK_SPEED_MS = 7.5;

/** Reference line on jump charts — rehab-appropriate target */
export const BENCHMARK_JUMP_HEIGHT_CM = 30;

const FP_TYPES = new Set([
  "force_plate",
  "force_plate_dj",
  "force_plate_cmj",
  "force_plate_imtp",
  "force_plate_calf",
]);

const DYNO_TYPES = new Set([
  "handheld_dynamometer",
  "dyno",
  "dynamometer",
]);

export function isForcePlateType(t: string | null): boolean {
  if (!t) return false;
  return FP_TYPES.has(t);
}

export function isDynamometerType(t: string | null): boolean {
  if (!t) return false;
  return DYNO_TYPES.has(t) || t.startsWith("dyno_");
}

export function isSprint1080(t: string | null): boolean {
  return t === "1080_sprint";
}

export function isSprintLikeType(t: string | null): boolean {
  if (!t) return false;
  return t === "1080_sprint" || t.startsWith("cod_");
}

export function formatTestTypeLabel(t: string | null): string {
  if (!t) return "—";
  const map: Record<string, string> = {
    "1080_sprint": "Sprint",
    cod_5_10_5: "COD (5-10-5)",
    force_plate: "Force plate",
    force_plate_dj: "Force plate (DJ)",
    force_plate_cmj: "Force plate (CMJ)",
    force_plate_imtp: "Force plate (IMTP)",
    force_plate_calf: "Force plate (calf raise)",
    handheld_dynamometer: "Handheld dynamometer",
    csv_import: "Dynamometer (CSV import)",
  };
  return map[t] ?? t.replace(/_/g, " ");
}
