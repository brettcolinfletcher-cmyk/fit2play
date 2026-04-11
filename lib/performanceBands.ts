/**
 * Resolve performance band labels from `performance_bands` rows.
 * Supports flexible column names from Supabase.
 */

export type NormalizedPerformanceBand = {
  metricKey: string;
  label: string;
  minValue: number | null;
  maxValue: number | null;
  sortOrder: number;
};

function pickNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function pickStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return null;
}

export function normalizePerformanceBandRow(
  raw: Record<string, unknown>
): NormalizedPerformanceBand | null {
  const metricKey =
    pickStr(raw.metric_key) ??
    pickStr(raw.metricKey) ??
    pickStr(raw["metric_key"]);
  const label =
    pickStr(raw.band_label) ??
    pickStr(raw.label) ??
    pickStr(raw.band) ??
    pickStr(raw.name);
  if (!metricKey || !label) return null;

  return {
    metricKey,
    label,
    minValue: pickNum(raw.min_value ?? raw.min ?? raw.range_min),
    maxValue: pickNum(raw.max_value ?? raw.max ?? raw.range_max),
    sortOrder: pickNum(raw.sort_order ?? raw.priority ?? raw.order) ?? 0,
  };
}

/** Tailwind text + optional ring for band label (Fit2Play palette). */
export function bandLabelToClasses(label: string): {
  text: string;
  bg: string;
  ring: string;
} {
  const l = label.trim().toLowerCase();
  if (l.includes("elite"))
    return {
      text: "text-emerald-700",
      bg: "bg-emerald-500/15",
      ring: "ring-emerald-500/40",
    };
  if (l.includes("good"))
    return {
      text: "text-yellow-700",
      bg: "bg-yellow-400/15",
      ring: "ring-yellow-400/50",
    };
  if (l.includes("fair"))
    return {
      text: "text-orange-800",
      bg: "bg-orange-400/15",
      ring: "ring-orange-400/50",
    };
  if (l.includes("poor"))
    return {
      text: "text-red-700",
      bg: "bg-red-500/15",
      ring: "ring-red-500/40",
    };
  return {
    text: "text-slate-700",
    bg: "bg-slate-500/10",
    ring: "ring-slate-400/30",
  };
}

/**
 * Pick the matching band for a numeric value.
 * A row matches if (min is null or value >= min) and (max is null or value <= max).
 * When multiple match, lowest sort_order wins; tie-breaker: longer label (more specific).
 */
export function matchPerformanceBand(
  metricKey: string,
  value: number,
  bands: NormalizedPerformanceBand[]
): NormalizedPerformanceBand | null {
  const key = metricKey.trim();
  const candidates = bands.filter((b) => b.metricKey === key);
  if (!candidates.length) return null;

  const matches = candidates.filter((b) => {
    const okMin = b.minValue == null || value >= b.minValue;
    const okMax = b.maxValue == null || value <= b.maxValue;
    return okMin && okMax;
  });

  const pool = matches.length ? matches : candidates;
  return [...pool].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.label.length - a.label.length;
  })[0];
}

/** Default TopSpeed / peakSpeed bands when DB has no row (rehab context). */
export function defaultPeakSpeedBand(
  peakSpeedMps: number
): { label: string } | null {
  if (Number.isNaN(peakSpeedMps)) return null;
  if (peakSpeedMps >= 7.5) return { label: "Elite" };
  if (peakSpeedMps >= 7.0) return { label: "Good" };
  if (peakSpeedMps >= 6.0) return { label: "Fair" };
  return { label: "Poor" };
}

export function resolveBandForMetric(
  metricKey: string,
  value: number | null,
  bands: NormalizedPerformanceBand[]
): NormalizedPerformanceBand | { label: string } | null {
  if (value == null || Number.isNaN(value)) return null;
  const fromDb = matchPerformanceBand(metricKey, value, bands);
  if (fromDb) return fromDb;
  if (metricKey === "peakSpeed" || metricKey === "topSpeed") {
    return defaultPeakSpeedBand(value);
  }
  return null;
}
