import {
  COMPARE_METRICS,
  COMPARE_METRIC_LABELS,
  COMPARE_METRIC_ORDER,
  compareMetricById,
  type AthleteRawBundle,
  type CompareMetricId,
} from "@/lib/compareMetrics";
import { formatChartAxisDate } from "@/lib/athleteReportData";

/** Matches sprint/COD line colours on `app/dashboard/athletes/[id]/page.tsx`. */
export const ATHLETE_COMPARE_LINE_COLORS = [
  "#84cc16",
  "#38bdf8",
  "#f43f5e",
  "#fbbf24",
  "#a78bfa",
  "#f472b6",
] as const;

export type { AthleteRawBundle, CompareMetricId } from "@/lib/compareMetrics";
export { COMPARE_METRIC_LABELS, COMPARE_METRIC_ORDER } from "@/lib/compareMetrics";

export type ComparePoint = {
  sessionDate: string;
  t: number;
  v: number | null;
};

export type AthleteCompareSeries = {
  athleteId: string;
  firstName: string | null;
  lastName: string | null;
  series: Record<CompareMetricId, ComparePoint[]>;
};

function toComparePoints(
  rows: Array<{ sessionDate: string; value: number }>
): ComparePoint[] {
  return rows.map((r) => ({
    sessionDate: r.sessionDate,
    t: new Date(r.sessionDate).getTime(),
    v: r.value,
  }));
}

/**
 * Per-athlete time series for all comparison metrics (keys + protocol filters from `COMPARE_METRICS`).
 */
export function buildAthleteCompareSeries(
  athleteId: string,
  firstName: string | null,
  lastName: string | null,
  sessions: AthleteRawBundle["sessions"],
  metricsBySession: AthleteRawBundle["metricsBySession"],
  hopTests: AthleteRawBundle["hopTests"]
): AthleteCompareSeries {
  const bundle: AthleteRawBundle = { sessions, metricsBySession, hopTests };
  const series = {} as Record<CompareMetricId, ComparePoint[]>;
  for (const def of COMPARE_METRICS) {
    series[def.id as CompareMetricId] = toComparePoints(def.extract(bundle));
  }
  return {
    athleteId,
    firstName,
    lastName,
    series,
  };
}

export function athleteDisplayName(a: {
  first_name: string | null;
  last_name: string | null;
}): string {
  const n = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  return n || "Athlete";
}

/** Latest non-null value in chronological series (by session time). */
export function latestValue(points: ComparePoint[]): number | null {
  let best: ComparePoint | null = null;
  for (const p of points) {
    if (p.v == null || !Number.isFinite(p.v)) continue;
    if (!best || p.t >= best.t) best = p;
  }
  return best?.v ?? null;
}

export type TrendRow = { t: number; label: string; [athleteKey: string]: number | string | null };

export function mergeTrendRowsForMetric(
  profiles: AthleteCompareSeries[],
  metric: CompareMetricId,
  athleteKeys: string[]
): TrendRow[] {
  const byDay = new Map<
    string,
    { t: number; label: string; vals: Record<string, number | null> }
  >();
  const nullRow = (): Record<string, number | null> =>
    Object.fromEntries(athleteKeys.map((k) => [k, null as number | null])) as Record<
      string,
      number | null
    >;

  for (const prof of profiles) {
    for (const pt of prof.series[metric]) {
      if (pt.v == null || !Number.isFinite(pt.v)) continue;
      const dk = pt.sessionDate.slice(0, 10);
      const cur = byDay.get(dk) ?? {
        t: pt.t,
        label: formatChartAxisDate(pt.sessionDate),
        vals: nullRow(),
      };
      cur.vals[prof.athleteId] = pt.v;
      cur.t = Math.min(cur.t, pt.t);
      byDay.set(dk, cur);
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => a[1].t - b[1].t)
    .map(([, row]) => {
      const o: TrendRow = { t: row.t, label: row.label };
      for (const k of athleteKeys) o[k] = row.vals[k] ?? null;
      return o;
    });
}

/** For radar: higher = better on 0–100 scale. Time-like metrics use `betterDirection === "lower"`. */
export function radarScoresForLatest(
  profiles: AthleteCompareSeries[],
  metric: CompareMetricId,
  athleteIds: string[]
): Map<string, number | null> {
  const def = compareMetricById(metric);
  const lowerIsBetter = def?.betterDirection === "lower";

  const raw = new Map<string, number | null>();
  for (const id of athleteIds) raw.set(id, null);
  for (const id of athleteIds) {
    const prof = profiles.find((p) => p.athleteId === id);
    if (!prof) continue;
    const v = latestValue(prof.series[metric]);
    raw.set(id, v);
  }
  const vals = [...raw.values()].filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return raw;
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = maxV - minV;
  const out = new Map<string, number | null>();
  for (const id of athleteIds) {
    const v = raw.get(id) ?? null;
    if (v == null || !Number.isFinite(v)) {
      out.set(id, null);
      continue;
    }
    if (span < 1e-9) {
      out.set(id, 50);
      continue;
    }
    if (lowerIsBetter) {
      out.set(id, ((maxV - v) / span) * 100);
    } else {
      out.set(id, ((v - minV) / span) * 100);
    }
  }
  return out;
}
