"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
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
import { dailyTotals, dayMs, ewmaSeries, isoDay, type EwmaPoint } from "@/lib/ewma";
import { loadAthletePhases, phaseStyle, type AthleteTeam, type SeasonPhase } from "@/lib/seasonPhases";
import { CHART_AXIS_LINE, CHART_AXIS_TICK, CHART_GRID, CHART_TOOLTIP_STYLE, ChartDefs } from "./chartTheme";
import SeasonPhaseEditor from "./SeasonPhaseEditor";

/** "bands" = sum of the speed bands switched on (falls back to total distance without band data). */
export const WORKLOAD_METRICS = [
  { key: "bands", label: "Speed bands", unit: "m" },
  { key: "gps_high_speed_run_distance_m", label: "High-speed running", unit: "m" },
  { key: "gps_total_sprint_distance_m", label: "Sprint distance", unit: "m" },
] as const;

const ACUTE_DAYS = 7;
/** Chronic window options in weeks (2 to 10). */
const CHRONIC_WEEKS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const DAY_MS = 86_400_000;

const ACUTE_COLOR = "#f59e0b";
const CHRONIC_STROKE = "#64748b";
const GAP_UP_FILL = "#fcd34d"; // acute above chronic
const GAP_DOWN_FILL = "#cbd5e1"; // acute below chronic
const TODAY_STROKE = "#3b82f6";
const ACWR_COLOR = "#0f172a";
const SWEET_LOW = 0.8;
const SWEET_HIGH = 1.3;
const DANGER = 1.5;
/** Spike labels: only increases this big are labelled on the chart (all are in the tooltip). */
const SPIKE_SHOW = 15;
const SPIKE_HIGH = 50;

type SessionLike = { id: string; session_date: string | null };
type MetricLike = { key: string; value: number | null };
type EndMode = "today" | "last";

type Props = {
  athleteId: string;
  /** Selected speed-band distance per session id; null when no band data exists. */
  bandLoad: Map<string, number> | null;
  bandLabel: string;
  /** Session names by day (YYYY-MM-DD) for tooltips. */
  namesByDate: Map<string, string[]>;
  /** ALL of the athlete's GPS sessions (not range-filtered): EWMA needs the full history. */
  sessions: SessionLike[];
  metricsBySession: Map<string, MetricLike[]>;
  rangeStart: string | null;
  rangeEnd: string | null;
};

function n0(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("en-AU");
}

function pct(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v)}%`;
}

function shortDate(t: number): string {
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}

function acwrTone(v: number | null): { text: string; chip: string } {
  if (v == null) return { text: "text-slate-400", chip: "bg-slate-100 text-slate-500" };
  if (v > DANGER) return { text: "text-rose-600", chip: "bg-rose-100 text-rose-700" };
  if (v > SWEET_HIGH || v < SWEET_LOW) return { text: "text-amber-600", chip: "bg-amber-100 text-amber-700" };
  return { text: "text-lime-700", chip: "bg-lime-100 text-lime-800" };
}

function Toggle<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { v: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {label ? <span className="text-slate-400">{label}</span> : null}
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 font-medium">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            title={o.title}
            onClick={() => onChange(o.v)}
            className={
              o.v === value
                ? "rounded-md bg-slate-900 px-2 py-1 text-white"
                : "rounded-md px-2 py-1 text-slate-500 hover:text-slate-800"
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Chart row: EWMA point plus the acute/chronic gap as [low, high] ranges for shading. */
type ChartPoint = EwmaPoint & { gapUp: [number, number]; gapDown: [number, number] };

export default function GpsWorkload({ athleteId, bandLoad, bandLabel, namesByDate, sessions, metricsBySession, rangeStart, rangeEnd }: Props) {
  const [phases, setPhases] = useState<SeasonPhase[]>([]);
  const [teams, setTeams] = useState<AthleteTeam[]>([]);
  const [phasesMissing, setPhasesMissing] = useState(false);
  const [editingPhases, setEditingPhases] = useState(false);
  const reloadPhases = useCallback(() => {
    void loadAthletePhases(athleteId).then((r) => {
      setPhases(r.phases);
      setTeams(r.teams);
      setPhasesMissing(r.missing);
    });
  }, [athleteId]);
  useEffect(() => reloadPhases(), [reloadPhases]);

  const [today] = useState(() => isoDay(Date.now()));
  const lastSession = useMemo(
    () => sessions.reduce<string | null>((m, s) => (s.session_date && (!m || s.session_date > m) ? s.session_date.slice(0, 10) : m), null),
    [sessions]
  );
  const staleData = lastSession != null && dayMs(today) - dayMs(lastSession) > 21 * DAY_MS;

  const [chronicWeeks, setChronicWeeks] = useState<number>(4);
  const [endMode, setEndMode] = useState<EndMode>(staleData ? "last" : "today");
  const [showSpikes, setShowSpikes] = useState(true);
  const [metricKey, setMetricKey] = useState<string>(WORKLOAD_METRICS[0].key);
  const chronicDays = chronicWeeks * 7;

  const endDate = useMemo(() => {
    let end = endMode === "last" && lastSession ? isoDay(Math.min(dayMs(lastSession) + 7 * DAY_MS, dayMs(today))) : today;
    if (rangeEnd && rangeEnd.slice(0, 10) < end) end = rangeEnd.slice(0, 10);
    return end;
  }, [endMode, lastSession, today, rangeEnd]);

  const series = useMemo(() => {
    const out = new Map<string, EwmaPoint[]>();
    const from = rangeStart ? dayMs(rangeStart) : -Infinity;
    const to = dayMs(endDate);
    for (const m of WORKLOAD_METRICS) {
      const rows: { date: string; value: number }[] = [];
      for (const s of sessions) {
        if (!s.session_date) continue;
        let v: number | null | undefined;
        if (m.key === "bands") {
          v = bandLoad ? bandLoad.get(s.id) : (metricsBySession.get(s.id) ?? []).find((r) => r.key === "gps_total_distance_m")?.value;
        } else {
          v = (metricsBySession.get(s.id) ?? []).find((r) => r.key === m.key)?.value;
        }
        if (v != null) rows.push({ date: s.session_date, value: Number(v) });
      }
      // EWMA runs over the full history; only the display is cut to the range.
      const full = ewmaSeries(dailyTotals(rows), { acuteDays: ACUTE_DAYS, chronicDays, endDate });
      out.set(m.key, full.filter((p) => p.t >= from && p.t <= to));
    }
    return out;
  }, [sessions, metricsBySession, chronicDays, endDate, rangeStart, bandLoad]);

  const labelFor = (m: (typeof WORKLOAD_METRICS)[number]) =>
    m.key === "bands" ? (bandLoad ? `Distance: ${bandLabel}` : "Total distance") : m.label;

  const available = WORKLOAD_METRICS.filter((m) => (series.get(m.key) ?? []).length > 0);
  if (available.length === 0) return null;
  const active = available.find((m) => m.key === metricKey) ?? available[0];
  const pts = series.get(active.key)!;
  const last = pts[pts.length - 1];

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header + controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Workload (EWMA)</h3>
          <p className="mt-0.5 text-[0.7rem] text-slate-400">
            All sessions, rest days count as zero. Computed from full history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle
            label="Chronic (wk)"
            value={chronicWeeks}
            onChange={setChronicWeeks}
            options={CHRONIC_WEEKS.map((w) => ({ v: w, label: String(w), title: `${w * 7}-day chronic EWMA` }))}
          />
          <Toggle
            label="Up to"
            value={endMode}
            onChange={setEndMode}
            options={[
              { v: "today", label: "Today" },
              { v: "last", label: "Last session" },
            ]}
          />
          <button
            type="button"
            onClick={() => setEditingPhases((v) => !v)}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
          >
            Season phases{phases.length ? ` (${phases.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setShowSpikes((v) => !v)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              showSpikes ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-400"
            }`}
            title={`Label sessions where acute load rose ${SPIKE_SHOW}% or more since the previous session`}
          >
            Spike % {showSpikes ? "on" : "off"}
          </button>
        </div>
      </div>

      {editingPhases ? (
        phasesMissing ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            Season phases need a database update before they can be saved.
          </p>
        ) : (
          <SeasonPhaseEditor
            athleteId={athleteId}
            phases={phases}
            teams={teams}
            onChanged={reloadPhases}
            onClose={() => setEditingPhases(false)}
          />
        )
      ) : null}

      {/* Metric tabs with current ACWR */}
      <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
        {available.map((m) => {
          const lp = series.get(m.key)!.at(-1)!;
          const tone = acwrTone(lp.acwr);
          const on = m.key === active.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetricKey(m.key)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
                on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <span className="text-sm font-medium">{labelFor(m)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums ${tone.chip}`}>
                {lp.acwr != null ? lp.acwr.toFixed(2) : lp.building ? "building" : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Current values + legend */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 tabular-nums">
          <span className="text-slate-400">As of {shortDate(last.t)}</span>
          <span>
            <span className="text-slate-400">Acute </span>
            <span className="font-semibold text-slate-800">{n0(last.acute)}</span>
          </span>
          <span>
            <span className="text-slate-400">Chronic </span>
            <span className="font-semibold text-slate-800">{n0(last.chronic)}</span>
          </span>
          <span>
            <span className="text-slate-400">ACWR </span>
            <span className={`font-semibold ${acwrTone(last.acwr).text}`}>
              {last.acwr != null ? last.acwr.toFixed(2) : last.building ? "building" : "—"}
            </span>
          </span>
          <span className="text-slate-400">({active.unit}/day)</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[0.7rem] text-slate-500">
          <LegendSwatch kind="bar" label="Session load" />
          <LegendSwatch kind="acute" label={`Acute ${ACUTE_DAYS} d`} />
          <LegendSwatch kind="chronic" label={`Chronic ${chronicWeeks} wk`} />
          <LegendSwatch kind="gap" label="Acute above / below chronic" />
          {showSpikes ? <LegendSwatch kind="spike" label={`Spike ≥${SPIKE_SHOW}%`} /> : null}
        </div>
      </div>

      <WorkloadChart
        points={pts}
        unit={active.unit}
        label={labelFor(active)}
        chronicWeeks={chronicWeeks}
        showSpikes={showSpikes}
        phases={phases}
        today={today}
        namesByDate={namesByDate}
      />
      <AcwrChart points={pts} label={labelFor(active)} phases={phases} today={today} />
    </div>
  );
}

function LegendSwatch({ kind, label }: { kind: "bar" | "acute" | "chronic" | "spike" | "gap"; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {kind === "bar" ? <span className="h-3 w-2 rounded-sm bg-lime-400" /> : null}
      {kind === "acute" ? <span className="h-0.5 w-4 rounded" style={{ background: ACUTE_COLOR }} /> : null}
      {kind === "chronic" ? <span className="h-0.5 w-4 rounded" style={{ background: CHRONIC_STROKE }} /> : null}
      {kind === "gap" ? (
        <span className="flex">
          <span className="h-2.5 w-2 rounded-l-sm" style={{ background: GAP_UP_FILL, opacity: 0.6 }} />
          <span className="h-2.5 w-2 rounded-r-sm" style={{ background: GAP_DOWN_FILL, opacity: 0.8 }} />
        </span>
      ) : null}
      {kind === "spike" ? <span className="text-[0.65rem] font-bold text-amber-600">+%</span> : null}
      {label}
    </span>
  );
}

function xAxisProps(points: EwmaPoint[]) {
  return {
    dataKey: "t",
    type: "number" as const,
    scale: "time" as const,
    domain: [points[0].t - DAY_MS / 2, points[points.length - 1].t + DAY_MS / 2] as [number, number],
    tickFormatter: shortDate,
    tick: CHART_AXIS_TICK,
    axisLine: CHART_AXIS_LINE,
    tickLine: false,
    minTickGap: 28,
  };
}

/** Phases clipped to the visible window, in chart x units. */
function visiblePhases(points: EwmaPoint[], phases: SeasonPhase[]) {
  const lo = points[0].t - DAY_MS / 2;
  const hi = points[points.length - 1].t + DAY_MS / 2;
  return phases
    .map((p) => ({ p, x1: Math.max(dayMs(p.start_date) - DAY_MS / 2, lo), x2: Math.min(dayMs(p.end_date) + DAY_MS / 2, hi) }))
    .filter((v) => v.x2 > v.x1);
}

function phaseAt(t: number, phases: SeasonPhase[]): SeasonPhase | null {
  // Narrowest phase wins when phases overlap (e.g. a deload inside a block)
  let best: SeasonPhase | null = null;
  for (const p of phases) {
    if (t >= dayMs(p.start_date) && t <= dayMs(p.end_date)) {
      if (!best || dayMs(p.end_date) - dayMs(p.start_date) < dayMs(best.end_date) - dayMs(best.start_date)) best = p;
    }
  }
  return best;
}

/** Phase name at the top of its band, cut to fit the band width. */
function PhaseLabel(props: { viewBox?: { x?: number; y?: number; width?: number }; name: string; color: string }) {
  const { viewBox, name, color } = props;
  const x = viewBox?.x ?? 0;
  const w = viewBox?.width ?? 0;
  const max = Math.floor((w - 8) / 6);
  if (max < 2) return null;
  const text = name.length > max ? `${name.slice(0, Math.max(1, max - 1))}…` : name;
  return (
    <text x={x + w / 2} y={(viewBox?.y ?? 0) + 11} textAnchor="middle" fontSize={10} fontWeight={600} fill={color} opacity={0.85}>
      {text}
    </text>
  );
}

function phaseBands(points: EwmaPoint[], phases: SeasonPhase[], withLabels: boolean) {
  return visiblePhases(points, phases).map(({ p, x1, x2 }) => {
    const st = phaseStyle(p.phase_type);
    return (
      <ReferenceArea
        key={p.id}
        x1={x1}
        x2={x2}
        fill={st.fill}
        fillOpacity={0.75}
        ifOverflow="hidden"
        label={withLabels ? <PhaseLabel name={p.name} color={st.text} /> : undefined}
      />
    );
  });
}

function todayLine(points: EwmaPoint[], today: string, withLabel: boolean) {
  const t = dayMs(today);
  if (t < points[0].t || t > points[points.length - 1].t) return null;
  return (
    <ReferenceLine
      x={t}
      stroke={TODAY_STROKE}
      strokeDasharray="3 4"
      strokeWidth={1.5}
      label={withLabel ? { value: "Today", position: "insideTopRight", fill: TODAY_STROKE, fontSize: 10 } : undefined}
    />
  );
}

type TipProps = { active?: boolean; payload?: { payload: ChartPoint }[] };

function WorkloadTooltip({
  active,
  payload,
  unit,
  phases,
  namesByDate,
}: TipProps & { unit: string; phases: SeasonPhase[]; namesByDate: Map<string, string[]> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const phase = phaseAt(p.t, phases);
  const diff = p.chronic > 1e-6 && !p.building ? ((p.acute - p.chronic) / p.chronic) * 100 : null;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="min-w-[200px] px-3 py-2 text-[11px] text-slate-200">
      {phase ? <p className="font-semibold text-white">{phase.name}</p> : null}
      <p className="mb-1.5 text-slate-400">
        {shortDate(p.t)}
        {p.load == null ? " · rest day" : ""}
      </p>
      {p.load != null && namesByDate.get(p.date)?.length ? (
        <p className="mb-1 font-medium text-lime-300">{namesByDate.get(p.date)!.join(" + ")}</p>
      ) : null}
      {p.load != null ? (
        <Row label="Session load" value={`${n0(p.load)} ${unit}`} />
      ) : null}
      <Row label="Acute (7 d)" value={n0(p.acute)} swatch={ACUTE_COLOR} />
      <Row label="Chronic" value={n0(p.chronic)} swatch={CHRONIC_STROKE} />
      {diff != null ? <Row label="Acute vs chronic" value={pct(diff)} /> : null}
      {p.spikePct != null ? <Row label="Spike since last session" value={pct(p.spikePct)} /> : null}
    </div>
  );
}

function Row({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <p className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-slate-300">
        {swatch ? <span className="h-2 w-2 rounded-sm" style={{ background: swatch }} /> : null}
        {label}
      </span>
      <b className="tabular-nums text-white">{value}</b>
    </p>
  );
}

function WorkloadChart({
  points,
  unit,
  label,
  chronicWeeks,
  showSpikes,
  phases,
  today,
  namesByDate,
}: {
  namesByDate: Map<string, string[]>;
  points: EwmaPoint[];
  unit: string;
  label: string;
  chronicWeeks: number;
  showSpikes: boolean;
  phases: SeasonPhase[];
  today: string;
}) {
  const data: ChartPoint[] = points.map((p) => ({
    ...p,
    gapUp: p.acute >= p.chronic ? [p.chronic, p.acute] : [p.chronic, p.chronic],
    gapDown: p.acute < p.chronic ? [p.acute, p.chronic] : [p.chronic, p.chronic],
  }));
  const buildingEnd = points.filter((p) => p.building).at(-1)?.t ?? null;
  const barSize = Math.max(3, Math.min(16, Math.floor(700 / Math.max(points.length, 1))));

  return (
    <ZoomableChart
      title={`${label}: session load, acute and chronic (${chronicWeeks} wk)`}
      height={280}
      zoomedHeight={540}
      className="mt-3 w-full rounded-xl border border-slate-200 bg-white"
    >
      {(h) => (
        <ResponsiveContainer width="100%" height={h}>
          <ComposedChart data={data} margin={{ top: 18, right: 16, left: 0, bottom: -6 }}>
            {ChartDefs}
            {phaseBands(points, phases, true)}
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...xAxisProps(points)} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => n0(v)} />
            {buildingEnd != null && phases.length === 0 ? (
              <ReferenceArea
                x1={points[0].t - DAY_MS / 2}
                x2={buildingEnd}
                fill="#f8fafc"
                fillOpacity={1}
                ifOverflow="hidden"
                label={{ value: "chronic building", position: "insideTopLeft", fill: "#94a3b8", fontSize: 10 }}
              />
            ) : null}
            <Tooltip content={<WorkloadTooltip unit={unit} phases={phases} namesByDate={namesByDate} />} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
            <Area dataKey="gapUp" type="monotone" stroke="none" fill={GAP_UP_FILL} fillOpacity={0.45} isAnimationActive={false} activeDot={false} />
            <Area dataKey="gapDown" type="monotone" stroke="none" fill={GAP_DOWN_FILL} fillOpacity={0.6} isAnimationActive={false} activeDot={false} />
            <Bar dataKey="load" fill="url(#f2pBar)" barSize={barSize} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {showSpikes ? (
                <LabelList
                  dataKey="load"
                  content={(props) => {
                    const { x, y, width, index } = props as { x?: number; y?: number; width?: number; index?: number };
                    const p = index != null ? points[index] : null;
                    if (!p || p.spikePct == null || p.spikePct < SPIKE_SHOW || x == null || y == null) return null;
                    const color = p.spikePct >= SPIKE_HIGH ? "#e11d48" : "#d97706";
                    return (
                      <text x={x + (width ?? 0) / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>
                        {pct(p.spikePct)}
                      </text>
                    );
                  }}
                />
              ) : null}
            </Bar>
            <Line dataKey="chronic" type="monotone" stroke={CHRONIC_STROKE} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="acute" type="monotone" stroke={ACUTE_COLOR} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {todayLine(points, today, true)}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ZoomableChart>
  );
}

function AcwrChart({ points, label, phases, today }: { points: EwmaPoint[]; label: string; phases: SeasonPhase[]; today: string }) {
  const top = Math.max(2, Math.ceil(Math.max(...points.map((p) => p.acwr ?? 0)) * 2) / 2);
  return (
    <ZoomableChart
      title={`${label}: ACWR`}
      height={120}
      zoomedHeight={320}
      className="mt-2 w-full rounded-xl border border-slate-200 bg-white"
    >
      {(h) => (
        <ResponsiveContainer width="100%" height={h}>
          <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: -6 }}>
            <XAxis {...xAxisProps(points)} />
            <YAxis
              domain={[0, top]}
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={52}
              ticks={[SWEET_LOW, SWEET_HIGH, DANGER]}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            {phaseBands(points, phases, false)}
            <ReferenceArea y1={SWEET_LOW} y2={SWEET_HIGH} fill="#bef264" fillOpacity={0.35} ifOverflow="hidden" />
            <ReferenceLine y={DANGER} stroke="#fb7185" strokeDasharray="4 4" />
            <ReferenceLine y={SWEET_HIGH} stroke="#fbbf24" strokeDasharray="2 4" />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={{ color: "#94a3b8" }}
              labelFormatter={(t) => {
                const ph = phaseAt(Number(t), phases);
                return `${shortDate(Number(t))}${ph ? ` · ${ph.name}` : ""}`;
              }}
              formatter={(v) => [Number(v).toFixed(2), "ACWR"]}
            />
            <Line dataKey="acwr" type="monotone" stroke={ACWR_COLOR} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            {todayLine(points, today, false)}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ZoomableChart>
  );
}
