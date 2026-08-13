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

export function isLinearSprintSession(s: ReportSessionRow): boolean {
  if (!is1080Session(s)) return false;
  const sub = (s.test_sub_type ?? "").toLowerCase();
  return !sub.includes("5-10-5") && !sub.includes("5-0-5") && !sub.includes("shuttle");
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
