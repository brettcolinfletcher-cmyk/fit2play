"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Presentational sprint-trend visual extracted from the staff sprint-report
 * (individual view). Driven entirely by `rows`, so it can be reused on the
 * athlete dashboard and the staff report without diverging.
 *
 * Speed-type metrics (m/s, m/s²) plot on the left axis; time-type metrics
 * (seconds) on the right. Peak force / power columns appear in the table only
 * when at least one row carries them.
 */

export type SprintReportRow = {
  /** formatted date label for axis + table */
  date: string;
  rawDate: string;
  topSpeed: number | null;
  totalTime: number | null;
  split5m: number | null;
  maxAcceleration: number | null;
  peakForce?: number | null;
  peakPower?: number | null;
};

type MetricKey = "topSpeed" | "totalTime" | "split5m" | "maxAcceleration";

const METRIC_CONFIG: {
  key: MetricKey;
  label: string;
  color: string;
  axis: "speed" | "time";
  lowerIsBetter: boolean;
}[] = [
  { key: "topSpeed", label: "Top Speed (m/s)", color: "#a3e635", axis: "speed", lowerIsBetter: false },
  { key: "split5m", label: "0–5 m Time (s)", color: "#60a5fa", axis: "time", lowerIsBetter: true },
  { key: "totalTime", label: "Total Time (s)", color: "#f97316", axis: "time", lowerIsBetter: true },
  { key: "maxAcceleration", label: "Max Accel (m/s²)", color: "#34d399", axis: "speed", lowerIsBetter: false },
];

function fmt(v: number | null | undefined, dp = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(dp);
}

export default function SprintTrendPanel({
  rows,
  title = "Sprint — trend over time",
  emptyLabel = "No sprint sessions yet.",
}: {
  rows: SprintReportRow[];
  title?: string;
  emptyLabel?: string;
}) {
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    new Set(METRIC_CONFIG.map((m) => m.key))
  );

  const hasForce = rows.some((r) => r.peakForce != null);
  const hasPower = rows.some((r) => r.peakPower != null);

  const avg = useMemo(() => {
    const cols: (keyof SprintReportRow)[] = [
      "topSpeed",
      "split5m",
      "totalTime",
      "maxAcceleration",
      "peakForce",
      "peakPower",
    ];
    const out: Record<string, number | null> = {};
    for (const c of cols) {
      const vals = rows
        .map((r) => r[c] as number | null | undefined)
        .filter((v): v is number => v != null && !Number.isNaN(v));
      out[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return out;
  }, [rows]);

  function toggleMetric(key: MetricKey) {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else next.add(key);
      return next;
    });
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
        <p className="mt-4 text-xs text-slate-400">{emptyLabel}</p>
      </div>
    );
  }

  const activeList = METRIC_CONFIG.filter((m) => activeMetrics.has(m.key));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
          <div className="flex flex-wrap gap-2">
            {METRIC_CONFIG.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMetric(m.key)}
                className={`rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-all ${
                  activeMetrics.has(m.key)
                    ? "border-transparent text-slate-950"
                    : "border-slate-800 text-slate-400 hover:border-slate-600"
                }`}
                style={activeMetrics.has(m.key) ? { backgroundColor: m.color } : {}}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="speed"
              orientation="left"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <YAxis
              yAxisId="time"
              orientation="right"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 10,
                fontSize: 12,
                color: "#e2e8f0",
              }}
              labelStyle={{ color: "#a3e635", fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            {activeList.map((m) => (
              <Line
                key={m.key}
                yAxisId={m.axis}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={2}
                dot={{ fill: m.color, r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
              <th className="py-3 pl-5 pr-4 font-medium">Date</th>
              <th className="py-3 px-4 font-medium">Top Speed (m/s)</th>
              <th className="py-3 px-4 font-medium">0–5 m Time (s)</th>
              <th className="py-3 px-4 font-medium">Total Time (s)</th>
              <th className="py-3 px-4 font-medium">Max Accel (m/s²)</th>
              {hasForce ? <th className="py-3 px-4 font-medium">Peak Force (N)</th> : null}
              {hasPower ? <th className="py-3 pr-5 pl-4 font-medium">Peak Power (W)</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-slate-800/40">
                <td className="py-3 pl-5 pr-4 text-xs font-medium text-slate-200">
                  {row.date}
                </td>
                <MC value={row.topSpeed} avg={avg.topSpeed} lb={false} dp={2} />
                <MC value={row.split5m} avg={avg.split5m} lb={true} dp={2} />
                <MC value={row.totalTime} avg={avg.totalTime} lb={true} dp={2} />
                <MC value={row.maxAcceleration} avg={avg.maxAcceleration} lb={false} dp={2} />
                {hasForce ? (
                  <MC value={row.peakForce ?? null} avg={avg.peakForce} lb={false} dp={0} />
                ) : null}
                {hasPower ? (
                  <MC value={row.peakPower ?? null} avg={avg.peakPower} lb={false} dp={0} />
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-700 bg-slate-900/60 text-[0.72rem] font-semibold text-slate-300">
              <td className="py-3 pl-5 pr-4 text-slate-400">Average</td>
              <td className="py-3 px-4 text-lime-300">{fmt(avg.topSpeed)}</td>
              <td className="py-3 px-4">{fmt(avg.split5m)}</td>
              <td className="py-3 px-4">{fmt(avg.totalTime)}</td>
              <td className="py-3 px-4">{fmt(avg.maxAcceleration)}</td>
              {hasForce ? <td className="py-3 px-4">{fmt(avg.peakForce, 0)}</td> : null}
              {hasPower ? <td className="py-3 pr-5 pl-4">{fmt(avg.peakPower, 0)}</td> : null}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[0.68rem] text-slate-500">
        <span className="mr-2 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">
          Green
        </span>
        better than this athlete&apos;s average ·{" "}
        <span className="mr-2 inline-block rounded bg-red-500/15 px-1.5 py-0.5 text-red-400">
          Red
        </span>
        below average
      </p>
    </div>
  );
}

function MC({
  value,
  avg,
  lb,
  dp,
}: {
  value: number | null;
  avg: number | null | undefined;
  lb: boolean;
  dp: number;
}) {
  if (value == null || Number.isNaN(value))
    return <td className="py-3 px-4 text-xs text-slate-400">—</td>;
  let color = "text-slate-200";
  if (avg != null && !Number.isNaN(avg) && avg !== 0) {
    if (lb ? value < avg : value > avg) color = "text-emerald-400";
    else if (lb ? value > avg : value < avg) color = "text-red-400";
  }
  return (
    <td className={`py-3 px-4 text-xs tabular-nums font-medium ${color}`}>
      {value.toFixed(dp)}
    </td>
  );
}
