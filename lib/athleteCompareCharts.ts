import {
  COMPARE_METRICS,
  COMPARE_METRIC_LABELS,
  COMPARE_METRIC_ORDER,
  COMPARE_LR_METRICS,
  compareMetricById,
  compareLRMetricById,
  extractLRPoints,
  hasAnyLRData,
  type AthleteRawBundle,
  type CompareMetricId,
  type CompareLRMetricDef,
  type CompareLRMetricId,
  type LRPoint,
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

export type { AthleteRawBundle, CompareMetricId, CompareLRMetricId, LRPoint } from "@/lib/compareMetrics";
export { COMPARE_METRIC_LABELS, COMPARE_METRIC_ORDER, COMPARE_LR_METRICS } from "@/lib/compareMetrics";

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

// ─────────────────────────────────────────────────────────────────────────────
// Phase D LR helpers
// ─────────────────────────────────────────────────────────────────────────────

export type LRRepAggregate = "max" | "min" | "avg";

export type AthleteLRSeries = {
  athleteId: string;
  firstName: string | null;
  lastName: string | null;
  series: Record<CompareLRMetricId, LRPoint[]>;
};

/**
 * Per-athlete LR series for every metric in `COMPARE_LR_METRICS`.
 * `repAggregate` controls within-session rep aggregation ("max" = best rep, "avg" = mean across reps).
 * When omitted, each metric def's own `aggregate` is used (currently all "max").
 */
export function buildAthleteLRSeries(
  athleteId: string,
  firstName: string | null,
  lastName: string | null,
  sessions: AthleteRawBundle["sessions"],
  metricsBySession: AthleteRawBundle["metricsBySession"],
  hopTests: AthleteRawBundle["hopTests"],
  repAggregate?: LRRepAggregate
): AthleteLRSeries {
  const bundle: AthleteRawBundle = { sessions, metricsBySession, hopTests };
  const series = {} as Record<CompareLRMetricId, LRPoint[]>;
  for (const def of COMPARE_LR_METRICS) {
    series[def.id as CompareLRMetricId] = extractLRPoints(def, bundle, repAggregate);
  }
  return { athleteId, firstName, lastName, series };
}

/** True iff at least one selected athlete has ≥1 LR point on any metric. */
export function anyLRDataAcrossProfiles(profiles: AthleteLRSeries[]): boolean {
  return profiles.some((p) =>
    COMPARE_LR_METRICS.some((def) => (p.series[def.id as CompareLRMetricId] ?? []).length > 0)
  );
}

/** True iff at least one selected athlete has ≥1 LR point for this metric. */
export function anyLRDataForMetric(
  profiles: AthleteLRSeries[],
  metric: CompareLRMetricId
): boolean {
  return profiles.some((p) => (p.series[metric] ?? []).length > 0);
}

function aggregateValues(vals: number[], mode: LRRepAggregate): number {
  if (mode === "max") return Math.max(...vals);
  if (mode === "min") return Math.min(...vals);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Merge LSI rows across athletes by date for a single LR metric.
 * Each row: { t, label, [athleteId]: lsi% | null }
 * When one athlete has multiple sessions on the same date, they are combined using `mode`.
 */
export function mergeLRLsiRowsForMetric(
  profiles: AthleteLRSeries[],
  metric: CompareLRMetricId,
  athleteKeys: string[],
  mode: LRRepAggregate = "max"
): TrendRow[] {
  const byDay = new Map<
    string,
    { t: number; label: string; perAthlete: Map<string, number[]> }
  >();

  for (const prof of profiles) {
    for (const pt of prof.series[metric] ?? []) {
      const dk = pt.sessionDate.slice(0, 10);
      const cur = byDay.get(dk) ?? {
        t: pt.t,
        label: formatChartAxisDate(pt.sessionDate),
        perAthlete: new Map<string, number[]>(),
      };
      const list = cur.perAthlete.get(prof.athleteId) ?? [];
      list.push(pt.lsi);
      cur.perAthlete.set(prof.athleteId, list);
      cur.t = Math.min(cur.t, pt.t);
      byDay.set(dk, cur);
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => a[1].t - b[1].t)
    .map(([, row]) => {
      const o: TrendRow = { t: row.t, label: row.label };
      for (const k of athleteKeys) {
        const vals = row.perAthlete.get(k);
        o[k] = vals && vals.length > 0 ? aggregateValues(vals, mode) : null;
      }
      return o;
    });
}

/**
 * Merge per-leg rows across athletes by date for a single LR metric.
 * Each row: { t, label, [`${id}__L`]: leftVal, [`${id}__R`]: rightVal }
 * When one athlete has multiple sessions on the same date, L and R are aggregated separately using `mode`.
 */
export function mergeLRPerLegRowsForMetric(
  profiles: AthleteLRSeries[],
  metric: CompareLRMetricId,
  athleteKeys: string[],
  mode: LRRepAggregate = "max"
): TrendRow[] {
  const byDay = new Map<
    string,
    {
      t: number;
      label: string;
      perAthleteL: Map<string, number[]>;
      perAthleteR: Map<string, number[]>;
    }
  >();

  for (const prof of profiles) {
    for (const pt of prof.series[metric] ?? []) {
      const dk = pt.sessionDate.slice(0, 10);
      const cur = byDay.get(dk) ?? {
        t: pt.t,
        label: formatChartAxisDate(pt.sessionDate),
        perAthleteL: new Map<string, number[]>(),
        perAthleteR: new Map<string, number[]>(),
      };
      const lList = cur.perAthleteL.get(prof.athleteId) ?? [];
      lList.push(pt.left);
      cur.perAthleteL.set(prof.athleteId, lList);
      const rList = cur.perAthleteR.get(prof.athleteId) ?? [];
      rList.push(pt.right);
      cur.perAthleteR.set(prof.athleteId, rList);
      cur.t = Math.min(cur.t, pt.t);
      byDay.set(dk, cur);
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => a[1].t - b[1].t)
    .map(([, row]) => {
      const o: TrendRow = { t: row.t, label: row.label };
      for (const k of athleteKeys) {
        const lVals = row.perAthleteL.get(k);
        const rVals = row.perAthleteR.get(k);
        o[`${k}__L`] = lVals && lVals.length > 0 ? aggregateValues(lVals, mode) : null;
        o[`${k}__R`] = rVals && rVals.length > 0 ? aggregateValues(rVals, mode) : null;
      }
      return o;
    });
}

export type LRLatest = {
  athleteId: string;
  sessionDate: string | null;
  dateLabel: string;
  left: number | null;
  right: number | null;
  lsi: number | null;
  pctDiff: number | null;
  flagged: boolean;
};

/** Latest LR point per athlete for a metric. */
export function lrLatestForMetric(
  profiles: AthleteLRSeries[],
  metric: CompareLRMetricId,
  athleteIds: string[]
): LRLatest[] {
  const out: LRLatest[] = [];
  for (const id of athleteIds) {
    const prof = profiles.find((p) => p.athleteId === id);
    const points = prof?.series[metric] ?? [];
    let best: LRPoint | null = null;
    for (const p of points) {
      if (!best || p.t >= best.t) best = p;
    }
    if (best) {
      out.push({
        athleteId: id,
        sessionDate: best.sessionDate,
        dateLabel: formatChartAxisDate(best.sessionDate),
        left: best.left,
        right: best.right,
        lsi: best.lsi,
        pctDiff: best.pctDiff,
        flagged: best.flagged,
      });
    } else {
      out.push({
        athleteId: id,
        sessionDate: null,
        dateLabel: "—",
        left: null,
        right: null,
        lsi: null,
        pctDiff: null,
        flagged: false,
      });
    }
  }
  return out;
}

/** Re-exported for component code. */
export { compareLRMetricById, hasAnyLRData };
export type { CompareLRMetricDef };

// ─────────────────────────────────────────────────────────────────────────────
// LR-eligible session listing (for the practitioner editor)
// ─────────────────────────────────────────────────────────────────────────────

export type LREligibleSession = {
  athleteId: string;
  sessionId: string;
  sessionDate: string | null;
  dateLabel: string;
  testSubType: string | null;
  lrStartingLeg: "left" | "right" | null;
  /** Rep counts per side across all LR registry metrics (use max across metrics so we don't double-count). */
  leftReps: number;
  rightReps: number;
  /** 1-based index of this session within sessions sharing the same date. */
  sessionIndexOnDay: number;
  /** Total sessions sharing this session's date. */
  totalSessionsOnDay: number;
};

const LR_METRIC_KEYS = new Set(
  (COMPARE_LR_METRICS as CompareLRMetricDef[]).map((d) => d.metricKey)
);

/**
 * For one athlete's bundle, return every 1080 session that has BOTH side='left' and
 * side='right' metrics for at least one LR registry metric. These are sessions where
 * the practitioner should record the anatomical starting leg.
 */
export function lrEligibleSessionsForAthlete(
  athleteId: string,
  bundle: AthleteRawBundle
): LREligibleSession[] {
  type Pre = Omit<LREligibleSession, "sessionIndexOnDay" | "totalSessionsOnDay">;
  const pre: Pre[] = [];
  for (const s of bundle.sessions) {
    if ((s.source ?? "").toLowerCase() !== "1080") continue;
    const rows = bundle.metricsBySession.get(s.id) ?? [];

    // Rep counts per side per metric — take max across metrics so we don't double-count
    // (e.g. top_speed + peak_force + peak_power for one rep all share the same rep_index).
    const leftRepsByMetric = new Map<string, Set<number | null>>();
    const rightRepsByMetric = new Map<string, Set<number | null>>();
    for (const r of rows) {
      if (!LR_METRIC_KEYS.has(r.key)) continue;
      if (r.value == null) continue;
      const n = Number(r.value);
      if (!Number.isFinite(n)) continue;
      if (r.side === "left") {
        const set = leftRepsByMetric.get(r.key) ?? new Set<number | null>();
        set.add(r.rep_index ?? null);
        leftRepsByMetric.set(r.key, set);
      } else if (r.side === "right") {
        const set = rightRepsByMetric.get(r.key) ?? new Set<number | null>();
        set.add(r.rep_index ?? null);
        rightRepsByMetric.set(r.key, set);
      }
    }
    const leftReps = leftRepsByMetric.size === 0
      ? 0
      : Math.max(...[...leftRepsByMetric.values()].map((s) => s.size));
    const rightReps = rightRepsByMetric.size === 0
      ? 0
      : Math.max(...[...rightRepsByMetric.values()].map((s) => s.size));

    if (leftReps === 0 || rightReps === 0) continue;

    pre.push({
      athleteId,
      sessionId: s.id,
      sessionDate: s.session_date,
      dateLabel: formatChartAxisDate(s.session_date),
      testSubType: s.test_sub_type,
      lrStartingLeg: (s.lr_starting_leg ?? null) as "left" | "right" | null,
      leftReps,
      rightReps,
    });
  }

  // Newest-first by date, then by session id for stable order within a date.
  pre.sort((a, b) => {
    const d = (b.sessionDate ?? "").localeCompare(a.sessionDate ?? "");
    if (d !== 0) return d;
    return a.sessionId.localeCompare(b.sessionId);
  });

  // Number the sessions within each date.
  const countsByDay = new Map<string, number>();
  for (const r of pre) {
    const k = (r.sessionDate ?? "").slice(0, 10);
    countsByDay.set(k, (countsByDay.get(k) ?? 0) + 1);
  }
  const seenByDay = new Map<string, number>();
  const out: LREligibleSession[] = pre.map((r) => {
    const k = (r.sessionDate ?? "").slice(0, 10);
    const total = countsByDay.get(k) ?? 1;
    const next = (seenByDay.get(k) ?? 0) + 1;
    seenByDay.set(k, next);
    return { ...r, sessionIndexOnDay: next, totalSessionsOnDay: total };
  });
  return out;
}

