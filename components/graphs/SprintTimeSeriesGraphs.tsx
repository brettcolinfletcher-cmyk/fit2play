"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type SprintSeriesRow = {
  rep_index: number | null;
  series: {
    t: number[];
    x: number[];
    v: number[];
    a: number[];
    f: number[];
    p: number[];
  } | null;
};

type Props = {
  series: SprintSeriesRow[];
};

// ---- Types for UI state ----
type MetricId = "v" | "a" | "f" | "p";
type XAxisMode = "time" | "distance";
type LeadLeg = "left" | "right";

const METRIC_OPTIONS: { id: MetricId; label: string; unit: string }[] = [
  { id: "v", label: "Speed", unit: "m/s" },
  { id: "a", label: "Acceleration", unit: "m/s²" },
  { id: "f", label: "Force", unit: "N" },
  { id: "p", label: "Power", unit: "W" },
];

const X_AXIS_OPTIONS: { id: XAxisMode; label: string; unit: string }[] = [
  { id: "time", label: "Time", unit: "s" },
  { id: "distance", label: "Position", unit: "m" },
];

// ------------- Helper: round to 2dp safely -------------
function round2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

// ------------- Helper: build base rows from rep.series -------------
function buildBaseRows(rep: SprintSeriesRow | undefined) {
  if (!rep?.series) return [];
  const { t, x, v, a, f, p } = rep.series;
  if (!t || !x || !v || !a || !f || !p) return [];

  const len = Math.min(
    t.length,
    x.length,
    v.length,
    a.length,
    f.length,
    p.length
  );

  const rows = [];
  for (let i = 0; i < len; i++) {
    rows.push({
      t: round2(t[i]),
      x: round2(x[i]),
      v: round2(v[i]),
      a: round2(a[i]),
      f: round2(f[i]),
      p: round2(p[i]),
    });
  }
  return rows;
}

// ------------- Helper: detect step peaks from force -------------
function detectStepIndices(f: number[]): number[] {
  const n = f.length;
  if (!n) return [];

  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const fi = f[i];
    if (fi > f[i - 1] && fi >= f[i + 1]) {
      peaks.push(i);
    }
  }
  if (!peaks.length) return [];

  const maxPeak = Math.max(...peaks.map((i) => f[i]));
  if (!Number.isFinite(maxPeak) || maxPeak <= 0) return [];

  const threshold = 0.3 * maxPeak;
  const filtered = peaks.filter((i) => f[i] >= threshold).sort((a, b) => a - b);

  return filtered;
}

// ------------- Helper: split base rows into left/right continuous curves -------------
function splitByLegContinuous(
  baseRows: {
    t: number | null;
    x: number | null;
    v: number | null;
    a: number | null;
    f: number | null;
    p: number | null;
  }[],
  leadLeg: LeadLeg
) {
  const n = baseRows.length;
  if (!n) return [];

  const fArray = baseRows.map((r) => r.f ?? 0);
  const stepIdx = detectStepIndices(fArray);

  // If we couldn't detect steps, just assign everything to the lead leg
  if (!stepIdx.length) {
    return baseRows.map((row) => ({
      t: row.t,
      x: row.x,
      vL: leadLeg === "left" ? row.v ?? 0 : 0,
      vR: leadLeg === "right" ? row.v ?? 0 : 0,
      aL: leadLeg === "left" ? row.a ?? 0 : 0,
      aR: leadLeg === "right" ? row.a ?? 0 : 0,
      fL: leadLeg === "left" ? row.f ?? 0 : 0,
      fR: leadLeg === "right" ? row.f ?? 0 : 0,
      pL: leadLeg === "left" ? row.p ?? 0 : 0,
      pR: leadLeg === "right" ? row.p ?? 0 : 0,
    }));
  }

  // Alternate legs across detected steps
  const legPerStep: LeadLeg[] = [];
  let current: LeadLeg = leadLeg;
  for (let i = 0; i < stepIdx.length; i++) {
    legPerStep.push(current);
    current = current === "left" ? "right" : "left";
  }

  function legAtSample(i: number): LeadLeg {
    let k = -1;
    for (let s = 0; s < stepIdx.length; s++) {
      if (stepIdx[s] <= i) k = s;
      else break;
    }
    if (k === -1) return leadLeg;
    return legPerStep[k];
  }

  return baseRows.map((row, i) => {
    const leg = legAtSample(i);

    const v = row.v ?? 0;
    const a = row.a ?? 0;
    const f = row.f ?? 0;
    const p = row.p ?? 0;

    return {
      t: row.t,
      x: row.x,
      vL: leg === "left" ? v : 0,
      vR: leg === "right" ? v : 0,
      aL: leg === "left" ? a : 0,
      aR: leg === "right" ? a : 0,
      fL: leg === "left" ? f : 0,
      fR: leg === "right" ? f : 0,
      pL: leg === "left" ? p : 0,
      pR: leg === "right" ? p : 0,
    };
  });
}

export default function SprintTimeSeriesGraphs({ series }: Props) {
  if (!series.length) return null;

  const [selectedRepIdx, setSelectedRepIdx] = useState(
    series[0]?.rep_index ?? 1
  );
  const [metric, setMetric] = useState<MetricId>("v");
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>("time");
  const [leadLeg, setLeadLeg] = useState<LeadLeg>("left");

  const selectedRep = useMemo(
    () =>
      series.find((s) => s.rep_index === selectedRepIdx) ?? series[0],
    [series, selectedRepIdx]
  );

  const data = useMemo(() => {
    const baseRows = buildBaseRows(selectedRep);
    return splitByLegContinuous(baseRows, leadLeg);
  }, [selectedRep, leadLeg]);

  const metricMeta = METRIC_OPTIONS.find((m) => m.id === metric)!;
  const xMeta = X_AXIS_OPTIONS.find((x) => x.id === xAxisMode)!;

  const leftKey =
    metric === "v"
      ? "vL"
      : metric === "a"
      ? "aL"
      : metric === "f"
      ? "fL"
      : "pL";

  const rightKey =
    metric === "v"
      ? "vR"
      : metric === "a"
      ? "aR"
      : metric === "f"
      ? "fR"
      : "pR";

  const xKey = xAxisMode === "time" ? "t" : "x";

  // ---- Summary for current rep + metric ----
  const summary = useMemo(() => {
    if (!data.length) return null;

    const leftVals = data.map(
      (row: any) => Number(row[leftKey] ?? 0)
    );
    const rightVals = data.map(
      (row: any) => Number(row[rightKey] ?? 0)
    );

    const leftPeak = Math.max(...leftVals);
    const rightPeak = Math.max(...rightVals);

    if (!Number.isFinite(leftPeak) && !Number.isFinite(rightPeak)) {
      return null;
    }

    const lp = Number.isFinite(leftPeak) ? leftPeak : 0;
    const rp = Number.isFinite(rightPeak) ? rightPeak : 0;

    const diff = lp - rp;
    const dominant = Math.max(Math.abs(lp), Math.abs(rp));
    const asymPct =
      dominant > 0 ? (Math.abs(diff) / dominant) * 100 : 0;

    return {
      leftPeak: lp,
      rightPeak: rp,
      diff,
      asymPct,
    };
  }, [data, leftKey, rightKey]);

  return (
    <section className="mt-8">
      {/* Header + controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-lime-300">
            1080 Sprint – time-series (per rep, left vs right)
          </h2>
          <p className="text-[0.7rem] text-slate-400">
            Continuous curves for each leg. “Lead leg” sets which leg hits the
            first step. Table below shows peak values &amp; % asymmetry for the
            selected metric.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-[0.7rem]">
          {/* Metric selector */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 mr-1">Y-axis:</span>
            {METRIC_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                className={`rounded-full px-2.5 py-1 border ${
                  metric === m.id
                    ? "bg-lime-400 text-slate-950 border-lime-400"
                    : "bg-slate-900 text-slate-200 border-slate-700 hover:border-lime-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* X-axis selector */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 mr-1">X-axis:</span>
            {X_AXIS_OPTIONS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setXAxisMode(x.id)}
                className={`rounded-full px-2.5 py-1 border ${
                  xAxisMode === x.id
                    ? "bg-sky-400 text-slate-950 border-sky-400"
                    : "bg-slate-900 text-slate-200 border-slate-700 hover:border-sky-300"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>

          {/* Lead leg selector */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 mr-1">Lead leg:</span>
            <button
              type="button"
              onClick={() => setLeadLeg("left")}
              className={`rounded-full px-2.5 py-1 border ${
                leadLeg === "left"
                  ? "bg-emerald-400 text-slate-950 border-emerald-400"
                  : "bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-300"
              }`}
            >
              Left
            </button>
            <button
              type="button"
              onClick={() => setLeadLeg("right")}
              className={`rounded-full px-2.5 py-1 border ${
                leadLeg === "right"
                  ? "bg-emerald-400 text-slate-950 border-emerald-400"
                  : "bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-300"
              }`}
            >
              Right
            </button>
          </div>
        </div>
      </div>

      {/* Rep selector */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {series.map((s) => {
          const repIdx = s.rep_index ?? 0;
          return (
            <button
              key={repIdx}
              type="button"
              onClick={() => setSelectedRepIdx(repIdx)}
              className={`rounded-full px-2.5 py-1 border ${
                repIdx === selectedRepIdx
                  ? "bg-lime-400 text-slate-950 border-lime-400"
                  : "bg-slate-900 text-slate-200 border-slate-700 hover:border-lime-300"
              }`}
            >
              Rep {repIdx}
            </button>
          );
        })}
      </div>

      {!data.length ? (
        <p className="text-xs text-slate-400">
          No time-series data stored for this rep.
        </p>
      ) : (
        <div className="space-y-4">
          {/* OVERLAY GRAPH */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <p className="mb-2 text-[0.7rem] text-slate-400">
              {metricMeta.label} vs {xMeta.label} · left vs right (rep{" "}
              {selectedRepIdx})
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey={xKey}
                  allowDecimals={false}
                  domain={["dataMin", "dataMax"]}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(v: any) =>
                    typeof v === "number" ? Math.round(v) : v
                  }
                  label={{
                    value:
                      xAxisMode === "time" ? "Time (s)" : "Position (m)",
                    position: "insideBottomRight",
                    offset: -4,
                    style: { fontSize: 10, fill: "#9ca3af" },
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(v: any) =>
                    typeof v === "number" ? v.toFixed(2) : v
                  }
                />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (typeof value === "number") {
                      return [value.toFixed(2), name];
                    }
                    return [value, name];
                  }}
                  labelFormatter={(label: any) =>
                    typeof label === "number"
                      ? `${xMeta.label}: ${label.toFixed(2)} ${xMeta.unit}`
                      : label
                  }
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {/* Left leg */}
                <Line
                  type="monotone"
                  dataKey={leftKey}
                  name={`Left ${metricMeta.label} (${metricMeta.unit})`}
                  dot={false}
                  stroke="#a3e635" // lime-400
                  strokeWidth={2}
                />
                {/* Right leg */}
                <Line
                  type="monotone"
                  dataKey={rightKey}
                  name={`Right ${metricMeta.label} (${metricMeta.unit})`}
                  dot={false}
                  stroke="#38bdf8" // sky-400
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* SUMMARY TABLE */}
          {summary && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-[0.7rem]">
              <p className="mb-2 text-[0.7rem] text-slate-400">
                Peak {metricMeta.label} asymmetry · Rep {selectedRepIdx}
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-[320px] text-left">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-1 px-2">Metric</th>
                      <th className="py-1 px-2">Left peak</th>
                      <th className="py-1 px-2">Right peak</th>
                      <th className="py-1 px-2">Diff (L − R)</th>
                      <th className="py-1 px-2">% asym (vs stronger)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-800">
                      <td className="py-1 px-2">
                        {metricMeta.label} ({metricMeta.unit})
                      </td>
                      <td className="py-1 px-2">
                        {summary.leftPeak.toFixed(2)}
                      </td>
                      <td className="py-1 px-2">
                        {summary.rightPeak.toFixed(2)}
                      </td>
                      <td className="py-1 px-2">
                        {summary.diff.toFixed(2)}
                      </td>
                      <td className="py-1 px-2">
                        {summary.asymPct.toFixed(1)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}