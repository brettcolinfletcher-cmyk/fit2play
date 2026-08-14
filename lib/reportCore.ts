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
const COMMON_SPRINT_DISTANCES_M = [10, 20, 40];
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
