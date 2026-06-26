"use client";

import { useMemo } from "react";
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
 * Bilateral drop-jump longitudinal trend panel.
 * RSI + jump height trend, table with contact time (stiffness strategy).
 */

export type DjRow = {
  date: string;
  rawDate: string;
  rsi: number | null;
  jumpHeightCm: number | null;
  contactTime: number | null; // seconds
  flightTime: number | null;
};

function fmt(v: number | null | undefined, dp = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(dp);
}

function avg(rows: DjRow[], key: keyof DjRow): number | null {
  const vals = rows
    .map((r) => r[key] as number | null)
    .filter((v): v is number => v != null && !Number.isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 10,
  fontSize: 12,
  color: "#e2e8f0",
};

export default function DjTrendPanel({
  rows,
  title = "Drop jump — bilateral",
}: {
  rows: DjRow[];
  title?: string;
}) {
  const avgs = useMemo(
    () => ({
      rsi: avg(rows, "rsi"),
      jumpHeightCm: avg(rows, "jumpHeightCm"),
      contactTime: avg(rows, "contactTime"),
      flightTime: avg(rows, "flightTime"),
    }),
    [rows]
  );

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
        <p className="mt-4 text-xs text-slate-400">No drop-jump sessions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-4 text-xs uppercase tracking-wide text-slate-500">{title}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="rsi" orientation="left" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={36} label={{ value: "RSI", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 10 }} />
            <YAxis yAxisId="jump" orientation="right" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={36} label={{ value: "cm", angle: 90, position: "insideRight", fill: "#475569", fontSize: 10 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#a3e635", fontWeight: 600 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <Line yAxisId="rsi" type="monotone" dataKey="rsi" name="RSI" stroke="#a3e635" strokeWidth={2} dot={{ fill: "#a3e635", r: 4 }} activeDot={{ r: 6 }} connectNulls />
            <Line yAxisId="jump" type="monotone" dataKey="jumpHeightCm" name="Jump height (cm)" stroke="#38bdf8" strokeWidth={2} dot={{ fill: "#38bdf8", r: 4 }} activeDot={{ r: 6 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
              <th className="py-3 pl-5 pr-4">Date</th>
              <th className="py-3 px-4">RSI</th>
              <th className="py-3 px-4">Jump height (cm)</th>
              <th className="py-3 px-4">Contact time (s)</th>
              <th className="py-3 pr-5 pl-4">Flight time (s)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-slate-800/40">
                <td className="py-3 pl-5 pr-4 text-xs font-medium text-slate-200">{row.date}</td>
                <MC value={row.rsi} avg={avgs.rsi} lb={false} dp={3} />
                <MC value={row.jumpHeightCm} avg={avgs.jumpHeightCm} lb={false} dp={1} />
                {/* contact time: lower is better (stiffer = faster SSC) */}
                <MC value={row.contactTime} avg={avgs.contactTime} lb={true} dp={3} />
                <MC value={row.flightTime} avg={avgs.flightTime} lb={false} dp={3} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-700 bg-slate-900/60 text-[0.72rem] font-semibold text-slate-300">
              <td className="py-3 pl-5 pr-4 text-slate-400">Average</td>
              <td className="py-3 px-4 text-lime-300">{fmt(avgs.rsi, 3)}</td>
              <td className="py-3 px-4">{fmt(avgs.jumpHeightCm, 1)}</td>
              <td className="py-3 px-4">{fmt(avgs.contactTime, 3)}</td>
              <td className="py-3 pr-5 pl-4">{fmt(avgs.flightTime, 3)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[0.68rem] text-slate-500">
        <span className="mr-2 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">Green</span>
        better than average ·{" "}
        <span className="mr-2 inline-block rounded bg-red-500/15 px-1.5 py-0.5 text-red-400">Red</span>
        below average · contact time: lower = stiffer SSC strategy
      </p>
    </div>
  );
}

function MC({ value, avg, lb, dp }: {
  value: number | null;
  avg: number | null;
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
