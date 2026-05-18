"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ATHLETE_COMPARE_LINE_COLORS,
  anyLRDataAcrossProfiles,
  anyLRDataForMetric,
  athleteDisplayName,
  buildAthleteCompareSeries,
  buildAthleteLRSeries,
  COMPARE_LR_METRICS,
  COMPARE_METRIC_LABELS,
  latestValue,
  lrEligibleSessionsForAthlete,
  lrLatestForMetric,
  mergeLRLsiRowsForMetric,
  mergeLRPerLegRowsForMetric,
  mergeTrendRowsForMetric,
  radarScoresForLatest,
  type AthleteCompareSeries,
  type AthleteLRSeries,
  type CompareLRMetricId,
  type CompareMetricId,
  type LREligibleSession,
  type LRRepAggregate,
} from "@/lib/athleteCompareCharts";
import LRStartingLegEditor from "@/components/athletes/LRStartingLegEditor";
import {
  COMPARE_METRICS,
  compareMetricUnit,
  type AthleteRawBundle,
  type MetricGroup,
} from "@/lib/compareMetrics";
import { formatChartAxisDate } from "@/lib/athleteReportData";

type AthleteOpt = { id: string; first_name: string | null; last_name: string | null };

export type { AthleteRawBundle } from "@/lib/compareMetrics";

type ChartView = "trends" | "current" | "overview";
type TopTab = MetricGroup | "overview" | "lr";
type LRSubView = "lsi" | "perLeg" | "latest";

const GROUP_PRIORITY: MetricGroup[] = ["sprint", "cod", "jump", "reactive", "hop"];

const GROUP_TAB_LABEL: Record<MetricGroup, string> = {
  sprint: "Sprint",
  cod: "COD",
  jump: "Jump",
  reactive: "Reactive",
  hop: "Hop",
};

const LR_REFERENCE_LSI = 90;

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(30 41 59)",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

const shellClass = "rounded-lg border border-slate-800 bg-slate-900/50 p-4";

/** True if this athlete has ≥1 finite point for the metric (absence ≠ zero). */
function athleteHasMetricPoint(prof: AthleteCompareSeries, metricId: CompareMetricId): boolean {
  const pts = prof.series[metricId];
  if (!pts?.length) return false;
  return pts.some((p) => p.v != null && Number.isFinite(p.v));
}

/**
 * True iff at least one selected athlete has ≥1 data point for at least one metric in `group`.
 */
function groupHasComparableData(profiles: AthleteCompareSeries[], group: MetricGroup): boolean {
  return COMPARE_METRICS.some(
    (def) =>
      def.group === group &&
      profiles.some((p) => athleteHasMetricPoint(p, def.id as CompareMetricId))
  );
}

function metricIdsForGroup(group: MetricGroup): CompareMetricId[] {
  return COMPARE_METRICS.filter((m) => m.group === group).map((m) => m.id as CompareMetricId);
}

/** Athletes who have ≥1 finite Y value in this trend dataset (omit lines for complete absence). */
function athleteIdsWithTrendLineData(
  rows: Array<{ t: number; label: string; [k: string]: unknown }>,
  ids: string[]
): string[] {
  return ids.filter((id) =>
    rows.some((row) => {
      const v = row[id];
      return typeof v === "number" && Number.isFinite(v);
    })
  );
}

/** Athletes with ≥1 finite normalised score in radar rows (omit empty polygons). */
function athleteIdsWithRadarPolygon(
  rows: Array<Record<string, string | number | null>>,
  ids: string[]
): string[] {
  return ids.filter((id) =>
    rows.some((row) => {
      const v = row[id];
      return typeof v === "number" && Number.isFinite(v);
    })
  );
}

function SmallMultLine({
  title,
  data,
  athleteIds,
  unit,
  nameById,
  plotAthleteIds,
}: {
  title: string;
  data: { t: number; label: string; [k: string]: number | string | null }[];
  athleteIds: string[];
  /** Subset of `athleteIds` that have ≥1 point; lines omitted for others. */
  plotAthleteIds: string[];
  unit: string;
  nameById: Map<string, string>;
}) {
  const colorIndex = (id: string) => athleteIds.indexOf(id);
  return (
    <div className={shellClass}>
      <h3 className="mb-2 text-xs font-medium text-slate-400">{title}</h3>
      <div className="h-52 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts: number) =>
                formatChartAxisDate(typeof ts === "number" ? new Date(ts).toISOString() : null)
              }
              stroke="#64748b"
              tick={AXIS_TICK}
            />
            <YAxis
              stroke="#64748b"
              tick={AXIS_TICK}
              label={{ value: unit, angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e2e8f0" }} />
            <Legend formatter={(v) => nameById.get(String(v)) ?? String(v)} wrapperStyle={{ fontSize: 11 }} />
            {plotAthleteIds.map((id) => {
              const i = colorIndex(id);
              const ci = i >= 0 ? i % ATHLETE_COMPARE_LINE_COLORS.length : 0;
              return (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  name={nameById.get(id) ?? id}
                  stroke={ATHLETE_COMPARE_LINE_COLORS[ci]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** LSI% line chart for one LR metric, with a horizontal reference line. */
function SmallMultLRLsi({
  title,
  data,
  athleteIds,
  plotAthleteIds,
  nameById,
  threshold,
}: {
  title: string;
  data: { t: number; label: string; [k: string]: number | string | null }[];
  athleteIds: string[];
  plotAthleteIds: string[];
  nameById: Map<string, string>;
  threshold: number;
}) {
  const colorIndex = (id: string) => athleteIds.indexOf(id);
  return (
    <div className={shellClass}>
      <h3 className="mb-2 text-xs font-medium text-slate-400">{title}</h3>
      <div className="h-52 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts: number) =>
                formatChartAxisDate(typeof ts === "number" ? new Date(ts).toISOString() : null)
              }
              stroke="#64748b"
              tick={AXIS_TICK}
            />
            <YAxis
              stroke="#64748b"
              tick={AXIS_TICK}
              domain={[0, 100]}
              label={{ value: "LSI %", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e2e8f0" }} />
            <Legend formatter={(v) => nameById.get(String(v)) ?? String(v)} wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              y={threshold}
              stroke="#84cc16"
              strokeDasharray="4 4"
              label={{
                value: `${threshold}%`,
                position: "insideTopRight",
                fill: "#84cc16",
                fontSize: 10,
              }}
            />
            {plotAthleteIds.map((id) => {
              const i = colorIndex(id);
              const ci = i >= 0 ? i % ATHLETE_COMPARE_LINE_COLORS.length : 0;
              return (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  name={nameById.get(id) ?? id}
                  stroke={ATHLETE_COMPARE_LINE_COLORS[ci]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Per-leg trend for one LR metric: solid line = Right, dashed = Left, colour per athlete. */
function SmallMultLRPerLeg({
  title,
  data,
  athleteIds,
  plotAthleteIds,
  unit,
  nameById,
}: {
  title: string;
  data: { t: number; label: string; [k: string]: number | string | null }[];
  athleteIds: string[];
  plotAthleteIds: string[];
  unit: string;
  nameById: Map<string, string>;
}) {
  const colorIndex = (id: string) => athleteIds.indexOf(id);
  return (
    <div className={shellClass}>
      <h3 className="mb-2 text-xs font-medium text-slate-400">{title}</h3>
      <div className="h-52 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts: number) =>
                formatChartAxisDate(typeof ts === "number" ? new Date(ts).toISOString() : null)
              }
              stroke="#64748b"
              tick={AXIS_TICK}
            />
            <YAxis
              stroke="#64748b"
              tick={AXIS_TICK}
              label={{ value: unit, angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e2e8f0" }} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v) => {
                const s = String(v);
                const isLeft = s.endsWith("__L");
                const id = s.replace(/__[LR]$/, "");
                const base = nameById.get(id) ?? id;
                return `${base} (${isLeft ? "L" : "R"})`;
              }}
            />
            {plotAthleteIds.flatMap((id) => {
              const i = colorIndex(id);
              const ci = i >= 0 ? i % ATHLETE_COMPARE_LINE_COLORS.length : 0;
              const color = ATHLETE_COMPARE_LINE_COLORS[ci];
              return [
                <Line
                  key={`${id}-R`}
                  type="monotone"
                  dataKey={`${id}__R`}
                  name={`${id}__R`}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />,
                <Line
                  key={`${id}-L`}
                  type="monotone"
                  dataKey={`${id}__L`}
                  name={`${id}__L`}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                  connectNulls={false}
                />,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatLrValue(v: number | null, unit: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "m/s" || unit === "m/s²") return v.toFixed(2);
  if (unit === "%") return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString();
}

/** Latest L vs R bar chart per athlete for one LR metric, with flag indicators. */
function LRLatestCard({
  title,
  unit,
  threshold,
  latest,
  nameById,
}: {
  title: string;
  unit: string;
  threshold: number;
  latest: ReturnType<typeof lrLatestForMetric>;
  nameById: Map<string, string>;
}) {
  const rows = latest.filter((row) => row.left != null && row.right != null);
  const data = rows.map((row) => ({
    athleteId: row.athleteId,
    label: nameById.get(row.athleteId) ?? row.athleteId,
    Left: row.left,
    Right: row.right,
    pctDiff: row.pctDiff,
    flagged: row.flagged,
    date: row.dateLabel,
    startingLeg: row.lrStartingLeg,
    swapped: row.lrSideSwap,
  }));

  return (
    <div className={shellClass}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-medium text-slate-400">{title}</h3>
        <span className="text-[10px] text-slate-500">flag &gt; {threshold}% diff</span>
      </div>
      {data.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">
          No LR session with both sides for this metric.
        </p>
      ) : (
        <>
          <div className="h-52 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 24 }}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  tick={AXIS_TICK}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={40}
                />
                <YAxis
                  stroke="#64748b"
                  tick={AXIS_TICK}
                  label={{ value: unit, angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Left" fill="#38bdf8" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Right" fill="#84cc16" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1">
            {data.map((d) => (
              <div key={d.athleteId} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-400">
                  {d.label}
                  {d.startingLeg ? (
                    <span className="rounded border border-slate-700 bg-slate-900 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-slate-400">
                      Started {d.startingLeg === "left" ? "L" : "R"}
                    </span>
                  ) : null}
                  {d.swapped ? (
                    <span
                      className="rounded border border-rose-700 bg-rose-950/50 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-rose-300"
                      title="L/R labels swapped from 1080's recording"
                    >
                      Swap
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 font-mono text-slate-300">
                  <span>L {formatLrValue(d.Left, unit)}</span>
                  <span>R {formatLrValue(d.Right, unit)}</span>
                  <span
                    className={d.flagged ? "text-rose-400 font-semibold" : "text-slate-500"}
                  >
                    Δ {d.pctDiff != null ? d.pctDiff.toFixed(1) : "—"}%
                    {d.flagged ? " ⚠" : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function AthleteCompareChartPanel({
  athletes,
  bundles,
  athleteIdsOrdered,
  onUpdateLrStartingLeg,
  onUpdateLrSideSwap,
}: {
  athletes: AthleteOpt[];
  bundles: Map<string, AthleteRawBundle>;
  athleteIdsOrdered: string[];
  /** Phase D-B: save callback for the LR starting-leg editor. */
  onUpdateLrStartingLeg?: (
    athleteId: string,
    sessionId: string,
    value: "left" | "right" | null
  ) => void | Promise<void>;
  /** Phase D-C: save callback for the LR side-swap toggle. */
  onUpdateLrSideSwap?: (
    athleteId: string,
    sessionId: string,
    value: boolean
  ) => void | Promise<void>;
}) {
  const [view, setView] = useState<ChartView>("trends");
  const [activeTopTab, setActiveTopTab] = useState<TopTab>("sprint");
  const [lrSubView, setLrSubView] = useState<LRSubView>("lsi");
  const [lrPending, setLrPending] = useState<Set<string>>(() => new Set());
  const [lrRepAgg, setLrRepAgg] = useState<LRRepAggregate>("max");
  const selectionKey = athleteIdsOrdered.join("|");
  const prevSelectionKey = useRef(selectionKey);

  const handleSaveLrLeg = useMemo(() => {
    if (!onUpdateLrStartingLeg) return undefined;
    return async (
      athleteId: string,
      sessionId: string,
      value: "left" | "right" | null
    ) => {
      const key = `leg:${athleteId}:${sessionId}`;
      setLrPending((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      try {
        await onUpdateLrStartingLeg(athleteId, sessionId, value);
      } finally {
        setLrPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    };
  }, [onUpdateLrStartingLeg]);

  const handleSaveLrSwap = useMemo(() => {
    if (!onUpdateLrSideSwap) return undefined;
    return async (athleteId: string, sessionId: string, value: boolean) => {
      const key = `swap:${athleteId}:${sessionId}`;
      setLrPending((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      try {
        await onUpdateLrSideSwap(athleteId, sessionId, value);
      } finally {
        setLrPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    };
  }, [onUpdateLrSideSwap]);

  const profiles: AthleteCompareSeries[] = useMemo(() => {
    const out: AthleteCompareSeries[] = [];
    for (const id of athleteIdsOrdered) {
      const raw = bundles.get(id);
      const a = athletes.find((x) => x.id === id);
      if (!raw || !a) continue;
      out.push(
        buildAthleteCompareSeries(id, a.first_name, a.last_name, raw.sessions, raw.metricsBySession, raw.hopTests)
      );
    }
    return out;
  }, [athletes, bundles, athleteIdsOrdered]);

  const lrProfiles: AthleteLRSeries[] = useMemo(() => {
    const out: AthleteLRSeries[] = [];
    for (const id of athleteIdsOrdered) {
      const raw = bundles.get(id);
      const a = athletes.find((x) => x.id === id);
      if (!raw || !a) continue;
      out.push(
        buildAthleteLRSeries(id, a.first_name, a.last_name, raw.sessions, raw.metricsBySession, raw.hopTests, lrRepAgg)
      );
    }
    return out;
  }, [athletes, bundles, athleteIdsOrdered, lrRepAgg]);

  const lrAvailable = useMemo(() => anyLRDataAcrossProfiles(lrProfiles), [lrProfiles]);

  /** LR-eligible sessions per athlete — used by the inline editor. */
  const lrSessionsByAthlete = useMemo(() => {
    const map = new Map<string, LREligibleSession[]>();
    for (const id of athleteIdsOrdered) {
      const raw = bundles.get(id);
      if (!raw) continue;
      map.set(id, lrEligibleSessionsForAthlete(id, raw));
    }
    return map;
  }, [athleteIdsOrdered, bundles]);

  const athleteIds = useMemo(() => profiles.map((p) => p.athleteId), [profiles]);
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) {
      m.set(p.athleteId, athleteDisplayName({ first_name: p.firstName, last_name: p.lastName }));
    }
    return m;
  }, [profiles]);

  const visibleGroupTabs = useMemo(
    () => GROUP_PRIORITY.filter((g) => groupHasComparableData(profiles, g)),
    [profiles]
  );

  const showOverviewTopTab = visibleGroupTabs.length >= 2;

  /** Representative metric ids for groups that currently have a visible tab. */
  const overviewRepresentativeMetricIds = useMemo(() => {
    return COMPARE_METRICS.filter(
      (m) => m.isRepresentative && visibleGroupTabs.includes(m.group)
    ).map((m) => m.id as CompareMetricId);
  }, [visibleGroupTabs]);

  useEffect(() => {
    if (visibleGroupTabs.length === 0 && !lrAvailable) return;
    const allowed: TopTab[] = [
      ...visibleGroupTabs,
      ...(showOverviewTopTab ? (["overview"] as const) : []),
      ...(lrAvailable ? (["lr"] as const) : []),
    ];

    if (prevSelectionKey.current !== selectionKey) {
      prevSelectionKey.current = selectionKey;
      const firstAllowed = visibleGroupTabs[0] ?? (lrAvailable ? "lr" : null);
      if (firstAllowed) setActiveTopTab(firstAllowed);
      setView("trends");
      setLrSubView("lsi");
      return;
    }

    setActiveTopTab((cur) => {
      if (allowed.includes(cur)) return cur;
      return visibleGroupTabs[0] ?? (lrAvailable ? "lr" : cur);
    });
  }, [selectionKey, visibleGroupTabs, showOverviewTopTab, lrAvailable]);

  const metricIdsInActiveGroup = useMemo((): CompareMetricId[] => {
    if (activeTopTab === "overview" || activeTopTab === "lr") return [];
    return metricIdsForGroup(activeTopTab);
  }, [activeTopTab]);

  const trendMultiples = useMemo(() => {
    return metricIdsInActiveGroup.map((metric) => ({
      metric,
      label: COMPARE_METRIC_LABELS[metric],
      rows: mergeTrendRowsForMetric(profiles, metric, athleteIds),
      unit: compareMetricUnit(metric),
    }));
  }, [profiles, athleteIds, metricIdsInActiveGroup]);

  const barRows = useMemo(() => {
    const rows: { metric: string; metricId: CompareMetricId }[] = [];
    for (const metric of metricIdsInActiveGroup) {
      const hasAny = athleteIds.some((id) => {
        const prof = profiles.find((p) => p.athleteId === id);
        if (!prof) return false;
        return latestValue(prof.series[metric]) != null;
      });
      if (!hasAny) continue;
      rows.push({ metric: COMPARE_METRIC_LABELS[metric], metricId: metric });
    }
    const data = rows.map((r) => {
      const row: Record<string, string | number | null> = { metric: r.metric };
      for (const id of athleteIds) {
        const prof = profiles.find((p) => p.athleteId === id);
        row[id] = prof ? latestValue(prof.series[r.metricId]) : null;
      }
      return row;
    });
    return { data };
  }, [profiles, athleteIds, metricIdsInActiveGroup]);

  const radarDataInGroup = useMemo(() => {
    const metrics = metricIdsInActiveGroup.filter((metric) =>
      athleteIds.some((id) => {
        const prof = profiles.find((p) => p.athleteId === id);
        return prof && latestValue(prof.series[metric]) != null;
      })
    );
    return metrics.map((metric) => {
      const row: Record<string, string | number | null> = {
        metric: COMPARE_METRIC_LABELS[metric],
      };
      const scores = radarScoresForLatest(profiles, metric, athleteIds);
      for (const id of athleteIds) {
        row[id] = scores.get(id) ?? null;
      }
      return row;
    });
  }, [profiles, athleteIds, metricIdsInActiveGroup]);

  const athleteIdsInGroupRadar = useMemo(
    () => athleteIdsWithRadarPolygon(radarDataInGroup, athleteIds),
    [radarDataInGroup, athleteIds]
  );

  const radarDataOverview = useMemo(() => {
    const metrics = overviewRepresentativeMetricIds.filter((metric) =>
      athleteIds.some((id) => {
        const prof = profiles.find((p) => p.athleteId === id);
        return prof && latestValue(prof.series[metric]) != null;
      })
    );
    return metrics.map((metric) => {
      const row: Record<string, string | number | null> = {
        metric: COMPARE_METRIC_LABELS[metric],
      };
      const scores = radarScoresForLatest(profiles, metric, athleteIds);
      for (const id of athleteIds) {
        row[id] = scores.get(id) ?? null;
      }
      return row;
    });
  }, [profiles, athleteIds, overviewRepresentativeMetricIds]);

  const athleteIdsInOverviewRadar = useMemo(
    () => athleteIdsWithRadarPolygon(radarDataOverview, athleteIds),
    [radarDataOverview, athleteIds]
  );

  const segmented = (v: ChartView, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => setView(v)}
      disabled={athleteIds.length < 2}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
        view === v
          ? "bg-lime-500/25 text-lime-200 ring-1 ring-lime-500/50"
          : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
      } disabled:opacity-40`}
    >
      {label}
    </button>
  );

  const topTabButton = (tab: TopTab) => {
    const label =
      tab === "overview" ? "Overview" : tab === "lr" ? "Left/Right" : GROUP_TAB_LABEL[tab];
    const active = activeTopTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => {
          setActiveTopTab(tab);
          if (tab === "lr") {
            setLrSubView("lsi");
          } else if (tab !== "overview") {
            setView("trends");
          }
        }}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          active
            ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
            : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
        }`}
      >
        {label}
      </button>
    );
  };

  const inRange = athleteIds.length >= 2 && athleteIds.length <= 6;
  const noComparableData = inRange && visibleGroupTabs.length === 0 && !lrAvailable;
  const anyTabVisible = inRange && (visibleGroupTabs.length > 0 || lrAvailable);

  return (
    <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      {noComparableData ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No comparable test data for the selected athletes yet.
        </p>
      ) : anyTabVisible ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comparison charts</h2>
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
              {visibleGroupTabs.map((t) => topTabButton(t))}
              {showOverviewTopTab ? topTabButton("overview") : null}
              {lrAvailable ? topTabButton("lr") : null}
            </div>
          </div>

          {activeTopTab !== "overview" && activeTopTab !== "lr" && (
            <div className="mt-3 flex flex-wrap justify-end gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
              {segmented("trends", "Trends")}
              {segmented("current", "Current session")}
              {segmented("overview", "Overview")}
            </div>
          )}

          {activeTopTab !== "overview" && activeTopTab !== "lr" && view === "trends" && (
            <>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {trendMultiples.map((tm) => (
                  <SmallMultLine
                    key={tm.metric}
                    title={tm.label}
                    data={tm.rows}
                    athleteIds={athleteIds}
                    plotAthleteIds={athleteIdsWithTrendLineData(tm.rows, athleteIds)}
                    unit={tm.unit}
                    nameById={nameById}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">Trend over the selected date range.</p>
            </>
          )}

          {activeTopTab !== "overview" && activeTopTab !== "lr" && view === "current" && (
            <>
              <div className={`mt-4 ${shellClass}`}>
                <div className="h-80 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barRows.data} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
                      <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="metric"
                        stroke="#64748b"
                        tick={AXIS_TICK}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={70}
                      />
                      <YAxis stroke="#64748b" tick={AXIS_TICK} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend
                        formatter={(value) => nameById.get(String(value)) ?? String(value)}
                        wrapperStyle={{ fontSize: 11 }}
                      />
                      {athleteIds.map((id, i) => (
                        <Bar
                          key={id}
                          dataKey={id}
                          name={nameById.get(id) ?? id}
                          fill={ATHLETE_COMPARE_LINE_COLORS[i % ATHLETE_COMPARE_LINE_COLORS.length]}
                          radius={[2, 2, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Latest session values per athlete.</p>
            </>
          )}

          {activeTopTab !== "overview" && activeTopTab !== "lr" && view === "overview" && (
            <>
              <div className={`mt-4 ${shellClass}`}>
                {radarDataInGroup.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No metrics in this group have data for any selected athlete yet.
                  </p>
                ) : (
                  <div className="h-96 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarDataInGroup} cx="50%" cy="50%" outerRadius="75%">
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend
                          formatter={(value) => nameById.get(String(value)) ?? String(value)}
                          wrapperStyle={{ fontSize: 11 }}
                        />
                        {athleteIdsInGroupRadar.map((id) => {
                          const i = athleteIds.indexOf(id);
                          const ci = i >= 0 ? i % ATHLETE_COMPARE_LINE_COLORS.length : 0;
                          return (
                            <Radar
                              key={id}
                              name={nameById.get(id) ?? id}
                              dataKey={id}
                              stroke={ATHLETE_COMPARE_LINE_COLORS[ci]}
                              fill={ATHLETE_COMPARE_LINE_COLORS[ci]}
                              fillOpacity={0.15}
                              strokeWidth={2}
                              connectNulls
                            />
                          );
                        })}
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Latest session, normalised. Larger shape = stronger overall profile.
              </p>
            </>
          )}

          {activeTopTab === "overview" && (
            <>
              <div className={`mt-4 ${shellClass}`}>
                {radarDataOverview.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No representative metrics have data for any selected athlete yet.
                  </p>
                ) : (
                  <div className="h-96 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarDataOverview} cx="50%" cy="50%" outerRadius="75%">
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend
                          formatter={(value) => nameById.get(String(value)) ?? String(value)}
                          wrapperStyle={{ fontSize: 11 }}
                        />
                        {athleteIdsInOverviewRadar.map((id) => {
                          const i = athleteIds.indexOf(id);
                          const ci = i >= 0 ? i % ATHLETE_COMPARE_LINE_COLORS.length : 0;
                          return (
                            <Radar
                              key={id}
                              name={nameById.get(id) ?? id}
                              dataKey={id}
                              stroke={ATHLETE_COMPARE_LINE_COLORS[ci]}
                              fill={ATHLETE_COMPARE_LINE_COLORS[ci]}
                              fillOpacity={0.15}
                              strokeWidth={2}
                              connectNulls
                            />
                          );
                        })}
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                One representative metric per visible group. Latest session, normalised 0–100.
              </p>
            </>
          )}
          {activeTopTab === "lr" && (
            <>
              <LRStartingLegEditor
                athleteIds={athleteIds}
                nameById={nameById}
                sessionsByAthlete={lrSessionsByAthlete}
                onSaveLeg={handleSaveLrLeg}
                onSaveSwap={handleSaveLrSwap}
                pending={lrPending}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">
                  Use{" "}
                  <span className="font-mono text-slate-400">
                    {lrRepAgg === "avg" ? "average" : "best"} rep
                  </span>{" "}
                  per session
                </span>
                <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
                  <button
                    type="button"
                    onClick={() => setLrRepAgg("max")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      lrRepAgg === "max"
                        ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Best rep
                  </button>
                  <button
                    type="button"
                    onClick={() => setLrRepAgg("avg")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      lrRepAgg === "avg"
                        ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Average
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
                <button
                  type="button"
                  onClick={() => setLrSubView("lsi")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    lrSubView === "lsi"
                      ? "bg-lime-500/25 text-lime-200 ring-1 ring-lime-500/50"
                      : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  LSI Trends
                </button>
                <button
                  type="button"
                  onClick={() => setLrSubView("perLeg")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    lrSubView === "perLeg"
                      ? "bg-lime-500/25 text-lime-200 ring-1 ring-lime-500/50"
                      : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Per-leg Trends
                </button>
                <button
                  type="button"
                  onClick={() => setLrSubView("latest")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    lrSubView === "latest"
                      ? "bg-lime-500/25 text-lime-200 ring-1 ring-lime-500/50"
                      : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Latest Session
                </button>
              </div>

              {lrSubView === "lsi" && (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {COMPARE_LR_METRICS.filter((def) =>
                      anyLRDataForMetric(lrProfiles, def.id as CompareLRMetricId)
                    ).map((def) => {
                      const rows = mergeLRLsiRowsForMetric(
                        lrProfiles,
                        def.id as CompareLRMetricId,
                        athleteIds,
                        lrRepAgg
                      );
                      return (
                        <SmallMultLRLsi
                          key={def.id}
                          title={`LSI — ${def.label}`}
                          data={rows}
                          athleteIds={athleteIds}
                          plotAthleteIds={athleteIdsWithTrendLineData(rows, athleteIds)}
                          nameById={nameById}
                          threshold={LR_REFERENCE_LSI}
                        />
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Limb Symmetry Index over time. Dashed line at {LR_REFERENCE_LSI}% is the clinical
                    return-to-sport reference. 1080 Motion side labels are used as-is.
                  </p>
                </>
              )}

              {lrSubView === "perLeg" && (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {COMPARE_LR_METRICS.filter((def) =>
                      anyLRDataForMetric(lrProfiles, def.id as CompareLRMetricId)
                    ).map((def) => {
                      const rows = mergeLRPerLegRowsForMetric(
                        lrProfiles,
                        def.id as CompareLRMetricId,
                        athleteIds,
                        lrRepAgg
                      );
                      return (
                        <SmallMultLRPerLeg
                          key={def.id}
                          title={def.label}
                          data={rows}
                          athleteIds={athleteIds}
                          plotAthleteIds={athleteIds.filter((id) =>
                            rows.some(
                              (row) =>
                                typeof row[`${id}__L`] === "number" ||
                                typeof row[`${id}__R`] === "number"
                            )
                          )}
                          unit={def.unit}
                          nameById={nameById}
                        />
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Per-leg values over time. Solid line = Right, dashed = Left. Colour = athlete.
                  </p>
                </>
              )}

              {lrSubView === "latest" && (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {COMPARE_LR_METRICS.filter((def) =>
                      anyLRDataForMetric(lrProfiles, def.id as CompareLRMetricId)
                    ).map((def) => {
                      const latest = lrLatestForMetric(
                        lrProfiles,
                        def.id as CompareLRMetricId,
                        athleteIds
                      );
                      return (
                        <LRLatestCard
                          key={def.id}
                          title={def.label}
                          unit={def.unit}
                          threshold={def.redFlagPctDiff}
                          latest={latest}
                          nameById={nameById}
                        />
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Each athlete's most recent LR session, per metric. ⚠ marks asymmetry above the
                    per-metric threshold.
                  </p>
                </>
              )}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
