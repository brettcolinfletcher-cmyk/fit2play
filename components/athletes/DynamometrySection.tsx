"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import SectionComment from "./SectionComment";
import { supabase } from "@/lib/supabaseClient";
import { formatDisplayDate } from "@/lib/dateDisplay";

// ── Types ─────────────────────────────────────────────────────────────────────

type MetricRow = { key: string; value: string; side: string | null };
type Session = {
  id: string;
  session_date: string;
  test_sub_type: string | null;
  metrics: MetricRow[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parse segment string like "TS Isometric Test-Abduction-Right-Supine:1"
// into a human-readable label: "Abduction – Right – Supine (rep 1)"
function parseSegmentLabel(segment: string | null): string {
  if (!segment) return "Isometric Test";
  // Strip leading "TS Isometric Test-" or similar prefix
  const cleaned = segment
    .replace(/^TS\s+/i, "")
    .replace(/^Isometric\s+Test[-\s]*/i, "");
  // Split on ":" to get rep number
  const [name, repStr] = cleaned.split(":");
  const parts = name.split("-").map((p) => p.trim()).filter(Boolean);
  const label = parts.join(" – ");
  const rep = repStr ? ` (rep ${repStr.trim()})` : "";
  return label + rep;
}

// The key metrics to show in trend charts — subset of what HHD returns
const TREND_METRICS: { key: string; label: string; unit: string }[] = [
  { key: "peak_force", label: "Peak Force", unit: "N" },
  { key: "peak_net_force", label: "Peak Net Force", unit: "N" },
  { key: "net_impulse", label: "Net Impulse", unit: "N·s" },
  { key: "peak_rfd", label: "Peak RFD", unit: "N/s" },
  { key: "time_to_peak_force", label: "Time to Peak Force", unit: "s" },
  { key: "explosive_strength_index", label: "Explosive Strength Index", unit: "" },
];

const ALL_METRIC_LABELS: Record<string, string> = {
  peak_force: "Peak Force (N)",
  peak_net_force: "Peak Net Force (N)",
  avg_force: "Avg Force (N)",
  avg_net_force: "Avg Net Force (N)",
  net_impulse: "Net Impulse (N·s)",
  total_impulse: "Total Impulse (N·s)",
  peak_rfd: "Peak RFD (N/s)",
  time_to_peak_force: "Time to Peak Force (s)",
  duration: "Duration (s)",
  explosive_strength_index: "Explosive Strength Index",
  pretension: "Pretension (N)",
  net_force_at_50_ms: "Net Force @ 50ms (N)",
  net_force_at_100_ms: "Net Force @ 100ms (N)",
  net_force_at_150_ms: "Net Force @ 150ms (N)",
  net_force_at_200_ms: "Net Force @ 200ms (N)",
  net_force_at_250_ms: "Net Force @ 250ms (N)",
};

// Group sessions by muscle/movement (strip rep number from segment)
function groupKey(session: Session): string {
  if (!session.test_sub_type) return "Unknown";
  return session.test_sub_type.replace(/:\d+$/, "").trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  athleteId: string;
  sectionComment: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

export default function DynamometrySection({ athleteId, sectionComment, dateFrom, dateTo }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from("sessions")
        .select("id, session_date, test_sub_type, metrics(key, value, side)")
        .eq("athlete_id", athleteId)
        .eq("source", "hawkins")
        .order("session_date", { ascending: true });

      if (dateFrom) query = query.gte("session_date", dateFrom.toISOString().slice(0, 10));
      if (dateTo) query = query.lte("session_date", dateTo.toISOString().slice(0, 10));

      const { data } = await query;
      setSessions((data as Session[]) ?? []);
      setLoading(false);
    }
    load();
  }, [athleteId, dateFrom, dateTo]);

  if (loading) {
    return (
      <section id="dynamometry" className="scroll-mt-28 mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">Dynamometry</h2>
        <div className="mt-4 h-24 rounded-lg border border-slate-800 bg-slate-900/50 animate-pulse" />
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section id="dynamometry" className="scroll-mt-28 mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">Dynamometry</h2>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
          <p className="text-sm text-slate-500">
            No dynamometry data yet.{" "}
            <Link href="/dashboard/upload" className="text-lime-400/90 hover:text-lime-300 hover:underline">
              Upload data →
            </Link>
          </p>
        </div>
        <SectionComment athleteId={athleteId} section="dynamometry" initialComment={sectionComment} />
      </section>
    );
  }

  // Group sessions by muscle/movement
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = groupKey(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  return (
    <section id="dynamometry" className="scroll-mt-28 mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">Dynamometry</h2>

      <div className="mt-4 space-y-4">
        {Array.from(groups.entries()).map(([gKey, gSessions]) => {
          const isExpanded = expandedGroup === gKey;
          const label = parseSegmentLabel(gSessions[0].test_sub_type);
          // Remove rep suffix for group label
          const groupLabel = label.replace(/\s*\(rep \d+\)$/, "");

          // Build trend data — one point per session (best rep = highest peak_force)
          // For sessions with multiple reps group by date
          const trendByDate = new Map<string, MetricRow[]>();
          for (const s of gSessions) {
            const existing = trendByDate.get(s.session_date);
            if (!existing) {
              trendByDate.set(s.session_date, s.metrics);
            } else {
              // Keep session with higher peak_force
              const existingPeak = Number(existing.find(m => m.key === "peak_force")?.value ?? 0);
              const thisPeak = Number(s.metrics.find(m => m.key === "peak_force")?.value ?? 0);
              if (thisPeak > existingPeak) trendByDate.set(s.session_date, s.metrics);
            }
          }

          const trendData = Array.from(trendByDate.entries()).map(([date, metrics]) => {
            const point: Record<string, string | number> = { date: formatDisplayDate(date) };
            for (const m of metrics) {
              point[m.key] = Number(m.value);
            }
            return point;
          });

          const side = gSessions[0].metrics[0]?.side;
          const sideLabel = side ? ` · ${side.charAt(0).toUpperCase() + side.slice(1)}` : "";

          return (
            <div key={gKey} className="rounded-lg border border-slate-800 bg-slate-900/50">
              {/* Header */}
              <button
                onClick={() => setExpandedGroup(isExpanded ? null : gKey)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <span className="text-sm font-medium text-slate-200">{groupLabel}</span>
                  <span className="ml-2 text-xs text-slate-500">{sideLabel} · {gSessions.length} session{gSessions.length !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-slate-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
              </button>

              {/* Summary row — latest values */}
              {!isExpanded && trendData.length > 0 && (
                <div className="px-5 pb-4 grid grid-cols-3 gap-3 border-t border-slate-800/60">
                  {TREND_METRICS.slice(0, 3).map(({ key, label, unit }) => {
                    const latest = trendData[trendData.length - 1];
                    const val = latest?.[key];
                    return (
                      <div key={key} className="pt-3">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="text-lg font-semibold text-slate-100">
                          {val != null ? Number(val).toFixed(1) : "—"}
                          {unit && <span className="text-xs text-slate-500 ml-1">{unit}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Expanded — trend charts + full metric table */}
              {isExpanded && (
                <div className="border-t border-slate-800/60 px-5 py-4 space-y-6">
                  {/* Trend charts */}
                  {trendData.length > 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {TREND_METRICS.map(({ key, label, unit }) => (
                        <div key={key}>
                          <p className="text-xs text-slate-400 mb-2">{label}{unit ? ` (${unit})` : ""}</p>
                          <ResponsiveContainer width="100%" height={140}>
                            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                              <Tooltip
                                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6 }}
                                labelStyle={{ color: "#94a3b8", fontSize: 11 }}
                                itemStyle={{ color: "#a3e635", fontSize: 11 }}
                              />
                              <Line
                                type="monotone"
                                dataKey={key}
                                stroke="#a3e635"
                                strokeWidth={2}
                                dot={{ fill: "#a3e635", r: 3 }}
                                activeDot={{ r: 5 }}
                                connectNulls
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ))}
                    </div>
                  )}

                  {trendData.length === 1 && (
                    <p className="text-xs text-slate-500">Only one session — trend charts will appear after more tests.</p>
                  )}

                  {/* All sessions — metric table */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">All Sessions</p>
                    {gSessions.map((s) => (
                      <div key={s.id} className="rounded border border-slate-800 bg-slate-950/40 overflow-hidden">
                        <div className="px-4 py-2 bg-slate-800/40 flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-300">{formatDisplayDate(s.session_date)}</span>
                          <span className="text-xs text-slate-500">{parseSegmentLabel(s.test_sub_type)}</span>
                        </div>
                        <div className="divide-y divide-slate-800/60">
                          {s.metrics.map((m) => (
                            <div key={m.key} className="flex justify-between px-4 py-1.5">
                              <span className="text-xs text-slate-400">
                                {ALL_METRIC_LABELS[m.key] ?? m.key.replace(/_/g, " ")}
                              </span>
                              <span className="text-xs font-mono text-slate-200">
                                {Number(m.value).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SectionComment athleteId={athleteId} section="dynamometry" initialComment={sectionComment} />
    </section>
  );
}
