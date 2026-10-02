// Small, dependency-free report helpers shared by both client components and
// server routes (e.g. app/api/athlete-dashboard/[id]/route.ts). Deliberately
// has NO imports from React components or the Supabase client — those pull
// in "use client" modules (recharts, etc.) that are safe in the browser but
// unnecessary/risky to drag into a server route's bundle. lib/athleteReportData.ts
// and lib/reportSections.ts re-export these for backward compatibility.

export type ReportSessionRow = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type: string | null;
  source: string | null;
  /** Phase D: athlete's anatomical leg that started a Left-Right protocol. */
  lr_starting_leg?: "left" | "right" | null;
  /** Phase D-C: when true, swap metrics.side left↔right for this session at read time. */
  lr_side_swap?: boolean;
};

export type ReportMetricRow = {
  session_id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
  /** Present when 1080 stores metrics per lateral rep */
  side?: string | null;
};

export function formatChartAxisDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Australia/Sydney",
    });
  } catch {
    return "—";
  }
}

export function bucket(source: string | null): "hawkins" | "1080" | "csv" {
  const s = (source ?? "").toLowerCase();
  if (s === "hawkins" || s === "hawkins_csv") return "hawkins";
  if (s === "1080" || s === "1080_csv") return "1080";
  return "csv";
}

export function is1080Session(s: ReportSessionRow): boolean {
  return bucket(s.source) === "1080";
}

// Deliberately excludes 5m: a 5-0-5/5-10-5 COD test's own turn-leg is 5m,
// so including it produced a false positive against real data (Adam Radi's
// genuine 5-0-5 session read ~5.2-5.5m per rep — well within a ±5m
// tolerance of "5", which would have wrongly flagged a real COD test as a
// linear sprint). Tolerance tightened to ±3m for the same reason — verified
// this still safely excludes that session while catching the confirmed
// real 40m case exactly.
// 30m added Oct 2026 for the SS WA U13 squad, who ran a 30m sprint on the
// 1080 (labelled "Running (LR)" / "5-0-5 Assisted start" on the device —
// there is no 30m exercise to pick). Sits well clear of the 20m and 40m
// windows, and of the 5m COD leg.
const COMMON_SPRINT_DISTANCES_M = [10, 20, 30, 40];
const SPRINT_DISTANCE_TOLERANCE_M = 3;

/**
 * True when a session's OWN metric rows contain direct evidence of a real
 * linear sprint effort — a total_distance/total_time pair (same rep_index +
 * side) landing near a common sprint test distance (5/10/20/40m). Checked
 * against the data directly rather than trusting test_sub_type, which the
 * 1080 sync derives from only the session's FIRST rep — so a session that
 * actually contains a real sprint can get mislabeled as something else
 * entirely (confirmed real case: a session labelled "5-0-5 Assisted start"
 * that actually contained a clean 40m Running LR effort — see
 * findFortyMBySide in lib/performanceSummary.ts, fixed Aug 2026).
 */
export function hasLinearSprintEvidence(
  sessionId: string,
  metricsBySession: Map<string, ReportMetricRow[]>
): boolean {
  const rows = metricsBySession.get(sessionId) ?? [];
  const groups = new Map<string, { distance: number | null; time: number | null }>();
  for (const r of rows) {
    if ((r.key !== "total_distance" && r.key !== "total_time") || r.value == null || !Number.isFinite(r.value)) {
      continue;
    }
    const groupKey = `${r.rep_index ?? "x"}|${r.side ?? ""}`;
    const g = groups.get(groupKey) ?? { distance: null, time: null };
    if (r.key === "total_distance") g.distance = g.distance == null ? r.value : Math.max(g.distance, r.value);
    if (r.key === "total_time") g.time = g.time == null ? r.value : Math.max(g.time, r.value);
    groups.set(groupKey, g);
  }
  for (const g of groups.values()) {
    if (g.distance == null || g.time == null) continue;
    if (COMMON_SPRINT_DISTANCES_M.some((d) => Math.abs(g.distance! - d) <= SPRINT_DISTANCE_TOLERANCE_M)) return true;
  }
  return false;
}

/**
 * `metricsBySession` is optional for backward compatibility with callers
 * that don't have it in scope — omitting it preserves the old label-only
 * behaviour exactly. Pass it whenever available: it corrects sessions the
 * sync mislabeled (see hasLinearSprintEvidence) instead of silently
 * excluding their real sprint data.
 */
export function isLinearSprintSession(
  s: ReportSessionRow,
  metricsBySession?: Map<string, ReportMetricRow[]>
): boolean {
  if (!is1080Session(s)) return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  const labelSaysCod = sub.includes("5-10-5") || sub.includes("5-0-5") || sub.includes("shuttle");
  if (!labelSaysCod) return true;
  return metricsBySession ? hasLinearSprintEvidence(s.id, metricsBySession) : false;
}

export function metricAggregate(
  map: Map<string, ReportMetricRow[]>,
  sessionId: string,
  key: string,
  mode: "max" | "min"
): number | null {
  const rows = map.get(sessionId)?.filter((r) => r.key === key && r.value != null) ?? [];
  if (rows.length === 0) return null;
  const vals = rows.map((r) => r.value!);
  return mode === "max" ? Math.max(...vals) : Math.min(...vals);
}

/**
 * Groups sessions matching `predicate` by calendar date, takes the LATEST
 * date with any matching session, and aggregates `key` (max/min) across
 * every metric row from EVERY session recorded that date — not just one
 * arbitrarily-picked session.
 *
 * This replaces the "pick one latest session, then read its metrics" pattern
 * (`lib/performanceSummary.ts` used to call this `latestSessionOf` +
 * `metricAggregate`), which breaks when an athlete has more than one session
 * of the same type on the same day: same-day sessions tie on `session_date`,
 * so which one gets picked as "latest" is effectively arbitrary — and
 * whichever one loses isn't just skipped, its (possibly better) values for
 * every metric read off it are silently discarded. Confirmed in production:
 * an athlete's real best CMJ jump height/propulsive impulse/RSI, all from
 * different reps recorded as separate same-day sessions, were being replaced
 * by a single worse rep's numbers across all three metrics.
 *
 * Pass `side` to restrict to metric rows tagged for that side (e.g. the
 * weaker-side "entry time" of a paired L/R test) — rows with a different or
 * missing side are excluded, so an untagged/ambiguous sub-split reading
 * can't get mixed in with genuine per-side readings.
 */
export function latestDayMetricAggregate(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  predicate: (s: ReportSessionRow) => boolean,
  key: string,
  mode: "max" | "min",
  side?: "left" | "right"
): { value: number | null; source: ReportSessionRow | null } {
  const matching = sessions.filter((s) => predicate(s) && s.session_date);
  if (matching.length === 0) return { value: null, source: null };

  let latestDate: string | null = null;
  for (const s of matching) {
    const d = s.session_date!.slice(0, 10);
    if (!latestDate || d > latestDate) latestDate = d;
  }
  if (!latestDate) return { value: null, source: null };

  const onDate = matching.filter((s) => s.session_date!.slice(0, 10) === latestDate);
  let value: number | null = null;
  let source: ReportSessionRow | null = null;
  for (const s of onDate) {
    const rows = metricsBySession.get(s.id) ?? [];
    for (const r of rows) {
      if (r.key !== key || r.value == null || !Number.isFinite(r.value)) continue;
      if (side && (r.side ?? "").toLowerCase() !== side) continue;
      if (value == null || (mode === "max" ? r.value > value : r.value < value)) {
        value = r.value;
        source = s;
      }
    }
  }
  return { value, source: source ?? onDate[0]! };
}

const HHD_SKIP_TOKENS = new Set([
  "left",
  "right",
  "bilateral",
  "supine",
  "prone",
  "seated",
  "standing",
]);

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export type RepKind = "sprint" | "cod";

function repKey(repIndex: number | null): string {
  return String(repIndex ?? "x");
}

/**
 * One 1080 session can hold several sets (e.g. a 30m sprint set plus a 5-0-5
 * set), but the sync labels the WHOLE session with the first set's exercise
 * name only. So classify each REP by its own distance / braking signature
 * instead of trusting the session label for every rep in it.
 *
 * Mirrors `rep_kind` in the athlete_cohort_ranks() SQL function — keep the two
 * in step. Differences: this also treats "5-10-5" labels as COD (the
 * Performance Summary has always done so).
 *
 * Returns rep_index (as a string key, "x" for null) -> kind, or null when the
 * rep is neither (e.g. a 10m acceleration rep, a hop test).
 */
export function classify1080Reps(
  label: string | null | undefined,
  rows: ReportMetricRow[]
): Map<string, RepKind | null> {
  const lbl = (label ?? "").toLowerCase();
  const resisted = lbl.includes("resist");
  const reps = new Map<string, { dist: number | null; decel: number | null; time: number | null }>();
  for (const r of rows) {
    if (r.value == null || !Number.isFinite(r.value)) continue;
    const k = repKey(r.rep_index);
    const g = reps.get(k) ?? { dist: null, decel: null, time: null };
    if (r.key === "total_distance") g.dist = g.dist == null ? r.value : Math.max(g.dist, r.value);
    else if (r.key === "decel_max") g.decel = g.decel == null ? r.value : Math.max(g.decel, r.value);
    else if (r.key === "total_time") g.time = g.time == null ? r.value : Math.max(g.time, r.value);
    reps.set(k, g);
  }
  const out = new Map<string, RepKind | null>();
  for (const [k, g] of reps) {
    let kind: RepKind | null = null;
    if ((g.dist ?? 0) >= 25) {
      // A rep that covers 25m+ is a linear sprint whatever the session is called.
      kind = "sprint";
    } else if (lbl.includes("5-0-5") || lbl.includes("5-10-5")) {
      kind = "cod";
    } else if (
      /(linear|running)/.test(lbl) &&
      !resisted &&
      g.dist != null && g.dist >= 3 && g.dist <= 9 &&
      (g.decel ?? 0) >= 4 &&
      g.time != null && g.time >= 1.2 && g.time <= 4
    ) {
      // Short, hard-braking, ~2s rep inside a session labelled as a sprint:
      // a 5-0-5 effort from a later set.
      kind = "cod";
    } else if (/(linear|running|40)/.test(lbl) && !resisted) {
      kind = "sprint";
    }
    out.set(k, kind);
  }
  return out;
}

/** Rows belonging only to reps of the given kind (see classify1080Reps). */
export function rowsOfRepKind<T extends ReportMetricRow>(
  label: string | null | undefined,
  rows: T[],
  kind: RepKind
): T[] {
  const kinds = classify1080Reps(label, rows);
  return rows.filter((r) => kinds.get(repKey(r.rep_index)) === kind);
}

/**
 * Like latestDayMetricAggregate, but only counts rows from reps of a given
 * kind (see classify1080Reps), and the "latest day" is the latest day that
 * actually HAS such a rep — so a later sprint-only day can't hide an earlier
 * 5-0-5 day. repKind "not_cod" = every rep except 5-0-5 efforts (used for
 * metrics, like the 5m split, that 10m-acceleration sessions also feed).
 * side "untagged" = rows with no left/right tag.
 */
export function latestDayRepAggregate(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  predicate: (s: ReportSessionRow) => boolean,
  key: string,
  mode: "max" | "min",
  repKind: RepKind | "not_cod",
  side?: "left" | "right" | "untagged"
): { value: number | null; source: ReportSessionRow | null } {
  const hits: { date: string; s: ReportSessionRow; v: number }[] = [];
  for (const s of sessions) {
    if (!s.session_date || !predicate(s)) continue;
    const rows = metricsBySession.get(s.id) ?? [];
    const kinds = classify1080Reps(s.test_sub_type, rows);
    for (const r of rows) {
      if (r.key !== key || r.value == null || !Number.isFinite(r.value)) continue;
      const kind = kinds.get(repKey(r.rep_index)) ?? null;
      if (repKind === "not_cod" ? kind === "cod" : kind !== repKind) continue;
      const rs = (r.side ?? "").toLowerCase();
      if (side === "untagged") {
        if (rs !== "") continue;
      } else if (side && rs !== side) {
        continue;
      }
      hits.push({ date: s.session_date.slice(0, 10), s, v: r.value });
    }
  }
  if (hits.length === 0) return { value: null, source: null };
  let latest = hits[0]!.date;
  for (const h of hits) if (h.date > latest) latest = h.date;
  let value: number | null = null;
  let source: ReportSessionRow | null = null;
  for (const h of hits) {
    if (h.date !== latest) continue;
    if (value == null || (mode === "max" ? h.v > value : h.v < value)) {
      value = h.v;
      source = h.s;
    }
  }
  return { value, source };
}

export function normaliseSubType(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw.trim().replace(/\s+/g, " ");
}

export function parseHhdMovement(subType: string | null | undefined): string {
  const normalised = normaliseSubType(subType);
  if (!normalised) return "";

  const remainder = normalised.replace(/^TS\s+Isometric\s+Test-/i, "");
  const parts = remainder.split("-").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const token = part.replace(/:\d+$/, "").trim();
    if (!token) continue;
    if (HHD_SKIP_TOKENS.has(token.toLowerCase())) continue;
    if (/^\d+$/.test(token)) continue;
    return titleCase(token);
  }

  return titleCase(normalised);
}
