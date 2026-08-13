import {
  bucket,
  formatChartAxisDate,
  isLinearSprintSession,
  metricAggregate,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";

export type SummaryStatus = "pass" | "warn" | "fail" | "no_data";

export type SummaryMetric = {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  displayValue: string;
  targetLabel: string;
  status: SummaryStatus;
  /** e.g. "5-0-5 Assisted start · 12 Aug 2026", null when no session found. */
  sourceLabel: string | null;
};

export type SummaryCategory = {
  id: string;
  label: string;
  metrics: SummaryMetric[];
};

type Direction = "higher" | "lower";

// ─── Starter RTP targets ───────────────────────────────────────────────
// These are generic placeholder thresholds, NOT validated clinical cutoffs.
// They exist so the dashboard has something sensible to traffic-light
// against on day one. Brett should tune every one of these to his own
// population/sport/return-to-sport protocol — treat them as a starting
// point, not a diagnosis. A ±10% "warn" band around the target avoids a
// hard pass/fail cliff right at the threshold.
const WARN_BAND = 0.1;

function statusFor(value: number | null, target: number, direction: Direction): SummaryStatus {
  if (value == null || !Number.isFinite(value)) return "no_data";
  if (direction === "higher") {
    if (value >= target) return "pass";
    if (value >= target * (1 - WARN_BAND)) return "warn";
    return "fail";
  }
  if (value <= target) return "pass";
  if (value <= target * (1 + WARN_BAND)) return "warn";
  return "fail";
}

function fmt(value: number | null, decimals: number, unit: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}

function is505Session(s: ReportSessionRow): boolean {
  if (bucket(s.source) !== "1080") return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return sub.includes("5-0-5") || sub.includes("5-10-5");
}

function isTenMAccelSession(s: ReportSessionRow): boolean {
  if (bucket(s.source) !== "1080") return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return sub.includes("10m acceleration");
}

function latestSessionOf(
  sessions: ReportSessionRow[],
  predicate: (s: ReportSessionRow) => boolean
): ReportSessionRow | null {
  let best: ReportSessionRow | null = null;
  let bestTime = -Infinity;
  for (const s of sessions) {
    if (!predicate(s) || !s.session_date) continue;
    const t = new Date(s.session_date).getTime();
    if (t >= bestTime) {
      bestTime = t;
      best = s;
    }
  }
  return best;
}

/**
 * Most recent session matching `predicate` that actually has a value for
 * `key` — lets us skip past sessions where a given split/metric wasn't
 * captured instead of just taking the single latest session of that type.
 */
function latestSessionWithMetric(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  predicate: (s: ReportSessionRow) => boolean,
  key: string
): ReportSessionRow | null {
  const candidates = sessions
    .filter((s) => predicate(s) && s.session_date)
    .sort((a, b) => new Date(b.session_date!).getTime() - new Date(a.session_date!).getTime());
  for (const s of candidates) {
    if (metricAggregate(metricsBySession, s.id, key, "min") != null) return s;
  }
  return null;
}

// The 1080 device doesn't tag sessions with a fixed test distance — "40m
// sprint" sessions are identified by the actual distance recorded
// (total_distance), not by test_sub_type. Tolerance allows for a device
// stopping a metre or two short/long of the configured 40m.
const FORTY_M_TOLERANCE = 5;

function latest40mSession(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>
): ReportSessionRow | null {
  const candidates = sessions
    .filter((s) => isLinearSprintSession(s) && s.session_date)
    .sort((a, b) => new Date(b.session_date!).getTime() - new Date(a.session_date!).getTime());
  for (const s of candidates) {
    const dist = metricAggregate(metricsBySession, s.id, "total_distance", "max");
    if (dist != null && Math.abs(dist - 40) <= FORTY_M_TOLERANCE) return s;
  }
  return null;
}

function sourceLabel(s: ReportSessionRow | null): string | null {
  if (!s || !s.session_date) return null;
  const sub = (s.test_sub_type ?? "").trim();
  return `${sub || "Session"} · ${formatChartAxisDate(s.session_date)}`;
}

export function computePerformanceSummary(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>
): SummaryCategory[] {
  const cmjSession = latestSessionOf(
    sessions,
    (s) => bucket(s.source) === "hawkins" && s.test_type === "force_plate_cmj"
  );
  const codSession = latestSessionOf(sessions, is505Session);
  const tenMSession = latestSessionOf(sessions, isTenMAccelSession);
  const fortyMSession = latest40mSession(sessions, metricsBySession);
  const fiveMSession = latestSessionWithMetric(
    sessions,
    metricsBySession,
    (s) => bucket(s.source) === "1080",
    "split_5m_time"
  );
  const peakPowerSession = latestSessionWithMetric(
    sessions,
    metricsBySession,
    (s) => bucket(s.source) === "1080",
    "peak_power"
  );

  const cmj = (key: string) =>
    cmjSession ? metricAggregate(metricsBySession, cmjSession.id, key, "max") : null;
  const codMax = (key: string) =>
    codSession ? metricAggregate(metricsBySession, codSession.id, key, "max") : null;
  const codMin = (key: string) =>
    codSession ? metricAggregate(metricsBySession, codSession.id, key, "min") : null;

  function metric(
    id: string,
    label: string,
    unit: string,
    value: number | null,
    target: number,
    direction: Direction,
    decimals: number,
    source: ReportSessionRow | null
  ): SummaryMetric {
    return {
      id,
      label,
      unit,
      value,
      displayValue: fmt(value, decimals, unit),
      targetLabel: `${direction === "higher" ? "≥" : "≤"} ${target}${unit ? ` ${unit}` : ""}`,
      status: statusFor(value, target, direction),
      sourceLabel: sourceLabel(source),
    };
  }

  const jumpHeight = cmj("fp_jump_height");

  const categories: SummaryCategory[] = [
    {
      id: "cmj",
      label: "CMJ",
      metrics: [
        metric("cmj_jump_height", "Jump Height", "cm", jumpHeight, 30, "higher", 1, cmjSession),
        metric(
          "cmj_conc_peak_force",
          "Conc. Peak Force",
          "N",
          cmj("fp_peak_propulsive_force"),
          1500,
          "higher",
          0,
          cmjSession
        ),
        metric(
          "cmj_propulsive_impulse",
          "Propulsive Impulse",
          "N·s",
          cmj("fp_propulsive_impulse"),
          220,
          "higher",
          0,
          cmjSession
        ),
      ],
    },
    {
      id: "power",
      label: "Power",
      metrics: [
        metric(
          "power_cmj_peak_power",
          "CMJ Peak Power",
          "W",
          cmj("fp_peak_propulsive_power"),
          3500,
          "higher",
          0,
          cmjSession
        ),
        metric("power_cmj_rsi_mod", "CMJ RSI (mod)", "", cmj("fp_mrsi"), 0.35, "higher", 2, cmjSession),
        metric(
          "power_1080_peak_power",
          "1080 Peak Power",
          "W",
          peakPowerSession
            ? metricAggregate(metricsBySession, peakPowerSession.id, "peak_power", "max")
            : null,
          500,
          "higher",
          0,
          peakPowerSession
        ),
      ],
    },
    {
      id: "speed",
      label: "Speed",
      metrics: [
        metric(
          "speed_40m",
          "1080 40m Sprint",
          "s",
          fortyMSession
            ? metricAggregate(metricsBySession, fortyMSession.id, "total_time", "min")
            : null,
          5.6,
          "lower",
          2,
          fortyMSession
        ),
      ],
    },
    {
      id: "accel",
      label: "Accel",
      metrics: [
        metric(
          "accel_5m",
          "1080 5m Sprint Time",
          "s",
          fiveMSession
            ? metricAggregate(metricsBySession, fiveMSession.id, "split_5m_time", "min")
            : null,
          1.05,
          "lower",
          2,
          fiveMSession
        ),
        metric(
          "accel_10m",
          "1080 10m Sprint Time",
          "s",
          tenMSession
            ? metricAggregate(metricsBySession, tenMSession.id, "total_time", "min")
            : null,
          1.85,
          "lower",
          2,
          tenMSession
        ),
        metric("accel_505_max_accel", "5-0-5 Max Accel", "m/s²", codMax("accel_max"), 5.0, "higher", 2, codSession),
      ],
    },
    {
      id: "decel",
      label: "Decel",
      metrics: [
        metric(
          "decel_cmj_rfd",
          "CMJ Ecc. Decel RFD",
          "N/s",
          cmj("fp_braking_rfd"),
          4000,
          "higher",
          0,
          cmjSession
        ),
        metric("decel_505_max_decel", "1080 5-0-5 Max Decel", "m/s²", codMax("decel_max"), 5.0, "higher", 2, codSession),
      ],
    },
    {
      id: "cod",
      label: "Change of Direction",
      metrics: [
        // TODO: Brett asked for this "corrected for distance" — the exact
        // correction formula wasn't specified, so this is the raw 1080
        // total_time for now. Confirm what "corrected" should mean
        // (e.g. normalised against the session's recorded total_distance)
        // and adjust here.
        metric(
          "cod_505_total_time",
          "5-0-5 Total Time",
          "s",
          codMin("total_time"),
          2.5,
          "lower",
          2,
          codSession
        ),
      ],
    },
  ];

  return categories;
}
