"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

const METRIC_LABELS: Record<string, string> = {
  fp_jump_height: "Jump Height",
  fp_jump_height_cm_best: "Jump Height",
  fp_rsi_best: "RSI",
  fp_mrsi: "mRSI",
  fp_flight_time: "Flight Time",
  fp_flight_time_s_best: "Flight Time",
  fp_contact_time: "Contact Time",
  fp_contact_time_s_best: "Contact Time",
  fp_peak_braking_force: "Peak Braking Force",
  fp_peak_propulsive_force: "Peak Propulsive Force",
  fp_avg_braking_velocity: "Avg Braking Velocity",
  fp_avg_propulsive_velocity: "Avg Propulsive Velocity",
  fp_landing_height: "Landing Height",
  fp_landing_performance_index: "Landing Performance Index",
  fp_landing_phase: "Landing Phase",
  fp_system_weight: "System Weight",
  fp_drop_height: "Drop Height",
  fp_box_height: "Box Height",
  fp_spring_like_correlation: "Spring Like Correlation",
  fp_time_to_peak_braking_force: "Time to Peak Braking Force",
  fp_jump_momentum: "Jump Momentum",
  fp_peak_relative_braking_force: "Peak Relative Braking Force",
  fp_peak_relative_propulsive_force: "Peak Relative Propulsive Force",
  fp_avg_braking_force: "Avg Braking Force",
  fp_avg_relative_braking_force: "Avg Relative Braking Force",
  fp_braking_impulse: "Braking Impulse",
  fp_relative_braking_impulse: "Relative Braking Impulse",
  fp_braking_net_impulse: "Braking Net Impulse",
  fp_relative_braking_net_impulse: "Relative Braking Net Impulse",
  fp_avg_propulsive_force: "Avg Propulsive Force",
  fp_avg_relative_propulsive_force: "Avg Relative Propulsive Force",
  fp_braking_phase: "Braking Phase",
  fp_propulsive_phase: "Propulsive Phase",
  fp_time_to_takeoff: "Time to Takeoff",
  fp_takeoff_velocity: "Takeoff Velocity",
  fp_peak_velocity: "Peak Velocity",
  fp_impact_peak: "Impact Peak",
  fp_stiffness: "Stiffness",
  fp_countermovement_depth: "CM Depth",
  fp_braking_rfd: "Braking RFD",
  fp_unweighting_phase: "Unweighting Phase",
  fp_peak_landing_force: "Peak Landing Force",
  fp_landing_stiffness: "Landing Stiffness",
  peakSpeed: "Peak Speed",
  peakForce: "Peak Force",
  peakPower: "Peak Power",
  split5m: "Split 5m",
  split10m: "Split 10m",
  split20m: "Split 20m",
};

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function labelForMetricKey(key: string): string {
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  if (key.startsWith("fp_")) {
    const rest = key.slice(3);
    const spaced = rest.replace(/_/g, " ");
    return titleCaseWords(spaced);
  }
  return key.includes("_") ? key.replace(/_/g, " ") : key;
}

type Athlete = Record<string, unknown> & {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type SessionRow = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type: string | null;
  source: string | null;
};

type MetricRow = {
  session_id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
};

function bucket(
  source: string | null
): "hawkins" | "1080" | "csv" {
  const s = (source ?? "").toLowerCase();
  if (s === "hawkins" || s === "hawkins_csv") return "hawkins";
  if (s === "1080" || s === "1080_csv") return "1080";
  return "csv";
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatChartAxisDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "Australia/Sydney",
    });
  } catch {
    return "—";
  }
}

function isCmjSession(s: SessionRow): boolean {
  const tt = (s.test_type ?? "").toLowerCase();
  const st = (s.test_sub_type ?? "").toLowerCase();
  if (tt === "force_plate_dj") return false;
  if (tt === "force_plate_cmj") return true;
  if (tt.includes("dj") || tt.includes("drop")) return false;
  if (tt.includes("cmj")) return true;
  if (st.includes("dj") || st.includes("drop")) return false;
  if (st.includes("cmj")) return true;
  return false;
}

function isDjSession(s: SessionRow): boolean {
  const tt = (s.test_type ?? "").toLowerCase();
  const st = (s.test_sub_type ?? "").toLowerCase();
  if (tt === "force_plate_dj") return true;
  if (tt === "force_plate_cmj") return false;
  if (tt.includes("dj") || tt.includes("drop")) return true;
  if (st.includes("dj") || st.includes("drop")) return true;
  return false;
}

function metricAggregate(
  map: Map<string, MetricRow[]>,
  sessionId: string,
  key: string,
  mode: "max" | "min"
): number | null {
  const rows =
    map.get(sessionId)?.filter((r) => r.key === key && r.value != null) ?? [];
  if (rows.length === 0) return null;
  const vals = rows.map((r) => r.value!);
  return mode === "max" ? Math.max(...vals) : Math.min(...vals);
}

function sessionsChronological(sess: SessionRow[]): SessionRow[] {
  return [...sess].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });
}

type TrendChartId =
  | "jumpHeight"
  | "rsi"
  | "contact"
  | "peakBrake"
  | "concentric"
  | "eccentric";

const ALL_TREND_CHART_IDS: TrendChartId[] = [
  "jumpHeight",
  "rsi",
  "contact",
  "peakBrake",
  "concentric",
  "eccentric",
];

const TREND_CHART_PILLS: { id: TrendChartId; label: string }[] = [
  { id: "jumpHeight", label: "Jump Height" },
  { id: "rsi", label: "RSI/mRSI" },
  { id: "contact", label: "Contact Time" },
  { id: "peakBrake", label: "Peak Braking Force" },
  { id: "concentric", label: "Propulsive Impulse" },
  { id: "eccentric", label: "Braking Impulse" },
];

export default function AthleteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const staffOk = useRequireDashboardStaff();

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [metricsBySession, setMetricsBySession] = useState<
    Map<string, MetricRow[]>
  >(() => new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleTrendCharts, setVisibleTrendCharts] = useState<
    Set<TrendChartId>
  >(() => new Set(ALL_TREND_CHART_IDS));

  useEffect(() => {
    if (!staffOk || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: a, error: aErr } = await supabase
        .from("athletes")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      if (aErr || !a) {
        setError(aErr?.message ?? "Athlete not found");
        setLoading(false);
        return;
      }

      const { data: s, error: sErr } = await supabase
        .from("sessions")
        .select("id, session_date, test_type, test_sub_type, source")
        .eq("athlete_id", id)
        .order("session_date", { ascending: false });

      if (cancelled) return;
      if (sErr) {
        setError(sErr.message);
        setLoading(false);
        return;
      }

      const sess = (s ?? []) as SessionRow[];
      setAthlete(a as Athlete);
      setSessions(sess);

      const sids = sess.map((x) => x.id);
      if (sids.length === 0) {
        setMetricsBySession(new Map());
        setLoading(false);
        return;
      }

      const { data: mrows, error: mErr } = await supabase
        .from("metrics")
        .select("session_id, key, value, rep_index")
        .in("session_id", sids);

      if (cancelled) return;
      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        return;
      }

      const map = new Map<string, MetricRow[]>();
      for (const row of (mrows ?? []) as MetricRow[]) {
        const list = map.get(row.session_id) ?? [];
        list.push(row);
        map.set(row.session_id, list);
      }
      setMetricsBySession(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk, id]);

  const grouped = useMemo(() => {
    const h: SessionRow[] = [];
    const m: SessionRow[] = [];
    const c: SessionRow[] = [];
    for (const s of sessions) {
      const b = bucket(s.source);
      if (b === "1080") m.push(s);
      else if (b === "csv") c.push(s);
      else h.push(s);
    }
    return { hawkins: h, motion1080: m, csv: c };
  }, [sessions]);

  const trendJumpHeight = useMemo(() => {
    const sorted = sessionsChronological(sessions);
    const points: {
      t: number;
      label: string;
      CMJ: number | null;
      DJ: number | null;
    }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "fp_jump_height", "max");
      if (v == null) continue;
      const t = new Date(s.session_date).getTime();
      const label = formatChartAxisDate(s.session_date);
      if (isCmjSession(s)) {
        points.push({ t, label, CMJ: v, DJ: null });
      } else if (isDjSession(s)) {
        points.push({ t, label, CMJ: null, DJ: v });
      }
    }
    const n =
      points.filter((p) => p.CMJ != null).length +
      points.filter((p) => p.DJ != null).length;
    return { points, enough: n >= 2 };
  }, [sessions, metricsBySession]);

  const trendRsi = useMemo(() => {
    const sorted = sessionsChronological(sessions);
    const points: {
      t: number;
      label: string;
      RSI: number | null;
      mRSI: number | null;
    }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const rsi = metricAggregate(metricsBySession, s.id, "fp_rsi_best", "max");
      const mrsi = metricAggregate(metricsBySession, s.id, "fp_mrsi", "max");
      if (rsi == null && mrsi == null) continue;
      const t = new Date(s.session_date).getTime();
      const label = formatChartAxisDate(s.session_date);
      points.push({ t, label, RSI: rsi, mRSI: mrsi });
    }
    return { points, enough: points.length >= 2 };
  }, [sessions, metricsBySession]);

  const trendContactDj = useMemo(() => {
    const sorted = sessionsChronological(sessions);
    const points: { t: number; label: string; ct: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date || !isDjSession(s)) continue;
      const v = metricAggregate(
        metricsBySession,
        s.id,
        "fp_contact_time",
        "min"
      );
      if (v == null) continue;
      const t = new Date(s.session_date).getTime();
      const label = formatChartAxisDate(s.session_date);
      points.push({ t, label, ct: v });
    }
    return { points, enough: points.length >= 2 };
  }, [sessions, metricsBySession]);

  const trendPeakBrake = useMemo(() => {
    const sorted = sessionsChronological(sessions);
    const points: { t: number; label: string; f: number }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(
        metricsBySession,
        s.id,
        "fp_peak_braking_force",
        "max"
      );
      if (v == null) continue;
      const t = new Date(s.session_date).getTime();
      const label = formatChartAxisDate(s.session_date);
      points.push({ t, label, f: v });
    }
    return { points, enough: points.length >= 2 };
  }, [sessions, metricsBySession]);

  const trendConcentric = useMemo(() => {
    const sorted = sessionsChronological(sessions);
    const points: {
      t: number;
      label: string;
      CMJ: number | null;
      DJ: number | null;
    }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(
        metricsBySession,
        s.id,
        "fp_propulsive_impulse",
        "max"
      );
      if (v == null) continue;
      const t = new Date(s.session_date).getTime();
      const label = formatChartAxisDate(s.session_date);
      if (isCmjSession(s)) {
        points.push({ t, label, CMJ: v, DJ: null });
      } else if (isDjSession(s)) {
        points.push({ t, label, CMJ: null, DJ: v });
      }
    }
    const n =
      points.filter((p) => p.CMJ != null).length +
      points.filter((p) => p.DJ != null).length;
    return { points, enough: n >= 2 };
  }, [sessions, metricsBySession]);

  const trendEccentric = useMemo(() => {
    const sorted = sessionsChronological(sessions);
    const points: {
      t: number;
      label: string;
      CMJ: number | null;
      DJ: number | null;
    }[] = [];
    for (const s of sorted) {
      if (!s.session_date) continue;
      const v = metricAggregate(
        metricsBySession,
        s.id,
        "fp_braking_impulse",
        "max"
      );
      if (v == null) continue;
      const t = new Date(s.session_date).getTime();
      const label = formatChartAxisDate(s.session_date);
      if (isCmjSession(s)) {
        points.push({ t, label, CMJ: v, DJ: null });
      } else if (isDjSession(s)) {
        points.push({ t, label, CMJ: null, DJ: v });
      }
    }
    const n =
      points.filter((p) => p.CMJ != null).length +
      points.filter((p) => p.DJ != null).length;
    return { points, enough: n >= 2 };
  }, [sessions, metricsBySession]);

  const name = athlete
    ? `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() ||
      "Athlete"
    : "";

  function toggleExpand(sid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  function toggleTrendChart(chartId: TrendChartId) {
    setVisibleTrendCharts((prev) => {
      const next = new Set(prev);
      if (next.has(chartId)) next.delete(chartId);
      else next.add(chartId);
      return next;
    });
  }

  function renderSessionSection(title: string, list: SessionRow[]) {
    if (list.length === 0) {
      return (
        <p className="text-xs text-slate-500">No sessions in this group.</p>
      );
    }
    return (
      <div className="space-y-2">
        {list.map((s) => {
          const rows = metricsBySession.get(s.id) ?? [];
          const count = rows.length;
          const open = expanded.has(s.id);
          return (
            <div
              key={s.id}
              className="rounded-lg border border-slate-800 bg-slate-900/50"
            >
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-900"
                onClick={() => toggleExpand(s.id)}
              >
                <span className="text-slate-200">
                  {formatWhen(s.session_date)}
                </span>
                <span className="text-xs text-slate-500">
                  {s.test_type ?? "—"}
                  {s.test_sub_type ? ` · ${s.test_sub_type}` : ""}
                  {" · "}
                  {count} metrics
                </span>
              </button>
              {open ? (
                <div className="border-t border-slate-800 px-3 py-2">
                  {rows.length === 0 ? (
                    <p className="text-xs text-slate-500">No metrics.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.key}-${r.rep_index ?? i}`} className="border-b border-slate-800/80">
                            <td className="py-1 pr-2 text-slate-400">
                              {labelForMetricKey(r.key)}
                              {r.rep_index != null ? ` (rep ${r.rep_index})` : ""}
                            </td>
                            <td className="py-1 text-right font-mono text-slate-200">
                              {r.value != null ? String(r.value) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-4xl px-4 pt-8 pb-20">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/athletes"
            className="text-xs text-slate-400 hover:text-lime-300"
          >
            ← Athletes
          </Link>
          <Link
            href={`/dashboard/athletes/${id}/edit`}
            className="ml-auto text-xs text-lime-300 hover:underline"
          >
            Edit
          </Link>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-rose-400">{error}</p>
        ) : athlete ? (
          <>
            <header className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h1 className="text-xl font-semibold text-slate-50">{name}</h1>
              <dl className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-slate-500">Team</dt>
                  <dd className="text-slate-200">
                    {(athlete.team as string) ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Sport</dt>
                  <dd className="text-slate-200">
                    {(athlete.primary_sport as string) ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Email</dt>
                  <dd className="text-slate-200">
                    {(athlete.email as string) ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Height</dt>
                  <dd className="text-slate-200">
                    {athlete.height_cm != null
                      ? `${athlete.height_cm} cm`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Weight</dt>
                  <dd className="text-slate-200">
                    {athlete.weight_kg != null
                      ? `${athlete.weight_kg} kg`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Dominant</dt>
                  <dd className="text-slate-200">
                    {(athlete.dominant_leg as string) ?? "—"} /{" "}
                    {(athlete.dominant_hand as string) ?? "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-slate-500">Notes</dt>
                  <dd className="text-slate-300 whitespace-pre-wrap">
                    {(athlete.notes as string) ?? "—"}
                  </dd>
                </div>
              </dl>
            </header>

            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-lime-300">
              Performance trends
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {TREND_CHART_PILLS.map(({ id, label }) => {
                const on = visibleTrendCharts.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleTrendChart(id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      on
                        ? "border-lime-400 bg-lime-400/15 text-lime-300"
                        : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {visibleTrendCharts.has("jumpHeight") ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-3 text-xs font-medium text-slate-400">
                  Jump height over time
                </h3>
                {trendJumpHeight.enough ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendJumpHeight.points}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(ts) =>
                            formatChartAxisDate(
                              new Date(Number(ts)).toISOString()
                            )
                          }
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          tickFormatter={(v) => Number(v).toFixed(2)}
                          label={{
                            value: "m",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgb(15 23 42)",
                            border: "1px solid rgb(30 41 59)",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                          labelFormatter={(_, payload) =>
                            payload[0]?.payload?.label ?? ""
                          }
                          formatter={(value: number | string) =>
                            typeof value === "number"
                              ? value.toFixed(2)
                              : String(value)
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="CMJ"
                          name="CMJ"
                          stroke="#84cc16"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="DJ"
                          name="DJ"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-16 text-center text-xs text-slate-500">
                    Not enough data
                  </p>
                )}
              </div>
              ) : null}

              {visibleTrendCharts.has("rsi") ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-3 text-xs font-medium text-slate-400">
                  RSI / mRSI over time
                </h3>
                {trendRsi.enough ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendRsi.points}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(ts) =>
                            formatChartAxisDate(
                              new Date(Number(ts)).toISOString()
                            )
                          }
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          tickFormatter={(v) => Number(v).toFixed(2)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgb(15 23 42)",
                            border: "1px solid rgb(30 41 59)",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                          labelFormatter={(_, payload) =>
                            payload[0]?.payload?.label ?? ""
                          }
                          formatter={(value: number | string) =>
                            typeof value === "number"
                              ? value.toFixed(2)
                              : String(value)
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="RSI"
                          name="RSI"
                          stroke="#84cc16"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="mRSI"
                          name="mRSI"
                          stroke="#fbbf24"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-16 text-center text-xs text-slate-500">
                    Not enough data
                  </p>
                )}
              </div>
              ) : null}

              {visibleTrendCharts.has("contact") ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-3 text-xs font-medium text-slate-400">
                  Contact time over time (DJ)
                </h3>
                {trendContactDj.enough ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendContactDj.points}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(ts) =>
                            formatChartAxisDate(
                              new Date(Number(ts)).toISOString()
                            )
                          }
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          tickFormatter={(v) => Number(v).toFixed(3)}
                          label={{
                            value: "s",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgb(15 23 42)",
                            border: "1px solid rgb(30 41 59)",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                          labelFormatter={(_, payload) =>
                            payload[0]?.payload?.label ?? ""
                          }
                          formatter={(value: number | string) =>
                            typeof value === "number"
                              ? value.toFixed(3)
                              : String(value)
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="ct"
                          name="Contact time"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-16 text-center text-xs text-slate-500">
                    Not enough data
                  </p>
                )}
              </div>
              ) : null}

              {visibleTrendCharts.has("peakBrake") ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-3 text-xs font-medium text-slate-400">
                  Peak braking force over time
                </h3>
                {trendPeakBrake.enough ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendPeakBrake.points}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(ts) =>
                            formatChartAxisDate(
                              new Date(Number(ts)).toISOString()
                            )
                          }
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          tickFormatter={(v) => Math.round(Number(v)).toString()}
                          label={{
                            value: "N",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgb(15 23 42)",
                            border: "1px solid rgb(30 41 59)",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                          labelFormatter={(_, payload) =>
                            payload[0]?.payload?.label ?? ""
                          }
                          formatter={(value: number | string) =>
                            typeof value === "number"
                              ? Math.round(value).toString()
                              : String(value)
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="f"
                          name="Peak braking force"
                          stroke="#f43f5e"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-16 text-center text-xs text-slate-500">
                    Not enough data
                  </p>
                )}
              </div>
              ) : null}

              {visibleTrendCharts.has("concentric") ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-3 text-xs font-medium text-slate-400">
                  Propulsive Impulse over time
                </h3>
                {trendConcentric.enough ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendConcentric.points}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(ts) =>
                            formatChartAxisDate(
                              new Date(Number(ts)).toISOString()
                            )
                          }
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          tickFormatter={(v) => Number(v).toFixed(1)}
                          label={{
                            value: "N·s",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgb(15 23 42)",
                            border: "1px solid rgb(30 41 59)",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                          labelFormatter={(_, payload) =>
                            payload[0]?.payload?.label ?? ""
                          }
                          formatter={(value: number | string) =>
                            typeof value === "number"
                              ? value.toFixed(1)
                              : String(value)
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="CMJ"
                          name="CMJ"
                          stroke="#84cc16"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="DJ"
                          name="DJ"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-16 text-center text-xs text-slate-500">
                    Not enough data
                  </p>
                )}
              </div>
              ) : null}

              {visibleTrendCharts.has("eccentric") ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="mb-3 text-xs font-medium text-slate-400">
                  Braking Impulse over time
                </h3>
                {trendEccentric.enough ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendEccentric.points}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(ts) =>
                            formatChartAxisDate(
                              new Date(Number(ts)).toISOString()
                            )
                          }
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          tickFormatter={(v) => Number(v).toFixed(1)}
                          label={{
                            value: "N·s",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgb(15 23 42)",
                            border: "1px solid rgb(30 41 59)",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                          labelFormatter={(_, payload) =>
                            payload[0]?.payload?.label ?? ""
                          }
                          formatter={(value: number | string) =>
                            typeof value === "number"
                              ? value.toFixed(1)
                              : String(value)
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="CMJ"
                          name="CMJ"
                          stroke="#84cc16"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="DJ"
                          name="DJ"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-16 text-center text-xs text-slate-500">
                    Not enough data
                  </p>
                )}
              </div>
              ) : null}
            </div>

            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-lime-300">
              Sessions
            </h2>

            <div className="mt-4 space-y-8">
              <div>
                <h3 className="mb-2 text-xs font-medium text-slate-400">
                  Hawkins
                </h3>
                {renderSessionSection("Hawkins", grouped.hawkins)}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-slate-400">
                  1080 Motion
                </h3>
                {renderSessionSection("1080", grouped.motion1080)}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-slate-400">
                  CSV uploads
                </h3>
                {renderSessionSection("CSV", grouped.csv)}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
