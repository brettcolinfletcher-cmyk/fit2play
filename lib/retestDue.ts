/**
 * Retest due dates. Pure, shared by the staff dashboard (Needs Attention) and
 * the Monday staff email so both always agree.
 *
 * Each athlete is due `interval` weeks after their latest test session, where
 * the interval is their team's retest_interval_weeks, or 12 weeks by default.
 * Archived athletes are ignored.
 */

export const DEFAULT_RETEST_WEEKS = 12;
const DAY_MS = 86_400_000;

export type RetestAthlete = {
  id: string;
  name: string;
  status: string | null;
  teamName: string | null;
  intervalWeeks: number | null;
};

export type RetestStatus = "overdue" | "due_soon" | "never" | "ok";

export type RetestRow = {
  athleteId: string;
  name: string;
  teamName: string | null;
  intervalWeeks: number;
  lastTest: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  daysOverdue: number | null; // negative = days until due
  status: RetestStatus;
};

function day(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Latest session_date (YYYY-MM-DD) per athlete. */
export function latestTestByAthlete(sessions: { athlete_id: string | null; session_date: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of sessions) {
    if (!s.athlete_id || !s.session_date) continue;
    const d = s.session_date.slice(0, 10);
    const cur = m.get(s.athlete_id);
    if (!cur || d > cur) m.set(s.athlete_id, d);
  }
  return m;
}

/**
 * @param today YYYY-MM-DD in Perth
 * @param soonDays "due soon" window (default 7)
 */
export function computeRetestDue(
  athletes: RetestAthlete[],
  lastTest: Map<string, string>,
  today: string,
  soonDays = 7
): RetestRow[] {
  const t = day(today);
  const rows: RetestRow[] = [];
  for (const a of athletes) {
    if (a.status === "archived") continue;
    const weeks = a.intervalWeeks && a.intervalWeeks > 0 ? a.intervalWeeks : DEFAULT_RETEST_WEEKS;
    const last = lastTest.get(a.id) ?? null;
    if (!last) {
      rows.push({ athleteId: a.id, name: a.name, teamName: a.teamName, intervalWeeks: weeks, lastTest: null, dueDate: null, daysOverdue: null, status: "never" });
      continue;
    }
    const due = day(last) + weeks * 7 * DAY_MS;
    const daysOverdue = Math.round((t - due) / DAY_MS);
    const status: RetestStatus = daysOverdue > 0 ? "overdue" : daysOverdue >= -soonDays ? "due_soon" : "ok";
    rows.push({ athleteId: a.id, name: a.name, teamName: a.teamName, intervalWeeks: weeks, lastTest: last, dueDate: ymd(due), daysOverdue, status });
  }
  const order: Record<RetestStatus, number> = { overdue: 0, due_soon: 1, never: 2, ok: 3 };
  return rows.sort(
    (x, y) =>
      order[x.status] - order[y.status] ||
      (y.daysOverdue ?? -1e9) - (x.daysOverdue ?? -1e9) ||
      x.name.localeCompare(y.name)
  );
}

/** Today's date in Perth as YYYY-MM-DD. */
export function perthToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
