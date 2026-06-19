"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDisplayDate } from "@/lib/dateDisplay";
import { lsiColorClass, SIDE_COLORS } from "@/lib/sideColors";
import ChartTypeToggle, { type ChartType } from "./ChartTypeToggle";
import SectionComment from "./SectionComment";

export type SLDJDataPoint = {
  date: string;
  t: number;
  rsi_left: number | null;
  rsi_right: number | null;
  jh_left: number | null; // cm
  jh_right: number | null; // cm
  ct_left: number | null; // ms
  ct_right: number | null; // ms
};

type SLDJMetricKey = "rsi" | "jh" | "ct";

const SLDJ_METRICS: {
  key: SLDJMetricKey;
  label: string;
  unit: string;
  decimals: number;
}[] = [
  { key: "rsi", label: "RSI", unit: "", decimals: 3 },
  { key: "jh", label: "Jump Height", unit: "cm", decimals: 1 },
  { key: "ct", label: "Contact Time", unit: "ms", decimals: 0 },
];

const SLDJ_DEFAULT = new Set<string>(["rsi", "jh", "ct"]);

const AXIS_TICK = { fill: "#64748b", fontSize: 10 };
const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "0.375rem",
  fontSize: "11px",
};

function fieldFor(key: SLDJMetricKey, side: "left" | "right"): keyof SLDJDataPoint {
  return `${key}_${side}` as keyof SLDJDataPoint;
}

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

function SLDJAsymmetryStrip({ latest }: { latest: SLDJDataPoint }) {
  const pairs = SLDJ_METRICS.map((m) => ({
    ...m,
    lv: latest[fieldFor(m.key, "left")] as number | null,
    rv: latest[fieldFor(m.key, "right")] as number | null,
  })).filter((p) => p.lv != null && p.rv != null);

  if (pairs.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Left / Right Asymmetry — Latest Session
      </p>
      {pairs.map((p) => {
        const lv = p.lv!;
        const rv = p.rv!;
        const total = lv + rv;
        const leftPct = total > 0 ? (lv / total) * 100 : 50;
        const rightPct = 100 - leftPct;
        const stronger = Math.max(lv, rv);
        const lsiVal = stronger === 0 ? 100 : (Math.min(lv, rv) / stronger) * 100;
        const fmt = (n: number) =>
          p.decimals === 0 ? String(Math.round(n)) : n.toFixed(p.decimals);
        return (
          <div key={p.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-400">
                {p.label}
                {p.unit ? ` (${p.unit})` : ""}
              </span>
              <span className={`font-mono text-xs ${lsiColorClass(lsiVal)}`}>
                LSI {lsiVal.toFixed(1)}%
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full">
              <div
                className="transition-all"
                style={{ width: `${leftPct}%`, backgroundColor: SIDE_COLORS.left }}
                title={`Left ${fmt(lv)}`}
              />
              <div
                className="transition-all"
                style={{ width: `${rightPct}%`, backgroundColor: SIDE_COLORS.right }}
                title={`Right ${fmt(rv)}`}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
              <span>L {fmt(lv)}</span>
              <span>R {fmt(rv)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  athleteId: string;
  data: SLDJDataPoint[];
  sectionComment: string | null;
};

export default function ForcePlateSingleLegDJSection({
  athleteId,
  data,
  sectionComment,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(SLDJ_DEFAULT));
  const [chartType, setChartType] = useState<ChartType>("bar");

  const chartRows = useMemo(() => [...data].sort((a, b) => a.t - b.t), [data]);
  const selectedMetrics = useMemo(
    () => SLDJ_METRICS.filter((m) => selected.has(m.key)),
    [selected]
  );

  if (data.length === 0) return null;

  const latest = chartRows[chartRows.length - 1] ?? null;

  return (
    <section id="drop_jump_single" className="scroll-mt-28 mt-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
            Force plate — Single-leg drop jump
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Left vs right per session ·{" "}
            <span style={{ color: SIDE_COLORS.left }}>Left</span> /{" "}
            <span style={{ color: SIDE_COLORS.right }}>Right</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ChartTypeToggle value={chartType} onChange={setChartType} />
          <MetricPicker
            metrics={SLDJ_METRICS}
            defaultSelected={SLDJ_DEFAULT}
            selected={selected}
            onChange={setSelected}
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {selectedMetrics.map((metric) => {
          const pts = chartRows
            .map((row) => {
              const l = row[fieldFor(metric.key, "left")] as number | null;
              const r = row[fieldFor(metric.key, "right")] as number | null;
              const lOk = l != null && Number.isFinite(l);
              const rOk = r != null && Number.isFinite(r);
              if (!lOk && !rOk) return null;
              return { date: row.date, left: lOk ? l : null, right: rOk ? r : null };
            })
            .filter(Boolean) as {
            date: string;
            left: number | null;
            right: number | null;
          }[];
          const enough = pts.length >= 1;
          const fmtNum = (n: number) =>
            metric.decimals === 0 ? String(Math.round(n)) : n.toFixed(metric.decimals);
          const tooltipFormatter = (value: number | string) => {
            const n = typeof value === "number" ? value : Number(value);
            if (!Number.isFinite(n)) return String(value);
            return metric.unit ? `${fmtNum(n)} ${metric.unit}` : fmtNum(n);
          };
          return (
            <div key={metric.key}>
              <p className="mb-2 text-xs text-slate-400">
                {metric.label}
                {metric.unit ? ` (${metric.unit})` : ""}
              </p>
              {!enough ? (
                <p className="py-12 text-center text-xs text-slate-500">Not enough data</p>
              ) : (
                <div className="h-[150px] w-full rounded border border-slate-800 bg-[#0f172a]">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartType === "bar" ? (
                      <BarChart data={pts} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={AXIS_TICK} />
                        <YAxis tick={AXIS_TICK} width={36} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelStyle={{ color: "#94a3b8" }}
                          formatter={tooltipFormatter}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="left" name="Left" fill={SIDE_COLORS.left} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="right" name="Right" fill={SIDE_COLORS.right} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    ) : (
                      <LineChart data={pts} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={AXIS_TICK} />
                        <YAxis tick={AXIS_TICK} width={36} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelStyle={{ color: "#94a3b8" }}
                          formatter={tooltipFormatter}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line
                          type="monotone"
                          dataKey="left"
                          name="Left"
                          stroke={SIDE_COLORS.left}
                          strokeWidth={2}
                          dot={{ fill: SIDE_COLORS.left, r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="right"
                          name="Right"
                          stroke={SIDE_COLORS.right}
                          strokeWidth={2}
                          dot={{ fill: SIDE_COLORS.right, r: 3 }}
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
      {latest ? <SLDJAsymmetryStrip latest={latest} /> : null}
      <SectionComment
        athleteId={athleteId}
        section="drop_jump_single"
        initialComment={sectionComment}
      />
    </section>
  );
}

type SLDJSessionLite = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type?: string | null;
};

type SLDJMetricLite = { key: string; value: number | null; side?: string | null };

function aggBySide(
  rows: SLDJMetricLite[],
  key: string,
  side: "left" | "right",
  mode: "max" | "min"
): number | null {
  let acc: number | null = null;
  for (const r of rows) {
    if (r.key !== key) continue;
    if ((r.side ?? "").toLowerCase() !== side) continue;
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    acc = acc == null ? v : mode === "min" ? Math.min(acc, v) : Math.max(acc, v);
  }
  return acc;
}

export function buildSingleLegDjSeries(
  sessions: SLDJSessionLite[],
  metricsBySession: Map<string, SLDJMetricLite[]>
): SLDJDataPoint[] {
  const out: SLDJDataPoint[] = [];
  const sorted = [...sessions].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });

  for (const s of sorted) {
    if (!s.session_date) continue;
    if ((s.test_type ?? "").toLowerCase() !== "force_plate_dj_single") continue;

    const rows = metricsBySession.get(s.id) ?? [];
    const rsiL = aggBySide(rows, "fp_rsi_best", "left", "max");
    const rsiR = aggBySide(rows, "fp_rsi_best", "right", "max");
    const jhLm = aggBySide(rows, "fp_jump_height", "left", "max");
    const jhRm = aggBySide(rows, "fp_jump_height", "right", "max");
    const ctLs = aggBySide(rows, "fp_contact_time", "left", "min");
    const ctRs = aggBySide(rows, "fp_contact_time", "right", "min");

    if (
      rsiL == null &&
      rsiR == null &&
      jhLm == null &&
      jhRm == null &&
      ctLs == null &&
      ctRs == null
    ) {
      continue;
    }

    out.push({
      date: formatDisplayDate(s.session_date),
      t: new Date(s.session_date).getTime(),
      rsi_left: rsiL,
      rsi_right: rsiR,
      jh_left: jhLm != null ? jhLm * 100 : null,
      jh_right: jhRm != null ? jhRm * 100 : null,
      ct_left: ctLs != null ? ctLs * 1000 : null,
      ct_right: ctRs != null ? ctRs * 1000 : null,
    });
  }

  return out;
}
