"use client";

import { useState } from "react";
import { formatDisplayDateTime } from "@/lib/dateDisplay";
import type { DateGroup } from "@/lib/sessionDateGroups";

/**
 * Renders one row per test date. A date with a single session just shows
 * that session's detail; a date with more than one session (re-test,
 * warm-up + main effort, etc.) defaults to showing only the best one, with
 * a click to reveal every session recorded that day — the same "best rep,
 * click to see the rest" pattern already used for dynamometry.
 */
export default function SessionDetailByDate<
  T extends { id: string; session_date: string | null }
>({
  title,
  groups,
  renderSummary,
  renderDetail,
}: {
  title?: string;
  groups: DateGroup<T>[];
  /** Header line shown for each session (test type, metric count, etc). */
  renderSummary: (session: T) => React.ReactNode;
  /** Body shown when a session row is expanded. */
  renderDetail: (session: T) => React.ReactNode;
}) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set());
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(() => new Set());

  if (groups.length === 0) return null;

  function toggleDate(d: string) {
    setExpandedDates((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  }
  function toggleSession(sid: string) {
    setExpandedSessions((prev) => {
      const n = new Set(prev);
      if (n.has(sid)) n.delete(sid);
      else n.add(sid);
      return n;
    });
  }

  return (
    <div className="mt-6 space-y-2">
      {title ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      ) : null}
      {[...groups].reverse().map((g) => {
        const dateExpanded = expandedDates.has(g.date);
        const multi = g.sessions.length > 1;
        const shown = dateExpanded ? g.sessions : [g.best];
        return (
          <div key={g.date} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              disabled={!multi}
              onClick={() => toggleDate(g.date)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-default"
            >
              <span className="text-slate-700">{formatDisplayDateTime(g.best.session_date)}</span>
              <span className="flex items-center gap-2 text-xs text-slate-400">
                {multi
                  ? `${g.sessions.length} reps · ${dateExpanded ? "showing all" : "best shown"}`
                  : "1 session"}
                {multi ? <span>{dateExpanded ? "▲" : "▼"}</span> : null}
              </span>
            </button>
            <div className="space-y-2 border-t border-slate-100 px-3 py-2">
              {shown.map((s) => {
                const open = expandedSessions.has(s.id);
                return (
                  <div key={s.id} className="overflow-hidden rounded border border-slate-100">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                      onClick={() => toggleSession(s.id)}
                    >
                      {renderSummary(s)}
                      <span className="shrink-0 text-slate-400">{open ? "▲" : "▼"}</span>
                    </button>
                    {open ? (
                      <div className="border-t border-slate-100 px-2 py-2">{renderDetail(s)}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
