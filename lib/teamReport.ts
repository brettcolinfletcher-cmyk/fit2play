/**
 * Team summary report. Pure: takes already-loaded data and builds everything
 * the team PDF shows, so it can be unit tested without Supabase or react-pdf.
 *
 * Sections:
 *  1. Squad table: each athlete's latest value per test, colour-coded.
 *  2. Rankings: top 3 per test plus the squad average.
 *  3. Flags: LSI below 90%, or a drop of more than 10% since the last test.
 *  4. Coverage: tested this round, missed, incomplete, due for retest.
 *
 * Metric values come from team_test_results(), which uses the same
 * definitions as athlete_cohort_ranks, so this report agrees with the
 * ranking dials on each athlete's own report.
 */

import { DIALS, type TestKey } from "@/lib/testCatalogue";
import { resolveBandForMetric, type NormalizedPerformanceBand } from "@/lib/performanceBands";
import { computeRetestDue, type RetestRow } from "@/lib/retestDue";

export type TeamMetricKey = "max_speed" | "acceleration" | "deceleration" | "cod" | "jump_height" | "adductor";

export type TeamMetricDef = {
  metric: TeamMetricKey;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  testKey: TestKey;
  lowerIsBetter: boolean;
};

const SHORT: Record<TeamMetricKey, string> = {
  max_speed: "Max speed",
  acceleration: "Accel",
  deceleration: "Decel",
  cod: "5-0-5",
  jump_height: "CMJ",
  adductor: "Adductor",
};

export const TEAM_METRICS: TeamMetricDef[] = [
  ...DIALS.map((d) => ({
    metric: d.metric as TeamMetricKey,
    label: d.label,
    short: SHORT[d.metric as TeamMetricKey],
    unit: d.unit,
    decimals: d.decimals,
    testKey: d.testKey,
    lowerIsBetter: d.metric === "cod",
  })),
  {
    metric: "adductor",
    label: "Adductor squeeze",
    short: SHORT.adductor,
    unit: "N",
    decimals: 0,
    testKey: "adductor_squeeze",
    lowerIsBetter: false,
  },
];

/** performance_bands lookup for metrics that have bands configured. */
const BAND_SOURCE: Partial<Record<TeamMetricKey, { key: string; testType: string | null; scale: number }>> = {
  max_speed: { key: "top_speed", testType: "linear_sprint_unresisted", scale: 1 / 3.6 },
  acceleration: { key: "maxAcceleration", testType: null, scale: 1 },
  jump_height: { key: "fp_jump_height_cm_best", testType: "force_plate_cmj", scale: 1 },
};

export const LSI_FLAG_BELOW = 90;
export const DROP_FLAG_PCT = 10;

export type Tone = "elite" | "good" | "fair" | "poor" | "neutral";
export type ColourMode = "bands" | "squad";

/** One row from team_test_results(). Numerics may arrive as strings. */
export type TeamResultRow = {
  athlete_id: string;
  metric: string;
  d: string | null;
  v: number | string | null;
  prev_d: string | null;
  prev_v: number | string | null;
};

export type LsiReading = { label: string; lsi: number; date: string };

export type TeamReportInput = {
  teamName: string;
  intervalWeeks: number | null;
  athletes: { id: string; name: string }[];
  results: TeamResultRow[];
  /** Latest LSI per paired test, per athlete (strength and hop). */
  lsi: Map<string, LsiReading[]>;
  /** Every test date (YYYY-MM-DD) per athlete, any source. */
  testDates: Map<string, string[]>;
  /** Testing round window, inclusive, YYYY-MM-DD. */
  from: string;
  to: string;
  today: string;
  /** Protocol test keys for the squad, or null for "any test with data". */
  protocolTests: TestKey[] | null;
  colourMode: ColourMode;
  bands: NormalizedPerformanceBand[];
};

export type TeamCell = {
  value: number | null;
  date: string | null;
  /** Value is from before this testing round. */
  stale: boolean;
  tone: Tone;
  /** 1-based squad rank, ties share a rank. */
  rank: number | null;
};

export type TeamRow = {
  athleteId: string;
  name: string;
  cells: Record<string, TeamCell>;
  /** Most recent test of any kind, YYYY-MM-DD. */
  lastTest: string | null;
};

export type TeamRanking = {
  metric: TeamMetricDef;
  top: { name: string; value: number; rank: number }[];
  average: number | null;
  count: number;
};

export type TeamFlag = {
  athleteId: string;
  name: string;
  kind: "lsi" | "drop";
  test: string;
  detail: string;
  date: string;
};

export type TeamCoverage = {
  tested: string[];
  missed: string[];
  incomplete: { name: string; missing: string[] }[];
  retest: RetestRow[];
};

export type TeamReport = {
  teamName: string;
  from: string;
  to: string;
  metrics: TeamMetricDef[];
  rows: TeamRow[];
  rankings: TeamRanking[];
  flags: TeamFlag[];
  coverage: TeamCoverage;
  colourMode: ColourMode;
};

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function inWindow(d: string | null, from: string, to: string): boolean {
  if (!d) return false;
  const x = d.slice(0, 10);
  return x >= from && x <= to;
}

export function formatMetric(def: TeamMetricDef, v: number | null): string {
  return v == null ? "–" : v.toFixed(def.decimals);
}

function toneFromLabel(label: string | null | undefined): Tone {
  const l = (label ?? "").toLowerCase();
  if (l.includes("elite")) return "elite";
  if (l.includes("good")) return "good";
  if (l.includes("fair")) return "fair";
  if (l.includes("poor")) return "poor";
  return "neutral";
}

export function bandTone(metric: TeamMetricKey, value: number | null, bands: NormalizedPerformanceBand[]): Tone {
  const src = BAND_SOURCE[metric];
  if (!src || value == null) return "neutral";
  const band = resolveBandForMetric(src.key, value * src.scale, bands, src.testType);
  return toneFromLabel(band?.label);
}

/** Squad thirds: top third green, middle amber, bottom red. */
export function squadTone(rank: number | null, count: number): Tone {
  if (rank == null || count < 3) return "neutral";
  const pos = (rank - 1) / count;
  if (pos < 1 / 3) return "good";
  if (pos < 2 / 3) return "fair";
  return "poor";
}

/** Competition ranks (1, 2, 2, 4) for one metric. */
export function rankValues(
  entries: { id: string; value: number }[],
  lowerIsBetter: boolean
): Map<string, number> {
  const sorted = [...entries].sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));
  const out = new Map<string, number>();
  sorted.forEach((e, i) => {
    const prev = sorted[i - 1];
    out.set(e.id, prev && prev.value === e.value ? out.get(prev.id)! : i + 1);
  });
  return out;
}

/** Signed % change where positive always means "got worse". */
export function worsening(latest: number, prev: number, lowerIsBetter: boolean): number | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  const pct = ((latest - prev) / Math.abs(prev)) * 100;
  return lowerIsBetter ? pct : -pct;
}

export function buildTeamReport(input: TeamReportInput): TeamReport {
  const { athletes, from, to } = input;
  const names = new Map(athletes.map((a) => [a.id, a.name] as const));
  const sortedAthletes = [...athletes].sort((a, b) => a.name.localeCompare(b.name));

  const byKey = new Map<string, TeamResultRow>();
  for (const r of input.results) {
    if (names.has(r.athlete_id)) byKey.set(`${r.athlete_id}|${r.metric}`, r);
  }

  const lastTest = new Map<string, string>();
  for (const a of athletes) {
    const dates = (input.testDates.get(a.id) ?? []).map((d) => d.slice(0, 10)).sort();
    if (dates.length) lastTest.set(a.id, dates[dates.length - 1]!);
  }

  const metrics = TEAM_METRICS.filter((m) =>
    input.protocolTests
      ? input.protocolTests.includes(m.testKey)
      : athletes.some((a) => num(byKey.get(`${a.id}|${m.metric}`)?.v) != null)
  );

  // Ranks per metric across the squad (latest values, any date).
  const ranks = new Map<TeamMetricKey, Map<string, number>>();
  const counts = new Map<TeamMetricKey, number>();
  for (const m of metrics) {
    const entries = athletes
      .map((a) => ({ id: a.id, value: num(byKey.get(`${a.id}|${m.metric}`)?.v) }))
      .filter((e): e is { id: string; value: number } => e.value != null);
    ranks.set(m.metric, rankValues(entries, m.lowerIsBetter));
    counts.set(m.metric, entries.length);
  }

  const rows: TeamRow[] = sortedAthletes.map((a) => {
    const cells: Record<string, TeamCell> = {};
    for (const m of metrics) {
      const r = byKey.get(`${a.id}|${m.metric}`);
      const value = num(r?.v);
      const rank = ranks.get(m.metric)?.get(a.id) ?? null;
      const tone =
        input.colourMode === "squad"
          ? squadTone(rank, counts.get(m.metric) ?? 0)
          : bandTone(m.metric, value, input.bands);
      cells[m.metric] = {
        value,
        date: r?.d ?? null,
        stale: value != null && !!r?.d && r.d.slice(0, 10) < from,
        tone,
        rank,
      };
    }
    return { athleteId: a.id, name: a.name, cells, lastTest: lastTest.get(a.id) ?? null };
  });

  const rankings: TeamRanking[] = metrics.map((m) => {
    const vals = rows
      .map((r) => ({ name: r.name, value: r.cells[m.metric]?.value ?? null, rank: r.cells[m.metric]?.rank ?? null }))
      .filter((x): x is { name: string; value: number; rank: number } => x.value != null && x.rank != null)
      .sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name));
    const sum = vals.reduce((s, x) => s + x.value, 0);
    return {
      metric: m,
      top: vals.filter((x) => x.rank <= 3),
      average: vals.length ? sum / vals.length : null,
      count: vals.length,
    };
  });

  // Flags: only readings from this testing round.
  const flags: TeamFlag[] = [];
  for (const a of sortedAthletes) {
    for (const reading of input.lsi.get(a.id) ?? []) {
      if (reading.lsi < LSI_FLAG_BELOW && inWindow(reading.date, from, to)) {
        flags.push({
          athleteId: a.id,
          name: a.name,
          kind: "lsi",
          test: reading.label,
          detail: `LSI ${reading.lsi.toFixed(1)}%`,
          date: reading.date.slice(0, 10),
        });
      }
    }
    for (const m of metrics) {
      const r = byKey.get(`${a.id}|${m.metric}`);
      const latest = num(r?.v);
      const prev = num(r?.prev_v);
      if (latest == null || prev == null || !inWindow(r?.d ?? null, from, to)) continue;
      const worse = worsening(latest, prev, m.lowerIsBetter);
      if (worse != null && worse > DROP_FLAG_PCT) {
        flags.push({
          athleteId: a.id,
          name: a.name,
          kind: "drop",
          test: m.label,
          detail: `${formatMetric(m, prev)} to ${formatMetric(m, latest)} ${m.unit} (${worse.toFixed(0)}% worse)`,
          date: r!.d!.slice(0, 10),
        });
      }
    }
  }

  // Coverage.
  const tested: string[] = [];
  const missed: string[] = [];
  const incomplete: { name: string; missing: string[] }[] = [];
  for (const a of sortedAthletes) {
    const dates = (input.testDates.get(a.id) ?? []).map((d) => d.slice(0, 10));
    if (!dates.some((d) => d >= from && d <= to)) {
      missed.push(a.name);
      continue;
    }
    tested.push(a.name);
    const missing = metrics
      .filter((m) => !inWindow(byKey.get(`${a.id}|${m.metric}`)?.d ?? null, from, to))
      .map((m) => m.label);
    if (missing.length) incomplete.push({ name: a.name, missing });
  }
  const retest = computeRetestDue(
    sortedAthletes.map((a) => ({
      id: a.id,
      name: a.name,
      status: null,
      teamName: input.teamName,
      intervalWeeks: input.intervalWeeks,
    })),
    lastTest,
    input.today
  ).filter((r) => r.status !== "ok");

  return {
    teamName: input.teamName,
    from,
    to,
    metrics,
    rows,
    rankings,
    flags,
    coverage: { tested, missed, incomplete, retest },
    colourMode: input.colourMode,
  };
}

/**
 * Default testing round: the 28 days up to and including the squad's most
 * recent test date. Returns null when nobody has been tested.
 */
export function defaultRound(testDates: Map<string, string[]>): { from: string; to: string } | null {
  let latest: string | null = null;
  for (const list of testDates.values()) {
    for (const d of list) {
      const x = d.slice(0, 10);
      if (!latest || x > latest) latest = x;
    }
  }
  if (!latest) return null;
  const t = Date.UTC(+latest.slice(0, 4), +latest.slice(5, 7) - 1, +latest.slice(8, 10)) - 27 * 86_400_000;
  return { from: new Date(t).toISOString().slice(0, 10), to: latest };
}
