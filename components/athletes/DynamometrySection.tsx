"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDisplayDate } from "@/lib/dateDisplay";
import { supabase } from "@/lib/supabaseClient";
import ChartTypeToggle, { type ChartType } from "./ChartTypeToggle";
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

function movementKey(gKey: string): string {
  return gKey
    .replace(/-Left/i, "")
    .replace(/-Right/i, "")
    .trim()
    .replace(/--/, "-");
}

function sideFromGroupKey(gKey: string): "left" | "right" | null {
  const parts = gKey.split("-").map((p) => p.trim());
  if (parts.some((p) => /^left$/i.test(p))) return "left";
  if (parts.some((p) => /^right$/i.test(p))) return "right";
  return null;
}

function lsi(left: number, right: number): number {
  const stronger = Math.max(left, right);
  const weaker = Math.min(left, right);
  return stronger === 0 ? 100 : (weaker / stronger) * 100;
}

function asymPct(left: number, right: number): number {
  const avg = (left + right) / 2;
  return avg === 0 ? 0 : ((right - left) / avg) * 100;
}

function lsiColorClass(value: number): string {
  if (value >= 90) return "text-lime-400";
  if (value >= 80) return "text-amber-400";
  return "text-rose-400";
}

function pairedGroupHeading(mKey: string): string {
  return parseSegmentLabel(mKey).replace(/\s*\(rep \d+\)$/, "");
}

type DisplayGroup =
  | { kind: "single"; key: string; sessions: Session[] }
  | { kind: "paired"; movementKey: string; left: Session[]; right: Session[] };

function buildDisplayGroups(groupMap: Map<string, Session[]>): DisplayGroup[] {
  const movementIndex = new Map<
    string,
    { leftKey?: string; rightKey?: string }
  >();
  const unpairedKeys: string[] = [];

  for (const gKey of groupMap.keys()) {
    const mKey = movementKey(gKey);
    const side = sideFromGroupKey(gKey);
    if (side === "left" || side === "right") {
      const entry = movementIndex.get(mKey) ?? {};
      if (side === "left") entry.leftKey = gKey;
      else entry.rightKey = gKey;
      movementIndex.set(mKey, entry);
    } else {
      unpairedKeys.push(gKey);
    }
  }

  const pairedKeys = new Set<string>();
  const items: DisplayGroup[] = [];

  for (const [mKey, { leftKey, rightKey }] of movementIndex) {
    if (leftKey && rightKey) {
      items.push({
        kind: "paired",
        movementKey: mKey,
        left: groupMap.get(leftKey) ?? [],
        right: groupMap.get(rightKey) ?? [],
      });
      pairedKeys.add(leftKey);
      pairedKeys.add(rightKey);
    } else if (leftKey) {
      unpairedKeys.push(leftKey);
    } else if (rightKey) {
      unpairedKeys.push(rightKey);
    }
  }

  for (const gKey of unpairedKeys) {
    if (pairedKeys.has(gKey)) continue;
    items.push({ kind: "single", key: gKey, sessions: groupMap.get(gKey) ?? [] });
  }

  items.sort((a, b) => {
    const dateA =
      a.kind === "single"
        ? a.sessions[0]?.session_date ?? ""
        : a.left[0]?.session_date ?? a.right[0]?.session_date ?? "";
    const dateB =
      b.kind === "single"
        ? b.sessions[0]?.session_date ?? ""
        : b.left[0]?.session_date ?? b.right[0]?.session_date ?? "";
    return dateA.localeCompare(dateB);
  });

  return items;
}

function latestPairedDate(leftSessions: Session[], rightSessions: Session[]): string | null {
  const leftDates = new Set(leftSessions.map((s) => s.session_date.slice(0, 10)));
  const rightDates = new Set(rightSessions.map((s) => s.session_date.slice(0, 10)));
  const common = [...leftDates].filter((d) => rightDates.has(d)).sort((a, b) => a.localeCompare(b));
  return common.length > 0 ? common[common.length - 1]! : null;
}

function buildPairedTrendData(
  leftSessions: Session[],
  rightSessions: Session[]
): Record<string, string | number>[] {
  const leftDates = new Set(leftSessions.map((s) => s.session_date.slice(0, 10)));
  const rightDates = new Set(rightSessions.map((s) => s.session_date.slice(0, 10)));
  const commonDates = [...leftDates]
    .filter((d) => rightDates.has(d))
    .sort((a, b) => a.localeCompare(b));

  return commonDates.map((date) => {
    const leftBest = bestSessionForDate(leftSessions, date);
    const rightBest = bestSessionForDate(rightSessions, date);
    const point: Record<string, string | number> = {
      date: formatDisplayDate(`${date}T12:00:00`),
    };
    if (leftBest && rightBest) {
      for (const def of AVAILABLE_METRICS) {
        const lv = metricValue(leftBest.metrics, def.key);
        const rv = metricValue(rightBest.metrics, def.key);
        if (lv != null) point[`${def.key}_left`] = lv;
        if (rv != null) point[`${def.key}_right`] = rv;
        if (lv != null && rv != null) point[`${def.key}_lsi`] = lsi(lv, rv);
      }
    }
    return point;
  });
}

function pairedSessionDates(leftSessions: Session[], rightSessions: Session[]) {
  const dates = [
    ...new Set(
      [...leftSessions, ...rightSessions].map((s) => s.session_date.slice(0, 10))
    ),
  ].sort((a, b) => a.localeCompare(b));
  return dates.map((date) => ({
    date,
    left: bestSessionForDate(leftSessions, date),
    right: bestSessionForDate(rightSessions, date),
  }));
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
  const [chartType, setChartType] = useState<ChartType>("bar");

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

  const groupMap = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const key = groupKey(s);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [sessions]);

  const displayGroups = useMemo(() => buildDisplayGroups(groupMap), [groupMap]);

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

  return (
    <section id="dynamometry" className="scroll-mt-28 mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Dynamometry
        </h2>
        <div className="flex items-center gap-2">
          <ChartTypeToggle value={chartType} onChange={setChartType} />
          <MetricPicker selected={selectedMetrics} onChange={setSelectedMetrics} />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {displayGroups.map((item) => {
          if (item.kind === "single") {
            const { key: gKey, sessions: gSessions } = item;
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
                      (chartType === "bar" ? trendData.length >= 1 : trendData.length > 1) ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {selectedMetricDefs.map(({ key, label, unit }) => (
                            <div key={key}>
                              <p className="mb-2 text-xs text-slate-400">
                                {label}
                                {unit ? ` (${unit})` : ""}
                              </p>
                              <div className="h-[130px] w-full rounded border border-slate-800 bg-[#0f172a]">
                                <ResponsiveContainer width="100%" height="100%">
                                  {chartType === "bar" ? (
                                    <BarChart
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
                                      <Bar
                                        dataKey={key}
                                        fill="#a3e635"
                                        radius={[3, 3, 0, 0]}
                                      />
                                    </BarChart>
                                  ) : (
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
                                  )}
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : chartType === "line" && trendData.length < 2 ? (
                        <p className="text-xs text-slate-500">
                          One session recorded — trend charts appear after more tests for this
                          movement.
                        </p>
                      ) : null
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
          }

          const pairKey = `pair:${item.movementKey}`;
          const isExpanded = expandedGroup === pairKey;
          const { left, right, movementKey: mKey } = item;
          const allSessions = [...left, ...right];
          const groupLabel = pairedGroupHeading(mKey);
          const latestDate = latestPairedDate(left, right);
          const leftLatest = latestDate ? bestSessionForDate(left, latestDate) : null;
          const rightLatest = latestDate ? bestSessionForDate(right, latestDate) : null;
          const trendData = buildPairedTrendData(left, right);
          const summaryMetrics = selectedMetricDefs.slice(0, 4);
          const sessionRows = pairedSessionDates(left, right);

          return (
            <div
              key={pairKey}
              className="rounded-lg border border-slate-800 bg-slate-900/50"
            >
              <button
                type="button"
                onClick={() => setExpandedGroup(isExpanded ? null : pairKey)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{groupLabel}</span>
                  <span className="rounded border border-lime-500/30 bg-lime-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-lime-300">
                    L ↔ R
                  </span>
                  <span className="text-xs text-slate-500">
                    · {allSessions.length} session{allSessions.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-xs text-slate-500">{isExpanded ? "▲" : "▼"}</span>
              </button>

              {!isExpanded && summaryMetrics.length > 0 ? (
                <div className="space-y-3 border-t border-slate-800/60 px-5 pb-4 pt-3">
                  {summaryMetrics.map(({ key, label, unit }) => {
                    const lv = leftLatest ? metricValue(leftLatest.metrics, key) : null;
                    const rv = rightLatest ? metricValue(rightLatest.metrics, key) : null;
                    const lsiVal = lv != null && rv != null ? lsi(lv, rv) : null;
                    return (
                      <div key={key}>
                        <p className="mb-1.5 text-xs text-slate-500">{label}</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] uppercase text-blue-400">Left</p>
                            <p className="font-mono text-sm text-slate-100">
                              {lv != null ? lv.toFixed(1) : "—"}
                              {unit && lv != null ? (
                                <span className="ml-0.5 text-[10px] text-slate-500">{unit}</span>
                              ) : null}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-lime-400">Right</p>
                            <p className="font-mono text-sm text-slate-100">
                              {rv != null ? rv.toFixed(1) : "—"}
                              {unit && rv != null ? (
                                <span className="ml-0.5 text-[10px] text-slate-500">{unit}</span>
                              ) : null}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-slate-500">LSI%</p>
                            <p
                              className={`font-mono text-sm font-semibold ${
                                lsiVal != null ? lsiColorClass(lsiVal) : "text-slate-500"
                              }`}
                            >
                              {lsiVal != null ? `${lsiVal.toFixed(1)}%` : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {isExpanded ? (
                <div className="space-y-6 border-t border-slate-800/60 px-5 py-4">
                  {selectedMetricDefs.length > 0 && latestDate && leftLatest && rightLatest ? (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Asymmetry — {formatDisplayDate(`${latestDate}T12:00:00`)}
                      </p>
                      {selectedMetricDefs.map(({ key, label, unit }) => {
                        const lv = metricValue(leftLatest.metrics, key);
                        const rv = metricValue(rightLatest.metrics, key);
                        if (lv == null || rv == null) return null;
                        const lsiVal = lsi(lv, rv);
                        const asym = asymPct(lv, rv);
                        const total = lv + rv;
                        const leftPct = total > 0 ? (lv / total) * 100 : 50;
                        const rightPct = total > 0 ? (rv / total) * 100 : 50;
                        return (
                          <div key={key}>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="text-xs text-slate-400">
                                {label}
                                {unit ? ` (${unit})` : ""}
                              </span>
                              <span className={`text-xs font-mono ${lsiColorClass(lsiVal)}`}>
                                LSI {lsiVal.toFixed(1)}%
                                {asym !== 0 ? (
                                  <span className="ml-1 text-slate-500">
                                    ({asym > 0 ? "+" : ""}
                                    {asym.toFixed(1)}% R)
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            <div className="flex h-3 items-stretch overflow-hidden rounded-full">
                              <div
                                className="bg-blue-500 transition-all"
                                style={{ width: `${leftPct}%` }}
                                title={`Left ${lv.toFixed(1)}`}
                              />
                              <div
                                className="bg-lime-500 transition-all"
                                style={{ width: `${rightPct}%` }}
                                title={`Right ${rv.toFixed(1)}`}
                              />
                            </div>
                            <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                              <span>L {lv.toFixed(1)}</span>
                              <span>R {rv.toFixed(1)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {selectedMetricDefs.length > 0 ? (
                    (chartType === "bar" ? trendData.length >= 1 : trendData.length > 1) ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {selectedMetricDefs.map(({ key, label, unit }) => (
                          <div key={key}>
                            <p className="mb-2 text-xs text-slate-400">
                              {label}
                              {unit ? ` (${unit})` : ""}
                            </p>
                            <div className="h-[130px] w-full rounded border border-slate-800 bg-[#0f172a]">
                              <ResponsiveContainer width="100%" height="100%">
                                {chartType === "bar" ? (
                                  <BarChart
                                    data={trendData}
                                    margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis dataKey="date" tick={AXIS_TICK} />
                                    <YAxis tick={AXIS_TICK} width={32} />
                                    <Tooltip
                                      contentStyle={TOOLTIP_STYLE}
                                      labelStyle={{ color: "#94a3b8" }}
                                      formatter={(v: number | string, name: string) => {
                                        const n = typeof v === "number" ? v : Number(v);
                                        const side = name.includes("_left") ? "Left" : "Right";
                                        return [
                                          Number.isFinite(n)
                                            ? `${n.toFixed(1)}${unit ? ` ${unit}` : ""}`
                                            : String(v),
                                          side,
                                        ];
                                      }}
                                    />
                                    <Legend
                                      wrapperStyle={{ fontSize: "10px" }}
                                      formatter={(value) =>
                                        value.includes("_left") ? "Left" : "Right"
                                      }
                                    />
                                    <Bar
                                      dataKey={`${key}_left`}
                                      name={`${key}_left`}
                                      fill="#60a5fa"
                                      radius={[3, 3, 0, 0]}
                                    />
                                    <Bar
                                      dataKey={`${key}_right`}
                                      name={`${key}_right`}
                                      fill="#a3e635"
                                      radius={[3, 3, 0, 0]}
                                    />
                                  </BarChart>
                                ) : (
                                  <LineChart
                                    data={trendData}
                                    margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis dataKey="date" tick={AXIS_TICK} />
                                    <YAxis
                                      yAxisId="value"
                                      tick={AXIS_TICK}
                                      width={32}
                                      domain={["auto", "auto"]}
                                    />
                                    <YAxis
                                      yAxisId="lsi"
                                      orientation="right"
                                      tick={AXIS_TICK}
                                      width={28}
                                      domain={[0, 100]}
                                      tickFormatter={(v) => `${v}`}
                                    />
                                    <Tooltip
                                      contentStyle={TOOLTIP_STYLE}
                                      labelStyle={{ color: "#94a3b8" }}
                                      formatter={(v: number | string, name: string) => {
                                        const n = typeof v === "number" ? v : Number(v);
                                        if (name.includes("LSI")) {
                                          return [`${n.toFixed(1)}%`, "LSI"];
                                        }
                                        const side = name.includes("Left") ? "Left" : "Right";
                                        return [
                                          Number.isFinite(n)
                                            ? `${n.toFixed(1)}${unit ? ` ${unit}` : ""}`
                                            : String(v),
                                          side,
                                        ];
                                      }}
                                    />
                                    <Legend
                                      wrapperStyle={{ fontSize: "10px" }}
                                      formatter={(value) =>
                                        value.includes("_left")
                                          ? "Left"
                                          : value.includes("_right")
                                            ? "Right"
                                            : "LSI %"
                                      }
                                    />
                                    <Line
                                      yAxisId="value"
                                      type="monotone"
                                      dataKey={`${key}_left`}
                                      name={`${key}_left`}
                                      stroke="#60a5fa"
                                      strokeWidth={2}
                                      dot={{ fill: "#60a5fa", r: 2 }}
                                      connectNulls
                                    />
                                    <Line
                                      yAxisId="value"
                                      type="monotone"
                                      dataKey={`${key}_right`}
                                      name={`${key}_right`}
                                      stroke="#a3e635"
                                      strokeWidth={2}
                                      dot={{ fill: "#a3e635", r: 2 }}
                                      connectNulls
                                    />
                                    <Line
                                      yAxisId="lsi"
                                      type="monotone"
                                      dataKey={`${key}_lsi`}
                                      name={`${key}_lsi`}
                                      stroke="#fbbf24"
                                      strokeWidth={1.5}
                                      strokeDasharray="4 3"
                                      dot={false}
                                      connectNulls
                                    />
                                  </LineChart>
                                )}
                              </ResponsiveContainer>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : chartType === "line" && trendData.length < 2 ? (
                      <p className="text-xs text-slate-500">
                        One paired session recorded — trend charts appear after more bilateral
                        tests for this movement.
                      </p>
                    ) : null
                  ) : (
                    <p className="text-xs text-slate-500">
                      Select at least one metric to view trends.
                    </p>
                  )}

                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Session Detail
                    </p>
                    {sessionRows.map(({ date, left: leftS, right: rightS }) => (
                      <div
                        key={date}
                        className="overflow-hidden rounded border border-slate-800 bg-slate-950/40"
                      >
                        <div className="bg-slate-800/40 px-4 py-2">
                          <span className="text-xs font-medium text-slate-300">
                            {formatDisplayDate(`${date}T12:00:00`)}
                          </span>
                        </div>
                        <div className="overflow-x-auto px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 text-left text-slate-500">
                                <th className="pb-2 pr-3 font-medium">Metric</th>
                                <th className="pb-2 pr-3 font-medium text-blue-400">Left</th>
                                <th className="pb-2 pr-3 font-medium text-lime-400">Right</th>
                                <th className="pb-2 font-medium">LSI%</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderedMetricRows(
                                leftS?.metrics ?? rightS?.metrics ?? []
                              ).map((m) => {
                                const lv = leftS ? metricValue(leftS.metrics, m.key) : null;
                                const rv = rightS ? metricValue(rightS.metrics, m.key) : null;
                                const lsiVal =
                                  lv != null && rv != null ? lsi(lv, rv) : null;
                                return (
                                  <tr
                                    key={m.key}
                                    className="border-b border-slate-800/60 last:border-0"
                                  >
                                    <td className="py-1.5 pr-3 text-slate-400">
                                      {metricDisplayLabel(m.key)}
                                    </td>
                                    <td className="py-1.5 pr-3 font-mono text-slate-200">
                                      {lv != null ? lv.toFixed(2) : "—"}
                                    </td>
                                    <td className="py-1.5 pr-3 font-mono text-slate-200">
                                      {rv != null ? rv.toFixed(2) : "—"}
                                    </td>
                                    <td
                                      className={`py-1.5 font-mono font-semibold ${
                                        lsiVal != null
                                          ? lsiColorClass(lsiVal)
                                          : "text-slate-500"
                                      }`}
                                    >
                                      {lsiVal != null ? `${lsiVal.toFixed(1)}%` : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
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
