"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ZoomableChart from "@/components/charts/ZoomableChart";
import { dailyTotals, dayMs, ewmaSeries, type EwmaPoint } from "@/lib/ewma";
import { CHART_AXIS_LINE, CHART_AXIS_TICK, CHART_GRID, CHART_TOOLTIP_STYLE, ChartDefs } from "./chartTheme";

export const WORKLOAD_METRICS = [
  { key: "gps_total_distance_m", label: "Total distance", unit: "m" },
  { key: "gps_high_speed_run_distance_m", label: "High-speed running", unit: "m" },
  { key: "gps_total_sprint_distance_m", label: "Sprint distance", unit: "m" },
] as const;

const ACUTE_DAYS = 7;
/** Chronic window options in weeks (2 to 10). */
const CHRONIC_WEEKS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const ACUTE_COLOR = "#f59e0b";
const CHRONIC_COLOR = "#334155";
const ACWR_COLOR = "#0f172a";
const SWEET_LOW = 0.8;
const SWEET_HIGH = 1.3;
const DANGER = 1.5;

type SessionLike = { id: string; session_date: string | null };
type MetricLike = { key: string; value: number | null };

type Props = {
  /** ALL of the athlete's GPS sessions (not range-filtered): EWMA needs the full history. */
  sessions: SessionLike[];
  metricsBySession: Map<string, MetricLike[]>;
  rangeStart: string | null;
  rangeEnd: string | null;
};

function n0(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("en-AU");
}

function shortDate(t: number): string {
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}

function acwrTone(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v > DANGER) return "text-rose-600";
  if (v > SWEET_HIGH || v < SWEET_LOW) return "text-amber-600";
  return "text-lime-700";
}

export default function GpsWorkload({ sessions, metricsBySession, rangeStart, rangeEnd }: Props) {
  const [chronicWeeks, setChronicWeeks] = useState<number>(4);
  const chronicDays = chronicWeeks * 7;
  const today = new Date().toISOString().slice(0, 10);
  const endDate = rangeEnd && rangeEnd < today ? rangeEnd.slice(0, 10) : today;

  const series = useMemo(() => {
    const out = new Map<string, EwmaPoint[]>();
    for (const m of WORKLOAD_METRICS) {
      const rows: { date: string; value: number }[] = [];
      for (const s of sessions) {
        if (!s.session_date) continue;
        const v = (metricsBySession.get(s.id) ?? []).find((r) => r.key === m.key)?.value;
        if (v != null) rows.push({ date: s.session_date, value: Number(v) });
      }
      const full = ewmaSeries(dailyTotals(rows), { acuteDays: ACUTE_DAYS, chronicDays, endDate });
      const from = rangeStart ? dayMs(rangeStart) : -Infinity;
      out.set(m.key, full.filter((p) => p.t >= from));
    }
    return out;
  }, [sessions, metricsBySession, chronicDays, endDate, rangeStart]);

  if (![...series.values()].some((s) => s.length > 0)) return null;

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Workload (EWMA)</h3>
          <p className="mt-0.5 text-[0.7rem] text-slate-400">
            Bars: daily load. Acute {ACUTE_DAYS}-day and chronic {chronicWeeks}-week ({chronicDays}-day) EWMA, all sessions, rest days count as zero. Shaded: chronic still building.
            ACWR target {SWEET_LOW}–{SWEET_HIGH}.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Chronic (weeks)</span>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 font-medium">
            {CHRONIC_WEEKS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setChronicWeeks(w)}
                className={
                  w === chronicWeeks
                    ? "rounded-md bg-slate-900 px-2.5 py-1 text-white"
                    : "rounded-md px-2.5 py-1 text-slate-500 hover:text-slate-800"
                }
                title={`${w * 7}-day chronic EWMA`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {WORKLOAD_METRICS.map((m) => {
          const pts = series.get(m.key) ?? [];
          if (pts.length === 0) return null;
          const last = pts[pts.length - 1];
          return (
            <div key={m.key}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">{m.label}</p>
                <p className="text-[0.7rem] tabular-nums text-slate-500">
                  as of {shortDate(last.t)}:{" "}
                  <span style={{ color: ACUTE_COLOR }}>acute {n0(last.acute)}</span> ·{" "}
                  <span style={{ color: CHRONIC_COLOR }}>chronic {n0(last.chronic)}</span> ·{" "}
                  <span className={`font-semibold ${acwrTone(last.acwr)}`}>
                    ACWR {last.acwr != null ? last.acwr.toFixed(2) : last.building ? "building" : "—"}
                  </span>
                </p>
              </div>
              <WorkloadChart points={pts} unit={m.unit} label={m.label} chronicDays={chronicDays} />
              <AcwrChart points={pts} label={m.label} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function xAxisProps(points: EwmaPoint[]) {
  return {
    dataKey: "t",
    type: "number" as const,
    scale: "time" as const,
    domain: [points[0].t - 43_200_000, points[points.length - 1].t + 43_200_000] as [number, number],
    tickFormatter: shortDate,
    tick: CHART_AXIS_TICK,
    axisLine: CHART_AXIS_LINE,
    tickLine: false,
    minTickGap: 24,
  };
}

function WorkloadChart({
  points,
  unit,
  label,
  chronicDays,
}: {
  points: EwmaPoint[];
  unit: string;
  label: string;
  chronicDays: number;
}) {
  const buildingEnd = points.filter((p) => p.building).at(-1)?.t ?? null;
  return (
    <ZoomableChart title={`${label}: load and EWMA`} height={200} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white">
      {(h) => (
        <ResponsiveContainer width="100%" height={h}>
          <ComposedChart data={points} margin={{ top: 10, right: 12, left: -4, bottom: -10 }}>
            {ChartDefs}
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...xAxisProps(points)} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => n0(v)} />
            {buildingEnd != null ? (
              <ReferenceArea x1={points[0].t} x2={buildingEnd} fill="#f1f5f9" fillOpacity={0.7} ifOverflow="hidden" />
            ) : null}
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={{ color: "#94a3b8" }}
              labelFormatter={(t) => shortDate(Number(t))}
              formatter={(v, name) => [`${n0(Number(v))} ${unit}`, String(name)]}
            />
            <Bar dataKey="load" name="Daily load" fill="url(#f2pBar)" radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
            <Line dataKey="acute" name={`Acute ${ACUTE_DAYS}d`} stroke={ACUTE_COLOR} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line dataKey="chronic" name={`Chronic ${chronicDays / 7}wk`} stroke={CHRONIC_COLOR} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ZoomableChart>
  );
}

function AcwrChart({ points, label }: { points: EwmaPoint[]; label: string }) {
  const max = Math.max(2, ...points.map((p) => p.acwr ?? 0));
  return (
    <ZoomableChart title={`${label}: ACWR`} height={100} zoomedHeight={300} className="mt-2 w-full rounded-xl border border-slate-200 bg-white">
      {(h) => (
        <ResponsiveContainer width="100%" height={h}>
          <LineChart data={points} margin={{ top: 8, right: 12, left: -4, bottom: -10 }}>
            <XAxis {...xAxisProps(points)} />
            <YAxis
              domain={[0, Math.ceil(max * 2) / 2]}
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              ticks={[0, SWEET_LOW, SWEET_HIGH, DANGER].filter((v) => v <= max)}
            />
            <ReferenceArea y1={SWEET_LOW} y2={SWEET_HIGH} fill="#d9f99d" fillOpacity={0.45} ifOverflow="hidden" />
            <ReferenceLine y={DANGER} stroke="#fda4af" strokeDasharray="4 4" />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={{ color: "#94a3b8" }}
              labelFormatter={(t) => shortDate(Number(t))}
              formatter={(v) => [Number(v).toFixed(2), "ACWR"]}
            />
            <Line dataKey="acwr" name="ACWR" stroke={ACWR_COLOR} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ZoomableChart>
  );
}
