import { buildCmjDataPoints } from "@/components/athletes/ForcePlateCMJSection";
import { buildDjDataPoints } from "@/components/athletes/ForcePlateDJSection";
import {
  bucket,
  formatChartAxisDate,
  hopTestDisplayName,
  isLinearSprintSession,
  metricAggregate,
  sessionsChronological,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import {
  buildIsoDisplayGroups,
  isoBestSessionForDate,
  isoGroupKey,
  isoLatestPairedDate,
  isoMetricValue,
  isoPairedGroupHeading,
  type IsoSession,
} from "@/lib/isometricGrouping";
import {
  resolveBandForMetric,
  type NormalizedPerformanceBand,
} from "@/lib/performanceBands";
import { groupSessionsByDate } from "@/lib/sessionDateGroups";
export type MetricRowWithSide = ReportMetricRow & { side?: string | null };

function is1080(s: ReportSessionRow): boolean {
  return bucket(s.source) === "1080";
}

function is505Session(s: ReportSessionRow): boolean {
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return is1080(s) && (sub.includes("5-10-5") || sub.includes("5-0-5"));
}

/** Which COD protocol was actually recorded — don't assume 5-10-5. */
function codProtocolLabel(testSubType: string | null | undefined): string {
  const sub = (testSubType ?? "").toLowerCase();
  if (sub.includes("5-10-5")) return "5-10-5";
  if (sub.includes("5-0-5")) return "5-0-5";
  return "COD";
}

/**
 * Chronologically-latest session for a predicate, deduped by calendar date
 * first — same "best rep per day" rule the dashboard trend charts use (see
 * lib/sessionDateGroups.ts). Without this, a same-day re-test or per-leg
 * session could get picked over the athlete's real main effort just because
 * it happened to sort last within the day. Day-grouping is scored by
 * top_speed (max), matching app/dashboard/athletes/[id]/page.tsx's
 * linearDateGroups/codDateGroups exactly, so the PDF's "latest session"
 * picks the same session the dashboard's trend chart would.
 */
function latestSessionByDate(
  sessions: ReportSessionRow[],
  pred: (s: ReportSessionRow) => boolean,
  metricsNorm: Map<string, MetricRowWithSide[]>
): ReportSessionRow | null {
  const filtered = sessions.filter(pred).filter((s) => s.session_date);
  if (filtered.length === 0) return null;
  const groups = groupSessionsByDate(filtered, (s) =>
    metricAggregate(metricsNorm as Map<string, ReportMetricRow[]>, s.id, "top_speed", "max")
  );
  return groups.length > 0 ? groups[groups.length - 1]!.best : null;
}

function minTotalTimeForSide(
  rows: MetricRowWithSide[] | undefined,
  side: "left" | "right"
): number | null {
  if (!rows?.length) return null;
  const s = side.toLowerCase();
  const vals = rows
    .filter(
      (r) =>
        r.key === "total_time" &&
        r.value != null &&
        (r.side ?? "").toLowerCase() === s
    )
    .map((r) => r.value!);
  if (vals.length === 0) return null;
  return Math.min(...vals);
}

function lsiPct(left: number, right: number): number | null {
  const hi = Math.max(left, right);
  if (hi <= 0) return null;
  return Math.round((Math.min(left, right) / hi) * 1000) / 10;
}

type IsoPdfSession = IsoSession<MetricRowWithSide>;

/**
 * Real Hawkins handheld-dynamometry (isometric) sessions, shaped for
 * lib/isometricGrouping.ts. Previously the PDF's "Strength" section filtered
 * on a legacy `dyno_` metric key namespace that no production session has
 * ever written (0 rows in the metrics table — confirmed via Supabase) while
 * the dashboard's DynamometrySection.tsx read the real data via
 * test_type = "force_plate_isometric". This is the same query/shape
 * DynamometrySection.tsx uses, so the PDF and dashboard read identical data.
 */
function buildIsoSessionsForPdf(
  sessions: ReportSessionRow[],
  metricsNorm: Map<string, MetricRowWithSide[]>
): IsoPdfSession[] {
  return sessions
    .filter((s) => s.test_type === "force_plate_isometric" && s.session_date)
    .map((s) => ({
      id: s.id,
      session_date: s.session_date!,
      test_sub_type: s.test_sub_type,
      metrics: metricsNorm.get(s.id) ?? [],
    }));
}

/**
 * One entry per paired (Left+Right) isometric movement — Knee Extension,
 * Hip Abduction, etc. — using each movement's own most recent common test
 * date (see isoLatestPairedDate), exactly the "collapsed" pair view
 * DynamometrySection.tsx shows on the dashboard before it's expanded.
 * Unpaired (single-side-only) movements are skipped, matching the old
 * strength chart's behaviour of only showing rows with both sides present.
 */
function buildIsoStrengthPairs(
  sessions: ReportSessionRow[],
  metricsNorm: Map<string, MetricRowWithSide[]>
): { label: string; left: number; right: number; lsiPct: number | null; date: string }[] {
  const isoSessions = buildIsoSessionsForPdf(sessions, metricsNorm);
  const groupMap = new Map<string, IsoPdfSession[]>();
  for (const s of isoSessions) {
    const key = isoGroupKey(s);
    const list = groupMap.get(key) ?? [];
    list.push(s);
    groupMap.set(key, list);
  }
  const displayGroups = buildIsoDisplayGroups(groupMap);

  const pairs: { label: string; left: number; right: number; lsiPct: number | null; date: string }[] = [];
  for (const g of displayGroups) {
    if (g.kind !== "paired") continue;
    const latestDate = isoLatestPairedDate(g.left, g.right);
    if (!latestDate) continue;
    const leftBest = isoBestSessionForDate(g.left, latestDate);
    const rightBest = isoBestSessionForDate(g.right, latestDate);
    if (!leftBest || !rightBest) continue;
    const lv = isoMetricValue(leftBest.metrics, "peak_force");
    const rv = isoMetricValue(rightBest.metrics, "peak_force");
    if (lv == null || rv == null) continue;
    pairs.push({
      label: isoPairedGroupHeading(g.movementKey),
      left: lv,
      right: rv,
      lsiPct: lsiPct(lv, rv),
      date: latestDate,
    });
  }
  pairs.sort((a, b) => a.label.localeCompare(b.label));
  return pairs;
}

export type PdfSprintSplitsChart = {
  title: string;
  dateCaption: string;
  unit: string;
  items: { label: string; value: number }[];
};

export type PdfCodChart = {
  title: string;
  dateCaption: string;
  unit: string;
  left: number;
  right: number;
  lsiPct: number | null;
};

export type PdfJumpChart =
  | {
      variant: "line";
      title: string;
      dateCaption: string;
      points: { t: number; xLabel: string; jumpCm: number | null; rsi: number | null }[];
    }
  | {
      variant: "bar";
      title: string;
      dateCaption: string;
      jumpCm: number | null;
      rsi: number | null;
    };

export type PdfStrengthChart = {
  title: string;
  dateCaption: string;
  unit: string;
  pairs: { label: string; left: number; right: number; lsiPct: number | null }[];
};

export type PdfHopChart = {
  title: string;
  dateCaption: string;
  unit: string;
  pairs: { label: string; left: number; right: number; lsiPct: number | null }[];
};

export type PdfReportCharts = {
  rangeCaption: string;
  sprint: PdfSprintSplitsChart | null;
  cod: PdfCodChart | null;
  jump: PdfJumpChart | null;
  strength: PdfStrengthChart | null;
  hop: PdfHopChart | null;
};

export function buildPdfReportCharts(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, MetricRowWithSide[]>,
  hopTests: ReportHopTestRow[],
  rangeStart: string | null,
  rangeEnd: string | null
): PdfReportCharts {
  const metricsNorm = metricsBySession as Map<string, MetricRowWithSide[]>;

  const rangeCaption =
    rangeStart || rangeEnd
      ? `${rangeStart ?? "…"} – ${rangeEnd ?? "…"}`
      : "Full history";

  const linearLatest = latestSessionByDate(
    sessions,
    (s) => isLinearSprintSession(s, metricsNorm as Map<string, ReportMetricRow[]>),
    metricsNorm
  );
  let sprint: PdfSprintSplitsChart | null = null;
  if (linearLatest) {
    const items: { label: string; value: number }[] = [];
    const defs = [
      { dist: 5, key: "split_5m_time" },
      { dist: 10, key: "split_10m_time" },
      { dist: 20, key: "split_20m_time" },
      { dist: 40, key: "split_40m_time" },
    ] as const;
    for (const d of defs) {
      const v = metricAggregate(
        metricsNorm as Map<string, ReportMetricRow[]>,
        linearLatest.id,
        d.key,
        "min"
      );
      if (v != null && Number.isFinite(v)) {
        items.push({ label: `${d.dist} m`, value: v });
      }
    }
    if (items.length > 0) {
      sprint = {
        title: "Sprint split times — latest session",
        dateCaption: linearLatest.session_date
          ? formatChartAxisDate(linearLatest.session_date)
          : "—",
        unit: "s",
        items,
      };
    }
  }

  let cod: PdfCodChart | null = null;
  const codLatest = latestSessionByDate(sessions, is505Session, metricsNorm);
  if (codLatest) {
    const rows = metricsNorm.get(codLatest.id) ?? [];
    const left = minTotalTimeForSide(rows, "left");
    const right = minTotalTimeForSide(rows, "right");
    if (left != null && right != null) {
      cod = {
        title: `${codProtocolLabel(codLatest.test_sub_type)} — latest session`,
        dateCaption: codLatest.session_date
          ? formatChartAxisDate(codLatest.session_date)
          : "—",
        unit: "s",
        left,
        right,
        lsiPct: lsiPct(left, right),
      };
    }
  }

  const hawkinsSessions = sessionsChronological(
    sessions.filter((s) => bucket(s.source) === "hawkins")
  );
  const cmjPts = buildCmjDataPoints(hawkinsSessions, metricsNorm as Map<string, { key: string; value: number | null; rep_index: number | null }[]>);
  const djPts = buildDjDataPoints(hawkinsSessions, metricsNorm as Map<string, { key: string; value: number | null; rep_index: number | null }[]>);

  const merged: { t: number; xLabel: string; jumpCm: number | null; rsi: number | null }[] = [];
  const byT = new Map<number, { t: number; xLabel: string; jumpCm: number | null; rsi: number | null }>();
  for (const p of cmjPts) {
    const cur = byT.get(p.t) ?? {
      t: p.t,
      xLabel: p.date,
      jumpCm: null as number | null,
      rsi: null as number | null,
    };
    cur.jumpCm = p.jump_height;
    byT.set(p.t, cur);
  }
  for (const p of djPts) {
    const cur = byT.get(p.t) ?? {
      t: p.t,
      xLabel: p.date,
      jumpCm: null as number | null,
      rsi: null as number | null,
    };
    cur.rsi = p.rsi;
    byT.set(p.t, cur);
  }
  for (const v of byT.values()) merged.push(v);
  merged.sort((a, b) => a.t - b.t);

  let jump: PdfJumpChart | null = null;
  const withAny = merged.filter((p) => p.jumpCm != null || p.rsi != null);
  if (withAny.length >= 3) {
    jump = {
      variant: "line",
      title: "Jump performance over time",
      dateCaption: rangeCaption,
      points: withAny.map((p) => ({
        t: p.t,
        xLabel: p.xLabel,
        jumpCm: p.jumpCm,
        rsi: p.rsi,
      })),
    };
  } else if (withAny.length >= 1) {
    // <3 sessions: a "trend" chart is meaningless. Surface the LATEST values
    // as a single-session bar, with the actual session date in the caption.
    const latest = withAny[withAny.length - 1]!;
    jump = {
      variant: "bar",
      title: "Jump performance \u2014 latest session",
      dateCaption: latest.xLabel,
      jumpCm: latest.jumpCm,
      rsi: latest.rsi,
    };
  }

  let strength: PdfStrengthChart | null = null;
  const strengthPairs = buildIsoStrengthPairs(sessions, metricsNorm);
  if (strengthPairs.length > 0) {
    strength = {
      // Each movement (Knee Extension, Hip Abduction, …) can have its own
      // most-recent paired test day, so — like the hop battery below — this
      // isn't tied to a single session date. Same reasoning as `hop`'s
      // dateCaption: use the report's overall range rather than implying
      // every pair below came from one visit.
      title: "Strength (dynamometry) — latest per movement",
      dateCaption: rangeCaption,
      unit: "N",
      pairs: strengthPairs.map(({ label, left, right, lsiPct: p }) => ({
        label,
        left,
        right,
        lsiPct: p,
      })),
    };
  }

  let hop: PdfHopChart | null = null;
  const byType = new Map<string, ReportHopTestRow[]>();
  for (const h of hopTests) {
    const list = byType.get(h.test_type) ?? [];
    list.push(h);
    byType.set(h.test_type, list);
  }
  const hopPairs: PdfHopChart["pairs"] = [];
  for (const [tt, rows] of byType) {
    const dates = [...new Set(rows.map((r) => r.session_date.slice(0, 10)))].sort(
      (a, b) => b.localeCompare(a)
    );
    const latestD = dates[0];
    if (!latestD) continue;
    const day = rows.filter((r) => r.session_date.slice(0, 10) === latestD);
    let left: number | null = null;
    let right: number | null = null;
    for (const r of day) {
      const sd = (r.side ?? "").toLowerCase();
      if (sd === "left") left = r.best_cm;
      if (sd === "right") right = r.best_cm;
    }
    if (left != null && right != null) {
      hopPairs.push({
        label: hopTestDisplayName(tt),
        left,
        right,
        lsiPct: lsiPct(left, right),
      });
    }
  }
  if (hopPairs.length > 0) {
    hop = {
      title: "Hop battery — latest session",
      dateCaption: rangeCaption,
      unit: "cm",
      pairs: hopPairs.sort((a, b) => a.label.localeCompare(b.label)),
    };
  }

  return {
    rangeCaption,
    sprint,
    cod,
    jump,
    strength,
    hop,
  };
}

// ────────────────────────────────────────────────────────────────────────
// PDF REPORT CONTEXT — snapshot page data
//
// `buildPdfReportContext` augments the chart data with high-level snapshot info
// the new layout (cover page) needs: tests-included summary, key findings
// (latest values per modality with band classification), and session-over-session
// deltas for headline metrics.
// ────────────────────────────────────────────────────────────────────────

/** Band tone family — matches `bandLabelToClasses` palette in `lib/performanceBands.ts`. */
export type PdfBandTone = "elite" | "good" | "fair" | "poor" | "neutral";

export type PdfBandTag = {
  label: string;
  tone: PdfBandTone;
};

export type PdfDelta = {
  /** The previous session's value for the same metric (numeric). */
  previousValue: number;
  /** Display date for the previous session, e.g. "12 Feb 2026". */
  previousDateLabel: string;
  /** Absolute change vs previous (current - previous). */
  absoluteChange: number;
  /** Percentage change vs previous (signed). */
  pctChange: number;
  /**
   * True when a *lower* numeric value is the better outcome for this metric
   * (e.g. sprint split time). Consumers use this to colour the arrow correctly.
   */
  lowerIsBetter: boolean;
};

export type PdfKeyFinding = {
  /** Stable id used as React key + section anchor (e.g. "sprint_top_speed"). */
  id: string;
  /** Which modality section this finding belongs to. */
  modality: "sprint" | "cod" | "jump" | "strength" | "hop";
  /** Human-readable metric name (e.g. "Top speed"). */
  label: string;
  /** Pre-formatted value with unit (e.g. "3.21 m/s"). */
  value: string;
  /** Date label of the session this came from. */
  dateLabel: string;
  /** Band classification when available. */
  band: PdfBandTag | null;
  /** Delta vs previous session if there is one. */
  delta: PdfDelta | null;
};

export type PdfTestIncluded = {
  id: string;
  modality: string;
  sessions: number;
  latestDateLabel: string;
};

export type PdfReportContext = {
  tests: PdfTestIncluded[];
  findings: PdfKeyFinding[];
};

function bandTone(label: string | null | undefined): PdfBandTone {
  const l = (label ?? "").trim().toLowerCase();
  if (l.includes("elite")) return "elite";
  if (l.includes("good")) return "good";
  if (l.includes("fair")) return "fair";
  if (l.includes("poor")) return "poor";
  return "neutral";
}

function bandTagForMetric(
  metricKey: string,
  value: number | null,
  bands: NormalizedPerformanceBand[],
  sessionTestType: string | null
): PdfBandTag | null {
  if (value == null || !Number.isFinite(value)) return null;
  const resolved = resolveBandForMetric(metricKey, value, bands, sessionTestType);
  if (!resolved) return null;
  return { label: resolved.label, tone: bandTone(resolved.label) };
}

function formatValueWithUnit(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return "\u2014";
  let formatted: string;
  switch (unit) {
    case "s":
      formatted = value.toFixed(2);
      break;
    case "m/s":
      formatted = value.toFixed(2);
      break;
    case "m/s\u00b2":
      formatted = value.toFixed(2);
      break;
    case "cm":
      formatted = value.toFixed(1);
      break;
    case "RSI":
    case "":
      formatted = value.toFixed(3);
      break;
    default:
      formatted = Math.round(value).toLocaleString();
  }
  return unit && unit !== "RSI" ? `${formatted} ${unit}` : formatted;
}

function deltaFromPair(
  current: number,
  previous: number,
  previousDateLabel: string,
  lowerIsBetter: boolean
): PdfDelta {
  const abs = current - previous;
  const pct = previous === 0 ? 0 : (abs / Math.abs(previous)) * 100;
  return {
    previousValue: previous,
    previousDateLabel,
    absoluteChange: abs,
    pctChange: pct,
    lowerIsBetter,
  };
}

/**
 * Walk sessions DAY-DEDUPED FIRST (see lib/sessionDateGroups.ts) and return
 * [latest, previous] pairs of (value, sessionDate) for a given numeric
 * extractor. Sessions where extractor returns null are skipped entirely —
 * we want the previous session that ACTUALLY had a comparable number, not
 * just the prior session.
 *
 * Day-deduping first matters: without it, an athlete with two same-day
 * sessions (a re-test, a warm-up rep, a per-leg session) could get "prev"
 * silently swapped for their OTHER session from the same day instead of a
 * genuinely earlier one, producing a delta between two efforts recorded
 * minutes apart rather than real session-over-session progress. Day
 * grouping is scored by top_speed (max), matching the dashboard's
 * linearDateGroups/codDateGroups exactly.
 */
function findLatestAndPrev(
  sessions: ReportSessionRow[],
  pred: (s: ReportSessionRow) => boolean,
  extractor: (s: ReportSessionRow) => number | null,
  metricsNorm: Map<string, MetricRowWithSide[]>
): { latest: { value: number; date: string } | null; prev: { value: number; date: string } | null } {
  const filtered = sessions.filter(pred).filter((s) => s.session_date);
  const groups = groupSessionsByDate(filtered, (s) =>
    metricAggregate(metricsNorm as Map<string, ReportMetricRow[]>, s.id, "top_speed", "max")
  );
  const valued: { value: number; date: string }[] = [];
  for (const g of groups) {
    const v = extractor(g.best);
    if (v == null || !Number.isFinite(v)) continue;
    valued.push({ value: v, date: g.best.session_date! });
  }
  const latest = valued.length > 0 ? valued[valued.length - 1]! : null;
  const prev = valued.length > 1 ? valued[valued.length - 2]! : null;
  return { latest, prev };
}

function findingFromSeries(
  id: PdfKeyFinding["id"],
  modality: PdfKeyFinding["modality"],
  label: string,
  unit: string,
  metricKeyForBand: string,
  sessionTestType: string | null,
  lowerIsBetter: boolean,
  sessions: ReportSessionRow[],
  pred: (s: ReportSessionRow) => boolean,
  extractor: (s: ReportSessionRow) => number | null,
  bands: NormalizedPerformanceBand[],
  metricsNorm: Map<string, MetricRowWithSide[]>
): PdfKeyFinding | null {
  const { latest, prev } = findLatestAndPrev(sessions, pred, extractor, metricsNorm);
  if (!latest) return null;
  const delta = prev
    ? deltaFromPair(latest.value, prev.value, formatChartAxisDate(prev.date), lowerIsBetter)
    : null;
  return {
    id,
    modality,
    label,
    value: formatValueWithUnit(latest.value, unit),
    dateLabel: formatChartAxisDate(latest.date),
    band: bandTagForMetric(metricKeyForBand, latest.value, bands, sessionTestType),
    delta,
  };
}

/**
 * Build the snapshot context that the new PDF cover page consumes.
 * `bands` may be an empty array — in that case any band tag falls back to the
 * built-in default in `resolveBandForMetric` (currently only peakSpeed has one).
 */
export function buildPdfReportContext(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, MetricRowWithSide[]>,
  hopTests: ReportHopTestRow[],
  bands: NormalizedPerformanceBand[]
): PdfReportContext {
  const metricsNorm = metricsBySession;

  // ───────────────────────────────────────────────────────────────────────
  // TESTS INCLUDED
  // ───────────────────────────────────────────────────────────────────────

  const tests: PdfTestIncluded[] = [];
  const pushTest = (
    id: string,
    modality: string,
    sess: { session_date: string | null }[]
  ) => {
    if (sess.length === 0) return;
    const dated = sess.filter((s): s is { session_date: string } => !!s.session_date);
    const latestDate = dated.length
      ? dated.reduce((a, b) =>
          new Date(a.session_date).getTime() > new Date(b.session_date).getTime() ? a : b
        ).session_date
      : null;
    tests.push({
      id,
      modality,
      sessions: sess.length,
      latestDateLabel: latestDate ? formatChartAxisDate(latestDate) : "\u2014",
    });
  };

  const linearSessions = sessions.filter((s) =>
    isLinearSprintSession(s, metricsNorm as Map<string, ReportMetricRow[]>)
  );
  const codSessions = sessions.filter(is505Session);
  const cmjSessions = sessions.filter((s) => {
    const tt = (s.test_type ?? "").toLowerCase();
    if (tt === "force_plate_dj" || tt.includes("drop")) return false;
    return tt === "force_plate_cmj" || tt.includes("cmj");
  });
  const djSessions = sessions.filter((s) => {
    const tt = (s.test_type ?? "").toLowerCase();
    return tt === "force_plate_dj" || tt.includes("drop");
  });
  const dynoSessions = buildIsoSessionsForPdf(sessions, metricsNorm);
  const hopByDate = new Set(
    hopTests.map((h) => h.session_date.slice(0, 10))
  );

  pushTest("sprint", "Linear sprint (1080)", linearSessions);
  pushTest("cod", `${codProtocolLabel(codSessions[0]?.test_sub_type)} (1080)`, codSessions);
  pushTest("cmj", "Force plate \u2014 CMJ", cmjSessions);
  pushTest("dj", "Force plate \u2014 drop jump", djSessions);
  pushTest("strength", "Dynamometry", dynoSessions);

  if (hopByDate.size > 0) {
    const sortedDates = [...hopByDate].sort();
    tests.push({
      id: "hop",
      modality: "Hop tests",
      sessions: hopByDate.size,
      latestDateLabel: formatChartAxisDate(sortedDates[sortedDates.length - 1]!),
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // KEY FINDINGS — one headline metric per modality, with band + delta
  // ───────────────────────────────────────────────────────────────────────

  const findings: PdfKeyFinding[] = [];

  // Sprint: top speed (max within session)
  const topSpeedF = findingFromSeries(
    "sprint_top_speed",
    "sprint",
    "Top speed",
    "m/s",
    "top_speed",
    "linear_sprint_unresisted",
    false,
    sessions,
    (s) => isLinearSprintSession(s, metricsNorm as Map<string, ReportMetricRow[]>),
    (s) =>
      metricAggregate(
        metricsNorm as Map<string, ReportMetricRow[]>,
        s.id,
        "top_speed",
        "max"
      ),
    bands,
    metricsNorm
  );
  if (topSpeedF) findings.push(topSpeedF);

  // Sprint: 5m split time (lower is better)
  const split5mF = findingFromSeries(
    "sprint_split_5m",
    "sprint",
    "5 m split",
    "s",
    "split_5m_time",
    "linear_sprint_unresisted",
    true,
    sessions,
    (s) => isLinearSprintSession(s, metricsNorm as Map<string, ReportMetricRow[]>),
    (s) =>
      metricAggregate(
        metricsNorm as Map<string, ReportMetricRow[]>,
        s.id,
        "split_5m_time",
        "min"
      ),
    bands,
    metricsNorm
  );
  if (split5mF) findings.push(split5mF);

  // COD: total time for the slower side at the latest 5-0-5/5-10-5 session (lower is better)
  // Band lookup + label both use the latest matching session's own
  // test_sub_type — don't hardcode "5-10-5" here (see codProtocolLabel's own
  // comment: "don't assume 5-10-5"). Adam Radi's real sessions are "5-0-5";
  // a hardcoded "5-10-5" testType meant this finding could never match a
  // "5-0-5"-specific band row in performance_bands, silently falling through
  // to a generic (testType-less) row or no band at all.
  const codLatestForFinding = latestSessionByDate(sessions, is505Session, metricsNorm);
  const codF = findingFromSeries(
    "cod_total_time",
    "cod",
    `${codProtocolLabel(codLatestForFinding?.test_sub_type)} total time`,
    "s",
    "total_time",
    codProtocolLabel(codLatestForFinding?.test_sub_type),
    true,
    sessions,
    is505Session,
    (s) => {
      const rows = metricsNorm.get(s.id) ?? [];
      const left = minTotalTimeForSide(rows, "left");
      const right = minTotalTimeForSide(rows, "right");
      if (left == null && right == null) return null;
      if (left == null) return right;
      if (right == null) return left;
      return Math.max(left, right); // weaker side = the time we want to track
    },
    bands,
    metricsNorm
  );
  if (codF) findings.push(codF);

  // Force plate CMJ: jump height
  const hawkinsSessions = sessionsChronological(
    sessions.filter((s) => bucket(s.source) === "hawkins")
  );
  const cmjPts = buildCmjDataPoints(
    hawkinsSessions,
    metricsNorm as Map<string, { key: string; value: number | null; rep_index: number | null }[]>
  );
  if (cmjPts.length > 0) {
    const latestCmj = cmjPts[cmjPts.length - 1]!;
    if (latestCmj.jump_height != null && Number.isFinite(latestCmj.jump_height)) {
      const prevCmj =
        cmjPts.length > 1 &&
        cmjPts[cmjPts.length - 2]!.jump_height != null
          ? cmjPts[cmjPts.length - 2]!
          : null;
      const delta =
        prevCmj && prevCmj.jump_height != null
          ? deltaFromPair(
              latestCmj.jump_height,
              prevCmj.jump_height,
              prevCmj.date,
              false
            )
          : null;
      findings.push({
        id: "cmj_jump_height",
        modality: "jump",
        label: "CMJ jump height",
        value: formatValueWithUnit(latestCmj.jump_height, "cm"),
        dateLabel: latestCmj.date,
        band: bandTagForMetric(
          "fp_jump_height_cm_best",
          latestCmj.jump_height,
          bands,
          "force_plate_cmj"
        ),
        delta,
      });
    }
  }

  // Drop jump: RSI
  const djPts = buildDjDataPoints(
    hawkinsSessions,
    metricsNorm as Map<string, { key: string; value: number | null; rep_index: number | null }[]>
  );
  if (djPts.length > 0) {
    const latestDj = djPts[djPts.length - 1]!;
    if (latestDj.rsi != null && Number.isFinite(latestDj.rsi)) {
      const prevDj =
        djPts.length > 1 && djPts[djPts.length - 2]!.rsi != null
          ? djPts[djPts.length - 2]!
          : null;
      const delta =
        prevDj && prevDj.rsi != null
          ? deltaFromPair(latestDj.rsi, prevDj.rsi, prevDj.date, false)
          : null;
      findings.push({
        id: "dj_rsi",
        modality: "jump",
        label: "Drop jump RSI",
        value: formatValueWithUnit(latestDj.rsi, "RSI"),
        dateLabel: latestDj.date,
        band: bandTagForMetric(
          "fp_rsi_best",
          latestDj.rsi,
          bands,
          "force_plate_dj"
        ),
        delta,
      });
    }
  }

  // Strength (isometric dynamometry): lowest LSI across each movement's own
  // latest paired (Left+Right) test — same peak_force LSI shown as the
  // "Start LSI / Latest LSI / Change" badge on the dashboard's paired
  // dynamometry groups, and on the patient-facing isometric strength cards.
  const strengthPairsForFinding = buildIsoStrengthPairs(sessions, metricsNorm);
  if (strengthPairsForFinding.length > 0) {
    let worstStrengthLsi: { label: string; lsi: number; date: string } | null = null;
    for (const p of strengthPairsForFinding) {
      if (p.lsiPct == null) continue;
      if (!worstStrengthLsi || p.lsiPct < worstStrengthLsi.lsi) {
        worstStrengthLsi = { label: p.label, lsi: p.lsiPct, date: p.date };
      }
    }
    if (worstStrengthLsi) {
      findings.push({
        id: "strength_min_lsi",
        modality: "strength",
        label: `Lowest strength LSI — ${worstStrengthLsi.label}`,
        value: `${worstStrengthLsi.lsi.toFixed(1)} %`,
        dateLabel: formatChartAxisDate(worstStrengthLsi.date),
        band:
          worstStrengthLsi.lsi >= 90
            ? { label: "Good", tone: "good" }
            : worstStrengthLsi.lsi >= 80
              ? { label: "Fair", tone: "fair" }
              : { label: "Poor", tone: "poor" },
        delta: null,
      });
    }
  }

  // Hop tests: lowest LSI across the latest day of hop battery
  if (hopTests.length > 0) {
    const byType = new Map<string, ReportHopTestRow[]>();
    for (const h of hopTests) {
      const list = byType.get(h.test_type) ?? [];
      list.push(h);
      byType.set(h.test_type, list);
    }
    let worstLsi: { label: string; lsi: number; date: string } | null = null;
    for (const [tt, rows] of byType) {
      const dates = [...new Set(rows.map((r) => r.session_date.slice(0, 10)))].sort(
        (a, b) => b.localeCompare(a)
      );
      const latestD = dates[0];
      if (!latestD) continue;
      const day = rows.filter((r) => r.session_date.slice(0, 10) === latestD);
      let left: number | null = null;
      let right: number | null = null;
      for (const r of day) {
        const sd = (r.side ?? "").toLowerCase();
        if (sd === "left") left = r.best_cm;
        if (sd === "right") right = r.best_cm;
      }
      if (left == null || right == null) continue;
      const lsi = lsiPct(left, right);
      if (lsi == null) continue;
      if (!worstLsi || lsi < worstLsi.lsi) {
        worstLsi = { label: hopTestDisplayName(tt), lsi, date: latestD };
      }
    }
    if (worstLsi) {
      findings.push({
        id: "hop_min_lsi",
        modality: "hop",
        label: `Lowest hop LSI \u2014 ${worstLsi.label}`,
        value: `${worstLsi.lsi.toFixed(1)} %`,
        dateLabel: formatChartAxisDate(worstLsi.date),
        band:
          worstLsi.lsi >= 90
            ? { label: "Good", tone: "good" }
            : worstLsi.lsi >= 80
            ? { label: "Fair", tone: "fair" }
            : { label: "Poor", tone: "poor" },
        delta: null,
      });
    }
  }

  return { tests, findings };
}
