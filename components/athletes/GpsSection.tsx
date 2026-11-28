"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ZoomableChart from "@/components/charts/ZoomableChart";
import { formatDisplayDate } from "@/lib/dateDisplay";
import GpsSessionList from "./GpsSessionList";
import {
  sessionDisplayName,
  GPS_CATEGORY_ORDER,
  GPS_CORE_KEYS,
  GPS_TILE_KEYS,
  gpsMetricInfo,
  type GpsMetricInfo,
} from "@/lib/gpsMetrics";
import {
  CHART_AXIS_LINE,
  CHART_AXIS_TICK,
  CHART_GRID,
  CHART_TOOLTIP_STYLE,
  ChartDefs,
} from "./chartTheme";
import SectionComment from "./SectionComment";
import GpsWorkload, { WORKLOAD_METRICS } from "./GpsWorkload";
import GpsMaxVelocity, { type BestSpeed } from "./GpsMaxVelocity";
import GpsBandCharts from "./GpsBandCharts";
import {
  bandsFromThresholds,
  loadThresholds,
  saveThresholds,
  sessionBandDistances,
  SPEED_BUCKET_KEY,
} from "@/lib/speedBands";

type SessionLike = {
  id: string;
  session_date: string | null;
  test_sub_type: string | null;
  session_name?: string | null;
  external_name?: string | null;
};
type MetricLike = { key: string; value: number | null; rep_index?: number | null };

type Props = {
  athleteId: string;
  /** PlayerData sessions for this athlete, already filtered to the page date range. */
  sessions: SessionLike[];
  metricsBySession: Map<string, MetricLike[]>;
  sectionComment: string | null;
  /** All GPS sessions (unfiltered) for the EWMA workload, plus the page date range. */
  allSessions: SessionLike[];
  rangeStart: string | null;
  rangeEnd: string | null;
  /** Fastest 1080 sprint top speed (km/h) across all history, for max velocity. */
  sprintBest: BestSpeed | null;
};

/** One chart point per GPS session. */
type Point = {
  idx: number;
  sessionId: string;
  date: string;
  dateLabel: string;
  type: string;
  name: string;
  [metricKey: string]: number | string | null;
};

type TypeFilter = "all" | "Match" | "Training";

const LIME = "#84cc16";
const MEAN_STROKE = "#cbd5e1";

function fmt(v: number | null | undefined, unit: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = unit === "km/h" || unit === "m/s²" || unit === "m/s" || abs < 10 ? 1 : 0;
  return v.toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export default function GpsSection({
  athleteId,
  sessions,
  metricsBySession,
  sectionComment,
  allSessions,
  rangeStart,
  rangeEnd,
  sprintBest,
}: Props) {
  const [mvKph, setMvKph] = useState<number | null>(null);
  // Names typed in this view, applied before the page reloads its sessions
  const [renamed, setRenamed] = useState<Map<string, string | null>>(() => new Map());
  const nameOf = (s: SessionLike) =>
    sessionDisplayName({ ...s, session_name: renamed.has(s.id) ? renamed.get(s.id) : s.session_name });
  const namesByDate = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of allSessions) {
      if (!s.session_date) continue;
      const d = s.session_date.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), nameOf(s)]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSessions, renamed]);
  const [thresholds, setThresholds] = useState<number[]>(() => (typeof window === "undefined" ? [] : loadThresholds()));
  const bands = useMemo(() => bandsFromThresholds(thresholds.length ? thresholds : loadThresholds()), [thresholds]);
  const [hiddenBands, setHiddenBands] = useState<Set<string>>(() => new Set());
  const [showTotal, setShowTotal] = useState(true);
  const enabledBands = useMemo(() => new Set(bands.map((b) => b.id).filter((id) => !hiddenBands.has(id))), [bands, hiddenBands]);

  // Selected-band distance per session (all history), the load used by the workload panel.
  const bandLoad = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of allSessions) {
      const rows = (metricsBySession.get(s.id) ?? []).map((r) => ({ key: r.key, value: r.value, rep_index: r.rep_index ?? null }));
      const dist = sessionBandDistances(rows, bands);
      if (dist) out.set(s.id, dist.reduce((a, v, i) => a + (enabledBands.has(bands[i].id) ? v : 0), 0));
    }
    return out;
  }, [allSessions, metricsBySession, bands, enabledBands]);
  const bandLabel =
    enabledBands.size === bands.length
      ? "All speed bands"
      : enabledBands.size === 0
        ? "No bands selected"
        : bands.filter((b) => enabledBands.has(b.id)).map((b) => b.label.replace("Band ", "B")).join(" + ");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());

  const typesPresent = useMemo(
    () => new Set(sessions.map((s) => s.test_sub_type ?? "Other")),
    [sessions]
  );

  const points: Point[] = useMemo(() => {
    const list = sessions
      .filter((s) => s.session_date && (typeFilter === "all" || s.test_sub_type === typeFilter))
      .sort((a, b) => (a.session_date! < b.session_date! ? -1 : a.session_date! > b.session_date! ? 1 : a.id.localeCompare(b.id)));
    return list.map((s, idx) => {
      const p: Point = {
        idx,
        sessionId: s.id,
        date: s.session_date!.slice(0, 10),
        dateLabel: formatDisplayDate(s.session_date),
        type: s.test_sub_type ?? "",
        name: nameOf(s),
      };
      for (const m of metricsBySession.get(s.id) ?? []) {
        if (m.key.startsWith("gps_") && m.key !== SPEED_BUCKET_KEY && m.value != null) p[m.key] = Number(m.value);
      }
      return p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, metricsBySession, typeFilter, renamed]);

  /** Every gps_ metric with at least one non-zero value in range, grouped by category. */
  const { byCategory, infoByKey, hiddenEmpty } = useMemo(() => {
    const keys = new Set<string>();
    const nonZero = new Set<string>();
    for (const p of points) {
      for (const [k, v] of Object.entries(p)) {
        if (!k.startsWith("gps_")) continue;
        keys.add(k);
        if (typeof v === "number" && v !== 0) nonZero.add(k);
      }
    }
    const info = new Map<string, GpsMetricInfo>();
    const cats = new Map<string, GpsMetricInfo[]>();
    for (const k of nonZero) {
      const i = gpsMetricInfo(k);
      info.set(k, i);
      const arr = cats.get(i.category) ?? [];
      arr.push(i);
      cats.set(i.category, arr);
    }
    for (const arr of cats.values()) arr.sort((a, b) => a.label.localeCompare(b.label));
    return { byCategory: cats, infoByKey: info, hiddenEmpty: keys.size - nonZero.size };
  }, [points]);

  // Distance, HSR and sprint distance are charted in the workload panel, so they're left out here.
  // Top speed is charted in the max velocity block.
  const workloadKeys = new Set<string>([...WORKLOAD_METRICS.map((m) => m.key), "gps_total_distance_m", "gps_max_speed_kph"]);
  const coreMetrics = GPS_CORE_KEYS.filter((k) => infoByKey.has(k) && !workloadKeys.has(k)).map((k) => infoByKey.get(k)!);
  const tileMetrics = GPS_TILE_KEYS.filter((k) => infoByKey.has(k)).map((k) => infoByKey.get(k)!);
  const latest = points[points.length - 1] ?? null;

  // Fastest GPS session across all history (not just the range)
  const gpsBest: BestSpeed | null = useMemo(() => {
    let best: BestSpeed | null = null;
    for (const s of allSessions) {
      const v = (metricsBySession.get(s.id) ?? []).find((m) => m.key === "gps_max_speed_kph")?.value;
      if (v != null && s.session_date && (!best || Number(v) > best.kph)) {
        best = { kph: Number(v), date: s.session_date, source: "GPS" };
      }
    }
    return best;
  }, [allSessions, metricsBySession]);
  const bests = [gpsBest, sprintBest].filter((b): b is BestSpeed => b != null);
  const speedPoints = points.map((p) => ({
    idx: p.idx,
    date: p.date,
    dateLabel: p.dateLabel,
    type: p.type,
    name: p.name,
    speed: typeof p.gps_max_speed_kph === "number" ? (p.gps_max_speed_kph as number) : null,
  }));

  if (sessions.length === 0) return null;

  return (
    <section id="gps" className="scroll-mt-28 mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">GPS load</h2>
          <p className="mt-1 text-xs text-slate-500">
            PlayerData · {points.length} session{points.length === 1 ? "" : "s"} in range
            {latest ? ` · latest ${latest.dateLabel}${latest.type ? ` (${latest.type})` : ""}` : ""}
          </p>
        </div>
        {typesPresent.size > 1 ? (
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
            {(["all", "Match", "Training"] as TypeFilter[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={
                  t === typeFilter
                    ? "rounded-md bg-slate-900 px-2.5 py-1 text-white"
                    : "rounded-md px-2.5 py-1 text-slate-500 hover:text-slate-800"
                }
              >
                {t === "all" ? "All sessions" : t}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {points.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">No {typeFilter.toLowerCase()} sessions in this date range.</p>
      ) : (
        <>
          {/* Latest session vs average in range */}
          {latest && tileMetrics.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {tileMetrics.map((m) => {
                const v = typeof latest[m.key] === "number" ? (latest[m.key] as number) : null;
                const avg = mean(points.map((p) => p[m.key]).filter((x): x is number => typeof x === "number"));
                const delta = v != null && avg ? ((v - avg) / avg) * 100 : null;
                return (
                  <div key={m.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[0.7rem] font-medium uppercase tracking-wide text-slate-400">{m.label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                      {fmt(v, m.unit)}
                      {m.unit ? <span className="ml-1 text-xs font-normal text-slate-400">{m.unit}</span> : null}
                    </p>
                    {m.key === "gps_max_speed_kph" && v != null && mvKph ? (
                      <p className={`text-xs tabular-nums ${v / mvKph >= 0.9 ? "text-lime-700" : "text-slate-500"}`}>
                        {Math.round((v / mvKph) * 100)}% of max velocity
                      </p>
                    ) : delta != null && points.length > 1 ? (
                      <p className={`text-xs tabular-nums ${delta >= 0 ? "text-lime-700" : "text-slate-500"}`}>
                        {delta >= 0 ? "+" : ""}
                        {delta.toFixed(0)}% vs avg {fmt(avg, m.unit)}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          <GpsBandCharts
            sessions={allSessions}
            namesByDate={namesByDate}
            metricsBySession={metricsBySession}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            bands={bands}
            enabled={enabledBands}
            onToggleBand={(id) =>
              setHiddenBands((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            showTotal={showTotal}
            onToggleTotal={() => setShowTotal((v) => !v)}
            thresholds={thresholds.length ? thresholds : bands.slice(1).map((b) => b.from)}
            onThresholds={(t) => {
              saveThresholds(t);
              setThresholds(t);
              setHiddenBands(new Set());
            }}
          />

          <GpsWorkload
            athleteId={athleteId}
            namesByDate={namesByDate}
            bandLoad={bandLoad.size > 0 ? bandLoad : null}
            bandLabel={bandLabel}
            sessions={allSessions}
            metricsBySession={metricsBySession}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
          />

          <GpsMaxVelocity athleteId={athleteId} points={speedPoints} bests={bests} onMaxVelocity={setMvKph} />

          <GpsSessionList
            rows={sessions.map((s) => {
              const ms = metricsBySession.get(s.id) ?? [];
              const top = ms.find((m) => m.key === "gps_max_speed_kph")?.value;
              return {
                id: s.id,
                session_date: s.session_date,
                test_sub_type: s.test_sub_type,
                session_name: renamed.has(s.id) ? renamed.get(s.id) : s.session_name,
                external_name: s.external_name,
                distance: ms.find((m) => m.key === "gps_total_distance_m")?.value ?? null,
                topSpeed: top ?? null,
                pctMv: top != null && mvKph ? (Number(top) / mvKph) * 100 : null,
              };
            })}
            onRenamed={(id, name) => setRenamed((prev) => new Map(prev).set(id, name))}
          />

          {/* Headline charts */}
          {coreMetrics.length > 0 ? (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {coreMetrics.map((m) => (
                <GpsMetricChart key={m.key} metric={m} points={points} height={190} />
              ))}
            </div>
          ) : null}

          {/* Every metric, by category */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">All GPS metrics</h3>
              {hiddenEmpty > 0 ? (
                <p className="text-[0.7rem] text-slate-400">{hiddenEmpty} metrics with no data hidden</p>
              ) : null}
            </div>
            <div className="mt-2 space-y-2">
              {GPS_CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => {
                const metrics = byCategory.get(cat)!;
                const open = openCategories.has(cat);
                return (
                  <div key={cat} className="rounded-xl border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenCategories((prev) => {
                          const next = new Set(prev);
                          if (next.has(cat)) next.delete(cat);
                          else next.add(cat);
                          return next;
                        })
                      }
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <span className="text-sm font-medium text-slate-800">
                        {cat}
                        <span className="ml-2 text-xs font-normal text-slate-400">{metrics.length} metrics</span>
                      </span>
                      <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
                    </button>
                    {open ? (
                      <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-3">
                        {metrics.map((m) => (
                          <GpsMetricChart key={m.key} metric={m} points={points} height={150} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="mt-4">
        <SectionComment athleteId={athleteId} section="gps" initialComment={sectionComment} />
      </div>
    </section>
  );
}

/**
 * One GPS metric over sessions. Bars for amounts, line for peaks and rates,
 * dashed line at the average for the range. Built on ComposedChart so a
 * second series (e.g. chronic workload on a right axis) can be layered on.
 */
function GpsMetricChart({ metric, points, height }: { metric: GpsMetricInfo; points: Point[]; height: number }) {
  const values = points.map((p) => p[metric.key]).filter((v): v is number => typeof v === "number");
  const avg = mean(values);
  const title = metric.unit ? `${metric.label} (${metric.unit})` : metric.label;
  const tickByIdx = new Map(points.map((p) => [p.idx, p.dateLabel]));

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{title}</p>
        {avg != null ? <p className="text-[0.7rem] tabular-nums text-slate-400">avg {fmt(avg, metric.unit)}</p> : null}
      </div>
      <ZoomableChart title={title} height={height} className="w-full rounded-xl border border-slate-200 bg-white">
        {(h) => (
          <ResponsiveContainer width="100%" height={h}>
            <ComposedChart data={points} margin={{ top: 10, right: 12, left: -8, bottom: -10 }}>
              {ChartDefs}
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="idx"
                type="number"
                domain={[-0.5, Math.max(points.length - 0.5, 0.5)]}
                ticks={points.map((p) => p.idx)}
                tickFormatter={(i: number) => tickByIdx.get(i) ?? ""}
                tick={CHART_AXIS_TICK}
                axisLine={CHART_AXIS_LINE}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={CHART_AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={metric.kind === "intensity" ? ["auto", "auto"] : [0, "auto"]}
                tickFormatter={(v: number) => fmt(v, metric.unit)}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "#94a3b8" }}
                itemStyle={{ color: "#e2e8f0" }}
                labelFormatter={(i) => {
                  const p = points[Number(i)];
                  return p ? `${p.dateLabel} · ${p.name}` : "";
                }}
                formatter={(v) => [`${fmt(Number(v), metric.unit)}${metric.unit ? ` ${metric.unit}` : ""}`, metric.label]}
              />
              {avg != null ? (
                <ReferenceLine y={avg} stroke={MEAN_STROKE} strokeDasharray="4 4" ifOverflow="extendDomain" />
              ) : null}
              {metric.kind === "volume" ? (
                <Bar dataKey={metric.key} fill="url(#f2pBar)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              ) : (
                <Line
                  dataKey={metric.key}
                  stroke={LIME}
                  strokeWidth={2.5}
                  dot={{ r: 5, fill: LIME, stroke: "#fff", strokeWidth: 1.5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ZoomableChart>
    </div>
  );
}
