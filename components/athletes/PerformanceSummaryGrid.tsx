"use client";

import { useMemo } from "react";
import { computePerformanceSummary, type SummaryStatus } from "@/lib/performanceSummary";
import type { ReportMetricRow, ReportSessionRow } from "@/lib/athleteReportData";

type Props = {
  sessions: ReportSessionRow[];
  metricsBySession: Map<string, ReportMetricRow[]>;
};

const STATUS_COLOR: Record<SummaryStatus, string> = {
  pass: "#a3e635",
  warn: "#fbbf24",
  fail: "#f87171",
  no_data: "#475569",
};

function StatusDot({ status }: { status: SummaryStatus }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: STATUS_COLOR[status], boxShadow: `0 0 6px 0 ${STATUS_COLOR[status]}88` }}
    />
  );
}

/**
 * "At a glance" performance summary — CMJ / Power / Speed / Accel / Decel /
 * Change of Direction, each with a couple of key parameters vs a target and
 * a traffic-light status. Modeled on the classic sports-science jump &
 * force test report layout, styled to match Fit2Play's dark snapshot cards.
 *
 * Targets are fixed starter defaults (see lib/performanceSummary.ts) — not
 * validated clinical cutoffs. Treat them as a first pass to tune per athlete
 * population, not as return-to-sport decisions on their own.
 */
export default function PerformanceSummaryGrid({ sessions, metricsBySession }: Props) {
  const categories = useMemo(
    () => computePerformanceSummary(sessions, metricsBySession),
    [sessions, metricsBySession]
  );

  const hasAnyData = categories.some((c) => c.metrics.some((m) => m.value != null));
  if (!hasAnyData) return null;

  return (
    <section className="rounded-2xl border bg-slate-950/70 p-5 f2p-dark-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
          Performance Summary
        </h3>
        <p className="text-[0.65rem] text-slate-500">
          Targets are starter defaults — tune to your population.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="rounded-xl p-4"
            style={{
              backgroundColor: "rgba(2,6,23,0.5)",
              border: "1px solid rgba(30,41,59,0.9)",
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {cat.label}
            </p>
            <div className="mt-3 space-y-2.5">
              {cat.metrics.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-slate-300">{m.label}</p>
                    {m.sourceLabel ? (
                      <p className="truncate text-[0.6rem] text-slate-500">{m.sourceLabel}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-right">
                    <div>
                      <p className="text-xs font-bold tabular-nums text-slate-50 leading-tight">
                        {m.displayValue}
                      </p>
                      <p className="text-[0.6rem] tabular-nums text-slate-500 leading-tight">
                        {m.targetLabel}
                      </p>
                    </div>
                    <StatusDot status={m.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
