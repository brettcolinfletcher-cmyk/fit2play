/**
 * Exponentially weighted moving averages for training load (Williams et al. 2017):
 *   EWMA_today = load_today * λ + EWMA_yesterday * (1 - λ),  λ = 2 / (N + 1)
 * Run over a continuous daily series (days without a session are zero load).
 * Both averages start at 0, so the first `chronicDays` days are flagged as
 * still building and get no ACWR.
 */

export type DailyLoad = { date: string; load: number };

export type EwmaPoint = {
  date: string;
  /** ms since epoch (UTC midnight), for time axes */
  t: number;
  /** that day's load, null on days with no session */
  load: number | null;
  acute: number;
  chronic: number;
  /** acute / chronic, null while building or when chronic is ~0 */
  acwr: number | null;
  building: boolean;
};

const DAY_MS = 86_400_000;

export function dayMs(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Sum loads per calendar day. Input dates are YYYY-MM-DD (or longer ISO strings). */
export function dailyTotals(rows: { date: string; value: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue;
    const d = r.date.slice(0, 10);
    out.set(d, (out.get(d) ?? 0) + r.value);
  }
  return out;
}

/**
 * Daily EWMA series from the first loaded day through `endDate` (inclusive).
 * Returns [] when there is no load.
 */
export function ewmaSeries(
  totals: Map<string, number>,
  opts: { acuteDays: number; chronicDays: number; endDate: string }
): EwmaPoint[] {
  if (totals.size === 0) return [];
  const days = [...totals.keys()].sort();
  const start = dayMs(days[0]);
  const end = Math.max(dayMs(opts.endDate), dayMs(days[days.length - 1]));
  const la = 2 / (opts.acuteDays + 1);
  const lc = 2 / (opts.chronicDays + 1);

  const out: EwmaPoint[] = [];
  let acute = 0;
  let chronic = 0;
  for (let t = start, i = 0; t <= end; t += DAY_MS, i++) {
    const date = isoDay(t);
    const has = totals.has(date);
    const load = has ? totals.get(date)! : 0;
    acute = load * la + acute * (1 - la);
    chronic = load * lc + chronic * (1 - lc);
    const building = i < opts.chronicDays - 1;
    out.push({
      date,
      t,
      load: has ? load : null,
      acute,
      chronic,
      acwr: !building && chronic > 1e-6 ? acute / chronic : null,
      building,
    });
  }
  return out;
}
