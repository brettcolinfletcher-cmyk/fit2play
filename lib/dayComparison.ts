/**
 * Test-day comparison: pick two test days for one athlete and compare every
 * test done on them, side by side.
 *
 * Rules
 * - A "test day" is a calendar date (session_date, first 10 chars).
 * - Every trial of the same test on the same day is pooled; each metric takes
 *   the best value of the day (max, or min for times). Zero / negative values
 *   are ignored (failed or landing-only trials store 0).
 * - Hawkins trials ("Countermovement Jump-CMJ:2") are grouped by test name
 *   with the trial number, side and redundant tags stripped, so CMJ:1..3 are
 *   one test and Left/Right sessions of a movement are one test with L/R rows.
 * - 1080 reps are grouped by what the rep actually was (sprint vs change of
 *   direction), not by the session label, because one 1080 session often
 *   holds both. See repKinds1080.
 * - Results are always shown earlier day first; change = later - earlier.
 */
import { hopTestDisplayName, type ReportHopTestRow } from "@/lib/athleteReportData";
import {
  bucket,
  classify1080Reps,
  formatChartAxisDate,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/reportCore";

export type CompareFamily =
  | "sprint"
  | "cod"
  | "speed_other"
  | "cmj"
  | "dj"
  | "force_plate"
  | "isometric"
  | "hop";

export const COMPARE_FAMILY_ORDER: CompareFamily[] = [
  "sprint",
  "cod",
  "speed_other",
  "cmj",
  "dj",
  "force_plate",
  "isometric",
  "hop",
];

export const COMPARE_FAMILY_TITLE: Record<CompareFamily, string> = {
  sprint: "Sprint",
  cod: "Change of direction",
  speed_other: "Other speed tests",
  cmj: "Countermovement jump",
  dj: "Drop jump",
  force_plate: "Other force plate tests",
  isometric: "Isometric strength",
  hop: "Hop tests",
};

const FAMILY_SHORT: Record<CompareFamily, string> = {
  sprint: "Sprint",
  cod: "COD",
  speed_other: "Speed (other)",
  cmj: "CMJ",
  dj: "Drop jump",
  force_plate: "Force plate",
  isometric: "Isometrics",
  hop: "Hops",
};

type Side = "both" | "left" | "right";
const SIDES: Side[] = ["both", "left", "right"];

type KeySource = { key: string; tx?: (v: number) => number };

type MetricSpec = {
  id: string;
  label: string;
  /** Tried in order; the first source with any value on the day is used. */
  sources: KeySource[];
  agg: "max" | "min";
  unit: string;
  digits: number;
  higherBetter: boolean;
};

const metresToCm = (v: number) => v * 100;
const secondsToMs = (v: number) => (v > 25 ? v : v * 1000);

const spec = (
  id: string,
  label: string,
  sources: KeySource[] | string,
  agg: "max" | "min",
  unit: string,
  digits: number
): MetricSpec => ({
  id,
  label,
  sources: typeof sources === "string" ? [{ key: sources }] : sources,
  agg,
  unit,
  digits,
  higherBetter: agg === "max",
});

const JUMP_HEIGHT = spec(
  "jump_height",
  "Jump height",
  [{ key: "fp_jump_height", tx: metresToCm }, { key: "fp_jump_height_cm_best" }],
  "max",
  "cm",
  1
);

const SPECS: Record<CompareFamily, MetricSpec[]> = {
  sprint: [
    spec("top_speed", "Top speed", "top_speed", "max", "m/s", 2),
    spec("accel_max", "Max acceleration", "accel_max", "max", "m/s²", 2),
    spec("split_0_5", "0–5 m", "split_0_5m_time", "min", "s", 2),
    spec("split_10", "0–10 m", "split_10m_time", "min", "s", 2),
    spec("split_20", "0–20 m", "split_20m_time", "min", "s", 2),
    spec("split_30", "0–30 m", "split_30m_time", "min", "s", 2),
    spec("split_40", "0–40 m", "split_40m_time", "min", "s", 2),
    spec("peak_force", "Peak force", "peak_force", "max", "N", 0),
    spec("peak_power", "Peak power", "peak_power", "max", "W", 0),
  ],
  cod: [
    spec("total_time", "Time", "total_time", "min", "s", 2),
    spec("top_speed", "Top speed", "top_speed", "max", "m/s", 2),
    spec("decel_max", "Peak deceleration", "decel_max", "max", "m/s²", 2),
    spec("accel_max", "Peak re-acceleration", "accel_max", "max", "m/s²", 2),
  ],
  speed_other: [
    spec("top_speed", "Top speed", "top_speed", "max", "m/s", 2),
    spec("accel_max", "Max acceleration", "accel_max", "max", "m/s²", 2),
    spec("split_0_5", "0–5 m", "split_0_5m_time", "min", "s", 2),
    spec("split_10", "0–10 m", "split_10m_time", "min", "s", 2),
    spec("peak_force", "Peak force", "peak_force", "max", "N", 0),
    spec("peak_power", "Peak power", "peak_power", "max", "W", 0),
  ],
  cmj: [
    JUMP_HEIGHT,
    spec("mrsi", "mRSI", "fp_mrsi", "max", "", 2),
    spec("peak_prop_force", "Peak propulsive force", "fp_peak_propulsive_force", "max", "N", 0),
    spec("peak_prop_power", "Peak propulsive power", "fp_peak_propulsive_power", "max", "W", 0),
    spec(
      "rel_prop_power",
      "Relative propulsive power",
      "fp_peak_relative_propulsive_power",
      "max",
      "W/kg",
      1
    ),
    spec("prop_impulse", "Propulsive impulse", "fp_propulsive_impulse", "max", "N·s", 1),
    spec("brake_impulse", "Braking impulse", "fp_braking_impulse", "max", "N·s", 1),
    spec("peak_brake_force", "Peak braking force", "fp_peak_braking_force", "max", "N", 0),
  ],
  dj: [
    spec("rsi", "RSI", [{ key: "fp_rsi" }, { key: "fp_rsi_best" }], "max", "", 2),
    JUMP_HEIGHT,
    spec("contact_time", "Contact time", [{ key: "fp_contact_time", tx: secondsToMs }], "min", "ms", 0),
  ],
  force_plate: [
    spec("rsi", "RSI", [{ key: "fp_rsi" }, { key: "fp_peak_rsi" }, { key: "fp_rsi_best" }], "max", "", 2),
    spec("mrsi", "mRSI", [{ key: "fp_mrsi" }, { key: "fp_peak_mrsi" }], "max", "", 2),
    spec(
      "jump_height",
      "Jump height",
      [
        { key: "fp_jump_height", tx: metresToCm },
        { key: "fp_peak_jump_height", tx: metresToCm },
      ],
      "max",
      "cm",
      1
    ),
    spec(
      "contact_time",
      "Contact time",
      [
        { key: "fp_contact_time", tx: secondsToMs },
        { key: "fp_avg_contact_time", tx: secondsToMs },
      ],
      "min",
      "ms",
      0
    ),
    spec("peak_force", "Peak force", "fp_peak_force", "max", "N", 0),
  ],
  isometric: [
    spec("peak_force", "Peak force", "peak_force", "max", "N", 0),
    spec("peak_rfd", "Peak RFD", "peak_rfd", "max", "N/s", 0),
  ],
  hop: [spec("distance", "Distance", "best_cm", "max", "cm", 1)],
};

/** metric key -> [specIndex, sourceIndex] pairs, per family. */
const KEY_LOOKUP: Record<CompareFamily, Map<string, [number, number][]>> = (() => {
  const out = {} as Record<CompareFamily, Map<string, [number, number][]>>;
  for (const fam of COMPARE_FAMILY_ORDER) {
    const m = new Map<string, [number, number][]>();
    SPECS[fam].forEach((s, si) =>
      s.sources.forEach((src, ci) => {
        const list = m.get(src.key) ?? [];
        list.push([si, ci]);
        m.set(src.key, list);
      })
    );
    out[fam] = m;
  }
  return out;
})();

type TestDay = {
  family: CompareFamily;
  key: string;
  title: string;
  /** Raw session labels seen (1080 only; shown when the two days differ). */
  labels: Set<string>;
  /** `${specIdx}|${sourceIdx}|${side}` -> best value of the day */
  acc: Map<string, number>;
};

/** date (YYYY-MM-DD) -> test key -> that test's results on that day */
export type DayIndex = Map<string, Map<string, TestDay>>;

function getTestDay(
  index: DayIndex,
  date: string,
  family: CompareFamily,
  key: string,
  title: string
): TestDay {
  let day = index.get(date);
  if (!day) {
    day = new Map();
    index.set(date, day);
  }
  let td = day.get(key);
  if (!td) {
    td = { family, key, title, labels: new Set(), acc: new Map() };
    day.set(key, td);
  }
  return td;
}

function pushValue(td: TestDay, key: string, value: number | null, side: Side): void {
  if (value == null || !Number.isFinite(value) || value <= 0) return;
  const hits = KEY_LOOKUP[td.family].get(key);
  if (!hits) return;
  const specs = SPECS[td.family];
  for (const [si, ci] of hits) {
    const s = specs[si]!;
    const src = s.sources[ci]!;
    const v = src.tx ? src.tx(value) : value;
    if (!Number.isFinite(v)) continue;
    const k = `${si}|${ci}|${side}`;
    const cur = td.acc.get(k);
    if (cur == null || (s.agg === "max" ? v > cur : v < cur)) td.acc.set(k, v);
  }
}

/** `${specId}|${side}` -> value, using the first source that has data. */
function resolve(td: TestDay | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!td) return out;
  SPECS[td.family].forEach((s, si) => {
    for (let ci = 0; ci < s.sources.length; ci++) {
      let found = false;
      for (const side of SIDES) {
        const v = td.acc.get(`${si}|${ci}|${side}`);
        if (v != null) {
          out.set(`${s.id}|${side}`, v);
          found = true;
        }
      }
      if (found) break;
    }
  });
  return out;
}

// ─── 1080 ────────────────────────────────────────────────────────────────────

const LONG_SPLIT_KEYS = new Set([
  "split_10m_time",
  "split_20m_time",
  "split_30m_time",
  "split_40m_time",
]);

/**
 * classify1080Reps, plus: the 1080 labels a whole session by its first set,
 * so a "5-0-5" session can hold linear sprint reps too. A rep is treated as a
 * linear sprint when it has 10m+ split times, covers 15m+ without hard
 * braking, or sits in a COD-labelled session but covers 8m+ with no braking
 * recorded at all. Real COD reps always record a deceleration.
 */
function repKinds1080(
  label: string,
  rows: ReportMetricRow[]
): Map<string, "sprint" | "cod" | null> {
  const kinds = classify1080Reps(label, rows);
  const stats = new Map<string, { dist: number | null; decel: number | null; long: boolean }>();
  for (const r of rows) {
    const k = String(r.rep_index ?? "x");
    const g = stats.get(k) ?? { dist: null, decel: null, long: false };
    if (r.value != null && Number.isFinite(r.value)) {
      if (r.key === "total_distance") g.dist = Math.max(g.dist ?? 0, r.value);
      else if (r.key === "decel_max") g.decel = Math.max(g.decel ?? 0, r.value);
      else if (LONG_SPLIT_KEYS.has(r.key) && r.value > 0) g.long = true;
    }
    stats.set(k, g);
  }
  for (const [k, g] of stats) {
    const dist = g.dist ?? 0;
    if (
      g.long ||
      (dist >= 15 && (g.decel == null || g.decel < 4)) ||
      (kinds.get(k) === "cod" && g.decel == null && dist >= 8)
    ) {
      kinds.set(k, "sprint");
    }
  }
  return kinds;
}

function add1080Session(
  index: DayIndex,
  date: string,
  s: ReportSessionRow,
  rows: ReportMetricRow[]
): void {
  const label = (s.test_sub_type ?? "").trim().replace(/\s+/g, " ") || "Speed test";
  const kinds = repKinds1080(label, rows);
  for (const r of rows) {
    const kind = kinds.get(String(r.rep_index ?? "x")) ?? null;
    const family: CompareFamily =
      kind === "sprint" ? "sprint" : kind === "cod" ? "cod" : "speed_other";
    const key = family === "speed_other" ? `speed_other:${label.toLowerCase()}` : family;
    const title =
      family === "speed_other" ? label : COMPARE_FAMILY_TITLE[family];
    const td = getTestDay(index, date, family, key, title);
    td.labels.add(label);
    pushValue(td, r.key, r.value, "both");
  }
}

// ─── Hawkins ─────────────────────────────────────────────────────────────────

function hawkinsFamily(testType: string | null): CompareFamily {
  const tt = (testType ?? "").toLowerCase();
  if (tt === "force_plate_cmj") return "cmj";
  if (tt === "force_plate_dj" || tt === "force_plate_dj_single") return "dj";
  if (tt === "force_plate_isometric") return "isometric";
  return "force_plate";
}

/** Tags that add nothing to the test name within a family. */
const REDUNDANT_TAGS: Partial<Record<CompareFamily, RegExp>> = {
  cmj: /^(cmj|counter ?movement jump|bilateral|double leg)$/i,
  dj: /^(dj|drop jump|ftm|bilateral|double leg)$/i,
  isometric: /^(ts isometric test|isometric test|isometric)$/i,
};

const DEFAULT_TEST_TITLE: Record<CompareFamily, string> = {
  ...COMPARE_FAMILY_TITLE,
  isometric: "Untagged isometric test",
  force_plate: "Force plate test",
};

function parseHawkinsName(
  subType: string | null,
  family: CompareFamily
): { tokens: string[]; side: "left" | "right" | null; singleLeg: boolean } {
  // Hawkins joins tags with a bare "-"; a spaced " - " is part of a tag name
  // ("Hip Abduction - Long Lever (0 degree)"), so protect it before splitting.
  const s = (subType ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/:\d+$/, "")
    .replace(/\s+-\s+/g, "\u0001");
  const tokens: string[] = [];
  let sawLeft = false;
  let sawRight = false;
  let singleLeg = false;
  const redundant = REDUNDANT_TAGS[family];
  for (const part of s ? s.split("-") : []) {
    const t = part.replace(/\u0001/g, " - ").trim();
    if (!t || /^\d+$/.test(t)) continue;
    const m = t.match(/^(single[\s-]?leg\s+)?(left|right|l|r)$/i);
    if (m) {
      if (m[2]!.toLowerCase().startsWith("l")) sawLeft = true;
      else sawRight = true;
      if (m[1]) singleLeg = true;
      continue;
    }
    if (/^single[\s-]?leg$/i.test(t)) {
      singleLeg = true;
      continue;
    }
    if (redundant?.test(t)) continue;
    tokens.push(t.charAt(0).toUpperCase() + t.slice(1));
  }
  if (sawLeft && sawRight) {
    // "Left-Right" describes the protocol, not a single side.
    tokens.push("Left", "Right");
    return { tokens, side: null, singleLeg };
  }
  return { tokens, side: sawLeft ? "left" : sawRight ? "right" : null, singleLeg };
}

function rowSide(r: ReportMetricRow): "left" | "right" | null {
  const sd = (r.side ?? "").toLowerCase();
  return sd === "left" || sd === "right" ? sd : null;
}

function addHawkinsSession(
  index: DayIndex,
  date: string,
  s: ReportSessionRow,
  rows: ReportMetricRow[]
): void {
  const family = hawkinsFamily(s.test_type);
  const parsed = parseHawkinsName(s.test_sub_type, family);
  const sessionSide = parsed.side ?? rows.map(rowSide).find((x) => x != null) ?? null;
  const singleLeg =
    parsed.singleLeg ||
    (s.test_type ?? "").toLowerCase() === "force_plate_dj_single" ||
    ((family === "cmj" || family === "dj") && sessionSide != null);
  const parts = [...parsed.tokens];
  if (singleLeg) parts.push("Single leg");
  const key = `${family}:${parts.join("|").toLowerCase()}`;
  const title = parts.join(" · ") || DEFAULT_TEST_TITLE[family];
  const td = getTestDay(index, date, family, key, title);
  for (const r of rows) {
    const side: Side = rowSide(r) ?? parsed.side ?? "both";
    pushValue(td, r.key, r.value, side);
  }
}

// ─── Index ───────────────────────────────────────────────────────────────────

export function buildDayIndex(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  hopTests: ReportHopTestRow[]
): DayIndex {
  const index: DayIndex = new Map();
  for (const s of sessions) {
    const date = s.session_date?.slice(0, 10);
    if (!date) continue;
    const rows = metricsBySession.get(s.id) ?? [];
    if (rows.length === 0) continue;
    const b = bucket(s.source);
    if (b === "1080" || (s.test_type ?? "").toLowerCase() === "1080_sprint") {
      add1080Session(index, date, s, rows);
    } else if (b === "hawkins") {
      addHawkinsSession(index, date, s, rows);
    }
  }
  for (const h of hopTests) {
    const date = h.session_date?.slice(0, 10);
    if (!date || !h.test_type) continue;
    const side = (h.side ?? "").toLowerCase();
    const td = getTestDay(
      index,
      date,
      "hop",
      `hop:${h.test_type}`,
      hopTestDisplayName(h.test_type)
    );
    pushValue(td, "best_cm", h.best_cm, side === "left" || side === "right" ? side : "both");
  }
  // Drop tests (and days) that ended up with no usable values.
  for (const [date, day] of index) {
    for (const [k, td] of day) if (td.acc.size === 0) day.delete(k);
    if (day.size === 0) index.delete(date);
  }
  return index;
}

export function formatTestDay(date: string): string {
  return formatChartAxisDate(`${date}T12:00:00`);
}

export type TestDayOption = { date: string; label: string; summary: string };

/** Every test day, newest first, labelled with what was tested. */
export function listTestDays(index: DayIndex): TestDayOption[] {
  const dates = [...index.keys()].sort((a, b) => b.localeCompare(a));
  return dates.map((date) => {
    const fams = new Set<CompareFamily>();
    for (const td of index.get(date)!.values()) fams.add(td.family);
    const summary = COMPARE_FAMILY_ORDER.filter((f) => fams.has(f))
      .map((f) => FAMILY_SHORT[f])
      .join(", ");
    return { date, summary, label: `${formatTestDay(date)} · ${summary}` };
  });
}

// ─── Comparison ──────────────────────────────────────────────────────────────

export type CompareTone = "better" | "worse" | "same" | "na";

export type DayCompareRow = {
  id: string;
  label: string;
  a: number | null;
  b: number | null;
  va: string;
  vb: string;
  change: string;
  pct: string;
  tone: CompareTone;
};

export type DayCompareTest = {
  key: string;
  title: string;
  /** e.g. which 1080 protocols were used, when they differ between the days */
  note: string | null;
  presence: "both" | "a_only" | "b_only";
  rows: DayCompareRow[];
};

export type DayCompareGroup = {
  family: CompareFamily;
  title: string;
  tests: DayCompareTest[];
};

export type DayComparisonData = {
  /** Always the earlier day. */
  dateA: string;
  /** Always the later day. */
  dateB: string;
  labelA: string;
  labelB: string;
  groups: DayCompareGroup[];
};

function withUnit(text: string, unit: string): string {
  if (!unit) return text;
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}

function fmtValue(v: number, digits: number, unit: string): string {
  return withUnit(v.toFixed(digits), unit);
}

function buildRow(
  id: string,
  label: string,
  a: number | null,
  b: number | null,
  digits: number,
  unit: string,
  higherBetter: boolean,
  changeUnit = unit,
  withPct = true
): DayCompareRow {
  const va = a != null ? fmtValue(a, digits, unit) : "—";
  const vb = b != null ? fmtValue(b, digits, unit) : "—";
  if (a == null || b == null) {
    return { id, label, a, b, va, vb, change: "—", pct: "—", tone: "na" };
  }
  const diff = b - a;
  const shown = Number(diff.toFixed(digits));
  if (shown === 0) {
    return { id, label, a, b, va, vb, change: "0", pct: withPct ? "0%" : "—", tone: "same" };
  }
  const sign = diff > 0 ? "+" : "-";
  const change = withUnit(`${sign}${Math.abs(diff).toFixed(digits)}`, changeUnit);
  let pct = "—";
  if (withPct && a !== 0) {
    const p = (diff / Math.abs(a)) * 100;
    pct = `${p > 0 ? "+" : "-"}${Math.abs(p).toFixed(1)}%`;
  }
  const better = higherBetter ? diff > 0 : diff < 0;
  return { id, label, a, b, va, vb, change, pct, tone: better ? "better" : "worse" };
}

function lsi(l: number | undefined, r: number | undefined): number | null {
  if (l == null || r == null) return null;
  const hi = Math.max(l, r);
  if (hi <= 0) return null;
  return (Math.min(l, r) / hi) * 100;
}

function compareTest(
  tdA: TestDay | undefined,
  tdB: TestDay | undefined,
  labelA: string,
  labelB: string
): DayCompareTest {
  const base = (tdA ?? tdB)!;
  const specs = SPECS[base.family];
  const ra = resolve(tdA);
  const rb = resolve(tdB);
  const rows: DayCompareRow[] = [];
  let lsiSpec: MetricSpec | null = null;

  for (const s of specs) {
    for (const side of SIDES) {
      const a = ra.get(`${s.id}|${side}`) ?? null;
      const b = rb.get(`${s.id}|${side}`) ?? null;
      if (a == null && b == null) continue;
      const label = side === "both" ? s.label : `${s.label} · ${side === "left" ? "L" : "R"}`;
      rows.push(buildRow(`${s.id}|${side}`, label, a, b, s.digits, s.unit, s.higherBetter));
    }
    if (!lsiSpec && s.higherBetter) {
      const pairA = ra.has(`${s.id}|left`) && ra.has(`${s.id}|right`);
      const pairB = rb.has(`${s.id}|left`) && rb.has(`${s.id}|right`);
      if (pairA || pairB) lsiSpec = s;
    }
  }

  if (lsiSpec) {
    const id = lsiSpec.id;
    const a = lsi(ra.get(`${id}|left`), ra.get(`${id}|right`));
    const b = lsi(rb.get(`${id}|left`), rb.get(`${id}|right`));
    rows.push(buildRow(`lsi|${id}`, `LSI · ${lsiSpec.label}`, a, b, 1, "%", true, "pts", false));
  }

  let note: string | null = null;
  if (tdA && tdB && base.family === "cod") {
    const la = [...tdA.labels].sort().join(", ");
    const lb = [...tdB.labels].sort().join(", ");
    if (la.toLowerCase() !== lb.toLowerCase()) {
      note = `Session labels differ (${labelA}: ${la}; ${labelB}: ${lb}), so times may not be like for like.`;
    }
  }

  return {
    key: base.key,
    title: base.title,
    note,
    presence: tdA && tdB ? "both" : tdA ? "a_only" : "b_only",
    rows,
  };
}

export function compareTestDays(
  index: DayIndex,
  date1: string,
  date2: string
): DayComparisonData {
  const [dateA, dateB] = date1 <= date2 ? [date1, date2] : [date2, date1];
  const labelA = formatTestDay(dateA);
  const labelB = formatTestDay(dateB);
  const dayA = index.get(dateA) ?? new Map<string, TestDay>();
  const dayB = index.get(dateB) ?? new Map<string, TestDay>();

  const byFamily = new Map<CompareFamily, DayCompareTest[]>();
  const keys = new Set<string>([...dayA.keys(), ...dayB.keys()]);
  for (const key of keys) {
    const t = compareTest(dayA.get(key), dayB.get(key), labelA, labelB);
    if (t.rows.length === 0) continue;
    const fam = (dayA.get(key) ?? dayB.get(key))!.family;
    const list = byFamily.get(fam) ?? [];
    list.push(t);
    byFamily.set(fam, list);
  }

  const groups: DayCompareGroup[] = [];
  for (const family of COMPARE_FAMILY_ORDER) {
    const tests = byFamily.get(family);
    if (!tests?.length) continue;
    tests.sort((x, y) => {
      const px = x.presence === "both" ? 0 : 1;
      const py = y.presence === "both" ? 0 : 1;
      return px - py || x.title.localeCompare(y.title);
    });
    groups.push({ family, title: COMPARE_FAMILY_TITLE[family], tests });
  }
  return { dateA, dateB, labelA, labelB, groups };
}
