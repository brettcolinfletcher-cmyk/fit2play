import type { ReportMetricRow } from "@/lib/athleteReportData";

/**
 * Maps legacy CSV-upload keys to canonical keys (1080 Motion sync / dashboard).
 * Downstream chart and PDF code should only reference canonical keys.
 */
const LEGACY_TO_CANONICAL: Record<string, string> = {
  split5m: "split_5m_time",
  split10m: "split_10m_time",
  split20m: "split_20m_time",
  split30m: "split_30m_time",
  split40m: "split_40m_time",
  peakSpeed: "top_speed",
  peakForce: "peak_force",
  peakPower: "peak_power",
};

export function canonicalMetricKey(key: string): string {
  return LEGACY_TO_CANONICAL[key] ?? key;
}

export function normalizeReportMetricRow<T extends { key: string }>(row: T): T {
  const nk = canonicalMetricKey(row.key);
  if (nk === row.key) return row;
  return { ...row, key: nk };
}

export function normalizeMetricsBySessionMap(
  map: Map<string, ReportMetricRow[]>
): Map<string, ReportMetricRow[]> {
  const out = new Map<string, ReportMetricRow[]>();
  for (const [sessionId, rows] of map) {
    out.set(sessionId, rows.map((r) => normalizeReportMetricRow(r)));
  }
  return out;
}
