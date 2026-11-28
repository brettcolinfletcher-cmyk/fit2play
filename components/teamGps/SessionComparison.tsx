"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ZoomableChart from "@/components/charts/ZoomableChart";
import { CHART_AXIS_LINE, CHART_AXIS_TICK, CHART_GRID, CHART_TOOLTIP_STYLE } from "@/components/athletes/chartTheme";
import { sessionLoad, type MetricRow, type TeamSession } from "@/lib/gpsTeam";
import type { SpeedBand } from "@/lib/speedBands";
import { Card, n0, Seg, shortDate } from "./ui";

type MetricId = "distance" | "bands" | "hsr" | "sprint" | "top" | "pctMv";
const METRICS: { v: MetricId; label: string; unit: string }[] = [
  { v: "distance", label: "Distance", unit: "m" },
  { v: "bands", label: "Selected bands", unit: "m" },
  { v: "hsr", label: "HSR", unit: "m" },
  { v: "sprint", label: "Sprint", unit: "m" },
  { v: "top", label: "Top speed", unit: "km/h" },
  { v: "pctMv", label: "% MV", unit: "%" },
];

type Props = {
  sessions: TeamSession[];
  metrics: Map<string, MetricRow[]>;
  names: Map<string, string>;
  maxVelocity: Map<string, number | null>;
  bands: SpeedBand[];
  enabled: Set<string>;
  rangeStart: string | null;
  rangeEnd: string;
};

function val(rows: MetricRow[], key: string): number | null {
  const v = rows.find((r) => r.key === key)?.value;
  return v == null ? null : Number(v);
}

export default function SessionComparison({ sessions, metrics, names, maxVelocity, bands, enabled, rangeStart, rangeEnd }: Props) {
  const days = useMemo(() => {
    const m = new Map<string, TeamSession[]>();
    for (const s of sessions) {
      if ((rangeStart && s.date < rangeStart) || s.date > rangeEnd) continue;
      m.set(s.date, [...(m.get(s.date) ?? []), s]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [sessions, rangeStart, rangeEnd]);

  const [picked, setPicked] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricId>("distance");
  const day = days.find(([d]) => d === picked) ?? days[0];

  const rows = useMemo(() => {
    if (!day) return [];
    const byAthlete = new Map<string, { distance: number; bands: number; hsr: number; sprint: number; top: number | null; names: string[] }>();
    for (const s of day[1]) {
      const r = metrics.get(s.id) ?? [];
      const cur = byAthlete.get(s.athleteId) ?? { distance: 0, bands: 0, hsr: 0, sprint: 0, top: null, names: [] };
      cur.distance += val(r, "gps_total_distance_m") ?? 0;
      cur.bands += sessionLoad(r, "bands", bands, enabled) ?? 0;
      cur.hsr += val(r, "gps_high_speed_run_distance_m") ?? 0;
      cur.sprint += val(r, "gps_total_sprint_distance_m") ?? 0;
      const top = val(r, "gps_max_speed_kph");
      if (top != null && (cur.top == null || top > cur.top)) cur.top = top;
      cur.names.push(s.name);
      byAthlete.set(s.athleteId, cur);
    }
    return [...byAthlete.entries()].map(([id, v]) => {
      const mv = maxVelocity.get(id) ?? null;
      return {
        id,
        name: names.get(id) ?? "Athlete",
        session: [...new Set(v.names)].join(" + "),
        distance: v.distance,
        bands: v.bands,
        hsr: v.hsr,
        sprint: v.sprint,
        top: v.top,
        pctMv: v.top != null && mv ? (v.top / mv) * 100 : null,
      };
    });
  }, [day, metrics, names, maxVelocity, bands, enabled]);

  const m = METRICS.find((x) => x.v === metric)!;
  const chartRows = rows
    .filter((r) => r[metric] != null)
    .sort((a, b) => (b[metric] as number) - (a[metric] as number));
  const avg = chartRows.length ? chartRows.reduce((a, r) => a + (r[metric] as number), 0) / chartRows.length : null;
  const fmt = (v: number | null | undefined) => (v == null ? "—" : m.unit === "km/h" ? v.toFixed(1) : m.unit === "%" ? `${Math.round(v)}%` : n0(v));

  return (
    <Card
      id="session"
      title="Session comparison"
      subtitle="Every player on one day, side by side. Dashed line = squad average."
      right={
        days.length ? (
          <select
            value={day?.[0] ?? ""}
            onChange={(e) => setPicked(e.target.value)}
            className="max-w-[280px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {days.map(([d, ss]) => (
              <option key={d} value={d}>
                {shortDate(d)} · {[...new Set(ss.map((s) => s.name))].join(" + ").slice(0, 40)} ({new Set(ss.map((s) => s.athleteId)).size})
              </option>
            ))}
          </select>
        ) : null
      }
    >
      {!day ? (
        <p className="mt-3 text-xs text-slate-500">No GPS sessions in this range.</p>
      ) : (
        <>
          <div className="mt-3">
            <Seg value={metric} onChange={setMetric} options={METRICS.map((x) => ({ v: x.v, label: x.label }))} />
          </div>
          <ZoomableChart
            title={`${m.label} · ${shortDate(day[0])}`}
            height={Math.max(120, chartRows.length * 28 + 30)}
            zoomedHeight={Math.max(300, chartRows.length * 36 + 40)}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white"
          >
            {(h) => (
              <ResponsiveContainer width="100%" height={h}>
                <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} horizontal={false} vertical />
                  <XAxis type="number" tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                  <YAxis type="category" dataKey="name" tick={{ ...CHART_AXIS_TICK, fill: "#334155" }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    cursor={{ fill: "rgba(148,163,184,0.12)" }}
                    formatter={(v) => [`${fmt(Number(v))}${m.unit === "%" ? "" : ` ${m.unit}`}`, m.label]}
                    labelFormatter={(l, p) => `${l} · ${(p?.[0]?.payload as { session?: string } | undefined)?.session ?? ""}`}
                  />
                  {avg != null ? <ReferenceLine x={avg} stroke="#64748b" strokeDasharray="4 4" /> : null}
                  <Bar dataKey={metric} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                    {chartRows.map((r) => (
                      <Cell key={r.id} fill={metric === "pctMv" && (r.pctMv ?? 0) >= 90 ? "#65a30d" : "#a3e635"} />
                    ))}
                    <LabelList dataKey={metric} position="right" formatter={(v) => fmt(Number(v))} style={{ fontSize: 10, fill: "#334155" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ZoomableChart>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[700px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[0.68rem] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 font-medium">Player</th>
                  <th className="py-1.5 font-medium">Session</th>
                  <th className="py-1.5 text-right font-medium">Distance</th>
                  <th className="py-1.5 text-right font-medium">Selected bands</th>
                  <th className="py-1.5 text-right font-medium">HSR</th>
                  <th className="py-1.5 text-right font-medium">Sprint</th>
                  <th className="py-1.5 text-right font-medium">Top speed</th>
                  <th className="py-1.5 text-right font-medium">% MV</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => a.name.localeCompare(b.name)).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-medium text-slate-800">{r.name}</td>
                    <td className="max-w-[220px] truncate py-1.5 text-slate-500" title={r.session}>{r.session}</td>
                    <td className="py-1.5 text-right tabular-nums">{n0(r.distance)}</td>
                    <td className="py-1.5 text-right tabular-nums">{n0(r.bands)}</td>
                    <td className="py-1.5 text-right tabular-nums">{n0(r.hsr)}</td>
                    <td className="py-1.5 text-right tabular-nums">{n0(r.sprint)}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.top != null ? r.top.toFixed(1) : "—"}</td>
                    <td className={`py-1.5 text-right tabular-nums ${(r.pctMv ?? 0) >= 90 ? "font-semibold text-lime-700" : ""}`}>
                      {r.pctMv != null ? `${Math.round(r.pctMv)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
