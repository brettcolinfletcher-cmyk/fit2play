"use client";

import { useMemo, useState } from "react";
import {
  computeBestInRangeData,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import {
  buildDayIndex,
  compareTestDays,
  formatTestDay,
  listTestDays,
  type CompareTone,
} from "@/lib/dayComparison";

export type SummarySessionRow = ReportSessionRow;
export type SummaryMetricRow = ReportMetricRow;
export type SummaryHopTestRow = ReportHopTestRow;

type Props = {
  sessions: SummarySessionRow[];
  metricsBySession: Map<string, SummaryMetricRow[]>;
  hopTests: SummaryHopTestRow[];
};

const TONE_CLASS: Record<CompareTone, string> = {
  better: "text-lime-400",
  worse: "text-rose-400",
  same: "text-slate-400",
  na: "text-slate-500",
};

export default function TimepointSummary({ sessions, metricsBySession, hopTests }: Props) {
  const [mode, setMode] = useState<"best" | "compare">("best");
  const [pickedA, setDateA] = useState<string | null>(null);
  const [pickedB, setDateB] = useState<string | null>(null);

  const [showSingleDay, setShowSingleDay] = useState(true);

  const dayIndex = useMemo(
    () => buildDayIndex(sessions, metricsBySession, hopTests),
    [sessions, metricsBySession, hopTests]
  );
  const dayOptions = useMemo(() => listTestDays(dayIndex), [dayIndex]);

  // Default: previous test day vs the latest one. A pick that falls outside
  // the current date range falls back to the default.
  const isOption = (d: string | null) => d != null && dayOptions.some((o) => o.date === d);
  const dateB = isOption(pickedB) ? pickedB : (dayOptions[0]?.date ?? null);
  const dateA = isOption(pickedA) ? pickedA : (dayOptions[1]?.date ?? dayOptions[0]?.date ?? null);

  const bestInRange = useMemo(
    () => computeBestInRangeData(sessions, metricsBySession, hopTests),
    [sessions, metricsBySession, hopTests]
  );

  const { linear: bestLinear, cmj: bestCmj, dj: bestDj, hop: bestHop } = bestInRange;

  const compareData = useMemo(
    () =>
      mode === "compare" && dateA && dateB && dateA !== dateB
        ? compareTestDays(dayIndex, dateA, dateB)
        : null,
    [mode, dayIndex, dateA, dateB]
  );

  const showLinearBest = bestLinear.length > 0;
  const showCmjBest = bestCmj.length > 0;
  const showDjBest = bestDj.length > 0;
  const showHopBest = bestHop.length > 0;

  const compareGroups = (compareData?.groups ?? [])
    .map((g) => ({
      ...g,
      tests: showSingleDay ? g.tests : g.tests.filter((t) => t.presence === "both"),
    }))
    .filter((g) => g.tests.length > 0);
  const singleDayCount = (compareData?.groups ?? []).reduce(
    (n, g) => n + g.tests.filter((t) => t.presence !== "both").length,
    0
  );

  const tableWrap = "mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/50";

  return (
    <div id="summary" className="scroll-mt-28 mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Time-point summary
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("best")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "best"
                ? "border-lime-400 bg-lime-400/15 text-lime-300"
                : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
            }`}
          >
            Best in range
          </button>
          <button
            type="button"
            onClick={() => setMode("compare")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "compare"
                ? "border-lime-400 bg-lime-400/15 text-lime-300"
                : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
            }`}
          >
            Date comparison
          </button>
        </div>
      </div>

      {mode === "best" && (
        <div className="mt-4 space-y-8">
          {!showLinearBest && !showCmjBest && !showDjBest && !showHopBest ? (
            <p className="text-xs text-slate-500">No summary data in the selected range.</p>
          ) : null}

          {showLinearBest && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                1080 linear sprint
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Best</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {bestLinear.map((r) => (
                      <tr key={r.metric} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.metric}</td>
                        <td className="px-3 py-2 font-mono text-lime-300">{r.best}</td>
                        <td className="px-3 py-2">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCmjBest && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Force plate — CMJ
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Best</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {bestCmj.map((r) => (
                      <tr key={r.metric} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.metric}</td>
                        <td className="px-3 py-2 font-mono text-lime-300">{r.best}</td>
                        <td className="px-3 py-2">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showDjBest && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Force plate — Drop jump
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Best</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {bestDj.map((r) => (
                      <tr key={r.metric} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.metric}</td>
                        <td className="px-3 py-2 font-mono text-lime-300">{r.best}</td>
                        <td className="px-3 py-2">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showHopBest && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Hop tests
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Test</th>
                      <th className="px-3 py-2 font-medium">Best LSI%</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {bestHop.map((r) => (
                      <tr key={r.test} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.test}</td>
                        <td className="px-3 py-2 font-mono text-lime-300">{r.best}</td>
                        <td className="px-3 py-2">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "compare" && (
        <div className="mt-4 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-400">Date A</label>
              <select
                value={dateA ?? ""}
                onChange={(e) => setDateA(e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                {dayOptions.map((o) => (
                  <option key={o.date} value={o.date}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Date B</label>
              <select
                value={dateB ?? ""}
                onChange={(e) => setDateB(e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                {dayOptions.map((o) => (
                  <option key={o.date} value={o.date}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dayOptions.length < 2 ? (
            <p className="text-xs text-slate-500">
              Only one test day in the selected range. Widen the date range to compare.
            </p>
          ) : !compareData ? (
            <p className="text-xs text-slate-500">Pick two different test days.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Best result of each day. Change is {compareData.labelB} compared with{" "}
                  {compareData.labelA}.
                </p>
                {singleDayCount > 0 ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={showSingleDay}
                      onChange={(e) => setShowSingleDay(e.target.checked)}
                    />
                    Show tests done on only one day ({singleDayCount})
                  </label>
                ) : null}
              </div>

              {compareGroups.map((group) => (
                <div key={group.family}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group.title}
                  </h3>
                  <div className="space-y-3">
                    {group.tests.map((test) => (
                      <div key={test.key}>
                        {test.title !== group.title || test.presence !== "both" ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {test.title !== group.title ? (
                              <p className="text-xs font-medium text-slate-300">{test.title}</p>
                            ) : null}
                            {test.presence !== "both" ? (
                              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500">
                                Only tested on{" "}
                                {test.presence === "a_only"
                                  ? compareData.labelA
                                  : compareData.labelB}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {test.note ? (
                          <p className="mt-1 text-[11px] text-amber-400/80">{test.note}</p>
                        ) : null}
                        <div className={tableWrap}>
                          <table className="w-full min-w-[480px] text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                                <th className="px-3 py-2 font-medium">Metric</th>
                                <th className="px-3 py-2 font-medium">{compareData.labelA}</th>
                                <th className="px-3 py-2 font-medium">{compareData.labelB}</th>
                                <th className="px-3 py-2 font-medium">Change</th>
                                <th className="px-3 py-2 font-medium">%</th>
                              </tr>
                            </thead>
                            <tbody className="text-slate-200">
                              {test.rows.map((r) => (
                                <tr key={r.id} className="border-b border-slate-800/80">
                                  <td className="px-3 py-2 text-slate-400">{r.label}</td>
                                  <td className="px-3 py-2 font-mono">{r.va}</td>
                                  <td className="px-3 py-2 font-mono">{r.vb}</td>
                                  <td className={`px-3 py-2 font-mono ${TONE_CLASS[r.tone]}`}>
                                    {r.change}
                                  </td>
                                  <td className={`px-3 py-2 font-mono ${TONE_CLASS[r.tone]}`}>
                                    {r.pct}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {compareGroups.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No tests in common between {formatTestDay(compareData.dateA)} and{" "}
                  {formatTestDay(compareData.dateB)}.
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
