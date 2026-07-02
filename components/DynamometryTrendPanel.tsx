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
 * Isometric strength trend panel — driven by force_plate_isometric sessions
 * from Hawkins (knee extension, knee flexion, hip abduction).
 *
 * For each test: dual-line L (blue) vs R (lime) peak force trend, plus
 * a per-date table with L / R / LSI% colour-coded at 90/80 thresholds.
 */

export type IsoTestRow = {
  date: string;
  rawDate: string;
  leftForce: number | null;   // N
  rightForce: number | null;  // N
  leftRfd: number | null;
  rightRfd: number | null;
};

export type DynamometryRows = {
  kneeExtension: IsoTestRow[];
  kneeFlexion: IsoTestRow[];
  hipAbduction: IsoTestRow[];
};

function lsi(a: number | null, b: number | null): number | null {
  if (a == null || b == null || Math.max(a, b) === 0) return null;
  return Math.round((Math.min(a, b) / Math.max(a, b)) * 100);
}

function fmt(v: number | null | undefined, dp = 0): string {
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

function IsoSubPanel({
  label,
  rows,
}: {
  label: string;
  rows: IsoTestRow[];
}) {
  const firstLsi = useMemo(
    () => lsi(rows[0]?.leftForce ?? null, rows[0]?.rightForce ?? null),
    [rows]
  );
  const lastLsi = useMemo(
    () => lsi(
      rows[rows.length - 1]?.leftForce ?? null,
      rows[rows.length - 1]?.rightForce ?? null
    ),
    [rows]
  );

  if (!rows.length) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {label}
          </h3>
          {firstLsi != null && lastLsi != null && rows.length >= 2 && (
            <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5">
              <div className="text-center">
                <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Start LSI</p>
                <p className={`text-sm font-semibold tabular-nums ${lsiColor(firstLsi)}`}>
                  {firstLsi}%
                </p>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              <div className="text-center">
                <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Latest LSI</p>
                <p className={`text-sm font-semibold tabular-nums ${lsiColor(lastLsi)}`}>
                  {lastLsi}%
                </p>
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

        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#a3e635", fontWeight: 600 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <Line type="monotone" dataKey="leftForce" name="Left (N)" stroke="#60a5fa" strokeWidth={2.5} dot={{ fill: "#60a5fa", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
            <Line type="monotone" dataKey="rightForce" name="Right (N)" stroke="#a3e635" strokeWidth={2.5} dot={{ fill: "#a3e635", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function DynamometryTrendPanel({
  rows,
  title = "Isometric strength — L vs R",
}: {
  rows: DynamometryRows;
  title?: string;
}) {
  const hasAny =
    rows.kneeExtension.length > 0 ||
    rows.kneeFlexion.length > 0 ||
    rows.hipAbduction.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
        <p className="mt-4 text-xs text-slate-400">No isometric strength data yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
      </div>

      {rows.kneeExtension.length > 0 && (
        <IsoSubPanel label="Knee Extension" rows={rows.kneeExtension} />
      )}
      {rows.kneeFlexion.length > 0 && (
        <IsoSubPanel label="Knee Flexion" rows={rows.kneeFlexion} />
      )}
      {rows.hipAbduction.length > 0 && (
        <IsoSubPanel label="Hip Abduction" rows={rows.hipAbduction} />
      )}

      <p className="text-[0.68rem] text-slate-500">
        <span className="text-[#60a5fa]">Blue = Left</span>{" · "}
        <span className="text-[#a3e635]">Lime = Right</span>
      </p>
    </div>
  );
}
