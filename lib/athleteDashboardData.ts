/** Normalize athlete_session_summary rows (column names may be camelCase or snake_case). */

export type NormalizedSession = {
  sessionId: string;
  createdAt: string;
  testType: string | null;
  fileName: string | null;
  peakSpeed: number | null;
  split10m: number | null;
  split20m: number | null;
  jumpHeightCm: number | null;
  rsi: number | null;
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

export function normalizeSessionRow(raw: Record<string, unknown>): NormalizedSession | null {
  const sessionId = pickStr(raw, ["session_id", "sessionId", "id"]);
  const createdAt = pickStr(raw, ["created_at", "createdAt"]);
  if (!sessionId || !createdAt) return null;

  return {
    sessionId,
    createdAt,
    testType: pickStr(raw, ["test_type", "testType"]),
    fileName: pickStr(raw, ["file_name", "fileName"]),
    peakSpeed: pickNum(raw, ["peakSpeed", "peak_speed"]),
    split10m: pickNum(raw, ["split10m", "split_10m"]),
    split20m: pickNum(raw, ["split20m", "split_20m"]),
    jumpHeightCm: pickNum(raw, [
      "fp_jump_height_cm_best",
      "jump_height_cm",
      "jumpHeightCm",
      "jump_height",
    ]),
    rsi: pickNum(raw, ["fp_rsi_best", "rsi", "fpRsiBest"]),
  };
}

/** RTS-style readiness from latest 1080 sprint summary metrics (0–100). */
export function computeReadinessScore(
  peakSpeed: number | null,
  split20m: number | null,
  repPeakSpeeds: number[] | null
): number | null {
  if (peakSpeed == null || split20m == null) return null;

  const speedScore = clamp((peakSpeed - 5) / 4, 0, 1);
  const splitScore = clamp((4.5 - split20m) / 1.5, 0, 1);

  if (repPeakSpeeds && repPeakSpeeds.length >= 2) {
    const sd = stdDev(repPeakSpeeds);
    const m = mean(repPeakSpeeds);
    const consistency = m > 0 ? clamp(1 - sd / m, 0, 1) : 0;
    const combined =
      0.4 * speedScore + 0.3 * splitScore + 0.3 * consistency;
    return Math.round(combined * 100);
  }

  const combined = 0.55 * speedScore + 0.45 * splitScore;
  return Math.round(combined * 100);
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
  c: Components | null,
  hasFpMetrics: boolean
): string[] {
  const out: string[] = [];
  if (score == null || !c) {
    out.push("Add at least one 1080 sprint session with peak speed and 20m split to unlock readiness.");
    if (!hasFpMetrics) out.push("Force plate data will strengthen jump and RSI tracking.");
    return out.slice(0, 3);
  }

  if (c.speedScore >= 0.62) {
    out.push("Peak speed is in a strong band relative to the model target.");
  } else {
    out.push("Peak speed is below the target band and is pulling the score down.");
  }

  if (c.splitScore >= 0.62) {
    out.push("20m split indicates solid acceleration out of the start.");
  } else {
    out.push("20m split suggests acceleration is limiting overall readiness.");
  }

  if (c.consistency != null) {
    if (c.consistency >= 0.62) {
      out.push("Rep-to-rep sprint consistency is helping the score.");
    } else {
      out.push("Variable rep-to-rep sprint outputs are limiting consistency.");
    }
  } else if (hasFpMetrics) {
    out.push("Force plate jumps are available to pair with sprint progress on return-to-play.");
  } else {
    out.push("Capture repeat sprints to measure rep consistency over time.");
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

/**
 * Percent change for metrics where lower raw values are better (split times).
 * Negates {@link pctChange} so a faster time (lower seconds) reads as a positive %.
 */
export function pctChangeLowerIsBetter(
  current: number | null,
  previous: number | null
): number | null {
  const raw = pctChange(current, previous);
  if (raw == null) return null;
  return -raw;
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
]);

export function isForcePlateType(t: string | null): boolean {
  if (!t) return false;
  return FP_TYPES.has(t);
}

export function isSprint1080(t: string | null): boolean {
  return t === "1080_sprint";
}

export function formatTestTypeLabel(t: string | null): string {
  if (!t) return "—";
  const map: Record<string, string> = {
    "1080_sprint": "1080 Sprint",
    force_plate: "Force plate",
    force_plate_dj: "Force plate (DJ)",
    force_plate_cmj: "Force plate (CMJ)",
    force_plate_imtp: "Force plate (IMTP)",
  };
  return map[t] ?? t.replace(/_/g, " ");
}
