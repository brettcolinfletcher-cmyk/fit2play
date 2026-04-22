import { buildCmjDataPoints } from "@/components/athletes/ForcePlateCMJSection";
import { buildDjDataPoints } from "@/components/athletes/ForcePlateDJSection";
import {
  bucket,
  formatChartAxisDate,
  isLinearSprintSession,
  metricAggregate,
  sessionsChronological,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";

/** Matches sprint/COD line colours on `app/dashboard/athletes/[id]/page.tsx`. */
export const ATHLETE_COMPARE_LINE_COLORS = [
  "#84cc16",
  "#38bdf8",
  "#f43f5e",
  "#fbbf24",
  "#a78bfa",
  "#f472b6",
] as const;

export type CompareMetricId =
  | "sprint10m"
  | "sprint40m"
  | "cod505"
  | "cmjHeight"
  | "rsiDj"
  | "lsiHop";

export const COMPARE_METRIC_ORDER: CompareMetricId[] = [
  "sprint10m",
  "sprint40m",
  "cod505",
  "cmjHeight",
  "rsiDj",
  "lsiHop",
];

export const COMPARE_METRIC_LABELS: Record<CompareMetricId, string> = {
  sprint10m: "10m sprint",
  sprint40m: "40m sprint",
  cod505: "5-10-5 COD",
  cmjHeight: "CMJ height",
  rsiDj: "RSI (drop jump)",
  lsiHop: "LSI (symmetry)",
};

function is1080(s: ReportSessionRow): boolean {
  return bucket(s.source) === "1080";
}

function is505Session(s: ReportSessionRow): boolean {
  return is1080(s) && (s.test_sub_type ?? "").toLowerCase().includes("5-10-5");
}

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

function pointForSession(
  s: ReportSessionRow,
  value: number | null
): ComparePoint | null {
  if (!s.session_date) return null;
  const t = new Date(s.session_date).getTime();
  return { sessionDate: s.session_date, t, v: value };
}

function buildLsiSeries(hopTests: ReportHopTestRow[]): ComparePoint[] {
  const pairByDate = new Map<
    string,
    Map<string, { left: number | null; right: number | null }>
  >();
  for (const r of hopTests) {
    const d = r.session_date?.slice(0, 10);
    if (!d) continue;
    const m = pairByDate.get(d) ?? new Map();
    const cur = m.get(r.test_type) ?? { left: null as number | null, right: null as number | null };
    const side = (r.side ?? "").toLowerCase();
    if (side === "left") cur.left = r.best_cm;
    else if (side === "right") cur.right = r.best_cm;
    m.set(r.test_type, cur);
    pairByDate.set(d, m);
  }
  const out: ComparePoint[] = [];
  for (const [d, typeMap] of pairByDate) {
    let minLsi: number | null = null;
    for (const pair of typeMap.values()) {
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
          if (minLsi == null || lsi < minLsi) minLsi = lsi;
        }
      }
    }
    if (minLsi != null) {
      const sessionDate = `${d}T12:00:00`;
      out.push({
        sessionDate,
        t: new Date(sessionDate).getTime(),
        v: minLsi,
      });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * Per-athlete time series for the six comparison metrics (same shaping rules as the athlete dashboard).
 */
export function buildAthleteCompareSeries(
  athleteId: string,
  firstName: string | null,
  lastName: string | null,
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  hopTests: ReportHopTestRow[]
): AthleteCompareSeries {
  const linearSorted = sessionsChronological(sessions.filter(isLinearSprintSession));
  const sprint10m: ComparePoint[] = [];
  const sprint40m: ComparePoint[] = [];
  for (const s of linearSorted) {
    const v10 = metricAggregate(metricsBySession, s.id, "split_10m_time", "min");
    const p10 = pointForSession(s, v10);
    if (p10) sprint10m.push(p10);
    const v40 = metricAggregate(metricsBySession, s.id, "split_40m_time", "min");
    const p40 = pointForSession(s, v40);
    if (p40) sprint40m.push(p40);
  }

  const codSorted = sessionsChronological(sessions.filter(is505Session));
  const cod505: ComparePoint[] = [];
  for (const s of codSorted) {
    const v = metricAggregate(metricsBySession, s.id, "total_time", "min");
    const p = pointForSession(s, v);
    if (p) cod505.push(p);
  }

  const hawkinsCsv = sessionsChronological(
    sessions.filter((s) => (s.source ?? "").toLowerCase() === "hawkins_csv")
  );
  const cmjPts = buildCmjDataPoints(hawkinsCsv, metricsBySession);
  const djPts = buildDjDataPoints(hawkinsCsv, metricsBySession);
  const cmjHeight: ComparePoint[] = cmjPts.map((p) => ({
    sessionDate: new Date(p.t).toISOString(),
    t: p.t,
    v: p.jump_height,
  }));
  const rsiDj: ComparePoint[] = djPts.map((p) => ({
    sessionDate: new Date(p.t).toISOString(),
    t: p.t,
    v: p.rsi,
  }));

  const lsiHop = buildLsiSeries(hopTests);

  return {
    athleteId,
    firstName,
    lastName,
    series: {
      sprint10m,
      sprint40m,
      cod505,
      cmjHeight,
      rsiDj,
      lsiHop,
    },
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

/** For radar: higher = better on 0–100 scale. Time metrics are inverted using min/max across athletes. */
export function radarScoresForLatest(
  profiles: AthleteCompareSeries[],
  metric: CompareMetricId,
  athleteIds: string[]
): Map<string, number | null> {
  const raw = new Map<string, number | null>();
  for (const id of athleteIds) raw.set(id, null);
  const timeLike: CompareMetricId[] = ["sprint10m", "sprint40m", "cod505"];
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
    if (timeLike.includes(metric)) {
      out.set(id, ((maxV - v) / span) * 100);
    } else {
      out.set(id, ((v - minV) / span) * 100);
    }
  }
  return out;
}
