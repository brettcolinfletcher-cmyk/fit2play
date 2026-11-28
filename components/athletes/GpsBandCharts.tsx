"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ZoomableChart from "@/components/charts/ZoomableChart";
import { dayMs, isoDay, type EwmaPoint } from "@/lib/ewma";
import { bandRangeLabel, DEFAULT_THRESHOLDS, sessionBandDistances, type SpeedBand } from "@/lib/speedBands";
import { CHART_AXIS_LINE, CHART_AXIS_TICK, CHART_GRID, CHART_TOOLTIP_STYLE } from "./chartTheme";

type SessionLike = { id: string; session_date: string | null };
type MetricLike = { key: string; value: number | null; rep_index?: number | null };

type Props = {
  /** Acute/chronic EWMA of the selected bands, daily, within the range. */
  ewma: EwmaPoint[];
  chronicWeeks: number;
  /** All GPS sessions; the charts cut to the page date range. */
  sessions: SessionLike[];
  metricsBySession: Map<string, MetricLike[]>;
  rangeStart: string | null;
  rangeEnd: string | null;
  bands: SpeedBand[];
  enabled: Set<string>;
  onToggleBand: (id: string) => void;
  showTotal: boolean;
  onToggleTotal: () => void;
  thresholds: number[];
  onThresholds: (t: number[]) => void;
  /** Session names by day (YYYY-MM-DD) for tooltips. */
  namesByDate: Map<string, string[]>;
};

/** shown = sum of the bands switched on (total distance when the day/week has no band data). */
type Row = {
  t: number;
  label: string;
  total: number | null;
  shown: number | null;
  hasBands: number;
  acute?: number | null;
  chronic?: number | null;
  [band: string]: number | string | null | undefined;
};

const ACUTE_COLOR = "#f59e0b";
const CHRONIC_COLOR = "#64748b";

const DAY_MS = 86_400_000;
const TOTAL_COLOR = "#0f172a";

function n0(v: number | null | undefined) {
  return v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("en-AU");
}
function dmy(t: number) {
  return new Date(t).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}
function shortDate(t: number) {
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}
/** Monday (UTC) of the week containing t. */
function weekStart(t: number) {
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return t - dow * DAY_MS;
}

export default function GpsBandCharts({
  ewma,
  chronicWeeks,
  sessions,
  metricsBySession,
  rangeStart,
  rangeEnd,
  bands,
  enabled,
  onToggleBand,
  showTotal,
  onToggleTotal,
  thresholds,
  onThresholds,
  namesByDate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [showAcute, setShowAcute] = useState(false);
  const [showChronic, setShowChronic] = useState(false);

  const { daily, weekly, missing, hasAny } = useMemo(() => {
    const from = rangeStart ? dayMs(rangeStart) : -Infinity;
    const to = rangeEnd ? dayMs(rangeEnd) : Infinity;
    const byDay = new Map<number, { bands: number[]; total: number; has: boolean }>();
    let missingCount = 0;
    let any = false;
    for (const s of sessions) {
      if (!s.session_date) continue;
      const t = dayMs(s.session_date);
      if (t < from || t > to) continue;
      const rows = metricsBySession.get(s.id) ?? [];
      const dist = sessionBandDistances(
        rows.map((r) => ({ key: r.key, value: r.value, rep_index: r.rep_index ?? null })),
        bands
      );
      const total = rows.find((r) => r.key === "gps_total_distance_m")?.value;
      if (!dist) missingCount += 1;
      else any = true;
      const cur = byDay.get(t) ?? { bands: bands.map(() => 0), total: 0, has: false };
      if (dist) {
        dist.forEach((v, i) => (cur.bands[i] += v));
        cur.has = true;
      }
      cur.total += total != null ? Number(total) : dist ? dist.reduce((a, b) => a + b, 0) : 0;
      byDay.set(t, cur);
    }
    const toRow = (t: number, v: { bands: number[]; total: number; has: boolean }, label: string): Row => {
      const shown = v.has ? v.bands.reduce((a, x, i) => a + (enabled.has(bands[i].id) ? x : 0), 0) : v.total;
      const r: Row = { t, label, total: v.total, shown, hasBands: v.has ? 1 : 0 };
      bands.forEach((b, i) => (r[b.id] = enabled.has(b.id) ? v.bands[i] : 0));
      return r;
    };
    // Daily rows: one per day of the EWMA series (so acute/chronic draw as lines), bars on session days
    const ewmaByT = new Map(ewma.map((p) => [p.t, p]));
    const sessionRows = new Map([...byDay.entries()].map(([t, v]) => [t, toRow(t, v, dmy(t))]));
    const allT = [...new Set([...ewmaByT.keys(), ...sessionRows.keys()])].sort((a, b) => a - b);
    const dailyRows: Row[] = allT.map((t) => {
      const base = sessionRows.get(t) ?? { t, label: dmy(t), total: null, shown: null, hasBands: 0 };
      const e = ewmaByT.get(t);
      return { ...base, acute: e?.acute ?? null, chronic: e?.chronic ?? null };
    });
    const byWeek = new Map<number, { bands: number[]; total: number; has: boolean }>();
    for (const [t, v] of byDay) {
      const w = weekStart(t);
      const cur = byWeek.get(w) ?? { bands: bands.map(() => 0), total: 0, has: false };
      v.bands.forEach((x, i) => (cur.bands[i] += x));
      cur.total += v.total;
      cur.has = cur.has || v.has;
      byWeek.set(w, cur);
    }
    // Weekly acute/chronic: EWMA at the end of the week (or the last day shown) × 7 = weekly equivalent
    const lastT = ewma.at(-1)?.t ?? null;
    const weeklyRows = [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([w, v]) => {
        const r = toRow(w, v, `${dmy(w)} – ${dmy(w + 6 * DAY_MS)}`);
        const at = lastT == null ? null : ewmaByT.get(Math.min(w + 6 * DAY_MS, lastT));
        return { ...r, acute: at ? at.acute * 7 : null, chronic: at ? at.chronic * 7 : null };
      });
    return { daily: dailyRows, weekly: weeklyRows, missing: missingCount, hasAny: any };
  }, [sessions, metricsBySession, rangeStart, rangeEnd, bands, enabled, ewma]);

  if (!daily.some((r) => r.total != null)) return null;
  const sessionDays = daily.filter((r) => r.total != null);

  const legend = (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
      {bands.map((b) => {
        const on = enabled.has(b.id);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onToggleBand(b.id)}
            title={`${bandRangeLabel(b)}. Click to ${on ? "hide" : "show"}`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${
              on ? "border-slate-200 bg-white text-slate-700" : "border-dashed border-slate-200 bg-slate-50 text-slate-400 line-through"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color, opacity: on ? 1 : 0.35 }} />
            {b.label}
            <span className="text-[0.65rem] text-slate-400 no-underline">{bandRangeLabel(b)}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onToggleTotal}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${
          showTotal ? "border-slate-200 bg-white text-slate-700" : "border-dashed border-slate-200 bg-slate-50 text-slate-400 line-through"
        }`}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: TOTAL_COLOR }} />
        Totals
      </button>
      <button
        type="button"
        onClick={() => setShowAcute((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 focus:outline-none ${
          showAcute ? "border-amber-300 bg-amber-50 text-amber-800" : "border-dashed border-slate-200 text-slate-400"
        }`}
        title="Acute load (7-day EWMA) of the bands shown"
      >
        <span className="h-0.5 w-3 rounded" style={{ background: ACUTE_COLOR }} />
        Acute 7 d
      </button>
      <button
        type="button"
        onClick={() => setShowChronic((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 focus:outline-none ${
          showChronic ? "border-slate-300 bg-slate-50 text-slate-700" : "border-dashed border-slate-200 text-slate-400"
        }`}
        title="Chronic load EWMA of the bands shown (length set in the workload panel)"
      >
        <span className="h-0.5 w-3 rounded" style={{ background: CHRONIC_COLOR }} />
        Chronic {chronicWeeks} wk
      </button>
      <button type="button" onClick={() => setEditing((v) => !v)} className="px-2 py-1 text-slate-400 underline hover:text-slate-600">
        Edit bands
      </button>
    </div>
  );

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Distance by speed band</h3>
        <p className="text-[0.7rem] text-slate-400">Click a band to hide it. Acute/chronic workload below uses the bands shown.</p>
      </div>

      {!hasAny ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          Speed band data hasn&apos;t been loaded for these sessions yet. Run &quot;Pull 12 months&quot; on the PlayerData card (Data sync page).
        </p>
      ) : missing > 0 ? (
        <p className="mt-2 text-[0.7rem] text-amber-600">{missing} session(s) have no speed band data yet: totals only.</p>
      ) : null}

      <div className="mt-3">{legend}</div>
      {editing ? <BandEditor thresholds={thresholds} onSave={(t) => { onThresholds(t); setEditing(false); }} /> : null}

      <p className="mt-4 text-center text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">Daily</p>
      <ZoomableChart title="Daily distance by speed band" height={240} zoomedHeight={520} className="mt-1 w-full rounded-xl border border-slate-200 bg-white">
        {(h) => (
          <ResponsiveContainer width="100%" height={h}>
            <ComposedChart data={daily} margin={{ top: 22, right: 16, left: 0, bottom: -6 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[daily[0].t - DAY_MS, daily[daily.length - 1].t + DAY_MS]}
                tickFormatter={shortDate}
                tick={CHART_AXIS_TICK}
                axisLine={CHART_AXIS_LINE}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => n0(v)} />
              <Tooltip content={<BandTooltip bands={bands} enabled={enabled} namesByDate={namesByDate} showAcute={showAcute} showChronic={showChronic} />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
              {bands.map((b) => (
                <Bar
                  key={b.id}
                  dataKey={b.id}
                  stackId="bands"
                  fill={b.color}
                  barSize={Math.max(4, Math.min(22, Math.floor(700 / Math.max(1, (daily[daily.length - 1].t - daily[0].t) / DAY_MS + 2))))}
                  isAnimationActive={false}
                />
              ))}
              {showChronic ? (
                <Line dataKey="chronic" type="monotone" stroke={CHRONIC_COLOR} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              ) : null}
              {showAcute ? (
                <Line dataKey="acute" type="monotone" stroke={ACUTE_COLOR} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
              ) : null}
              {showTotal ? (
                <Line dataKey="shown" stroke="none" dot={{ r: 2.5, fill: TOTAL_COLOR, stroke: "none" }} activeDot={false} isAnimationActive={false}>
                  {sessionDays.length <= 40 ? (
                    <LabelList
                      dataKey="shown"
                      position="top"
                      offset={6}
                      formatter={(v) => (v == null ? "" : n0(Number(v)))}
                      style={{ fontSize: 10, fill: "#334155" }}
                    />
                  ) : null}
                </Line>
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ZoomableChart>

      <p className="mt-5 text-center text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">
        Weekly (Mon–Sun){showAcute || showChronic ? " · acute/chronic as weekly equivalent (×7)" : ""}
      </p>
      <ZoomableChart title="Weekly distance by speed band" height={220} zoomedHeight={480} className="mt-1 w-full rounded-xl border border-slate-200 bg-white">
        {(h) => (
          <ResponsiveContainer width="100%" height={h}>
            <ComposedChart data={weekly} margin={{ top: 22, right: 16, left: 0, bottom: -6 }} barCategoryGap="22%">
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={CHART_AXIS_LINE} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => n0(v)} />
              <Tooltip content={<BandTooltip bands={bands} enabled={enabled} weekly showAcute={showAcute} showChronic={showChronic} />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
              {bands.map((b) => (
                <Bar key={b.id} dataKey={b.id} stackId="bands" fill={b.color} isAnimationActive={false} />
              ))}
              {showChronic ? (
                <Line dataKey="chronic" stroke={CHRONIC_COLOR} strokeWidth={2} dot={{ r: 3, fill: CHRONIC_COLOR, stroke: "none" }} isAnimationActive={false} />
              ) : null}
              {showAcute ? (
                <Line dataKey="acute" stroke={ACUTE_COLOR} strokeWidth={2.5} dot={{ r: 3, fill: ACUTE_COLOR, stroke: "none" }} isAnimationActive={false} />
              ) : null}
              {showTotal ? (
                <Line dataKey="shown" stroke="none" dot={{ r: 3, fill: TOTAL_COLOR, stroke: "none" }} activeDot={false} isAnimationActive={false}>
                  <LabelList
                    dataKey="shown"
                    position="top"
                    offset={6}
                    formatter={(v) => (v == null ? "" : n0(Number(v)))}
                    style={{ fontSize: 10, fill: "#334155", fontWeight: 600 }}
                  />
                </Line>
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ZoomableChart>
    </div>
  );
}

type TipProps = {
  active?: boolean;
  payload?: { payload: Row }[];
  bands: SpeedBand[];
  enabled: Set<string>;
  weekly?: boolean;
  namesByDate?: Map<string, string[]>;
  showAcute?: boolean;
  showChronic?: boolean;
};

function BandTooltip({ active, payload, bands, enabled, weekly, namesByDate, showAcute, showChronic }: TipProps) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const shown = bands.filter((b) => enabled.has(b.id));
  const shownSum = shown.reduce((a, b) => a + Number(r[b.id] ?? 0), 0);
  return (
    <div style={CHART_TOOLTIP_STYLE} className="w-[240px] px-3 py-2 text-[11px] text-slate-200">
      <p className="mb-1 text-slate-400">{weekly ? `Week ${r.label}` : isoDay(r.t).split("-").reverse().join("/")}</p>
      {!weekly && namesByDate?.get(isoDay(r.t))?.length ? (
        <p className="mb-1 truncate font-medium text-lime-300">{namesByDate.get(isoDay(r.t))!.join(" + ")}</p>
      ) : null}
      {r.total == null ? <p className="py-0.5 text-slate-400">Rest day</p> : null}
      {r.total != null && !r.hasBands ? <p className="py-0.5 text-amber-300">No speed band data yet</p> : null}
      {(r.hasBands ? [...shown].reverse() : []).map((b) => (
        <p key={b.id} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-sm" style={{ background: b.color }} />
            {b.label} <span className="text-slate-500">{bandRangeLabel(b)}</span>
          </span>
          <b className="tabular-nums text-white">{n0(Number(r[b.id] ?? 0))}</b>
        </p>
      ))}
      {r.hasBands && shown.length < bands.length ? (
        <p className="flex justify-between gap-4 border-t border-slate-700 pt-1">
          <span className="text-slate-300">Selected bands</span>
          <b className="tabular-nums text-white">{n0(shownSum)}</b>
        </p>
      ) : null}
      {r.total != null ? (
        <p className="flex justify-between gap-4 pt-0.5">
          <span className="text-slate-300">Total distance</span>
          <b className="tabular-nums text-white">{n0(r.total)} m</b>
        </p>
      ) : null}
      {(showAcute && r.acute != null) || (showChronic && r.chronic != null) ? (
        <div className="mt-1 border-t border-slate-700 pt-1">
          {showAcute && r.acute != null ? (
            <p className="flex justify-between gap-4">
              <span style={{ color: ACUTE_COLOR }}>Acute{weekly ? " (×7)" : ""}</span>
              <b className="tabular-nums text-white">{n0(r.acute)}</b>
            </p>
          ) : null}
          {showChronic && r.chronic != null ? (
            <p className="flex justify-between gap-4">
              <span className="text-slate-300">Chronic{weekly ? " (×7)" : ""}</span>
              <b className="tabular-nums text-white">{n0(r.chronic)}</b>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BandEditor({ thresholds, onSave }: { thresholds: number[]; onSave: (t: number[]) => void }) {
  const [draft, setDraft] = useState<string[]>(thresholds.map(String));
  const nums = draft.map(Number);
  const valid = nums.every((n) => Number.isFinite(n) && n > 0 && n < 50) && nums.every((n, i) => i === 0 || n > nums[i - 1]);
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
      <p className="text-slate-500">Band boundaries (km/h). Bands run from 0 to the first boundary, between boundaries, then above the last.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {draft.map((v, i) => (
          <span key={i} className="flex items-center gap-1">
            <input
              value={v}
              onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 tabular-nums"
              inputMode="decimal"
            />
            <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" title="Remove boundary">
              ×
            </button>
          </span>
        ))}
        {draft.length < 5 ? (
          <button type="button" onClick={() => setDraft((d) => [...d, String((Number(d[d.length - 1]) || 0) + 3)])} className="rounded-full border border-slate-200 px-2 py-1 text-slate-600">
            + boundary
          </button>
        ) : null}
        <button type="button" onClick={() => setDraft(DEFAULT_THRESHOLDS.map(String))} className="px-2 py-1 text-slate-400 underline">
          Reset
        </button>
        <button type="button" disabled={!valid} onClick={() => onSave(nums)} className="rounded-full bg-[#0f172a] px-3 py-1 font-semibold text-white disabled:opacity-40">
          Save
        </button>
      </div>
    </div>
  );
}
