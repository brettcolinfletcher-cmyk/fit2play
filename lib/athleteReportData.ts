import {
  buildCmjDataPoints,
  type CMJDataPoint,
  type MetricLite,
} from "@/components/athletes/ForcePlateCMJSection";
import { buildDjDataPoints, type DJDataPoint } from "@/components/athletes/ForcePlateDJSection";
import type { HopTestTableRow, HopTestTypeBlock } from "@/components/athletes/HopTestsSection";
import {
  bucket,
  formatChartAxisDate,
  hasLinearSprintEvidence,
  is1080Session,
  isLinearSprintSession,
  metricAggregate,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/reportCore";

// Re-exported for backward compatibility — these now live in lib/reportCore.ts
// (a dependency-free module, safe to import from server routes) since this
// file pulls in "use client" chart components that shouldn't be dragged into
// a server bundle just to reuse a date formatter.
export {
  bucket,
  formatChartAxisDate,
  hasLinearSprintEvidence,
  is1080Session,
  isLinearSprintSession,
  metricAggregate,
  type ReportMetricRow,
  type ReportSessionRow,
};

export type ReportHopTestRow = {
  session_date: string;
  test_type: string;
  side: string;
  best_cm: number | null;
};

export type BestRow = { metric: string; best: string; date: string };

export type BestInRangeData = {
  linear: BestRow[];
  cmj: BestRow[];
  dj: BestRow[];
  hop: { test: string; best: string; date: string }[];
};

export type CompareMetricRow = {
  label: string;
  va: string;
  vb: string;
  delta: string;
  /** Tailwind class for web tables; PDF ignores */
  deltaClassName: string;
};

export type HopCompareBlockPdf = {
  testType: string;
  title: string;
  rows: CompareMetricRow[];
};

export type DateComparisonData = {
  linear: CompareMetricRow[];
  cmj: CompareMetricRow[];
  dj: CompareMetricRow[];
  hop: HopCompareBlockPdf[];
};

const HOP_TEST_LABELS: Record<string, string> = {
  slhd: "Single Leg Hop for Distance",
  thd: "Triple Hop for Distance",
  thcod: "Triple Crossover Hop",
  single_leg_hop: "Single Leg Hop for Distance",
  triple_hop: "Triple Hop for Distance",
  triple_crossover_hop: "Triple Crossover Hop",
  medial_hop: "Medial Hop for Distance",
  lateral_hop: "Lateral Hop for Distance",
};

export function hopTestDisplayName(testType: string): string {
  return HOP_TEST_LABELS[testType] ?? testType.replace(/_/g, " ");
}

export function isCmjSessionRow(s: ReportSessionRow): boolean {
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

export function isDjSessionRow(s: ReportSessionRow): boolean {
  const tt = (s.test_type ?? "").toLowerCase();
  const st = (s.test_sub_type ?? "").toLowerCase();
  if (tt === "force_plate_dj") return true;
  if (tt === "force_plate_cmj") return false;
  if (tt.includes("dj") || tt.includes("drop")) return true;
  if (st.includes("dj") || st.includes("drop")) return true;
  return false;
}

export function sessionsChronological(sess: ReportSessionRow[]): ReportSessionRow[] {
  return [...sess].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });
}

export function sessionOptionLabel(s: ReportSessionRow): string {
  const d = s.session_date ? formatChartAxisDate(s.session_date) : "—";
  const sub = (s.test_sub_type ?? "").trim() || "—";
  return `${d} — ${sub}`;
}

export function sortedSessionOptions(sessions: ReportSessionRow[]): ReportSessionRow[] {
  const list = sessions.filter((s) => s.session_date);
  list.sort((a, b) => {
    const ta = new Date(a.session_date!).getTime();
    const tb = new Date(b.session_date!).getTime();
    return tb - ta;
  });
  return list;
}

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

function hopLsiByDateType(rows: ReportHopTestRow[]): Map<
  string,
  Map<string, { lsi: number; date: string }>
> {
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

export function formatDeltaText(
  a: number | null,
  b: number | null,
  higherBetter: boolean
): string {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return "—";
  const raw = b - a;
  if (Math.abs(raw) < 1e-9) return "0";
  const improved = higherBetter ? raw > 0 : raw < 0;
  const arrow = improved ? "▲" : "▼";
  const sign = raw > 0 ? "+" : "";
  return `${arrow} ${sign}${raw.toFixed(higherBetter ? 2 : 3)}`;
}

export function deltaCellUi(
  a: number | null,
  b: number | null,
  higherBetter: boolean
): { text: string; className: string } {
  const text = formatDeltaText(a, b, higherBetter);
  if (text === "—") return { text, className: "text-slate-500" };
  if (text === "0") return { text, className: "text-slate-400" };
  const raw = (a != null && b != null ? b - a : 0) as number;
  const improved = higherBetter ? raw > 0 : raw < 0;
  return { text, className: improved ? "text-lime-400" : "text-rose-400" };
}

export function buildHopTestBlocks(rows: ReportHopTestRow[]): HopTestTypeBlock[] {
  const byType = new Map<
    string,
    Map<string, { left: number | null; right: number | null }>
  >();
  for (const r of rows) {
    const d = r.session_date;
    if (!d) continue;
    const dateMap = byType.get(r.test_type) ?? new Map();
    const cur = dateMap.get(d) ?? { left: null, right: null };
    const side = (r.side ?? "").toLowerCase();
    if (side === "left") cur.left = r.best_cm;
    else if (side === "right") cur.right = r.best_cm;
    dateMap.set(d, cur);
    byType.set(r.test_type, dateMap);
  }
  const blocks: HopTestTypeBlock[] = [];
  for (const [testType, dateMap] of byType) {
    const tableRows: HopTestTableRow[] = [];
    for (const [sessionDate, pair] of dateMap) {
      const leftBest = pair.left;
      const rightBest = pair.right;
      let lsi: number | null = null;
      if (
        leftBest != null &&
        rightBest != null &&
        Number.isFinite(leftBest) &&
        Number.isFinite(rightBest)
      ) {
        const hi = Math.max(leftBest, rightBest);
        const lo = Math.min(leftBest, rightBest);
        if (hi > 0) lsi = Math.round((lo / hi) * 1000) / 10;
      }
      tableRows.push({
        sessionDate,
        dateLabel: formatChartAxisDate(`${sessionDate}T12:00:00`),
        leftCm: leftBest,
        rightCm: rightBest,
        lsi,
      });
    }
    tableRows.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
    const trendPoints = [...tableRows]
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
      .filter((row) => row.lsi != null)
      .map((row) => ({
        label: row.dateLabel,
        t: new Date(`${row.sessionDate}T12:00:00`).getTime(),
        lsi: row.lsi!,
      }));
    blocks.push({
      testType,
      displayName: hopTestDisplayName(testType),
      rows: tableRows,
      trendPoints,
    });
  }
  blocks.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return blocks;
}

export function computeBestInRangeData(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  hopTests: ReportHopTestRow[]
): BestInRangeData {
  const hawkinsSessions = sessionsChronological(
    sessions.filter((s) => bucket(s.source) === "hawkins")
  );
  const metricMap = metricsBySession as Map<string, MetricLite[]>;
  const cmjPts = buildCmjDataPoints(hawkinsSessions, metricMap);
  const djPts = buildDjDataPoints(hawkinsSessions, metricMap);
  const linearSessions = sessionsChronological(
    sessions.filter((s) => isLinearSprintSession(s, metricsBySession))
  );

  const linear: BestRow[] = [];
  const ts = linearSessions
    .filter((s) => s.session_date)
    .map((s) => ({
      t: new Date(s.session_date!).getTime(),
      v: metricAggregate(metricsBySession, s.id, "top_speed", "max"),
    }));
  const r1 = bestHigherInSeries(ts, (v) => `${v.toFixed(2)} m/s`);
  if (r1) linear.push({ metric: "Top Speed", ...r1 });
  const pf = linearSessions
    .filter((s) => s.session_date)
    .map((s) => ({
      t: new Date(s.session_date!).getTime(),
      v: metricAggregate(metricsBySession, s.id, "peak_force", "max"),
    }));
  const r2 = bestHigherInSeries(pf, (v) => `${Math.round(v)} N`);
  if (r2) linear.push({ metric: "Peak Force", ...r2 });
  const pp = linearSessions
    .filter((s) => s.session_date)
    .map((s) => ({
      t: new Date(s.session_date!).getTime(),
      v: metricAggregate(metricsBySession, s.id, "peak_power", "max"),
    }));
  const r3 = bestHigherInSeries(pp, (v) => `${Math.round(v)} W`);
  if (r3) linear.push({ metric: "Peak Power", ...r3 });
  const sp = linearSessions
    .filter((s) => s.session_date)
    .map((s) => ({
      t: new Date(s.session_date!).getTime(),
      v: metricAggregate(metricsBySession, s.id, "split_5m_time", "min"),
    }));
  const r4 = bestLowerInSeries(sp, (v) => `${v.toFixed(2)} s`);
  if (r4) linear.push({ metric: "5m Split", ...r4 });

  const cmj: BestRow[] = [];
  if (cmjPts.length > 0) {
    const defs: { field: keyof CMJDataPoint; label: string; higher: boolean; fmt: (v: number) => string }[] = [
      { field: "jump_height", label: "Jump Height", higher: true, fmt: (v) => `${v.toFixed(1)} cm` },
      { field: "propulsive_impulse", label: "Propulsive Impulse", higher: true, fmt: (v) => `${v.toFixed(1)} N·s` },
      { field: "braking_impulse", label: "Braking Impulse", higher: true, fmt: (v) => `${v.toFixed(1)} N·s` },
      {
        field: "peak_propulsive_force",
        label: "Peak Propulsive Force",
        higher: true,
        fmt: (v) => `${Math.round(v)} N`,
      },
      { field: "peak_braking_force", label: "Peak Braking Force", higher: true, fmt: (v) => `${Math.round(v)} N` },
      { field: "mrsi", label: "mRSI", higher: true, fmt: (v) => v.toFixed(3) },
    ];
    for (const d of defs) {
      const series = cmjPointSeries(cmjPts, d.field);
      const fn = d.higher ? bestHigherInSeries : bestLowerInSeries;
      const r = fn(series, d.fmt);
      if (r) cmj.push({ metric: d.label, ...r });
    }
  }

  const dj: BestRow[] = [];
  if (djPts.length > 0) {
    const rsi = bestHigherInSeries(djPointSeries(djPts, "rsi"), (v) => v.toFixed(3));
    if (rsi) dj.push({ metric: "RSI", ...rsi });
    const jh = bestHigherInSeries(
      djPointSeries(djPts, "jump_height_cm"),
      (v) => `${v.toFixed(1)} cm`
    );
    if (jh) dj.push({ metric: "Jump Height", ...jh });
    const ct = bestLowerInSeries(
      djPointSeries(djPts, "contact_time_ms"),
      (v) => `${v.toFixed(1)} ms`
    );
    if (ct) dj.push({ metric: "Contact Time", ...ct });
  }

  const hop: { test: string; best: string; date: string }[] = [];
  const m = hopLsiByDateType(hopTests);
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
      hop.push({
        test: hopTestDisplayName(tt),
        best: `${bestLsi.toFixed(1)}%`,
        date: bestDate,
      });
    }
  }
  hop.sort((a, b) => a.test.localeCompare(b.test));

  return { linear, cmj, dj, hop };
}

function hopSide(
  hopTests: ReportHopTestRow[],
  dateStr: string | null,
  testType: string,
  side: "left" | "right"
): number | null {
  if (!dateStr) return null;
  const row = hopTests.find(
    (h) =>
      h.session_date.slice(0, 10) === dateStr &&
      h.test_type === testType &&
      h.side === side
  );
  return row?.best_cm ?? null;
}

function hopLsiForDate(
  hopTests: ReportHopTestRow[],
  dateStr: string | null,
  testType: string
): number | null {
  if (!dateStr) return null;
  const l = hopSide(hopTests, dateStr, testType, "left");
  const r = hopSide(hopTests, dateStr, testType, "right");
  if (l == null || r == null) return null;
  const hi = Math.max(l, r);
  if (hi <= 0) return null;
  return Math.round((Math.min(l, r) / hi) * 1000) / 10;
}

export function computeDateComparisonData(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  hopTests: ReportHopTestRow[],
  dateAId: string | null,
  dateBId: string | null
): DateComparisonData {
  const sessA = dateAId ? sessions.find((s) => s.id === dateAId) ?? null : null;
  const sessB = dateBId ? sessions.find((s) => s.id === dateBId) ?? null : null;
  const dateStrA = sessA?.session_date?.slice(0, 10) ?? null;
  const dateStrB = sessB?.session_date?.slice(0, 10) ?? null;
  const metricMap = metricsBySession as Map<string, MetricLite[]>;

  const linear: CompareMetricRow[] = [];
  if (sessA && sessB) {
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
    const canA = isLinearSprintSession(sessA, metricsBySession);
    const canB = isLinearSprintSession(sessB, metricsBySession);
    for (const d of defs) {
      const va = canA ? metricAggregate(metricsBySession, sessA.id, d.key, d.mode) : null;
      const vb = canB ? metricAggregate(metricsBySession, sessB.id, d.key, d.mode) : null;
      const da = va != null ? d.fmt(va) : "—";
      const db = vb != null ? d.fmt(vb) : "—";
      const dui = deltaCellUi(va, vb, d.higherBetter);
      if (da !== "—" || db !== "—") {
        linear.push({ label: d.label, va: da, vb: db, delta: dui.text, deltaClassName: dui.className });
      }
    }
  }

  const cmj: CompareMetricRow[] = [];
  if (sessA && sessB) {
    const snap = (sess: ReportSessionRow | null) => {
      if (!sess) return null;
      if (bucket(sess.source) !== "hawkins" || !isCmjSessionRow(sess)) return null;
      const pts = buildCmjDataPoints([sess], metricMap);
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
    for (const d of defs) {
      const va = pa ? (pa[d.key] as number | null) : null;
      const vb = pb ? (pb[d.key] as number | null) : null;
      const da = va != null && Number.isFinite(va) ? d.fmt(va) : "—";
      const db = vb != null && Number.isFinite(vb) ? d.fmt(vb) : "—";
      const dui = deltaCellUi(va, vb, true);
      if (da !== "—" || db !== "—") {
        cmj.push({ label: d.label, va: da, vb: db, delta: dui.text, deltaClassName: dui.className });
      }
    }
  }

  const dj: CompareMetricRow[] = [];
  if (sessA && sessB) {
    const snap = (sess: ReportSessionRow | null) => {
      if (!sess) return null;
      if (bucket(sess.source) !== "hawkins" || !isDjSessionRow(sess)) return null;
      const pts = buildDjDataPoints([sess], metricMap);
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
    for (const d of defs) {
      const va = pa ? (pa[d.key] as number | null) : null;
      const vb = pb ? (pb[d.key] as number | null) : null;
      const da = va != null && Number.isFinite(va) ? d.fmt(va) : "—";
      const db = vb != null && Number.isFinite(vb) ? d.fmt(vb) : "—";
      const dui = deltaCellUi(va, vb, d.higherBetter);
      if (da !== "—" || db !== "—") {
        dj.push({ label: d.label, va: da, vb: db, delta: dui.text, deltaClassName: dui.className });
      }
    }
  }

  const hopTypes = [...new Set(hopTests.map((h) => h.test_type))].sort();
  const hop: HopCompareBlockPdf[] = [];
  if (dateStrA && dateStrB) {
    for (const tt of hopTypes) {
      const la = hopSide(hopTests, dateStrA, tt, "left");
      const ra = hopSide(hopTests, dateStrA, tt, "right");
      const lb = hopSide(hopTests, dateStrB, tt, "left");
      const rb = hopSide(hopTests, dateStrB, tt, "right");
      const lsia = hopLsiForDate(hopTests, dateStrA, tt);
      const lsib = hopLsiForDate(hopTests, dateStrB, tt);
      if (
        la == null &&
        ra == null &&
        lb == null &&
        rb == null &&
        lsia == null &&
        lsib == null
      ) {
        continue;
      }
      const dLeft = deltaCellUi(la, lb, true);
      const dRight = deltaCellUi(ra, rb, true);
      const dLsi = deltaCellUi(lsia, lsib, true);
      const rows: CompareMetricRow[] = [
        {
          label: "Left (cm)",
          va: la != null ? la.toFixed(1) : "—",
          vb: lb != null ? lb.toFixed(1) : "—",
          delta: dLeft.text,
          deltaClassName: dLeft.className,
        },
        {
          label: "Right (cm)",
          va: ra != null ? ra.toFixed(1) : "—",
          vb: rb != null ? rb.toFixed(1) : "—",
          delta: dRight.text,
          deltaClassName: dRight.className,
        },
        {
          label: "LSI%",
          va: lsia != null ? `${lsia.toFixed(1)}%` : "—",
          vb: lsib != null ? `${lsib.toFixed(1)}%` : "—",
          delta: dLsi.text,
          deltaClassName: dLsi.className,
        },
      ];
      hop.push({ testType: tt, title: hopTestDisplayName(tt), rows });
    }
  }

  return { linear, cmj, dj, hop };
}
