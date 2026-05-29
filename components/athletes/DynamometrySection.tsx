"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDisplayDate } from "@/lib/dateDisplay";
import { supabase } from "@/lib/supabaseClient";
import SectionComment from "./SectionComment";

type MetricRow = { key: string; value: string; side: string | null };
type Session = {
  id: string;
  session_date: string;
  test_sub_type: string | null;
  metrics: MetricRow[];
};

type Props = {
  athleteId: string;
  sectionComment: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

const AVAILABLE_METRICS = [
  { key: "peak_force", label: "Peak Force", unit: "N" },
  { key: "peak_net_force", label: "Peak Net Force", unit: "N" },
  { key: "net_impulse", label: "Net Impulse", unit: "N·s" },
  { key: "total_impulse", label: "Total Impulse", unit: "N·s" },
  { key: "peak_rfd", label: "Peak RFD", unit: "N/s" },
  { key: "time_to_peak_force", label: "Time to Peak Force", unit: "s" },
  { key: "explosive_strength_index", label: "Explosive Strength Index", unit: "" },
  { key: "avg_force", label: "Avg Force", unit: "N" },
  { key: "avg_net_force", label: "Avg Net Force", unit: "N" },
  { key: "duration", label: "Duration", unit: "s" },
  { key: "pretension", label: "Pretension", unit: "N" },
  { key: "net_force_at_50_ms", label: "Net Force @ 50ms", unit: "N" },
  { key: "net_force_at_100_ms", label: "Net Force @ 100ms", unit: "N" },
  { key: "net_force_at_150_ms", label: "Net Force @ 150ms", unit: "N" },
  { key: "net_force_at_200_ms", label: "Net Force @ 200ms", unit: "N" },
  { key: "net_force_at_250_ms", label: "Net Force @ 250ms", unit: "N" },
] as const;

const DEFAULT_SELECTED = new Set<string>(["peak_force", "net_impulse", "peak_rfd"]);

const METRIC_BY_KEY = new Map<string, (typeof AVAILABLE_METRICS)[number]>(
  AVAILABLE_METRICS.map((m) => [m.key, m])
);

const AXIS_TICK = { fill: "#64748b", fontSize: 10 };
const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "0.375rem",
  fontSize: "11px",
};

function groupKey(s: Session): string {
  return (s.test_sub_type ?? "Unknown").replace(/:\d+$/, "").trim();
}

function parseSegmentLabel(segment: string | null): string {
  if (!segment) return "Unknown";
  const cleaned = segment
    .replace(/^TS\s+/i, "")
    .replace(/^Isometric\s+Test[-\s]*/i, "");
  const colonIdx = cleaned.lastIndexOf(":");
  const name = colonIdx >= 0 ? cleaned.slice(0, colonIdx) : cleaned;
  const repStr = colonIdx >= 0 ? cleaned.slice(colonIdx + 1).trim() : "";
  const parts = name.split("-").map((p) => p.trim()).filter(Boolean);
  const label = parts.join(" – ");
  return repStr ? `${label} (rep ${repStr})` : label;
}

function groupHeading(segment: string | null): string {
  return parseSegmentLabel(segment).replace(/\s*\(rep \d+\)$/, "");
}

function metricValue(metrics: MetricRow[], key: string): number | null {
  const row = metrics.find((m) => m.key === key);
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : null;
}

function bestSessionForDate(sessions: Session[], date: string): Session | null {
  const onDate = sessions.filter((s) => s.session_date.slice(0, 10) === date.slice(0, 10));
  if (onDate.length === 0) return null;
  return onDate.reduce((best, cur) => {
    const bestPeak = metricValue(best.metrics, "peak_force") ?? -Infinity;
    const curPeak = metricValue(cur.metrics, "peak_force") ?? -Infinity;
    return curPeak > bestPeak ? cur : best;
  });
}

function buildTrendData(sessions: Session[]): Record<string, string | number>[] {
  const dates = [...new Set(sessions.map((s) => s.session_date.slice(0, 10)))].sort(
    (a, b) => a.localeCompare(b)
  );
  return dates.map((date) => {
    const best = bestSessionForDate(sessions, date);
    const point: Record<string, string | number> = {
      date: formatDisplayDate(`${date}T12:00:00`),
    };
    if (best) {
      for (const m of best.metrics) {
        const n = Number(m.value);
        if (Number.isFinite(n)) point[m.key] = n;
      }
    }
    return point;
  });
}

function latestSessionMetrics(sessions: Session[]): MetricRow[] {
  if (sessions.length === 0) return [];
  const latestDate = sessions[sessions.length - 1]!.session_date.slice(0, 10);
  return bestSessionForDate(sessions, latestDate)?.metrics ?? [];
}

function orderedMetricRows(metrics: MetricRow[]): MetricRow[] {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const ordered: MetricRow[] = [];
  for (const def of AVAILABLE_METRICS) {
    const row = byKey.get(def.key);
    if (row) ordered.push(row);
  }
  for (const m of metrics) {
    if (!METRIC_BY_KEY.has(m.key)) ordered.push(m);
  }
  return ordered;
}

function metricDisplayLabel(key: string): string {
  const def = METRIC_BY_KEY.get(key);
  if (def) return def.unit ? `${def.label} (${def.unit})` : def.label;
  return key.replace(/_/g, " ");
}

function MetricPicker({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
      >
        Metrics ({selected.size}) ▼
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl">
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {AVAILABLE_METRICS.map((m) => {
              const checked = selected.has(m.key);
              return (
                <li key={m.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-200 hover:bg-slate-900/80">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(selected);
                        if (checked) next.delete(m.key);
                        else next.add(m.key);
                        onChange(next);
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-lime-400"
                    />
                    <span>{m.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-end gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => onChange(new Set(DEFAULT_SELECTED))}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded bg-lime-400/20 px-2 py-1 text-xs font-medium text-lime-300 ring-1 ring-lime-500/40 hover:bg-lime-400/30"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function DynamometrySection({
  athleteId,
  sectionComment,
  dateFrom,
  dateTo,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED)
  );

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
    void load();
  }, [athleteId, dateFrom, dateTo]);

  const selectedMetricDefs = useMemo(
    () => AVAILABLE_METRICS.filter((m) => selectedMetrics.has(m.key)),
    [selectedMetrics]
  );

  if (loading) {
    return (
      <section id="dynamometry" className="scroll-mt-28 mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Dynamometry
        </h2>
        <div className="mt-4 h-24 animate-pulse rounded-lg border border-slate-800 bg-slate-900/50" />
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section id="dynamometry" className="scroll-mt-28 mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Dynamometry
        </h2>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
          <p className="text-sm text-slate-500">
            No dynamometry data yet.{" "}
            <Link
              href="/dashboard/upload"
              className="text-lime-400/90 hover:text-lime-300 hover:underline"
            >
              Upload data →
            </Link>
          </p>
        </div>
        <SectionComment
          athleteId={athleteId}
          section="dynamometry"
          initialComment={sectionComment}
        />
      </section>
    );
  }

  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = groupKey(s);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  return (
    <section id="dynamometry" className="scroll-mt-28 mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Dynamometry
        </h2>
        <MetricPicker selected={selectedMetrics} onChange={setSelectedMetrics} />
      </div>

      <div className="mt-4 space-y-4">
        {Array.from(groups.entries()).map(([gKey, gSessions]) => {
          const isExpanded = expandedGroup === gKey;
          const groupLabel = groupHeading(gSessions[0]?.test_sub_type ?? null);
          const trendData = buildTrendData(gSessions);
          const latestMetrics = latestSessionMetrics(gSessions);
          const side = gSessions[0]?.metrics[0]?.side;
          const sideLabel = side
            ? side.charAt(0).toUpperCase() + side.slice(1).toLowerCase()
            : null;
          const summaryMetrics = selectedMetricDefs.slice(0, 4);

          return (
            <div
              key={gKey}
              className="rounded-lg border border-slate-800 bg-slate-900/50"
            >
              <button
                type="button"
                onClick={() => setExpandedGroup(isExpanded ? null : gKey)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <span className="text-sm font-medium text-slate-200">{groupLabel}</span>
                  {sideLabel ? (
                    <span className="ml-2 text-xs text-slate-500">{sideLabel}</span>
                  ) : null}
                  <span className="ml-2 text-xs text-slate-500">
                    · {gSessions.length} session{gSessions.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-xs text-slate-500">{isExpanded ? "▲" : "▼"}</span>
              </button>

              {!isExpanded && summaryMetrics.length > 0 ? (
                <div
                  className="grid gap-3 border-t border-slate-800/60 px-5 pb-4 pt-3"
                  style={{
                    gridTemplateColumns: `repeat(${summaryMetrics.length}, minmax(0, 1fr))`,
                  }}
                >
                  {summaryMetrics.map(({ key, label, unit }) => {
                    const val = metricValue(latestMetrics, key);
                    return (
                      <div key={key}>
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="text-lg font-semibold text-slate-100">
                          {val != null ? val.toFixed(1) : "—"}
                          {unit ? (
                            <span className="ml-1 text-xs font-normal text-slate-500">
                              {unit}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {isExpanded ? (
                <div className="space-y-6 border-t border-slate-800/60 px-5 py-4">
                  {selectedMetricDefs.length > 0 ? (
                    trendData.length > 1 ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {selectedMetricDefs.map(({ key, label, unit }) => (
                          <div key={key}>
                            <p className="mb-2 text-xs text-slate-400">
                              {label}
                              {unit ? ` (${unit})` : ""}
                            </p>
                            <div className="h-[130px] w-full rounded border border-slate-800 bg-[#0f172a]">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                  data={trendData}
                                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                  <XAxis dataKey="date" tick={AXIS_TICK} />
                                  <YAxis tick={AXIS_TICK} width={36} />
                                  <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    labelStyle={{ color: "#94a3b8" }}
                                    itemStyle={{ color: "#a3e635" }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey={key}
                                    stroke="#a3e635"
                                    strokeWidth={2}
                                    dot={{ fill: "#a3e635", r: 3 }}
                                    connectNulls
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        One session recorded — trend charts appear after more tests for this
                        movement.
                      </p>
                    )
                  ) : (
                    <p className="text-xs text-slate-500">
                      Select at least one metric to view trends.
                    </p>
                  )}

                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Session Detail
                    </p>
                    {gSessions.map((s) => (
                      <div
                        key={s.id}
                        className="overflow-hidden rounded border border-slate-800 bg-slate-950/40"
                      >
                        <div className="flex items-center justify-between bg-slate-800/40 px-4 py-2">
                          <span className="text-xs font-medium text-slate-300">
                            {formatDisplayDate(s.session_date)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {parseSegmentLabel(s.test_sub_type)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3">
                          {orderedMetricRows(s.metrics).map((m) => (
                            <div
                              key={`${s.id}-${m.key}`}
                              className="flex items-baseline justify-between gap-2 py-0.5"
                            >
                              <span className="text-xs text-slate-400">
                                {metricDisplayLabel(m.key)}
                              </span>
                              <span className="shrink-0 font-mono text-xs text-slate-200">
                                {Number(m.value).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <SectionComment
        athleteId={athleteId}
        section="dynamometry"
        initialComment={sectionComment}
      />
    </section>
  );
}
