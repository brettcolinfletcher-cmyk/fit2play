/**
 * Team GPS calculations (pure, tested). Per athlete: EWMA workload on the
 * chosen load, % of max velocity, days since a 90%+ MV exposure, totals in
 * the date range, and watch-list flags.
 */
import { dailyTotals, dayMs, ewmaSeries, type EwmaPoint } from "@/lib/ewma";
import { sessionBandDistances, type SpeedBand } from "@/lib/speedBands";

export type MetricRow = { key: string; value: number | null; rep_index: number | null };
export type TeamSession = { id: string; athleteId: string; date: string; type: string; name: string };
export type LoadKey = "bands" | "gps_high_speed_run_distance_m" | "gps_total_sprint_distance_m";

export const ACWR_LOW = 0.8;
export const ACWR_HIGH = 1.3;
export const ACWR_DANGER = 1.5;
export const SPIKE_FLAG = 50;
export const MV_HIGH = 90;
export const MV_STALE_DAYS = 14;

function metric(rows: MetricRow[], key: string): number | null {
  const v = rows.find((r) => r.key === key)?.value;
  return v == null ? null : Number(v);
}

/** One session's load. "bands" = selected speed bands, else total distance when all bands are on and no buckets exist. */
export function sessionLoad(rows: MetricRow[], loadKey: LoadKey, bands: SpeedBand[], enabled: Set<string>): number | null {
  if (loadKey !== "bands") return metric(rows, loadKey);
  const dist = sessionBandDistances(rows, bands);
  if (dist) return dist.reduce((a, v, i) => a + (enabled.has(bands[i].id) ? v : 0), 0);
  return enabled.size === bands.length ? metric(rows, "gps_total_distance_m") : null;
}

export type AthleteStatus = {
  athleteId: string;
  series: EwmaPoint[];
  last: EwmaPoint | null;
  lastSession: TeamSession | null;
  sessionsInRange: number;
  distanceInRange: number;
  hsrInRange: number;
  sprintInRange: number;
  maxVelocity: number | null;
  /** Top speed / MV of the most recent session in range */
  lastPctMv: number | null;
  lastHit90: string | null;
  daysSince90: number | null;
};

export function athleteStatus(args: {
  athleteId: string;
  sessions: TeamSession[]; // this athlete's GPS sessions, full history
  metrics: Map<string, MetricRow[]>;
  loadKey: LoadKey;
  bands: SpeedBand[];
  enabled: Set<string>;
  chronicDays: number;
  rangeStart: string | null;
  rangeEnd: string;
  setMaxVelocity: number | null;
  best1080: number | null;
}): AthleteStatus {
  const { sessions, metrics, rangeStart, rangeEnd } = args;
  const rows = (id: string) => metrics.get(id) ?? [];

  const loads: { date: string; value: number }[] = [];
  let gpsBest: number | null = null;
  for (const s of sessions) {
    const l = sessionLoad(rows(s.id), args.loadKey, args.bands, args.enabled);
    if (l != null) loads.push({ date: s.date, value: l });
    const top = metric(rows(s.id), "gps_max_speed_kph");
    if (top != null && (gpsBest == null || top > gpsBest)) gpsBest = top;
  }
  const full = ewmaSeries(dailyTotals(loads), { acuteDays: 7, chronicDays: args.chronicDays, endDate: rangeEnd });
  const from = rangeStart ? dayMs(rangeStart) : -Infinity;
  const to = dayMs(rangeEnd);
  const series = full.filter((p) => p.t >= from && p.t <= to);
  const last = full.filter((p) => p.t <= to).at(-1) ?? null;

  const inRange = sessions
    .filter((s) => (!rangeStart || s.date >= rangeStart) && s.date <= rangeEnd)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const sum = (key: string) => inRange.reduce((a, s) => a + (metric(rows(s.id), key) ?? 0), 0);

  const bestRecorded = [gpsBest, args.best1080].filter((v): v is number => v != null);
  const mv = args.setMaxVelocity ?? (bestRecorded.length ? Math.max(...bestRecorded) : null);
  const lastSession = inRange.at(-1) ?? null;
  const lastTop = lastSession ? metric(rows(lastSession.id), "gps_max_speed_kph") : null;
  let lastHit90: string | null = null;
  if (mv) {
    for (const s of [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      if (s.date > rangeEnd) continue;
      const top = metric(rows(s.id), "gps_max_speed_kph");
      if (top != null && (top / mv) * 100 >= MV_HIGH) {
        lastHit90 = s.date;
        break;
      }
    }
  }

  return {
    athleteId: args.athleteId,
    series,
    last,
    lastSession,
    sessionsInRange: inRange.length,
    distanceInRange: sum("gps_total_distance_m"),
    hsrInRange: sum("gps_high_speed_run_distance_m"),
    sprintInRange: sum("gps_total_sprint_distance_m"),
    maxVelocity: mv,
    lastPctMv: lastTop != null && mv ? (lastTop / mv) * 100 : null,
    lastHit90,
    daysSince90: lastHit90 ? Math.round((dayMs(rangeEnd) - dayMs(lastHit90)) / 86_400_000) : null,
  };
}

export type Flag = { athleteId: string; severity: "high" | "medium"; text: string };

export function statusFlags(s: AthleteStatus, spikeThreshold: number = SPIKE_FLAG): Flag[] {
  const out: Flag[] = [];
  const acwr = s.last?.acwr ?? null;
  if (acwr != null && acwr > ACWR_DANGER) out.push({ athleteId: s.athleteId, severity: "high", text: `ACWR ${acwr.toFixed(2)} (above ${ACWR_DANGER})` });
  else if (acwr != null && acwr > ACWR_HIGH) out.push({ athleteId: s.athleteId, severity: "medium", text: `ACWR ${acwr.toFixed(2)} (above ${ACWR_HIGH})` });
  else if (acwr != null && acwr < ACWR_LOW) out.push({ athleteId: s.athleteId, severity: "medium", text: `ACWR ${acwr.toFixed(2)} (below ${ACWR_LOW})` });
  const spike = s.last?.diffPct ?? null;
  if (spike != null && spike >= spikeThreshold) out.push({ athleteId: s.athleteId, severity: "high", text: `Load spike +${Math.round(spike)}%` });
  if (s.maxVelocity && s.sessionsInRange > 0 && (s.daysSince90 == null || s.daysSince90 > MV_STALE_DAYS)) {
    out.push({
      athleteId: s.athleteId,
      severity: "medium",
      text: s.daysSince90 == null ? `No ${MV_HIGH}%+ MV exposure on record` : `${s.daysSince90} days since ${MV_HIGH}%+ MV`,
    });
  }
  return out;
}
