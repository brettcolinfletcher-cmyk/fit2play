"use client";

import { type LREligibleSession } from "@/lib/athleteCompareCharts";

/**
 * Phase D-C: Per-athlete editor for the anatomical starting leg of each LR-eligible
 * 1080 session AND the optional Swap L/R override (for when the device's L/R labels
 * were recorded backwards from anatomy).
 *
 * Used on both:
 *   - /dashboard/athletes/compare         (within AthleteCompareChartPanel)
 *   - /dashboard/athletes/[id]            (athlete detail page)
 *
 * Layout: a collapsible <details> panel showing one table per athlete. Auto-expands
 * when any session has an unrecorded starting leg.
 */
export default function LRStartingLegEditor({
  athleteIds,
  nameById,
  sessionsByAthlete,
  onSaveLeg,
  onSaveSwap,
  pending,
  /** Override the panel title when used outside the compare page. */
  title = "Starting leg per LR session",
}: {
  athleteIds: string[];
  nameById: Map<string, string>;
  sessionsByAthlete: Map<string, LREligibleSession[]>;
  onSaveLeg?: (
    athleteId: string,
    sessionId: string,
    value: "left" | "right" | null
  ) => void | Promise<void>;
  onSaveSwap?: (
    athleteId: string,
    sessionId: string,
    value: boolean
  ) => void | Promise<void>;
  pending: Set<string>;
  title?: string;
}) {
  const athletesWithSessions = athleteIds.filter(
    (id) => (sessionsByAthlete.get(id) ?? []).length > 0
  );
  if (athletesWithSessions.length === 0) return null;

  const totalSessions = athletesWithSessions.reduce(
    (n, id) => n + (sessionsByAthlete.get(id)?.length ?? 0),
    0
  );
  const unsetCount = athletesWithSessions.reduce((n, id) => {
    const rows = sessionsByAthlete.get(id) ?? [];
    return n + rows.filter((r) => r.lrStartingLeg == null).length;
  }, 0);

  // Single-athlete uses don't need per-athlete name headers.
  const showAthleteHeaders = athletesWithSessions.length > 1;

  return (
    <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60" open={unsetCount > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-slate-300">
        <span>
          {title}
          <span className="ml-2 font-normal text-slate-500">
            {unsetCount > 0
              ? `${unsetCount} of ${totalSessions} unrecorded`
              : `${totalSessions} session${totalSessions === 1 ? "" : "s"} recorded`}
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">click to toggle</span>
      </summary>
      <div className="space-y-4 border-t border-slate-800 px-4 py-3">
        {athletesWithSessions.map((athleteId) => {
          const rows = sessionsByAthlete.get(athleteId) ?? [];
          if (rows.length === 0) return null;
          return (
            <div key={athleteId}>
              {showAthleteHeaders ? (
                <p className="mb-1.5 text-xs font-medium text-slate-300">
                  {nameById.get(athleteId) ?? athleteId}
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      <th className="py-1.5 pr-3 font-medium">Date</th>
                      <th className="py-1.5 pr-3 font-medium">Sub-type</th>
                      <th className="py-1.5 pr-3 font-medium">Starting leg</th>
                      <th className="py-1.5 pr-3 font-medium">Swap L/R</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {rows.map((row) => {
                      const legKey = `leg:${athleteId}:${row.sessionId}`;
                      const swapKey = `swap:${athleteId}:${row.sessionId}`;
                      const legPending = pending.has(legKey);
                      const swapPending = pending.has(swapKey);
                      const dateBadge =
                        row.totalSessionsOnDay > 1
                          ? ` (${row.sessionIndexOnDay} of ${row.totalSessionsOnDay})`
                          : "";
                      return (
                        <tr key={row.sessionId} className="border-b border-slate-800/60">
                          <td className="py-1.5 pr-3 text-slate-400">
                            {row.dateLabel}
                            {dateBadge ? (
                              <span className="ml-1 text-slate-500">{dateBadge}</span>
                            ) : null}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-400">
                            <span>{row.testSubType ?? "—"}</span>
                            <span className="ml-2 font-mono text-[10px] text-slate-500">
                              {row.leftReps}L / {row.rightReps}R
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">
                            <select
                              value={row.lrStartingLeg ?? ""}
                              disabled={!onSaveLeg || legPending}
                              onChange={(e) => {
                                if (!onSaveLeg) return;
                                const v = e.target.value;
                                const next: "left" | "right" | null =
                                  v === "left" ? "left" : v === "right" ? "right" : null;
                                void onSaveLeg(athleteId, row.sessionId, next);
                              }}
                              className={`rounded-md border bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-50 ${
                                row.lrStartingLeg == null
                                  ? "border-amber-500/50"
                                  : "border-slate-700"
                              }`}
                            >
                              <option value="">Not set</option>
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                            </select>
                            {legPending ? (
                              <span className="ml-2 text-[10px] text-slate-500">saving…</span>
                            ) : null}
                          </td>
                          <td className="py-1.5 pr-3">
                            <label
                              className={`inline-flex items-center gap-1.5 ${
                                !onSaveSwap || swapPending ? "opacity-50" : ""
                              }`}
                              title="Tick if 1080's L/R labels were recorded backwards for this session"
                            >
                              <input
                                type="checkbox"
                                checked={row.lrSideSwap}
                                disabled={!onSaveSwap || swapPending}
                                onChange={(e) => {
                                  if (!onSaveSwap) return;
                                  void onSaveSwap(athleteId, row.sessionId, e.target.checked);
                                }}
                                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-950 text-rose-400 focus:ring-rose-500"
                              />
                              <span
                                className={`text-[11px] ${
                                  row.lrSideSwap ? "text-rose-300" : "text-slate-500"
                                }`}
                              >
                                {row.lrSideSwap ? "Swapped" : "As-is"}
                              </span>
                              {swapPending ? (
                                <span className="ml-1 text-[10px] text-slate-500">saving…</span>
                              ) : null}
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-500">
          Record which anatomical leg the athlete started the test with. Tick{" "}
          <span className="font-medium text-rose-300">Swap L/R</span> when the device's
          left/right labels were recorded backwards from anatomy — values will be
          re-mapped at read time across charts and reports.
        </p>
      </div>
    </details>
  );
}
