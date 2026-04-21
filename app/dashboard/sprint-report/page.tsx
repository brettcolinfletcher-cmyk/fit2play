"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Athlete = { id: string; first_name: string | null; last_name: string | null };
type SessionRow = { id: string; athlete_id: string; created_at: string; session_date: string | null; test_type: string | null };
type MetricRow = { session_id: string; key: string; value: number };
type ReportRow = {
  date: string; rawDate: string;
  topSpeed: number | null; totalTime: number | null;
  split5m: number | null; maxAcceleration: number | null;
  peakForce: number | null; peakPower: number | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" });
}
function athleteName(a: Athlete) {
  return `${a.last_name ?? ""}, ${a.first_name ?? ""}`.trim().replace(/^,\s*/, "");
}
function fmt(v: number | null, decimals = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(decimals);
}
function isSprintType(t: string | null) {
  if (!t) return false;
  return t === "1080_sprint" || t.startsWith("1080") || t.includes("sprint");
}

const METRIC_CONFIG = [
  { key: "topSpeed",        label: "Top Speed (m/s)",  color: "#a3e635" },
  { key: "totalTime",       label: "Total Time (s)",   color: "#f97316" },
  { key: "split5m",         label: "0–5 m Time (s)",   color: "#60a5fa" },
  { key: "maxAcceleration", label: "Max Accel (m/s²)", color: "#34d399" },
];

export default function SprintReportPage() {
  const [athletes, setAthletes]     = useState<Athlete[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions]     = useState<SessionRow[]>([]);
  const [metrics, setMetrics]       = useState<MetricRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    new Set(METRIC_CONFIG.map((m) => m.key))
  );

  useEffect(() => {
    supabase.from("athletes").select("id, first_name, last_name")
      .order("last_name", { ascending: true })
      .then(({ data }) => {
        const list = (data ?? []) as Athlete[];
        setAthletes(list);
        if (list.length > 0) setSelectedId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    async function load() {
      const { data: sessData } = await supabase
        .from("sessions").select("id, athlete_id, created_at, session_date, test_type")
        .eq("athlete_id", selectedId).order("session_date", { ascending: true });
      const sprintSessions = ((sessData ?? []) as any[]).filter((s) => isSprintType(s.test_type)) as SessionRow[];
      setSessions(sprintSessions);
      if (!sprintSessions.length) { setMetrics([]); setLoading(false); return; }
      const ids = sprintSessions.map((s) => s.id);
      const { data: mData } = await supabase.from("metrics")
        .select("session_id, key, value").in("session_id", ids);
      setMetrics((mData ?? []) as MetricRow[]);
      setLoading(false);
    }
    load();
  }, [selectedId]);

  const reportRows = useMemo<ReportRow[]>(() => {
    const mm: Record<string, Record<string, number>> = {};
    for (const m of metrics) { if (!mm[m.session_id]) mm[m.session_id] = {}; mm[m.session_id][m.key] = m.value; }
    return sessions.map((s) => {
      const m = mm[s.id] ?? {};
      return {
        date: fmtDate(s.session_date ?? s.created_at), rawDate: s.session_date ?? s.created_at,
        topSpeed: m.top_speed ?? null, totalTime: m.total_time ?? null,
        split5m: m.split_5m_time ?? null, maxAcceleration: m.accel_max ?? null,
        peakForce: m.peak_force ?? null, peakPower: m.peak_power ?? null,
      };
    });
  }, [sessions, metrics]);

  const avg = useMemo(() => {
    const cols = ["topSpeed","totalTime","split5m","maxAcceleration","peakForce","peakPower"] as (keyof ReportRow)[];
    const r: Record<string, number | null> = {};
    for (const c of cols) {
      const vals = reportRows.map((row) => row[c] as number | null).filter((v): v is number => v != null);
      r[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return r;
  }, [reportRows]);

  function toggleMetric(key: string) {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); } else next.add(key);
      return next;
    });
  }

  const selectedAthlete = athletes.find((a) => a.id === selectedId);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />
      <div className="mx-auto max-w-7xl px-4 pt-8 pb-16">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">1080 Sprint — Longitudinal Report</h1>
          <p className="mt-1 text-xs text-slate-400">Select an athlete to view their sprint metrics across all testing sessions.</p>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <aside className="w-full shrink-0 lg:w-52">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">Athlete</h2>
              <ul className="space-y-1">
                {athletes.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => setSelectedId(a.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-[0.82rem] font-medium transition-colors ${
                        selectedId === a.id
                          ? "bg-lime-400/15 text-lime-300 ring-1 ring-lime-400/40"
                          : "text-slate-300 hover:bg-slate-800"}`}>
                      {athleteName(a)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-6">
            {selectedAthlete && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[0.7rem] uppercase tracking-widest text-slate-400">Viewing</p>
                  <p className="text-lg font-semibold">{selectedAthlete.first_name} {selectedAthlete.last_name}</p>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-[0.72rem] text-slate-300">
                  {reportRows.length} session{reportRows.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-slate-400">Loading…</p>
              </div>
            ) : reportRows.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-6 py-10 text-center">
                <p className="text-sm text-slate-400">No sprint sessions found for this athlete.</p>
              </div>
            ) : (<>
              <div className="flex flex-wrap gap-2">
                {METRIC_CONFIG.map((m) => (
                  <button key={m.key} onClick={() => toggleMetric(m.key)}
                    className={`rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-all ${
                      activeMetrics.has(m.key) ? "border-transparent text-slate-950" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                    style={activeMetrics.has(m.key) ? { backgroundColor: m.color } : {}}>
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-lime-300">Trend over time</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={reportRows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="speed" orientation="left" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <YAxis yAxisId="time" orientation="right" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, fontSize: 12, color: "#e2e8f0" }}
                      labelStyle={{ color: "#a3e635", fontWeight: 600 }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    {METRIC_CONFIG.filter((m) => activeMetrics.has(m.key)).map((m) => (
                      <Line key={m.key} yAxisId={m.key === "topSpeed" || m.key === "maxAcceleration" ? "speed" : "time"}
                        type="monotone" dataKey={m.key} name={m.label} stroke={m.color}
                        strokeWidth={2} dot={{ fill: m.color, r: 4 }} activeDot={{ r: 6 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      <th className="py-3 pl-5 pr-4 font-medium">Date</th>
                      <th className="py-3 px-4 font-medium">Top Speed (m/s)</th>
                      <th className="py-3 px-4 font-medium">Total Time (s)</th>
                      <th className="py-3 px-4 font-medium">0–5 m Time (s)</th>
                      <th className="py-3 px-4 font-medium">Max Accel (m/s²)</th>
                      <th className="py-3 px-4 font-medium">Peak Force (N)</th>
                      <th className="py-3 pr-5 pl-4 font-medium">Peak Power (W)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {reportRows.map((row, i) => (
                      <tr key={i} className="transition-colors hover:bg-slate-800/40">
                        <td className="py-3 pl-5 pr-4 text-xs font-medium text-slate-200">{row.date}</td>
                        <MC value={row.topSpeed}        avg={avg.topSpeed}        lb={false} dp={2} />
                        <MC value={row.totalTime}       avg={avg.totalTime}       lb={true}  dp={2} />
                        <MC value={row.split5m}         avg={avg.split5m}         lb={true}  dp={2} />
                        <MC value={row.maxAcceleration} avg={avg.maxAcceleration} lb={false} dp={2} />
                        <MC value={row.peakForce}       avg={avg.peakForce}       lb={false} dp={0} />
                        <MC value={row.peakPower}       avg={avg.peakPower}       lb={false} dp={0} />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-700 bg-slate-900/80 text-[0.72rem] font-semibold text-slate-300">
                      <td className="py-3 pl-5 pr-4 text-slate-400">Average</td>
                      <td className="py-3 px-4 text-lime-300">{fmt(avg.topSpeed)}</td>
                      <td className="py-3 px-4">{fmt(avg.totalTime)}</td>
                      <td className="py-3 px-4">{fmt(avg.split5m)}</td>
                      <td className="py-3 px-4">{fmt(avg.maxAcceleration)}</td>
                      <td className="py-3 px-4">{fmt(avg.peakForce, 0)}</td>
                      <td className="py-3 pr-5 pl-4">{fmt(avg.peakPower, 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[0.68rem] text-slate-500">
                <span className="mr-2 inline-block rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400">Green</span>better than average ·{" "}
                <span className="mr-2 inline-block rounded px-1.5 py-0.5 bg-red-500/15 text-red-400">Red</span>below average
              </p>
            </>)}
          </div>
        </div>
      </div>
    </main>
  );
}

function MC({ value, avg, lb, dp }: { value: number | null; avg: number | null | undefined; lb: boolean; dp: number }) {
  if (value == null || Number.isNaN(value)) return <td className="py-3 px-4 text-xs text-slate-400">—</td>;
  let color = "text-slate-200";
  if (avg != null && !Number.isNaN(avg) && avg !== 0) {
    if (lb ? value < avg : value > avg) color = "text-emerald-400";
    else if (lb ? value > avg : value < avg) color = "text-red-400";
  }
  return <td className={`py-3 px-4 text-xs tabular-nums font-medium ${color}`}>{value.toFixed(dp)}</td>;
}
