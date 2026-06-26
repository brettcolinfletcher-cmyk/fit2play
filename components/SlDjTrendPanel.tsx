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
 * Single-leg drop-jump asymmetry panel — the centrepiece of the RTP narrative.
 *
 * Chart: Left RSI (blue #60a5fa) vs Right RSI (lime #a3e635) overlaid on one axis.
 * Table: L / R per date with LSI% colour-coded at 90/80 thresholds.
 * The closing asymmetry story is immediately visible both in the chart and table.
 */

export type SlDjRow = {
  date: string;
  rawDate: string;
  rsiLeft: number | null;
  rsiRight: number | null;
  jumpLeft: number | null;   // cm
  jumpRight: number | null;  // cm
};

function lsi(a: number | null, b: number | null): number | null {
  if (a == null || b == null || Math.max(a, b) === 0) return null;
  return Math.round((Math.min(a, b) / Math.max(a, b)) * 100);
}

function fmt(v: number | null | undefined, dp = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(dp);
}

function lsiColor(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  if (pct >= 90) return "text-emerald-400";
  if (pct >= 80) return "text-amber-400";
  return "text-rose-400";
}

const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 10,
  fontSize: 12,
  color: "#e2e8f0",
};

export default function SlDjTrendPanel({
  rows,
  title = "Single-leg drop jump — L vs R asymmetry",
}: {
  rows: SlDjRow[];
  title?: string;
}) {
  const firstLsi = useMemo(() => lsi(rows[0]?.rsiLeft ?? null, rows[0]?.rsiRight ?? null), [rows]);
  const lastLsi = useMemo(() => lsi(rows[rows.length - 1]?.rsiLeft ?? null, rows[rows.length - 1]?.rsiRight ?? null), [rows]);

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
        <p className="mt-4 text-xs text-slate-400">No single-leg drop-jump sessions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
          {firstLsi != null && lastLsi != null && rows.length >= 2 && (
            <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5">
              <div className="text-center">
                <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Start LSI</p>
                <p className={`text-sm font-semibold tabular-nums ${lsiColor(firstLsi)}`}>{firstLsi}%</p>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              <div className="text-center">
                <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Latest LSI</p>
                <p className={`text-sm font-semibold tabular-nums ${lsiColor(lastLsi)}`}>{lastLsi}%</p>
              </div>
              {lastLsi > firstLsi && (
                <>
                  <div className="h-6 w-px bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Change</p>
                    <p className="text-sm font-semibold tabular-nums text-emerald-400">
                      +{lastLsi - firstLsi}%
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#a3e635", fontWeight: 600 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <Line type="monotone" dataKey="rsiLeft" name="Left RSI" stroke="#60a5fa" strokeWidth={2.5} dot={{ fill: "#60a5fa", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
            <Line type="monotone" dataKey="rsiRight" name="Right RSI" stroke="#a3e635" strokeWidth={2.5} dot={{ fill: "#a3e635", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[0.68rem] text-slate-500">
        <span className="text-[#60a5fa]">Blue = Left</span>{" · "}
        <span className="text-[#a3e635]">Lime = Right</span>
      </p>
    </div>
  );
}
