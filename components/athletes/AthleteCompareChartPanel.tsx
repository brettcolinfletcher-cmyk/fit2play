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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ATHLETE_COMPARE_LINE_COLORS,
  athleteDisplayName,
  buildAthleteCompareSeries,
  COMPARE_METRIC_LABELS,
  latestValue,
  mergeTrendRowsForMetric,
  radarScoresForLatest,
  type AthleteCompareSeries,
  type CompareMetricId,
} from "@/lib/athleteCompareCharts";
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
type TopTab = MetricGroup | "overview";

const GROUP_PRIORITY: MetricGroup[] = ["sprint", "cod", "jump", "reactive", "hop"];

const GROUP_TAB_LABEL: Record<MetricGroup, string> = {
  sprint: "Sprint",
  cod: "COD",
  jump: "Jump",
  reactive: "Reactive",
  hop: "Hop",
};

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

export default function AthleteCompareChartPanel({
  athletes,
  bundles,
  athleteIdsOrdered,
}: {
  athletes: AthleteOpt[];
  bundles: Map<string, AthleteRawBundle>;
  athleteIdsOrdered: string[];
}) {
  const [view, setView] = useState<ChartView>("trends");
  const [activeTopTab, setActiveTopTab] = useState<TopTab>("sprint");
  const selectionKey = athleteIdsOrdered.join("|");
  const prevSelectionKey = useRef(selectionKey);

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
    if (visibleGroupTabs.length === 0) return;
    const allowed: TopTab[] = [
      ...visibleGroupTabs,
      ...(showOverviewTopTab ? (["overview"] as const) : []),
    ];

    if (prevSelectionKey.current !== selectionKey) {
      prevSelectionKey.current = selectionKey;
      setActiveTopTab(visibleGroupTabs[0]!);
      setView("trends");
      return;
    }

    setActiveTopTab((cur) => {
      if (allowed.includes(cur)) return cur;
      return visibleGroupTabs[0]!;
    });
  }, [selectionKey, visibleGroupTabs, showOverviewTopTab]);

  const metricIdsInActiveGroup = useMemo((): CompareMetricId[] => {
    if (activeTopTab === "overview") return [];
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
    const label = tab === "overview" ? "Overview" : GROUP_TAB_LABEL[tab];
    const active = activeTopTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => {
          setActiveTopTab(tab);
          if (tab !== "overview") setView("trends");
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
  const noComparableData = inRange && visibleGroupTabs.length === 0;

  return (
    <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      {noComparableData ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No comparable test data for the selected athletes yet.
        </p>
      ) : inRange && visibleGroupTabs.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comparison charts</h2>
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
              {visibleGroupTabs.map((t) => topTabButton(t))}
              {showOverviewTopTab ? topTabButton("overview") : null}
            </div>
          </div>

          {activeTopTab !== "overview" && (
            <div className="mt-3 flex flex-wrap justify-end gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
              {segmented("trends", "Trends")}
              {segmented("current", "Current session")}
              {segmented("overview", "Overview")}
            </div>
          )}

          {activeTopTab !== "overview" && view === "trends" && (
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

          {activeTopTab !== "overview" && view === "current" && (
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

          {activeTopTab !== "overview" && view === "overview" && (
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
        </>
      ) : null}
    </div>
  );
}
