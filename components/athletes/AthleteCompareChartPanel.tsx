"use client";

import { useMemo, useState } from "react";
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
  COMPARE_METRIC_ORDER,
  latestValue,
  mergeTrendRowsForMetric,
  radarScoresForLatest,
  type AthleteCompareSeries,
  type CompareMetricId,
} from "@/lib/athleteCompareCharts";
import { compareMetricUnit, type AthleteRawBundle } from "@/lib/compareMetrics";
import { formatChartAxisDate } from "@/lib/athleteReportData";

type AthleteOpt = { id: string; first_name: string | null; last_name: string | null };

export type { AthleteRawBundle } from "@/lib/compareMetrics";


type ChartView = "trends" | "current" | "overview";

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(30 41 59)",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

const shellClass = "rounded-lg border border-slate-800 bg-slate-900/50 p-4";

function SmallMultLine({
  title,
  data,
  athleteIds,
  unit,
  nameById,
}: {
  title: string;
  data: { t: number; label: string; [k: string]: number | string | null }[];
  athleteIds: string[];
  unit: string;
  nameById: Map<string, string>;
}) {
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
            {athleteIds.map((id, i) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={nameById.get(id) ?? id}
                stroke={ATHLETE_COMPARE_LINE_COLORS[i % ATHLETE_COMPARE_LINE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            ))}
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

  const trendMultiples = useMemo(() => {
    return COMPARE_METRIC_ORDER.map((metric) => ({
      metric,
      label: COMPARE_METRIC_LABELS[metric],
      rows: mergeTrendRowsForMetric(profiles, metric, athleteIds),
      unit: compareMetricUnit(metric),
    }));
  }, [profiles, athleteIds]);

  const barRows = useMemo(() => {
    const rows: { metric: string; metricId: CompareMetricId }[] = [];
    for (const metric of COMPARE_METRIC_ORDER) {
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
  }, [profiles, athleteIds]);

  const radarData = useMemo(() => {
    // TODO: switch to benchmark normalisation once thresholds land
    const metrics = COMPARE_METRIC_ORDER.filter((metric) =>
      athleteIds.every((id) => {
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
  }, [profiles, athleteIds]);

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

  return (
    <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comparison charts</h2>
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
          {segmented("trends", "Trends")}
          {segmented("current", "Current session")}
          {segmented("overview", "Overview")}
        </div>
      </div>

      {athleteIds.length >= 2 && athleteIds.length <= 6 ? (
        <>
          {view === "trends" && (
            <>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {trendMultiples.map((tm) => (
                  <SmallMultLine
                    key={tm.metric}
                    title={tm.label}
                    data={tm.rows}
                    athleteIds={athleteIds}
                    unit={tm.unit}
                    nameById={nameById}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">Trend over the selected date range.</p>
            </>
          )}

          {view === "current" && (
            <>
              <div className={`mt-4 ${shellClass}`}>
                <div className="h-80 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barRows.data} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
                      <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                      <XAxis dataKey="metric" stroke="#64748b" tick={AXIS_TICK} interval={0} angle={-20} textAnchor="end" height={70} />
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

          {view === "overview" && (
            <>
              <div className={`mt-4 ${shellClass}`}>
                {radarData.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Not enough overlapping metrics across athletes for an overview chart.
                  </p>
                ) : (
                  <div className="h-96 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend
                          formatter={(value) => nameById.get(String(value)) ?? String(value)}
                          wrapperStyle={{ fontSize: 11 }}
                        />
                        {athleteIds.map((id, i) => (
                          <Radar
                            key={id}
                            name={nameById.get(id) ?? id}
                            dataKey={id}
                            stroke={ATHLETE_COMPARE_LINE_COLORS[i % ATHLETE_COMPARE_LINE_COLORS.length]}
                            fill={ATHLETE_COMPARE_LINE_COLORS[i % ATHLETE_COMPARE_LINE_COLORS.length]}
                            fillOpacity={0.15}
                            strokeWidth={2}
                          />
                        ))}
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
        </>
      ) : null}
    </div>
  );
}
