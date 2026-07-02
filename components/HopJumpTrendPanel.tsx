"use client";

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
 * Hop & jump distance panel — driven by 1080 sprint sessions with sub-types:
 *   "Broad Jump"     — bilateral (side=null), total_distance + peak_force
 *   "Single Leg Hop" — side-tagged L/R, total_distance
 *   "Triple Hop"     — side-tagged L/R, total_distance
 *
 * Sub-type strings are placeholders until real 1080 data confirms exact names.
 */

export type HopJumpRow = {
  date: string;
  rawDate: string;
  distLeft: number | null;   // m
  distRight: number | null;  // m — null for bilateral (broad jump)
  peakForce: number | null;  // N
};

export type HopJumpRows = {
  broadJump: HopJumpRow[];
  slHop: HopJumpRow[];
  tripleHop: HopJumpRow[];
};

function lsi(a: number | null, b: number | null): number | null {
  if (a == null || b == null || Math.max(a, b) === 0) return null;
  return Math.round((Math.min(a, b) / Math.max(a, b)) * 100);
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

/** Bilateral chart — distance only */
function BilateralSubPanel({ label, rows }: { label: string; rows: HopJumpRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#a3e635", fontWeight: 600 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
          <Line type="monotone" dataKey="distLeft" name="Distance (m)" stroke="#a3e635" strokeWidth={2.5} dot={{ fill: "#a3e635", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Asymmetry chart — L (blue) vs R (lime) with LSI badge */
function AsymmetrySubPanel({ label, rows }: { label: string; rows: HopJumpRow[] }) {
  if (!rows.length) return null;
  const firstLsi = lsi(rows[0]?.distLeft ?? null, rows[0]?.distRight ?? null);
  const lastLsi = lsi(rows[rows.length - 1]?.distLeft ?? null, rows[rows.length - 1]?.distRight ?? null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</h3>
        {firstLsi != null && lastLsi != null && rows.length >= 2 && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <div className="text-center">
              <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Start LSI</p>
              <p className={`text-sm font-semibold tabular-nums ${lsiColor(firstLsi)}`}>{firstLsi}%</p>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="text-center">
              <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Latest LSI</p>
              <p className={`text-sm font-semibold tabular-nums ${lsiColor(lastLsi)}`}>{lastLsi}%</p>
            </div>
            {lastLsi > firstLsi && (
              <>
                <div className="h-6 w-px bg-slate-200" />
                <div className="text-center">
                  <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">Change</p>
                  <p className="text-sm font-semibold tabular-nums text-emerald-600">
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
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#a3e635", fontWeight: 600 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
          <Line type="monotone" dataKey="distLeft" name="Left (m)" stroke="#60a5fa" strokeWidth={2.5} dot={{ fill: "#60a5fa", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
          <Line type="monotone" dataKey="distRight" name="Right (m)" stroke="#a3e635" strokeWidth={2.5} dot={{ fill: "#a3e635", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function HopJumpTrendPanel({
  rows,
  title = "Hop & jump — distance",
}: {
  rows: HopJumpRows;
  title?: string;
}) {
  const hasAny =
    rows.broadJump.length > 0 || rows.slHop.length > 0 || rows.tripleHop.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
        <p className="mt-4 text-xs text-slate-400">No hop/jump sessions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">{title}</h2>
      {rows.broadJump.length > 0 && (
        <BilateralSubPanel label="Broad jump" rows={rows.broadJump} />
      )}
      {rows.slHop.length > 0 && (
        <AsymmetrySubPanel label="Single leg hop for distance" rows={rows.slHop} />
      )}
      {rows.tripleHop.length > 0 && (
        <AsymmetrySubPanel label="Triple hop for distance" rows={rows.tripleHop} />
      )}
      <p className="text-[0.68rem] text-slate-500">
        <span className="text-[#60a5fa]">Blue = Left</span>{" · "}
        <span className="text-[#a3e635]">Lime = Right / Bilateral</span>
      </p>
    </div>
  );
}
