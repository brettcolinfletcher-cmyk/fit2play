"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildCmjDataPoints,
  type CMJDataPoint,
  type MetricLite,
} from "@/components/athletes/ForcePlateCMJSection";
import { buildDjDataPoints, type DJDataPoint } from "@/components/athletes/ForcePlateDJSection";

export type SummarySessionRow = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type: string | null;
  source: string | null;
};

export type SummaryMetricRow = {
  session_id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
};

export type SummaryHopTestRow = {
  session_date: string;
  test_type: string;
  side: string;
  best_cm: number | null;
};

type Props = {
  sessions: SummarySessionRow[];
  metricsBySession: Map<string, SummaryMetricRow[]>;
  hopTests: SummaryHopTestRow[];
  rangeStart: string | null;
  rangeEnd: string | null;
};

function bucket(source: string | null): "hawkins" | "1080" | "csv" {
  const s = (source ?? "").toLowerCase();
  if (s === "hawkins" || s === "hawkins_csv") return "hawkins";
  if (s === "1080" || s === "1080_csv") return "1080";
  return "csv";
}

function is1080Session(s: SummarySessionRow): boolean {
  return bucket(s.source) === "1080";
}

function isLinearSprintSession(s: SummarySessionRow): boolean {
  if (!is1080Session(s)) return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return !sub.includes("5-10-5") && !sub.includes("5-0-5") && !sub.includes("shuttle");
}

function isCmjSessionRow(s: SummarySessionRow): boolean {
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

function isDjSessionRow(s: SummarySessionRow): boolean {
  const tt = (s.test_type ?? "").toLowerCase();
  const st = (s.test_sub_type ?? "").toLowerCase();
  if (tt === "force_plate_dj") return true;
  if (tt === "force_plate_cmj") return false;
  if (tt.includes("dj") || tt.includes("drop")) return true;
  if (st.includes("dj") || st.includes("drop")) return true;
  return false;
}

function sessionsChronological(sess: SummarySessionRow[]): SummarySessionRow[] {
  return [...sess].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });
}

function metricAggregate(
  map: Map<string, SummaryMetricRow[]>,
  sessionId: string,
  key: string,
  mode: "max" | "min"
): number | null {
  const rows = map.get(sessionId)?.filter((r) => r.key === key && r.value != null) ?? [];
  if (rows.length === 0) return null;
  const vals = rows.map((r) => r.value!);
  return mode === "max" ? Math.max(...vals) : Math.min(...vals);
}

function formatChartAxisDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Australia/Sydney",
    });
  } catch {
    return "—";
  }
}

function sessionOptionLabel(s: SummarySessionRow): string {
  const d = s.session_date
    ? formatChartAxisDate(s.session_date)
    : "—";
  const sub = (s.test_sub_type ?? "").trim() || "—";
  return `${d} — ${sub}`;
}

const HOP_LABELS: Record<string, string> = {
  slhd: "Single Leg Hop for Distance",
  thd: "Triple Hop for Distance",
  thcod: "Triple Crossover Hop",
  medial_hop: "Medial Hop for Distance",
  lateral_hop: "Lateral Hop for Distance",
};

function hopLabel(tt: string): string {
  return HOP_LABELS[tt] ?? tt.replace(/_/g, " ");
}

type BestRow = { metric: string; best: string; date: string };

function bestHigherInSeries(
  points: { t: number; v: number | null }[],
  format: (v: number) => string
): { best: string; date: string } | null {
  let best: number | null = null;
  let bestT = 0;
  for (const p of points) {
    if (p.v == null || !Number.isFinite(p.v)) continue;
    if (best == null || p.v > best) {
      best = p.v;
      bestT = p.t;
    }
  }
  if (best == null) return null;
  return {
    best: format(best),
    date: formatChartAxisDate(new Date(bestT).toISOString()),
  };
}

function bestLowerInSeries(
  points: { t: number; v: number | null }[],
  format: (v: number) => string
): { best: string; date: string } | null {
  let best: number | null = null;
  let bestT = 0;
  for (const p of points) {
    if (p.v == null || !Number.isFinite(p.v)) continue;
    if (best == null || p.v < best) {
      best = p.v;
      bestT = p.t;
    }
  }
  if (best == null) return null;
  return {
    best: format(best),
    date: formatChartAxisDate(new Date(bestT).toISOString()),
  };
}

function cmjPointSeries(
  pts: CMJDataPoint[],
  field: keyof CMJDataPoint
): { t: number; v: number | null }[] {
  return pts.map((p) => ({ t: p.t, v: p[field] as number | null }));
}

function djPointSeries(
  pts: DJDataPoint[],
  field: keyof DJDataPoint
): { t: number; v: number | null }[] {
  return pts.map((p) => ({ t: p.t, v: p[field] as number | null }));
}

function hopLsiByDateType(
  rows: SummaryHopTestRow[]
): Map<string, Map<string, { lsi: number; date: string }>> {
  const byType = new Map<string, Map<string, { left: number | null; right: number | null }>>();
  for (const r of rows) {
    const d = r.session_date?.slice(0, 10) ?? "";
    if (!d) continue;
    const m = byType.get(r.test_type) ?? new Map();
    const cur = m.get(d) ?? { left: null, right: null };
    const side = (r.side ?? "").toLowerCase();
    if (side === "left") cur.left = r.best_cm;
    else if (side === "right") cur.right = r.best_cm;
    m.set(d, cur);
    byType.set(r.test_type, m);
  }
  const out = new Map<string, Map<string, { lsi: number; date: string }>>();
  for (const [tt, dateMap] of byType) {
    const inner = new Map<string, { lsi: number; date: string }>();
    for (const [date, pair] of dateMap) {
      if (
        pair.left != null &&
        pair.right != null &&
        Number.isFinite(pair.left) &&
        Number.isFinite(pair.right)
      ) {
        const hi = Math.max(pair.left, pair.right);
        if (hi > 0) {
          const lo = Math.min(pair.left, pair.right);
          inner.set(date, { lsi: Math.round((lo / hi) * 1000) / 10, date });
        }
      }
    }
    if (inner.size) out.set(tt, inner);
  }
  return out;
}

function deltaCell(
  a: number | null,
  b: number | null,
  higherBetter: boolean
): { text: string; className: string } {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) {
    return { text: "—", className: "text-slate-500" };
  }
  const raw = b - a;
  if (Math.abs(raw) < 1e-9) {
    return { text: "0", className: "text-slate-400" };
  }
  const improved = higherBetter ? raw > 0 : raw < 0;
  const arrow = improved ? "▲" : "▼";
  const cls = improved ? "text-lime-400" : "text-rose-400";
  const sign = raw > 0 ? "+" : "";
  return { text: `${arrow} ${sign}${raw.toFixed(higherBetter ? 2 : 3)}`, className: cls };
}

export default function TimepointSummary({
  sessions,
  metricsBySession,
  hopTests,
}: Props) {
  const [mode, setMode] = useState<"best" | "compare">("best");
  const [dateA, setDateA] = useState<string | null>(null);
  const [dateB, setDateB] = useState<string | null>(null);

  const hawkinsCsv = useMemo(
    () =>
      sessionsChronological(
        sessions.filter((s) => (s.source ?? "").toLowerCase() === "hawkins_csv")
      ),
    [sessions]
  );

  const metricMap = metricsBySession as Map<string, MetricLite[]>;

  const cmjPts = useMemo(
    () => buildCmjDataPoints(hawkinsCsv, metricMap),
    [hawkinsCsv, metricsBySession]
  );

  const djPts = useMemo(
    () => buildDjDataPoints(hawkinsCsv, metricMap),
    [hawkinsCsv, metricsBySession]
  );

  const linearSessions = useMemo(
    () => sessionsChronological(sessions.filter(isLinearSprintSession)),
    [sessions]
  );

  const sessionOptions = useMemo(() => {
    const list = sessions.filter((s) => s.session_date);
    list.sort((a, b) => {
      const ta = new Date(a.session_date!).getTime();
      const tb = new Date(b.session_date!).getTime();
      return tb - ta;
    });
    return list;
  }, [sessions]);

  useEffect(() => {
    if (sessionOptions.length >= 1) {
      setDateA(sessionOptions[0]!.id);
      setDateB(sessionOptions[1]?.id ?? sessionOptions[0]!.id);
    } else {
      setDateA(null);
      setDateB(null);
    }
  }, [sessionOptions]);

  const bestLinear = useMemo((): BestRow[] => {
    const rows: BestRow[] = [];
    const ts = linearSessions
      .filter((s) => s.session_date)
      .map((s) => ({
        t: new Date(s.session_date!).getTime(),
        v: metricAggregate(metricsBySession, s.id, "top_speed", "max"),
      }));
    const r1 = bestHigherInSeries(ts, (v) => `${v.toFixed(2)} m/s`);
    if (r1) rows.push({ metric: "Top Speed", ...r1 });

    const pf = linearSessions
      .filter((s) => s.session_date)
      .map((s) => ({
        t: new Date(s.session_date!).getTime(),
        v: metricAggregate(metricsBySession, s.id, "peak_force", "max"),
      }));
    const r2 = bestHigherInSeries(pf, (v) => `${Math.round(v)} N`);
    if (r2) rows.push({ metric: "Peak Force", ...r2 });

    const pp = linearSessions
      .filter((s) => s.session_date)
      .map((s) => ({
        t: new Date(s.session_date!).getTime(),
        v: metricAggregate(metricsBySession, s.id, "peak_power", "max"),
      }));
    const r3 = bestHigherInSeries(pp, (v) => `${Math.round(v)} W`);
    if (r3) rows.push({ metric: "Peak Power", ...r3 });

    const sp = linearSessions
      .filter((s) => s.session_date)
      .map((s) => ({
        t: new Date(s.session_date!).getTime(),
        v: metricAggregate(metricsBySession, s.id, "split_5m_time", "min"),
      }));
    const r4 = bestLowerInSeries(sp, (v) => `${v.toFixed(2)} s`);
    if (r4) rows.push({ metric: "5m Split", ...r4 });

    return rows;
  }, [linearSessions, metricsBySession]);

  const bestCmj = useMemo((): BestRow[] => {
    if (cmjPts.length === 0) return [];
    const rows: BestRow[] = [];
    const defs: { field: keyof CMJDataPoint; label: string; higher: boolean; fmt: (v: number) => string }[] = [
      { field: "jump_height", label: "Jump Height", higher: true, fmt: (v) => `${v.toFixed(1)} cm` },
      { field: "propulsive_impulse", label: "Propulsive Impulse", higher: true, fmt: (v) => `${v.toFixed(1)} N·s` },
      { field: "braking_impulse", label: "Braking Impulse", higher: true, fmt: (v) => `${v.toFixed(1)} N·s` },
      { field: "peak_propulsive_force", label: "Peak Propulsive Force", higher: true, fmt: (v) => `${Math.round(v)} N` },
      { field: "peak_braking_force", label: "Peak Braking Force", higher: true, fmt: (v) => `${Math.round(v)} N` },
      { field: "mrsi", label: "mRSI", higher: true, fmt: (v) => v.toFixed(3) },
    ];
    for (const d of defs) {
      const series = cmjPointSeries(cmjPts, d.field);
      const fn = d.higher ? bestHigherInSeries : bestLowerInSeries;
      const r = fn(series, d.fmt);
      if (r) rows.push({ metric: d.label, ...r });
    }
    return rows;
  }, [cmjPts]);

  const bestDj = useMemo((): BestRow[] => {
    if (djPts.length === 0) return [];
    const rows: BestRow[] = [];
    const rsi = bestHigherInSeries(
      djPointSeries(djPts, "rsi"),
      (v) => v.toFixed(3)
    );
    if (rsi) rows.push({ metric: "RSI", ...rsi });
    const jh = bestHigherInSeries(
      djPointSeries(djPts, "jump_height_cm"),
      (v) => `${v.toFixed(1)} cm`
    );
    if (jh) rows.push({ metric: "Jump Height", ...jh });
    const ct = bestLowerInSeries(
      djPointSeries(djPts, "contact_time_ms"),
      (v) => `${v.toFixed(1)} ms`
    );
    if (ct) rows.push({ metric: "Contact Time", ...ct });
    return rows;
  }, [djPts]);

  const bestHop = useMemo(() => {
    const m = hopLsiByDateType(hopTests);
    const out: { test: string; best: string; date: string }[] = [];
    for (const [tt, inner] of m) {
      let bestLsi = -Infinity;
      let bestDate = "";
      for (const { lsi, date } of inner.values()) {
        if (lsi > bestLsi) {
          bestLsi = lsi;
          bestDate = formatChartAxisDate(`${date}T12:00:00`);
        }
      }
      if (bestLsi > -Infinity) {
        out.push({
          test: hopLabel(tt),
          best: `${bestLsi.toFixed(1)}%`,
          date: bestDate,
        });
      }
    }
    out.sort((a, b) => a.test.localeCompare(b.test));
    return out;
  }, [hopTests]);

  const sessA = dateA ? sessions.find((s) => s.id === dateA) ?? null : null;
  const sessB = dateB ? sessions.find((s) => s.id === dateB) ?? null : null;

  const dateStrA = sessA?.session_date?.slice(0, 10) ?? null;
  const dateStrB = sessB?.session_date?.slice(0, 10) ?? null;

  function hopSide(dateStr: string | null, testType: string, side: "left" | "right"): number | null {
    if (!dateStr) return null;
    const row = hopTests.find(
      (h) => h.session_date.slice(0, 10) === dateStr && h.test_type === testType && h.side === side
    );
    return row?.best_cm ?? null;
  }

  function hopLsiForDate(dateStr: string | null, testType: string): number | null {
    if (!dateStr) return null;
    const l = hopSide(dateStr, testType, "left");
    const r = hopSide(dateStr, testType, "right");
    if (l == null || r == null) return null;
    const hi = Math.max(l, r);
    if (hi <= 0) return null;
    return Math.round((Math.min(l, r) / hi) * 1000) / 10;
  }

  const hopTypesInRange = useMemo(() => {
    const s = new Set(hopTests.map((h) => h.test_type));
    return [...s].sort();
  }, [hopTests]);

  const compareLinearRows = useMemo(() => {
    if (!sessA || !sessB) return [];
    const defs: {
      key: string;
      label: string;
      higherBetter: boolean;
      mode: "max" | "min";
      fmt: (v: number) => string;
    }[] = [
      { key: "top_speed", label: "Top Speed", higherBetter: true, mode: "max", fmt: (v) => `${v.toFixed(2)} m/s` },
      { key: "peak_force", label: "Peak Force", higherBetter: true, mode: "max", fmt: (v) => `${Math.round(v)} N` },
      { key: "peak_power", label: "Peak Power", higherBetter: true, mode: "max", fmt: (v) => `${Math.round(v)} W` },
      { key: "split_5m_time", label: "5m Split", higherBetter: false, mode: "min", fmt: (v) => `${v.toFixed(2)} s` },
    ];
    const out: {
      label: string;
      va: string;
      vb: string;
      delta: { text: string; className: string };
    }[] = [];
    const canA = isLinearSprintSession(sessA);
    const canB = isLinearSprintSession(sessB);
    for (const d of defs) {
      const va = canA ? metricAggregate(metricsBySession, sessA.id, d.key, d.mode) : null;
      const vb = canB ? metricAggregate(metricsBySession, sessB.id, d.key, d.mode) : null;
      const da = va != null ? d.fmt(va) : "—";
      const db = vb != null ? d.fmt(vb) : "—";
      const delta = deltaCell(va, vb, d.higherBetter);
      if (da !== "—" || db !== "—") {
        out.push({ label: d.label, va: da, vb: db, delta });
      }
    }
    return out;
  }, [sessA, sessB, metricsBySession]);

  const compareCmjRows = useMemo(() => {
    if (!sessA || !sessB) return [];
    const map = metricsBySession as Map<string, MetricLite[]>;
    const snap = (sess: SummarySessionRow | null) => {
      if (!sess) return null;
      if ((sess.source ?? "").toLowerCase() !== "hawkins_csv" || !isCmjSessionRow(sess)) return null;
      const pts = buildCmjDataPoints([sess], map);
      return pts[0] ?? null;
    };
    const pa = snap(sessA);
    const pb = snap(sessB);
    const defs: { key: keyof CMJDataPoint; label: string; fmt: (v: number) => string }[] = [
      { key: "jump_height", label: "Jump Height", fmt: (v) => `${v.toFixed(1)} cm` },
      { key: "propulsive_impulse", label: "Propulsive Impulse", fmt: (v) => `${v.toFixed(1)} N·s` },
      { key: "braking_impulse", label: "Braking Impulse", fmt: (v) => `${v.toFixed(1)} N·s` },
      { key: "peak_propulsive_force", label: "Peak Propulsive Force", fmt: (v) => `${Math.round(v)} N` },
      { key: "peak_braking_force", label: "Peak Braking Force", fmt: (v) => `${Math.round(v)} N` },
      { key: "mrsi", label: "mRSI", fmt: (v) => v.toFixed(3) },
    ];
    const out: {
      label: string;
      va: string;
      vb: string;
      delta: { text: string; className: string };
    }[] = [];
    for (const d of defs) {
      const va = pa ? (pa[d.key] as number | null) : null;
      const vb = pb ? (pb[d.key] as number | null) : null;
      const da = va != null && Number.isFinite(va) ? d.fmt(va) : "—";
      const db = vb != null && Number.isFinite(vb) ? d.fmt(vb) : "—";
      const delta = deltaCell(va, vb, true);
      if (da !== "—" || db !== "—") {
        out.push({ label: d.label, va: da, vb: db, delta });
      }
    }
    return out;
  }, [sessA, sessB, metricsBySession]);

  const compareDjRows = useMemo(() => {
    if (!sessA || !sessB) return [];
    const map = metricsBySession as Map<string, MetricLite[]>;
    const snap = (sess: SummarySessionRow | null) => {
      if (!sess) return null;
      if ((sess.source ?? "").toLowerCase() !== "hawkins_csv" || !isDjSessionRow(sess)) return null;
      const pts = buildDjDataPoints([sess], map);
      return pts[0] ?? null;
    };
    const pa = snap(sessA);
    const pb = snap(sessB);
    const defs: {
      key: keyof DJDataPoint;
      label: string;
      higherBetter: boolean;
      fmt: (v: number) => string;
    }[] = [
      { key: "rsi", label: "RSI", higherBetter: true, fmt: (v) => v.toFixed(3) },
      { key: "jump_height_cm", label: "Jump Height", higherBetter: true, fmt: (v) => `${v.toFixed(1)} cm` },
      { key: "contact_time_ms", label: "Contact Time", higherBetter: false, fmt: (v) => `${v.toFixed(1)} ms` },
    ];
    const out: {
      label: string;
      va: string;
      vb: string;
      delta: { text: string; className: string };
    }[] = [];
    for (const d of defs) {
      const va = pa ? (pa[d.key] as number | null) : null;
      const vb = pb ? (pb[d.key] as number | null) : null;
      const da = va != null && Number.isFinite(va) ? d.fmt(va) : "—";
      const db = vb != null && Number.isFinite(vb) ? d.fmt(vb) : "—";
      const delta = deltaCell(va, vb, d.higherBetter);
      if (da !== "—" || db !== "—") {
        out.push({ label: d.label, va: da, vb: db, delta });
      }
    }
    return out;
  }, [sessA, sessB, metricsBySession]);

  const showLinearBest = bestLinear.length > 0;
  const showCmjBest = bestCmj.length > 0;
  const showDjBest = bestDj.length > 0;
  const showHopBest = bestHop.length > 0;

  const showCompareLinear = compareLinearRows.length > 0;
  const showCompareCmj = compareCmjRows.length > 0;
  const showCompareDj = compareDjRows.length > 0;
  const showCompareHop = hopTypesInRange.length > 0 && dateStrA && dateStrB;

  const tableWrap = "mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/50";

  return (
    <div id="summary" className="scroll-mt-28 mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Time-point summary
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("best")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "best"
                ? "border-lime-400 bg-lime-400/15 text-lime-300"
                : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
            }`}
          >
            Best in range
          </button>
          <button
            type="button"
            onClick={() => setMode("compare")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "compare"
                ? "border-lime-400 bg-lime-400/15 text-lime-300"
                : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
            }`}
          >
            Date comparison
          </button>
        </div>
      </div>

      {mode === "best" && (
        <div className="mt-4 space-y-8">
          {!showLinearBest && !showCmjBest && !showDjBest && !showHopBest ? (
            <p className="text-xs text-slate-500">No summary data in the selected range.</p>
          ) : null}

          {showLinearBest && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                1080 linear sprint
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Best</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {bestLinear.map((r) => (
                      <tr key={r.metric} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.metric}</td>
                        <td className="px-3 py-2 font-mono text-lime-300">{r.best}</td>
                        <td className="px-3 py-2">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCmjBest && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Force plate — CMJ
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Best</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {bestCmj.map((r) => (
                      <tr key={r.metric} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.metric}</td>
                        <td className="px-3 py-2 font-mono text-lime-300">{r.best}</td>
                        <td className="px-3 py-2">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showDjBest && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Force plate — Drop jump
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Best</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {bestDj.map((r) => (
                      <tr key={r.metric} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.metric}</td>
                        <td className="px-3 py-2 font-mono text-lime-300">{r.best}</td>
                        <td className="px-3 py-2">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showHopBest && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Hop tests
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Test</th>
                      <th className="px-3 py-2 font-medium">Best LSI%</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {bestHop.map((r) => (
                      <tr key={r.test} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.test}</td>
                        <td className="px-3 py-2 font-mono text-lime-300">{r.best}</td>
                        <td className="px-3 py-2">{r.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "compare" && (
        <div className="mt-4 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-400">Date A</label>
              <select
                value={dateA ?? ""}
                onChange={(e) => setDateA(e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                {sessionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionOptionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Date B</label>
              <select
                value={dateB ?? ""}
                onChange={(e) => setDateB(e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                {sessionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionOptionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showCompareLinear && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                1080 linear sprint
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[360px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Date A</th>
                      <th className="px-3 py-2 font-medium">Date B</th>
                      <th className="px-3 py-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {compareLinearRows.map((r) => (
                      <tr key={r.label} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.label}</td>
                        <td className="px-3 py-2 font-mono">{r.va}</td>
                        <td className="px-3 py-2 font-mono">{r.vb}</td>
                        <td className={`px-3 py-2 font-mono ${r.delta.className}`}>{r.delta.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCompareCmj && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Force plate — CMJ
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[360px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Date A</th>
                      <th className="px-3 py-2 font-medium">Date B</th>
                      <th className="px-3 py-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {compareCmjRows.map((r) => (
                      <tr key={r.label} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.label}</td>
                        <td className="px-3 py-2 font-mono">{r.va}</td>
                        <td className="px-3 py-2 font-mono">{r.vb}</td>
                        <td className={`px-3 py-2 font-mono ${r.delta.className}`}>{r.delta.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCompareDj && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Force plate — Drop jump
              </h3>
              <div className={tableWrap}>
                <table className="w-full min-w-[360px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Date A</th>
                      <th className="px-3 py-2 font-medium">Date B</th>
                      <th className="px-3 py-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {compareDjRows.map((r) => (
                      <tr key={r.label} className="border-b border-slate-800/80">
                        <td className="px-3 py-2 text-slate-400">{r.label}</td>
                        <td className="px-3 py-2 font-mono">{r.va}</td>
                        <td className="px-3 py-2 font-mono">{r.vb}</td>
                        <td className={`px-3 py-2 font-mono ${r.delta.className}`}>{r.delta.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showCompareHop &&
            hopTypesInRange.map((tt) => {
              const la = hopSide(dateStrA, tt, "left");
              const ra = hopSide(dateStrA, tt, "right");
              const lb = hopSide(dateStrB, tt, "left");
              const rb = hopSide(dateStrB, tt, "right");
              const lsia = hopLsiForDate(dateStrA, tt);
              const lsib = hopLsiForDate(dateStrB, tt);
              if (
                la == null &&
                ra == null &&
                lb == null &&
                rb == null &&
                lsia == null &&
                lsib == null
              ) {
                return null;
              }
              const dLsi = deltaCell(lsia, lsib, true);
              const dLeft = deltaCell(la, lb, true);
              const dRight = deltaCell(ra, rb, true);
              return (
                <div key={tt}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {hopLabel(tt)}
                  </h3>
                  <div className={tableWrap}>
                    <table className="w-full min-w-[360px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                          <th className="px-3 py-2 font-medium">Metric</th>
                          <th className="px-3 py-2 font-medium">Date A</th>
                          <th className="px-3 py-2 font-medium">Date B</th>
                          <th className="px-3 py-2 font-medium">Δ</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        <tr className="border-b border-slate-800/80">
                          <td className="px-3 py-2 text-slate-400">Left (cm)</td>
                          <td className="px-3 py-2 font-mono">
                            {la != null ? la.toFixed(1) : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {lb != null ? lb.toFixed(1) : "—"}
                          </td>
                          <td className={`px-3 py-2 font-mono ${dLeft.className}`}>{dLeft.text}</td>
                        </tr>
                        <tr className="border-b border-slate-800/80">
                          <td className="px-3 py-2 text-slate-400">Right (cm)</td>
                          <td className="px-3 py-2 font-mono">
                            {ra != null ? ra.toFixed(1) : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {rb != null ? rb.toFixed(1) : "—"}
                          </td>
                          <td className={`px-3 py-2 font-mono ${dRight.className}`}>{dRight.text}</td>
                        </tr>
                        <tr className="border-b border-slate-800/80">
                          <td className="px-3 py-2 text-slate-400">LSI%</td>
                          <td className="px-3 py-2 font-mono">
                            {lsia != null ? `${lsia.toFixed(1)}%` : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {lsib != null ? `${lsib.toFixed(1)}%` : "—"}
                          </td>
                          <td className={`px-3 py-2 font-mono ${dLsi.className}`}>{dLsi.text}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

          {!showCompareLinear &&
          !showCompareCmj &&
          !showCompareDj &&
          !(showCompareHop && hopTypesInRange.some((tt) => {
            const la = hopSide(dateStrA, tt, "left");
            const ra = hopSide(dateStrA, tt, "right");
            const lb = hopSide(dateStrB, tt, "left");
            const rb = hopSide(dateStrB, tt, "right");
            const lsia = hopLsiForDate(dateStrA, tt);
            const lsib = hopLsiForDate(dateStrB, tt);
            return (
              la != null ||
              ra != null ||
              lb != null ||
              rb != null ||
              lsia != null ||
              lsib != null
            );
          })) ? (
            <p className="text-xs text-slate-500">No comparable data for the selected sessions.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
