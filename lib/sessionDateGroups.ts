/**
 * Groups same-day sessions/reps together so trend charts and detail lists
 * show one entry per calendar date (the "best" one) instead of a separate
 * point for every session recorded that day.
 *
 * Several test types can produce more than one session on the same date —
 * confirmed in production for 1080 COD (5-0-5 / 5-10-5), Running (LR), and
 * Linear bilateral sessions (re-tests, warm-up vs. main effort, per-leg
 * sessions, etc.). Without this, trend charts plot multiple points on the
 * same date and per-metric "best" selection only looked within a single
 * session, never across the day's sessions.
 */

export type DateGroup<T> = {
  /** Calendar date, YYYY-MM-DD, derived from session_date. */
  date: string;
  /** Every session recorded on this date, chronological. */
  sessions: T[];
  /** The highest-scoring session for this date (per `scoreOf`). */
  best: T;
};

export function groupSessionsByDate<
  T extends { id: string; session_date: string | null }
>(
  items: T[],
  scoreOf: (item: T) => number | null,
  mode: "max" | "min" = "max"
): DateGroup<T>[] {
  const byDate = new Map<string, T[]>();
  for (const item of items) {
    if (!item.session_date) continue;
    const d = item.session_date.slice(0, 10);
    const list = byDate.get(d) ?? [];
    list.push(item);
    byDate.set(d, list);
  }

  const dates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));

  return dates.map((date) => {
    const daySessions = [...byDate.get(date)!].sort((a, b) => {
      const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
      const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
      return ta - tb;
    });

    let best = daySessions[0]!;
    let bestScore = scoreOf(best);
    for (const item of daySessions.slice(1)) {
      const score = scoreOf(item);
      if (score == null) continue;
      if (
        bestScore == null ||
        (mode === "max" ? score > bestScore : score < bestScore)
      ) {
        best = item;
        bestScore = score;
      }
    }

    return { date, sessions: daySessions, best };
  });
}
