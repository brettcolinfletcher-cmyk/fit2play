"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeBestInRangeData,
  computeDateComparisonData,
  sessionOptionLabel,
  sortedSessionOptions,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";

export type SummarySessionRow = ReportSessionRow;
export type SummaryMetricRow = ReportMetricRow;
export type SummaryHopTestRow = ReportHopTestRow;

type Props = {
  sessions: SummarySessionRow[];
  metricsBySession: Map<string, SummaryMetricRow[]>;
  hopTests: SummaryHopTestRow[];
};

export default function TimepointSummary({ sessions, metricsBySession, hopTests }: Props) {
  const [mode, setMode] = useState<"best" | "compare">("best");
  const [dateA, setDateA] = useState<string | null>(null);
  const [dateB, setDateB] = useState<string | null>(null);

  const sessionOptions = useMemo(() => sortedSessionOptions(sessions), [sessions]);

  useEffect(() => {
    if (sessionOptions.length >= 1) {
      setDateA(sessionOptions[0]!.id);
      setDateB(sessionOptions[1]?.id ?? sessionOptions[0]!.id);
    } else {
      setDateA(null);
      setDateB(null);
    }
  }, [sessionOptions]);

  const bestInRange = useMemo(
    () => computeBestInRangeData(sessions, metricsBySession, hopTests),
    [sessions, metricsBySession, hopTests]
  );

  const { linear: bestLinear, cmj: bestCmj, dj: bestDj, hop: bestHop } = bestInRange;

  const compareData = useMemo(
    () =>
      mode === "compare"
        ? computeDateComparisonData(sessions, metricsBySession, hopTests, dateA, dateB)
        : null,
    [mode, sessions, metricsBySession, hopTests, dateA, dateB]
  );

  const compareLinearRows = compareData?.linear ?? [];
  const compareCmjRows = compareData?.cmj ?? [];
  const compareDjRows = compareData?.dj ?? [];

  const showLinearBest = bestLinear.length > 0;
  const showCmjBest = bestCmj.length > 0;
  const showDjBest = bestDj.length > 0;
  const showHopBest = bestHop.length > 0;

  const showCompareLinear = compareLinearRows.length > 0;
  const showCompareCmj = compareCmjRows.length > 0;
  const showCompareDj = compareDjRows.length > 0;
  const showCompareHop = (compareData?.hop.length ?? 0) > 0;

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
                {sessionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionOptionLabel(s)}
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
                {sessionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionOptionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showCompareLinear && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                1080 linear sprint
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[360px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Date A</th>
                      <th className="px-3 py-2 font-medium">Date B</th>
                      <th className="px-3 py-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {compareLinearRows.map((r) => (
                      <tr key={r.label} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.label}</td>
                        <td className="px-3 py-2 font-mono">{r.va}</td>
                        <td className="px-3 py-2 font-mono">{r.vb}</td>
                        <td className={`px-3 py-2 font-mono ${r.deltaClassName}`}>{r.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCompareCmj && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Force plate — CMJ
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[360px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Date A</th>
                      <th className="px-3 py-2 font-medium">Date B</th>
                      <th className="px-3 py-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {compareCmjRows.map((r) => (
                      <tr key={r.label} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.label}</td>
                        <td className="px-3 py-2 font-mono">{r.va}</td>
                        <td className="px-3 py-2 font-mono">{r.vb}</td>
                        <td className={`px-3 py-2 font-mono ${r.deltaClassName}`}>{r.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCompareDj && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Force plate — Drop jump
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[360px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Date A</th>
                      <th className="px-3 py-2 font-medium">Date B</th>
                      <th className="px-3 py-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {compareDjRows.map((r) => (
                      <tr key={r.label} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.label}</td>
                        <td className="px-3 py-2 font-mono">{r.va}</td>
                        <td className="px-3 py-2 font-mono">{r.vb}</td>
                        <td className={`px-3 py-2 font-mono ${r.deltaClassName}`}>{r.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCompareHop &&
            (compareData?.hop ?? []).map((block) => (
              <div key={block.testType}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {block.title}
                </h3>
                <div className={tableWrap}>
                  <table className="w-full min-w-[360px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                        <th className="px-3 py-2 font-medium">Metric</th>
                        <th className="px-3 py-2 font-medium">Date A</th>
                        <th className="px-3 py-2 font-medium">Date B</th>
                        <th className="px-3 py-2 font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {block.rows.map((r) => (
                        <tr key={r.label} className="border-b border-slate-800/80">
                          <td className="px-3 py-2 text-slate-400">{r.label}</td>
                          <td className="px-3 py-2 font-mono">{r.va}</td>
                          <td className="px-3 py-2 font-mono">{r.vb}</td>
                          <td className={`px-3 py-2 font-mono ${r.deltaClassName}`}>{r.delta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

          {!showCompareLinear &&
          !showCompareCmj &&
          !showCompareDj &&
          !showCompareHop ? (
            <p className="text-xs text-slate-500">No comparable data for the selected sessions.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
