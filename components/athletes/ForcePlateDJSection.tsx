"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDisplayDate } from "@/lib/dateDisplay";
import { lsiColorClass, SIDE_COLORS } from "@/lib/sideColors";
import ChartTypeToggle, { type ChartType } from "./ChartTypeToggle";
import SectionComment from "./SectionComment";
import {
  CHART_AXIS_LINE,
  CHART_AXIS_TICK,
  CHART_GRID,
  CHART_REFERENCE_STROKE,
  CHART_TOOLTIP_STYLE,
  ChartDefs,
} from "./chartTheme";

export type DJDataPoint = {
  date: string;
  t: number;
  rsi: number | null;
  jump_height_cm: number | null;
  contact_time_ms: number | null;
  peak_propulsive_force: number | null;
  peak_braking_force: number | null;
  rawMetrics?: Record<string, number>;
};

export type DJLRPair = {
  label: string;
  leftKey: string;
  rightKey: string;
};

// Drop jump is a reactive / landing task — limb asymmetry shows up most in the
// landing phase, so landing force leads the strip.
const DJ_LR_PAIRS: DJLRPair[] = [
  {
    label: "Avg Landing Force",
    leftKey: "fp_left_avg_landing_force",
    rightKey: "fp_right_avg_landing_force",
  },
  {
    label: "Peak Landing Force",
    leftKey: "fp_left_force_at_peak_landing_force",
    rightKey: "fp_right_force_at_peak_landing_force",
  },
  {
    label: "Avg Propulsive Force",
    leftKey: "fp_left_avg_propulsive_force",
    rightKey: "fp_right_avg_propulsive_force",
  },
  {
    label: "Avg Braking Force",
    leftKey: "fp_left_avg_braking_force",
    rightKey: "fp_right_avg_braking_force",
  },
];

const DJ_METRICS = [
  { key: "rsi", label: "RSI", unit: "" },
  { key: "jump_height_cm", label: "Jump Height", unit: "cm" },
  { key: "contact_time_ms", label: "Contact Time", unit: "ms" },
  { key: "peak_propulsive_force", label: "Peak Propulsive Force", unit: "N" },
  { key: "peak_braking_force", label: "Peak Braking Force", unit: "N" },
] as const;

const DJ_DEFAULT = new Set<string>(["rsi", "jump_height_cm", "contact_time_ms"]);

const DECIMALS: Record<string, number> = {
  rsi: 3,
  jump_height_cm: 1,
  contact_time_ms: 1,
  peak_propulsive_force: 0,
  peak_braking_force: 0,
};

const AXIS_TICK = CHART_AXIS_TICK;
const TOOLTIP_STYLE = CHART_TOOLTIP_STYLE;

function MetricPicker({
  metrics,
  defaultSelected,
  selected,
  onChange,
}: {
  metrics: readonly { key: string; label: string; unit: string }[];
  defaultSelected: Set<string>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800"
      >
        Metrics ({selected.size}) ▼
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {metrics.map((m) => {
              const checked = selected.has(m.key);
              return (
                <li key={m.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(selected);
                        if (checked) next.delete(m.key);
                        else next.add(m.key);
                        onChange(next);
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-lime-400"
                    />
                    <span>{m.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => onChange(new Set(defaultSelected))}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded bg-lime-400/20 px-2 py-1 text-xs font-medium text-lime-300 ring-1 ring-lime-500/40 hover:bg-lime-400/30"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DJAsymmetryStrip({ rawMetrics }: { rawMetrics: Record<string, number> }) {
  const pairs = DJ_LR_PAIRS.filter(
    (p) => rawMetrics[p.leftKey] != null && rawMetrics[p.rightKey] != null
  );
  if (pairs.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Left / Right Asymmetry — Latest Session
      </p>
      {pairs.map((p) => {
        const lv = rawMetrics[p.leftKey]!;
        const rv = rawMetrics[p.rightKey]!;
        const total = lv + rv;
        const leftPct = total > 0 ? (lv / total) * 100 : 50;
        const rightPct = 100 - leftPct;
        const stronger = Math.max(lv, rv);
        const lsiVal = stronger === 0 ? 100 : (Math.min(lv, rv) / stronger) * 100;
        return (
          <div key={p.leftKey}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-400">{p.label}</span>
              <span className={`font-mono text-xs ${lsiColorClass(lsiVal)}`}>
                LSI {lsiVal.toFixed(1)}%
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full">
              <div
                className="transition-all"
                style={{ width: `${leftPct}%`, backgroundColor: SIDE_COLORS.left }}
                title={`Left ${lv.toFixed(1)} N`}
              />
              <div
                className="transition-all"
                style={{ width: `${rightPct}%`, backgroundColor: SIDE_COLORS.right }}
                title={`Right ${rv.toFixed(1)} N`}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
              <span>L {lv.toFixed(1)}</span>
              <span>R {rv.toFixed(1)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function extractRawLrMetrics(rows: MetricLite[]): Record<string, number> | undefined {
  const raw: Record<string, number> = {};
  for (const r of rows) {
    if (r.value == null || !Number.isFinite(r.value)) continue;
    if (r.key.startsWith("fp_left_") || r.key.startsWith("fp_right_")) {
      const prev = raw[r.key];
      raw[r.key] = prev != null ? Math.max(prev, r.value) : r.value;
    }
  }
  return Object.keys(raw).length > 0 ? raw : undefined;
}

type Props = {
  athleteId: string;
  data: DJDataPoint[];
  sectionComment: string | null;
};

export default function ForcePlateDJSection({
  athleteId,
  data,
  sectionComment,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DJ_DEFAULT));
  const [chartType, setChartType] = useState<ChartType>("bar");

  const chartRows = useMemo(
    () => [...data].sort((a, b) => a.t - b.t),
    [data]
  );
  const selectedMetrics = useMemo(
    () => DJ_METRICS.filter((m) => selected.has(m.key)),
    [selected]
  );

  if (data.length === 0) return null;

  return (
    <section id="drop_jump" className="scroll-mt-28 mt-10">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Force plate — Drop jump
        </h2>
        <div className="flex items-center gap-2">
          <ChartTypeToggle value={chartType} onChange={setChartType} />
          <MetricPicker
            metrics={DJ_METRICS}
            defaultSelected={DJ_DEFAULT}
            selected={selected}
            onChange={setSelected}
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {selectedMetrics.map((metric) => {
          const field = metric.key as keyof DJDataPoint;
          const decimals = DECIMALS[metric.key] ?? 2;
          const pts = chartRows
            .map((row) => {
              const v = row[field] as number | null;
              if (v == null || !Number.isFinite(v)) return null;
              return { date: row.date, v };
            })
            .filter(Boolean) as { date: string; v: number }[];
          const enough = pts.length >= 1;
          return (
            <div key={metric.key}>
              <p className="mb-2 text-xs text-slate-400">
                {metric.label}
                {metric.unit ? ` (${metric.unit})` : ""}
              </p>
              {!enough ? (
                <p className="py-12 text-center text-xs text-slate-500">Not enough data</p>
              ) : (
                <div className="h-[220px] w-full rounded-xl border border-slate-200 bg-white">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartType === "bar" ? (
                      <BarChart data={pts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        {ChartDefs}
                        <CartesianGrid {...CHART_GRID} />
                        <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={CHART_AXIS_LINE} />
                        <YAxis tick={AXIS_TICK} width={48} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelStyle={{ color: "#94a3b8" }}
                          itemStyle={{ color: "#a3e635" }}
                          formatter={(v: number | string) => {
                            const n = typeof v === "number" ? v : Number(v);
                            const text = Number.isFinite(n)
                              ? decimals === 0
                                ? String(Math.round(n))
                                : n.toFixed(decimals)
                              : String(v);
                            return [
                              metric.unit ? `${text} ${metric.unit}` : text,
                              metric.label,
                            ];
                          }}
                        />
                        <ReferenceLine
                          y={pts[0]!.v}
                          stroke={CHART_REFERENCE_STROKE}
                          strokeDasharray="4 4"
                        />
                        <Bar dataKey="v" radius={[6, 6, 0, 0]} maxBarSize={44}>
                          {pts.map((_, i) => (
                            <Cell key={i} fill="url(#f2pBar)" />
                          ))}
                        </Bar>
                      </BarChart>
                    ) : (
                      <LineChart data={pts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid {...CHART_GRID} />
                        <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={CHART_AXIS_LINE} />
                        <YAxis tick={AXIS_TICK} width={48} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelStyle={{ color: "#94a3b8" }}
                          itemStyle={{ color: "#a3e635" }}
                          formatter={(v: number | string) => {
                            const n = typeof v === "number" ? v : Number(v);
                            const text = Number.isFinite(n)
                              ? decimals === 0
                                ? String(Math.round(n))
                                : n.toFixed(decimals)
                              : String(v);
                            return [
                              metric.unit ? `${text} ${metric.unit}` : text,
                              metric.label,
                            ];
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke="#a3e635"
                          strokeWidth={2.25}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          dot={{ fill: "#a3e635", r: 2.5, strokeWidth: 0 }}
                          activeDot={{ r: 4 }}
                          connectNulls
                        />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(() => {
        const latest = chartRows[chartRows.length - 1];
        if (!latest?.rawMetrics) return null;
        return <DJAsymmetryStrip rawMetrics={latest.rawMetrics} />;
      })()}
      <SectionComment
        athleteId={athleteId}
        section="drop_jump"
        initialComment={sectionComment}
      />
    </section>
  );
}

type SessionLite = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type?: string | null;
};

type MetricLite = { key: string; value: number | null; rep_index: number | null };

function isDjSession(s: SessionLite): boolean {
  const tt = (s.test_type ?? "").toLowerCase();
  const st = (s.test_sub_type ?? "").toLowerCase();
  if (tt === "force_plate_dj") return true;
  if (tt === "force_plate_cmj") return false;
  if (tt.includes("single")) return false;
  if (tt.includes("dj") || tt.includes("drop")) return true;
  if (st.includes("dj") || st.includes("drop")) return true;
  return false;
}

function toContactMs(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw > 25) return raw;
  return raw * 1000;
}

export function buildDjDataPoints(
  sessions: SessionLite[],
  metricsBySession: Map<string, MetricLite[]>
): DJDataPoint[] {
  const out: DJDataPoint[] = [];
  const sorted = [...sessions].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });

  for (const s of sorted) {
    if (!s.session_date || !isDjSession(s)) continue;

    const rows = metricsBySession.get(s.id) ?? [];
    const byRep = new Map<number, Record<string, number>>();
    for (const r of rows) {
      if (r.rep_index == null || r.value == null) continue;
      if (!r.key.startsWith("fp_")) continue;
      const m = byRep.get(r.rep_index) ?? {};
      m[r.key] = r.value;
      byRep.set(r.rep_index, m);
    }

    let bestRep: Record<string, number> | null = null;
    let bestScore = -Infinity;
    for (const m of byRep.values()) {
      const jm = m.fp_jump_height;
      const jcm = m.fp_jump_height_cm_best;
      let score = -Infinity;
      if (jm != null && Number.isFinite(jm)) score = Math.max(score, jm * 100);
      if (jcm != null && Number.isFinite(jcm)) score = Math.max(score, jcm);
      if (score === -Infinity && m.fp_rsi_best != null && Number.isFinite(m.fp_rsi_best)) {
        score = m.fp_rsi_best;
      }
      if (score > bestScore) {
        bestScore = score;
        bestRep = m;
      }
    }

    if (!bestRep || bestScore === -Infinity) {
      const rsi = maxMetric(rows, "fp_rsi_best");
      const jhM = maxMetric(rows, "fp_jump_height");
      const jhCm = maxMetric(rows, "fp_jump_height_cm_best");
      const ct =
        minMetric(rows, "fp_contact_time") ??
        minMetric(rows, "fp_contact_time_s_best");
      const ppf = maxMetric(rows, "fp_peak_propulsive_force");
      const pbf = maxMetric(rows, "fp_peak_braking_force");
      if (
        rsi == null &&
        jhM == null &&
        jhCm == null &&
        ct == null &&
        ppf == null &&
        pbf == null
      ) {
        continue;
      }
      const jhCmVal = jhM != null ? jhM * 100 : jhCm;
      out.push(
        djRow(
          s.session_date,
          rsi,
          jhCmVal,
          toContactMs(ct),
          ppf,
          pbf,
          extractRawLrMetrics(rows)
        )
      );
      continue;
    }

    const rsi = bestRep.fp_rsi_best ?? null;
    const jhCm =
      bestRep.fp_jump_height != null
        ? bestRep.fp_jump_height * 100
        : bestRep.fp_jump_height_cm_best ?? null;
    const ctRaw =
      bestRep.fp_contact_time ?? bestRep.fp_contact_time_s_best ?? null;
    out.push(
      djRow(
        s.session_date,
        rsi,
        jhCm,
        toContactMs(ctRaw),
        bestRep.fp_peak_propulsive_force ?? null,
        bestRep.fp_peak_braking_force ?? null,
        extractRawLrMetrics(rows)
      )
    );
  }
  return out;
}

function maxMetric(rows: MetricLite[], key: string): number | null {
  const vals = rows
    .filter((r) => r.key === key && r.value != null)
    .map((r) => r.value!);
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

function minMetric(rows: MetricLite[], key: string): number | null {
  const vals = rows
    .filter((r) => r.key === key && r.value != null)
    .map((r) => r.value!);
  if (vals.length === 0) return null;
  return Math.min(...vals);
}

function djRow(
  sessionDate: string,
  rsi: number | null,
  jumpHeightCm: number | null,
  contactMs: number | null,
  peakPropulsive: number | null,
  peakBraking: number | null,
  rawMetrics?: Record<string, number>
): DJDataPoint {
  return {
    date: formatDisplayDate(sessionDate),
    t: new Date(sessionDate).getTime(),
    rsi,
    jump_height_cm: jumpHeightCm,
    contact_time_ms: contactMs,
    peak_propulsive_force: peakPropulsive,
    peak_braking_force: peakBraking,
    rawMetrics,
  };
}
