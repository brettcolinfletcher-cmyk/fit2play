"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
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
import { formatDisplayDate } from "@/lib/dateDisplay";
import { supabase } from "@/lib/supabaseClient";
import { CHART_AXIS_LINE, CHART_AXIS_TICK, CHART_GRID, CHART_TOOLTIP_STYLE } from "./chartTheme";

export type SpeedPoint = { idx: number; date: string; dateLabel: string; type: string; speed: number | null };
export type BestSpeed = { kph: number; date: string; source: "GPS" | "1080 sprint" };

const HIGH = 90; // % of max velocity worth flagging as a true high-speed exposure
const NEAR = 95;

type Props = {
  athleteId: string;
  /** GPS sessions in range, in date order, with session top speed (km/h). */
  points: SpeedPoint[];
  /** Fastest recorded speeds across all history. */
  bests: BestSpeed[];
  /** Effective max velocity is reported up so tiles can show % of it. */
  onMaxVelocity?: (kph: number | null) => void;
};

function f1(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(1);
}

export default function GpsMaxVelocity({ athleteId, points, bests, onMaxVelocity }: Props) {
  const [manual, setManual] = useState<{ kph: number | null; setAt: string | null } | null>(null);
  const [columnMissing, setColumnMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("athletes")
      .select("max_velocity_kph, max_velocity_set_at")
      .eq("id", athleteId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) {
          setColumnMissing(/max_velocity/.test(e.message));
          setManual({ kph: null, setAt: null });
          return;
        }
        const row = data as { max_velocity_kph: number | string | null; max_velocity_set_at: string | null } | null;
        setManual({ kph: row?.max_velocity_kph != null ? Number(row.max_velocity_kph) : null, setAt: row?.max_velocity_set_at ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const bestOverall = bests.reduce<BestSpeed | null>((b, x) => (!b || x.kph > b.kph ? x : b), null);
  const mv = manual?.kph ?? bestOverall?.kph ?? null;
  const usingManual = manual?.kph != null;

  useEffect(() => {
    onMaxVelocity?.(mv);
  }, [mv, onMaxVelocity]);

  async function save(kph: number | null) {
    setSaving(true);
    setError(null);
    const { error: e } = await supabase
      .from("athletes")
      .update({ max_velocity_kph: kph, max_velocity_set_at: kph == null ? null : new Date().toISOString() })
      .eq("id", athleteId);
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setManual({ kph, setAt: kph == null ? null : new Date().toISOString() });
    setEditing(false);
  }

  const data = points.map((p) => ({ ...p, pct: mv && p.speed != null ? (p.speed / mv) * 100 : null }));
  const withPct = data.filter((d) => d.pct != null);
  // Days since the most recent session at or above 90% of max velocity
  const lastHit = [...withPct].reverse().find((d) => d.pct! >= HIGH) ?? null;
  const daysSinceHit = lastHit
    ? Math.max(0, Math.round((Date.parse(today) - Date.parse(lastHit.date.slice(0, 10))) / 86_400_000))
    : null;
  const fasterThanMv = usingManual && bestOverall && mv != null && bestOverall.kph > mv ? bestOverall : null;
  const yMin = Math.min(60, Math.floor(Math.min(...withPct.map((d) => d.pct!), 100) / 5) * 5 - 5);
  const yMax = Math.max(105, Math.ceil(Math.max(...withPct.map((d) => d.pct!), 0) / 5) * 5 + 2);
  const tickByIdx = new Map(points.map((p) => [p.idx, p.dateLabel]));

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Max velocity exposure</h3>
          <p className="mt-0.5 text-[0.7rem] text-slate-400">Session top speed as % of the athlete&apos;s max velocity.</p>
        </div>

        {/* Max velocity value + source + edit */}
        <div className="flex flex-wrap items-center gap-3">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="number"
                step="0.1"
                min="5"
                max="45"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                placeholder="km/h"
                autoFocus
              />
              <span className="text-slate-400">km/h</span>
              <button
                type="button"
                disabled={saving || !(Number(draft) > 5 && Number(draft) < 45)}
                onClick={() => void save(Math.round(Number(draft) * 10) / 10)}
                className="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white disabled:opacity-40"
              >
                Save
              </button>
              {bests.map((b) => (
                <button
                  key={b.source}
                  type="button"
                  disabled={saving}
                  onClick={() => void save(Math.round(b.kph * 10) / 10)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:border-slate-300"
                >
                  Use {b.source} best {f1(b.kph)}
                </button>
              ))}
              {usingManual ? (
                <button type="button" disabled={saving} onClick={() => void save(null)} className="px-2 py-1 text-slate-400 hover:text-slate-600">
                  Clear
                </button>
              ) : null}
              <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-slate-400 hover:text-slate-600">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="text-right">
                <p className="text-2xl font-semibold tabular-nums text-slate-900">
                  {f1(mv)}
                  <span className="ml-1 text-xs font-normal text-slate-400">km/h</span>
                </p>
                <p className="text-[0.7rem] text-slate-400">
                  {usingManual
                    ? `Set${manual?.setAt ? ` ${formatDisplayDate(manual.setAt)}` : ""}`
                    : bestOverall
                      ? `Best recorded: ${bestOverall.source}, ${formatDisplayDate(bestOverall.date)}`
                      : "Not set"}
                </p>
              </div>
              {!columnMissing ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(mv != null ? mv.toFixed(1) : "");
                    setEditing(true);
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-300"
                >
                  {usingManual ? "Edit" : "Set max velocity"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {columnMissing ? (
        <p className="mt-2 text-[0.7rem] text-amber-600">Saving a max velocity needs a database update. Using best recorded speed for now.</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      {fasterThanMv ? (
        <p className="mt-2 text-xs text-amber-700">
          Faster than the set max velocity: {f1(fasterThanMv.kph)} km/h ({fasterThanMv.source}, {formatDisplayDate(fasterThanMv.date)}).{" "}
          <button type="button" className="underline" onClick={() => void save(Math.round(fasterThanMv.kph * 10) / 10)}>
            Update
          </button>
        </p>
      ) : null}

      {mv != null && withPct.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums">
            <span>
              <span className="text-slate-400">Latest </span>
              <span className="font-semibold text-slate-800">{Math.round(withPct.at(-1)!.pct!)}%</span>
              <span className="text-slate-400"> ({f1(withPct.at(-1)!.speed)} km/h, {withPct.at(-1)!.dateLabel})</span>
            </span>
            <span>
              <span className="text-slate-400">Days since {HIGH}%+ MV </span>
              {daysSinceHit != null && lastHit ? (
                <>
                  <span
                    className={`font-semibold ${
                      daysSinceHit > 14 ? "text-rose-600" : daysSinceHit > 7 ? "text-amber-600" : "text-slate-800"
                    }`}
                  >
                    {daysSinceHit}
                  </span>
                  <span className="text-slate-400"> (last {lastHit.dateLabel}, {Math.round(lastHit.pct!)}%)</span>
                </>
              ) : (
                <span className="font-semibold text-slate-500">none in range</span>
              )}
            </span>
          </div>
          <ZoomableChart title="% of max velocity per session" height={180} className="mt-2 w-full rounded-xl border border-slate-200 bg-white">
            {(h) => (
              <ResponsiveContainer width="100%" height={h}>
                <LineChart data={data} margin={{ top: 22, right: 16, left: 0, bottom: -6 }}>
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
                    domain={[yMin, yMax]}
                    tick={CHART_AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <ReferenceArea y1={HIGH} y2={yMax} fill="#ecfccb" fillOpacity={0.8} ifOverflow="hidden" />
                  <ReferenceLine y={NEAR} stroke="#a3e635" strokeDasharray="4 4" />
                  <ReferenceLine y={100} stroke="#cbd5e1" />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{ color: "#94a3b8" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    labelFormatter={(i) => {
                      const p = data[Number(i)];
                      return p ? `${p.dateLabel}${p.type ? ` · ${p.type}` : ""}` : "";
                    }}
                    formatter={(v, _n, item) => {
                      const sp = (item?.payload as { speed?: number } | undefined)?.speed;
                      return [`${Math.round(Number(v))}% (${f1(sp)} km/h)`, "Of max velocity"];
                    }}
                  />
                  <Line
                    dataKey="pct"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    connectNulls
                    isAnimationActive={false}
                    dot={(props: { cx?: number; cy?: number; payload?: { pct: number | null }; index?: number }) => {
                      const { cx, cy, payload, index } = props;
                      if (cx == null || cy == null || payload?.pct == null) return <g key={index} />;
                      const hit = payload.pct >= HIGH;
                      return (
                        <circle
                          key={index}
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill={hit ? "#65a30d" : "#ffffff"}
                          stroke={hit ? "#ffffff" : "#94a3b8"}
                          strokeWidth={1.5}
                        />
                      );
                    }}
                  >
                    {data.length <= 30 ? (
                      <LabelList
                        dataKey="pct"
                        position="top"
                        offset={9}
                        formatter={(v) => (v == null ? "" : Number(v).toFixed(1))}
                        style={{ fontSize: 10, fill: "#334155", fontWeight: 600 }}
                      />
                    ) : null}
                    {data.length <= 30 ? (
                      <LabelList
                        dataKey="speed"
                        position="bottom"
                        offset={9}
                        formatter={(v) => (v == null ? "" : Number(v).toFixed(1))}
                        style={{ fontSize: 9.5, fill: "#e11d48" }}
                      />
                    ) : null}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            )}
          </ZoomableChart>
          <p className="mt-1.5 text-[0.7rem] text-slate-400">
            Dark labels: % of max velocity. Red labels: session top speed (km/h). Green zone ≥{HIGH}%, dashed line {NEAR}%.
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No session top speeds in this range.</p>
      )}
    </div>
  );
}
