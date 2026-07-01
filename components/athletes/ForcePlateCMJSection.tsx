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
import { lsiColorClass, SIDE_COLORS, sideColor } from "@/lib/sideColors";
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

export type CMJLRPair = {
  label: string;
  leftKey: string;
  rightKey: string;
};

const CMJ_LR_PAIRS: CMJLRPair[] = [
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
  {
    label: "Avg Landing Force",
    leftKey: "fp_left_avg_landing_force",
    rightKey: "fp_right_avg_landing_force",
  },
  {
    label: "Peak Propulsive Force",
    leftKey: "fp_left_force_at_peak_propulsive_force",
    rightKey: "fp_right_force_at_peak_propulsive_force",
  },
  {
    label: "Peak Braking Force",
    leftKey: "fp_left_force_at_peak_braking_force",
    rightKey: "fp_right_force_at_peak_braking_force",
  },
];

export type CMJDataPoint = {
  date: string;
  t: number;
  jump_height: number | null;
  propulsive_impulse: number | null;
  braking_impulse: number | null;
  peak_propulsive_force: number | null;
  peak_braking_force: number | null;
  mrsi: number | null;
  rawMetrics?: Record<string, number>;
};

export type MetricLite = { key: string; value: number | null; rep_index: number | null };

type SessionLite = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type?: string | null;
};

function isCmjSession(s: SessionLite): boolean {
  const tt = (s.test_type ?? "").toLowerCase();
  const st = (s.test_sub_type ?? "").toLowerCase();
  if (tt === "force_plate_dj") return false;
  if (tt === "force_plate_cmj") return true;
  if (tt.includes("dj") || tt.includes("drop")) return false;
  if (tt.includes("cmj")) return true;
  if (st.includes("dj") || st.includes("drop")) return false;
  if (st.includes("cmj")) return true;
  return false;
}

function maxMetric(rows: MetricLite[], key: string): number | null {
  const vals = rows
    .filter((r) => r.key === key && r.value != null)
    .map((r) => r.value!);
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

const CMJ_METRICS = [
  { key: "jump_height", label: "Jump Height", unit: "cm" },
  { key: "mrsi", label: "mRSI", unit: "" },
  { key: "propulsive_impulse", label: "Propulsive Impulse", unit: "N·s" },
  { key: "braking_impulse", label: "Braking Impulse", unit: "N·s" },
  { key: "peak_propulsive_force", label: "Peak Propulsive Force", unit: "N" },
  { key: "peak_braking_force", label: "Peak Braking Force", unit: "N" },
] as const;

const CMJ_DEFAULT = new Set<string>(["jump_height", "mrsi", "propulsive_impulse"]);

const DECIMALS: Record<string, number> = {
  jump_height: 1,
  mrsi: 3,
  propulsive_impulse: 1,
  braking_impulse: 1,
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
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
      >
        Metrics ({selected.size}) ▼
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl">
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {metrics.map((m) => {
              const checked = selected.has(m.key);
              return (
                <li key={m.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-200 hover:bg-slate-900/80">
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
          <div className="mt-3 flex justify-end gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => onChange(new Set(defaultSelected))}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
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

function CMJAsymmetryStrip({ rawMetrics }: { rawMetrics: Record<string, number> }) {
  const pairs = CMJ_LR_PAIRS.filter(
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
  data: CMJDataPoint[];
  sectionComment: string | null;
};

export default function ForcePlateCMJSection({
  athleteId,
  data,
  sectionComment,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(CMJ_DEFAULT));
  const [chartType, setChartType] = useState<ChartType>("bar");

  const chartData = useMemo(() => [...data].sort((a, b) => a.t - b.t), [data]);
  const selectedMetrics = useMemo(
    () => CMJ_METRICS.filter((m) => selected.has(m.key)),
    [selected]
  );

  if (data.length === 0) return null;

  const chartColor = sideColor(null);

  return (
    <section id="cmj" className="scroll-mt-28 mt-10">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Force plate — CMJ
        </h2>
        <div className="flex items-center gap-2">
          <ChartTypeToggle value={chartType} onChange={setChartType} />
          <MetricPicker
            metrics={CMJ_METRICS}
            defaultSelected={CMJ_DEFAULT}
            selected={selected}
            onChange={setSelected}
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {selectedMetrics.map((metric) => {
          const field = metric.key as keyof CMJDataPoint;
          const decimals = DECIMALS[metric.key] ?? 2;
          const pts = chartData
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
                <div className="h-[220px] w-full rounded-xl border border-slate-800 f2p-dark-tile">
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
                          itemStyle={{ color: chartColor }}
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
                          itemStyle={{ color: chartColor }}
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
                          stroke={chartColor}
                          strokeWidth={2.25}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          dot={{ fill: chartColor, r: 2.5, strokeWidth: 0 }}
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
        const latest = chartData[chartData.length - 1];
        if (!latest?.rawMetrics) return null;
        return <CMJAsymmetryStrip rawMetrics={latest.rawMetrics} />;
      })()}
      <SectionComment
        athleteId={athleteId}
        section="cmj"
        initialComment={sectionComment}
      />
    </section>
  );
}

export function buildCmjDataPoints(
  sessions: SessionLite[],
  metricsBySession: Map<string, MetricLite[]>
): CMJDataPoint[] {
  const out: CMJDataPoint[] = [];
  const sorted = [...sessions].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });

  for (const s of sorted) {
    if (!s.session_date || !isCmjSession(s)) continue;

    const rows = metricsBySession.get(s.id) ?? [];
    const byRep = new Map<number, Record<string, number>>();
    for (const r of rows) {
      if (r.rep_index == null || r.value == null) continue;
      const k = r.key;
      if (!k.startsWith("fp_")) continue;
      const m = byRep.get(r.rep_index) ?? {};
      m[k] = r.value;
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
      if (score > bestScore) {
        bestScore = score;
        bestRep = m;
      }
    }

    if (!bestRep || bestScore === -Infinity) {
      const jhM = maxMetric(rows, "fp_jump_height");
      const jhCm = maxMetric(rows, "fp_jump_height_cm_best");
      const pi = maxMetric(rows, "fp_propulsive_impulse");
      const bi = maxMetric(rows, "fp_braking_impulse");
      const ppf = maxMetric(rows, "fp_peak_propulsive_force");
      const pbf = maxMetric(rows, "fp_peak_braking_force");
      const mrsi = maxMetric(rows, "fp_mrsi");
      if (
        jhM == null &&
        jhCm == null &&
        pi == null &&
        bi == null &&
        ppf == null &&
        pbf == null &&
        mrsi == null
      ) {
        continue;
      }
      const jhAgg = jhM != null ? jhM * 100 : jhCm;
      out.push({
        date: formatDisplayDate(s.session_date),
        t: new Date(s.session_date).getTime(),
        jump_height: jhAgg != null && Number.isFinite(jhAgg) ? jhAgg : null,
        propulsive_impulse: pi,
        braking_impulse: bi,
        peak_propulsive_force: ppf,
        peak_braking_force: pbf,
        mrsi,
        rawMetrics: extractRawLrMetrics(rows),
      });
      continue;
    }

    const jh =
      bestRep.fp_jump_height != null
        ? bestRep.fp_jump_height * 100
        : bestRep.fp_jump_height_cm_best ?? null;

    out.push({
      date: formatDisplayDate(s.session_date),
      t: new Date(s.session_date).getTime(),
      jump_height: jh != null && Number.isFinite(jh) ? jh : null,
      propulsive_impulse: bestRep.fp_propulsive_impulse ?? null,
      braking_impulse: bestRep.fp_braking_impulse ?? null,
      peak_propulsive_force: bestRep.fp_peak_propulsive_force ?? null,
      peak_braking_force: bestRep.fp_peak_braking_force ?? null,
      mrsi: bestRep.fp_mrsi ?? null,
      rawMetrics: extractRawLrMetrics(rows),
    });
  }
  return out;
}
