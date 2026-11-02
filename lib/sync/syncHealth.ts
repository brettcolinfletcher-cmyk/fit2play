/**
 * Sync health: is each nightly sync running and succeeding?
 * Pure function so the dashboard, the status API and the morning alert agree.
 *
 * Syncs run daily at 14:00 UTC (10pm Perth). A source is:
 *  - "overdue" when its last successful run is older than maxAgeHours (or it never succeeded)
 *  - "errors"  when it has succeeded recently but its latest run logged errors
 *  - "ok"      otherwise
 */

export type SyncLogRow = {
  source: string;
  synced_at: string;
  errors: string | null;
};

export type SyncHealthStatus = "ok" | "errors" | "overdue";

export type SourceHealth = {
  source: string;
  label: string;
  status: SyncHealthStatus;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  hoursSinceSuccess: number | null;
  latestError: string | null;
  message: string;
};

export const SYNC_SOURCES: { source: string; label: string }[] = [
  { source: "hawkins", label: "Force plates (Hawkins)" },
  { source: "1080", label: "Speed and sprint" },
];

/** 30 h: the alert at 07:00 Perth fires if last night's 10pm run did not succeed. */
export const DEFAULT_MAX_AGE_HOURS = 30;

export function evaluateSyncHealth(
  rows: SyncLogRow[],
  now: Date = new Date(),
  maxAgeHours: number = DEFAULT_MAX_AGE_HOURS
): SourceHealth[] {
  return SYNC_SOURCES.map(({ source, label }) => {
    const mine = rows
      .filter((r) => r.source === source)
      .sort((a, b) => Date.parse(b.synced_at) - Date.parse(a.synced_at));
    const latest = mine[0] ?? null;
    const lastSuccess = mine.find((r) => !r.errors) ?? null;
    const hours =
      lastSuccess != null ? (now.getTime() - Date.parse(lastSuccess.synced_at)) / 3_600_000 : null;
    const latestError = latest?.errors ?? null;

    let status: SyncHealthStatus = "ok";
    let message = "Running normally.";
    if (hours == null || hours > maxAgeHours) {
      status = "overdue";
      message =
        hours == null
          ? "No successful sync on record."
          : `No successful sync for ${Math.floor(hours)} hours (expected daily at 10pm Perth).`;
    } else if (latestError) {
      status = "errors";
      message = "The latest sync ran but logged errors.";
    }

    return {
      source,
      label,
      status,
      lastRunAt: latest?.synced_at ?? null,
      lastSuccessAt: lastSuccess?.synced_at ?? null,
      hoursSinceSuccess: hours == null ? null : Math.round(hours * 10) / 10,
      latestError,
      message,
    };
  });
}

export function hasSyncProblem(health: SourceHealth[]): boolean {
  return health.some((h) => h.status !== "ok");
}
