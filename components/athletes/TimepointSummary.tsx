"use client";

import { useMemo, useState } from "react";
import {
  computeBestInRangeData,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import {
  MAX_COMPARE_DAYS,
  buildDayIndex,
  compareTestDays,
  defaultCompareDays,
  listTestDays,
  type CompareReference,
  type CompareTone,
  type LsiBand,
} from "@/lib/dayComparison";

export type SummarySessionRow = ReportSessionRow;
export type SummaryMetricRow = ReportMetricRow;
export type SummaryHopTestRow = ReportHopTestRow;

type Props = {
  /** Which view opens first (default: compare test days). */
  defaultMode?: "best" | "compare";
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

const TONE_STROKE: Record<CompareTone, string> = {
  better: "#a3e635",
  worse: "#fb7185",
  same: "#64748b",
  na: "#64748b",
};

const LSI_CHIP: Record<LsiBand, string> = {
  good: "bg-emerald-500/15 text-emerald-400",
  watch: "bg-amber-500/15 text-amber-400",
  poor: "bg-rose-500/15 text-rose-400",
};

/** Tiny trend line across the selected days; gaps (untested days) are skipped. */
function Sparkline({ values, tone }: { values: (number | null)[]; tone: CompareTone }) {
  const pts = values.flatMap((v, i) => (v == null ? [] : [{ i, v }]));
  if (pts.length < 2) return <span className="text-slate-600">—</span>;
  const W = 72;
  const H = 20;
  const pad = 3;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const step = values.length > 1 ? (W - pad * 2) / (values.length - 1) : 0;
  const xy = pts.map((p) => ({
    x: pad + p.i * step,
    y: max === min ? H / 2 : H - pad - ((p.v - min) / span) * (H - pad * 2),
  }));
  const last = xy[xy.length - 1]!;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline
        points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={TONE_STROKE[tone]}
        strokeWidth={1.5}
      />
      <circle cx={last.x} cy={last.y} r={2} fill={TONE_STROKE[tone]} />
    </svg>
  );
}

export default function TimepointSummary({
  sessions,
  metricsBySession,
  hopTests,
  defaultMode = "compare",
}: Props) {
  const [mode, setMode] = useState<"best" | "compare">(defaultMode);
  const [pickedDays, setPickedDays] = useState<string[] | null>(null);
  const [reference, setReference] = useState<CompareReference>("baseline");
  const [limitHit, setLimitHit] = useState(false);
  const [showSingleDay, setShowSingleDay] = useState(true);

  const dayIndex = useMemo(
    () => buildDayIndex(sessions, metricsBySession, hopTests),
    [sessions, metricsBySession, hopTests]
  );
  const dayOptions = useMemo(() => listTestDays(dayIndex), [dayIndex]);

  // Default: the last 4 test days. Picks outside the current date range drop out.
  const selectedDays = useMemo(() => {
    if (!pickedDays) return defaultCompareDays(dayOptions);
    const valid = new Set(dayOptions.map((o) => o.date));
    return pickedDays.filter((d) => valid.has(d));
  }, [pickedDays, dayOptions]);

  const toggleDay = (date: string) => {
    if (selectedDays.includes(date)) {
      setPickedDays(selectedDays.filter((d) => d !== date));
      setLimitHit(false);
    } else if (selectedDays.length >= MAX_COMPARE_DAYS) {
      setLimitHit(true);
    } else {
      setPickedDays([...selectedDays, date]);
      setLimitHit(false);
    }
  };

  const bestInRange = useMemo(
    () => computeBestInRangeData(sessions, metricsBySession, hopTests),
    [sessions, metricsBySession, hopTests]
  );

  const { linear: bestLinear, cmj: bestCmj, dj: bestDj, hop: bestHop } = bestInRange;

  const compareData = useMemo(
    () =>
      mode === "compare" && selectedDays.length >= 2
        ? compareTestDays(dayIndex, selectedDays, reference)
        : null,
    [mode, dayIndex, selectedDays, reference]
  );

  const showLinearBest = bestLinear.length > 0;
  const showCmjBest = bestCmj.length > 0;
  const showDjBest = bestDj.length > 0;
  const showHopBest = bestHop.length > 0;

  const compareGroups = (compareData?.groups ?? [])
    .map((g) => ({
      ...g,
      tests: showSingleDay ? g.tests : g.tests.filter((t) => t.daysTested >= 2),
    }))
    .filter((g) => g.tests.length > 0);
  const singleDayCount = (compareData?.groups ?? []).reduce(
    (n, g) => n + g.tests.filter((t) => t.daysTested < 2).length,
    0
  );

  const tableWrap = "mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/50";

  return (
    <div id="summary" className="scroll-mt-28 mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Compare
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("compare")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "compare"
                ? "border-lime-400 bg-lime-400/15 text-lime-300"
                : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
            }`}
          >
            Compare test days
          </button>
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
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-slate-400">
                Test days <span className="font-normal text-slate-500">(up to {MAX_COMPARE_DAYS})</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...dayOptions].reverse().map((o) => {
                  const on = selectedDays.includes(o.date);
                  return (
                    <button
                      key={o.date}
                      type="button"
                      title={o.summary}
                      aria-pressed={on}
                      onClick={() => toggleDay(o.date)}
                      className={`rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
                        on ? "border-lime-400 bg-lime-400/15 text-lime-300" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                      }`}
                    >
                      <span className="block font-medium">{o.label.split(" · ")[0]}</span>
                      <span className="block text-[10px] opacity-80">{o.summary}</span>
                    </button>
                  );
                })}
              </div>
              {limitHit ? (
                <p className="mt-2 text-xs text-amber-400">
                  Up to {MAX_COMPARE_DAYS} days at once. Untick one to add another.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">Change compared with</span>
              {(["baseline", "previous"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReference(r)}
                  className={`rounded-full border px-3 py-1 font-medium transition-colors ${
                    reference === r ? "border-lime-400 bg-lime-400/15 text-lime-300" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                  }`}
                >
                  {r === "baseline" ? "Baseline (first day)" : "Previous test"}
                </button>
              ))}
            </div>
          </div>

          {dayOptions.length < 2 ? (
            <p className="text-xs text-slate-500">
              Only one test day in the selected range. Widen the date range to compare.
            </p>
          ) : !compareData ? (
            <p className="text-xs text-slate-500">Tick at least two test days.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Best result of each day, oldest first. Best value in each row is in bold.
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
                        {test.title !== group.title || test.daysTested < 2 ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {test.title !== group.title ? (
                              <p className="text-xs font-medium text-slate-300">{test.title}</p>
                            ) : null}
                            {test.daysTested < 2 ? (
                              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500">
                                Only tested on one of these days
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {test.note ? (
                          <p className="mt-1 text-[11px] text-amber-400/80">{test.note}</p>
                        ) : null}
                        <div className={tableWrap}>
                          <table className="w-full min-w-[560px] text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                                <th className="px-3 py-2 font-medium">Metric</th>
                                {compareData.labels.map((l) => (
                                  <th key={l} className="px-2 py-2 font-medium">
                                    {l}
                                  </th>
                                ))}
                                <th className="px-2 py-2 font-medium">Trend</th>
                                <th className="px-3 py-2 font-medium">
                                  {reference === "baseline" ? "Since baseline" : "Since previous"}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="text-slate-200">
                              {test.rows.map((r) => (
                                <tr key={r.id} className="border-b border-slate-800/80">
                                  <td className="px-3 py-2 text-slate-400">{r.label}</td>
                                  {r.cells.map((c, i) => {
                                    const band = r.lsiBands?.[i] ?? null;
                                    return (
                                      <td
                                        key={i}
                                        className={`px-2 py-2 font-mono ${
                                          i === r.bestIdx ? "font-semibold text-slate-50" : ""
                                        }`}
                                      >
                                        {band ? (
                                          <span className={`rounded px-1.5 py-0.5 ${LSI_CHIP[band]}`}>
                                            {c}
                                          </span>
                                        ) : (
                                          c
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="px-2 py-2">
                                    <Sparkline values={r.values} tone={r.tone} />
                                  </td>
                                  <td className={`whitespace-nowrap px-3 py-2 font-mono ${TONE_CLASS[r.tone]}`}>
                                    {r.change}
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
                  No test was done on more than one of the ticked days.
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
