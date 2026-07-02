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
  ReferenceLine,
} from "recharts";

/**
 * CMJ longitudinal trend panel.
 * Shows jump height + mRSI dual-line chart, then a per-date table
 * with jump height / mRSI / peak propulsive force / L:R asymmetry %.
 */

export type CmjRow = {
  date: string;
  rawDate: string;
  jumpHeightCm: number | null;   // stored in metres × 100
  mrsi: number | null;
  peakPropulsiveForce: number | null;
  lrAsymmetryPct: number | null; // fp_lr_peak_propulsive_force (already %)
};

function fmt(v: number | null | undefined, dp = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(dp);
}

function avg(rows: CmjRow[], key: keyof CmjRow): number | null {
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

export default function CmjTrendPanel({
  rows,
  title = "CMJ — counter-movement jump",
}: {
  rows: CmjRow[];
  title?: string;
}) {
  const avgs = useMemo(
    () => ({
      jumpHeightCm: avg(rows, "jumpHeightCm"),
      mrsi: avg(rows, "mrsi"),
      peakPropulsiveForce: avg(rows, "peakPropulsiveForce"),
      lrAsymmetryPct: avg(rows, "lrAsymmetryPct"),
    }),
    [rows]
  );

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
        <p className="mt-4 text-xs text-slate-400">No CMJ sessions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-xs uppercase tracking-wide text-slate-500">{title}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="jump" orientation="left" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={36} tickCount={5} domain={["auto", "auto"]} />
            <YAxis yAxisId="rsi" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={36} tickCount={5} domain={["auto", "auto"]} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#a3e635", fontWeight: 600 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
            <ReferenceLine yAxisId="jump" y={30} stroke="#94a3b8" strokeDasharray="6 4" />
            <Line yAxisId="jump" type="monotone" dataKey="jumpHeightCm" name="Jump height (cm)" stroke="#a3e635" strokeWidth={2.5} dot={{ fill: "#a3e635", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
            <Line yAxisId="rsi" type="monotone" dataKey="mrsi" name="mRSI" stroke="#38bdf8" strokeWidth={2.5} dot={{ fill: "#38bdf8", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-3 text-[0.65rem] text-slate-500">
          <span className="mr-1.5 inline-block font-mono tracking-widest">- - -</span>
          30 cm benchmark
        </p>
      </div>
    </div>
  );
}

function MC({ value, avg, lb, dp, suffix = "" }: {
  value: number | null;
  avg: number | null;
  lb: boolean;
  dp: number;
  suffix?: string;
}) {
  if (value == null || Number.isNaN(value))
    return <td className="py-3 px-4 text-xs text-slate-400">—</td>;
  let color = "text-slate-700";
  if (avg != null && !Number.isNaN(avg) && avg !== 0) {
    if (lb ? value < avg : value > avg) color = "text-emerald-400";
    else if (lb ? value > avg : value < avg) color = "text-red-400";
  }
  return (
    <td className={`py-3 px-4 text-xs tabular-nums font-medium ${color}`}>
      {value.toFixed(dp)}{suffix}
    </td>
  );
}
