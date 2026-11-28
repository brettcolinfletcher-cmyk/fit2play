"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ZoomableChart from "@/components/charts/ZoomableChart";
import { CHART_AXIS_LINE, CHART_AXIS_TICK, CHART_GRID, CHART_TOOLTIP_STYLE } from "@/components/athletes/chartTheme";
import { dayMs } from "@/lib/ewma";
import type { AthleteStatus, MetricRow, TeamSession } from "@/lib/gpsTeam";
import { phaseStyle, type SeasonPhase } from "@/lib/seasonPhases";
import { bandRangeLabel, sessionBandDistances, type SpeedBand } from "@/lib/speedBands";
import { Card, n0, Seg, shortDate } from "./ui";

const DAY = 86_400_000;

function weekStart(t: number) {
  return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
}
function dm(t: number) {
  return new Date(t).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

type Props = {
  statuses: AthleteStatus[];
  sessions: TeamSession[];
  metrics: Map<string, MetricRow[]>;
  bands: SpeedBand[];
  enabled: Set<string>;
  rangeStart: string | null;
  rangeEnd: string;
  phases: SeasonPhase[];
  loadLabel: string;
};

export default function TeamTrends({ statuses, sessions, metrics, bands, enabled, rangeStart, rangeEnd, phases, loadLabel }: Props) {
  const [mode, setMode] = useState<"avg" | "total">("avg");

  const weekly = useMemo(() => {
    const from = rangeStart ?? "0000";
    const byWeek = new Map<number, { bands: number[]; total: number; players: Set<string>; has: boolean }>();
    for (const s of sessions) {
      if (s.date < from || s.date > rangeEnd) continue;
      const w = weekStart(dayMs(s.date));
      const rows = metrics.get(s.id) ?? [];
      const cur = byWeek.get(w) ?? { bands: bands.map(() => 0), total: 0, players: new Set<string>(), has: false };
      const dist = sessionBandDistances(rows, bands);
      if (dist) {
        dist.forEach((v, i) => (cur.bands[i] += v));
        cur.has = true;
      }
      cur.total += Number(rows.find((r) => r.key === "gps_total_distance_m")?.value ?? 0);
      cur.players.add(s.athleteId);
      byWeek.set(w, cur);
    }
    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([w, v]) => {
        const div = mode === "avg" ? Math.max(1, v.players.size) : 1;
        const row: Record<string, number | string> = {
          label: `${dm(w)} – ${dm(w + 6 * DAY)}`,
          players: v.players.size,
          total: v.total / div,
          // Label = bands switched on (total distance when no band data)
          shown: (v.has ? v.bands.reduce((a, x, i) => a + (enabled.has(bands[i].id) ? x : 0), 0) : v.total) / div,
        };
        bands.forEach((b, i) => (row[b.id] = enabled.has(b.id) ? v.bands[i] / div : 0));
        return row;
      });
  }, [sessions, metrics, bands, enabled, rangeStart, rangeEnd, mode]);

  const acwr = useMemo(() => {
    const byT = new Map<number, number[]>();
    for (const st of statuses) for (const p of st.series) if (p.acwr != null) byT.set(p.t, [...(byT.get(p.t) ?? []), p.acwr]);
    return [...byT.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, vals]) => ({
        t,
        mean: vals.reduce((a, b) => a + b, 0) / vals.length,
        range: [Math.min(...vals), Math.max(...vals)] as [number, number],
        n: vals.length,
      }));
  }, [statuses]);

  const top = Math.max(2, Math.ceil(Math.max(0, ...acwr.map((p) => p.range[1])) * 2) / 2);
  const x0 = acwr[0]?.t ?? 0;
  const x1 = acwr.at(-1)?.t ?? 0;

  return (
    <Card
      id="trends"
      title="Team load trends"
      subtitle="Weekly distance by speed band (Mon–Sun) and squad ACWR over time."
      right={<Seg value={mode} onChange={setMode} options={[{ v: "avg", label: "Per player" }, { v: "total", label: "Squad total" }]} />}
    >
      {weekly.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No GPS sessions in this range.</p>
      ) : (
        <ZoomableChart title="Weekly distance by speed band" height={230} zoomedHeight={480} className="mt-3 w-full rounded-xl border border-slate-200 bg-white">
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <ComposedChart data={weekly} margin={{ top: 22, right: 16, left: 0, bottom: -6 }} barCategoryGap="22%">
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => n0(v)} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#e2e8f0" }}
                  labelFormatter={(l, p) => {
                    const players = (p?.[0]?.payload as { players?: number } | undefined)?.players;
                    return `Week ${l}${players ? ` · ${players} player${players === 1 ? "" : "s"}` : ""}`;
                  }}
                  formatter={(v, name) => {
                    const b = bands.find((x) => x.id === name);
                    return [`${n0(Number(v))} m`, b ? `${b.label} ${bandRangeLabel(b)}` : "Selected bands"];
                  }}
                />
                {bands.map((b) => (
                  <Bar key={b.id} dataKey={b.id} stackId="bands" fill={b.color} isAnimationActive={false} />
                ))}
                <Line dataKey="shown" stroke="none" dot={{ r: 3, fill: "#0f172a", stroke: "none" }} activeDot={false} isAnimationActive={false}>
                  <LabelList dataKey="shown" position="top" offset={6} formatter={(v) => n0(Number(v))} style={{ fontSize: 10, fill: "#334155", fontWeight: 600 }} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ZoomableChart>
      )}

      <p className="mt-5 text-xs font-medium text-slate-600">
        Squad ACWR ({loadLabel}) <span className="font-normal text-slate-400">· line = squad average, shaded = lowest to highest player</span>
      </p>
      {acwr.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No ACWR yet (chronic load still building).</p>
      ) : (
        <ZoomableChart title="Squad ACWR" height={170} zoomedHeight={420} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white">
          {(h) => (
            <ResponsiveContainer width="100%" height={h}>
              <ComposedChart data={acwr} margin={{ top: 14, right: 16, left: 0, bottom: -6 }}>
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[x0 - DAY / 2, x1 + DAY / 2]}
                  tickFormatter={(t: number) => shortDate(t)}
                  tick={CHART_AXIS_TICK}
                  axisLine={CHART_AXIS_LINE}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis domain={[0, top]} ticks={[0, 0.8, 1.3, 1.5]} interval={0} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={52} />
                {phases
                  .map((p) => ({ p, a: Math.max(dayMs(p.start_date) - DAY / 2, x0 - DAY / 2), b: Math.min(dayMs(p.end_date) + DAY / 2, x1 + DAY / 2) }))
                  .filter((v) => v.b > v.a)
                  .map(({ p, a, b }) => (
                    <ReferenceArea
                      key={p.id}
                      x1={a}
                      x2={b}
                      fill={phaseStyle(p.phase_type).fill}
                      fillOpacity={0.75}
                      ifOverflow="hidden"
                      label={{ value: p.name, position: "insideTop", fill: phaseStyle(p.phase_type).text, fontSize: 10 }}
                    />
                  ))}
                <ReferenceArea y1={0.8} y2={1.3} fill="#bef264" fillOpacity={0.35} ifOverflow="hidden" />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#e2e8f0" }}
                  labelFormatter={(t) => shortDate(Number(t))}
                  formatter={(v, name, item) => {
                    if (name === "range") {
                      const r = v as unknown as [number, number];
                      return [`${r[0].toFixed(2)} – ${r[1].toFixed(2)}`, "Player range"];
                    }
                    const n = (item?.payload as { n?: number } | undefined)?.n;
                    return [`${Number(v).toFixed(2)}${n ? ` (${n} players)` : ""}`, "Squad average"];
                  }}
                />
                <Area dataKey="range" stroke="none" fill="#94a3b8" fillOpacity={0.25} isAnimationActive={false} activeDot={false} />
                <Line dataKey="mean" stroke="#0f172a" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ZoomableChart>
      )}
    </Card>
  );
}
