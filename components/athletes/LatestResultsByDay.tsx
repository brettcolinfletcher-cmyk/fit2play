"use client";

import { useMemo } from "react";
import type { ReportHopTestRow, ReportMetricRow, ReportSessionRow } from "@/lib/athleteReportData";
import {
  buildDayIndex,
  latestResults,
  type CompareTone,
  type LsiBand,
} from "@/lib/dayComparison";

/**
 * Clinician "Latest results": for each test, the latest test day it was done
 * vs the previous day it was done. Uses the same engine as Compare test days
 * (best of day, trials pooled, sprint vs COD reps separated).
 */

const TONE_CLASS: Record<CompareTone, string> = {
  better: "text-lime-400",
  worse: "text-rose-400",
  same: "text-slate-400",
  na: "text-slate-500",
};

const LSI_CHIP: Record<LsiBand, string> = {
  good: "bg-emerald-500/15 text-emerald-400",
  watch: "bg-amber-500/15 text-amber-400",
  poor: "bg-rose-500/15 text-rose-400",
};

type Props = {
  sessions: ReportSessionRow[];
  metricsBySession: Map<string, ReportMetricRow[]>;
  hopTests: ReportHopTestRow[];
};

export default function LatestResultsByDay({ sessions, metricsBySession, hopTests }: Props) {
  const cards = useMemo(
    () => latestResults(buildDayIndex(sessions, metricsBySession, hopTests)),
    [sessions, metricsBySession, hopTests]
  );

  return (
    <section id="latest" className="scroll-mt-28 mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">Latest results</h2>
        <p className="text-xs text-slate-500">
          Best of the latest test day vs the previous day each test was done
        </p>
      </div>
      {cards.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No test results in the selected range.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.key}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">
                {card.familyTitle}
              </p>
              {card.title !== card.familyTitle ? (
                <p className="text-sm font-medium text-slate-200">{card.title}</p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-slate-500">
                {card.latestLabel}
                {card.prevLabel ? ` vs ${card.prevLabel}` : " · first test"}
              </p>
              {card.note ? (
                <p className="mt-1 text-[11px] text-amber-400/80">Session labels differ between days.</p>
              ) : null}
              <dl className="mt-3 space-y-1.5">
                {card.rows.map((r) => {
                  const latestIdx = r.values.length - 1;
                  const band = r.lsiBands?.[latestIdx] ?? null;
                  return (
                    <div key={r.id} className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-slate-400">{r.label}</dt>
                      <dd className="flex items-baseline gap-2 font-mono text-sm">
                        {band ? (
                          <span className={`rounded px-1.5 py-0.5 ${LSI_CHIP[band]}`}>
                            {r.cells[latestIdx]}
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-100">{r.cells[latestIdx]}</span>
                        )}
                        {card.prevLabel ? (
                          <span className={`text-[11px] ${TONE_CLASS[r.tone]}`}>{r.change}</span>
                        ) : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
