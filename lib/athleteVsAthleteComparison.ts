import type { BestInRangeData, BestRow } from "@/lib/athleteReportData";
import { deltaCellUi } from "@/lib/athleteReportData";

export type AthleteVsAthleteRow = {
  label: string;
  va: string;
  vb: string;
  delta: { text: string; className: string };
};

export type AthleteVsAthleteSection = {
  id: string;
  title: string;
  rows: AthleteVsAthleteRow[];
};

function parseNumericFromBestDisplay(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!t || t === "—") return null;
  const m = t.match(/-?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function higherBetterForMetricLabel(label: string): boolean {
  const m = label.toLowerCase();
  if (m.includes("contact time")) return false;
  if (m.includes("5m split") || (m.includes("split") && m.includes("time"))) return false;
  return true;
}

function mergeMetricRows(aRows: BestRow[], bRows: BestRow[]): AthleteVsAthleteRow[] {
  const bMap = new Map(bRows.map((r) => [r.metric, r]));
  const seen = new Set<string>();
  const out: AthleteVsAthleteRow[] = [];
  for (const ra of aRows) {
    seen.add(ra.metric);
    const rb = bMap.get(ra.metric);
    const va = ra.best;
    const vb = rb?.best ?? "—";
    const na = parseNumericFromBestDisplay(va);
    const nb = parseNumericFromBestDisplay(vb);
    const hb = higherBetterForMetricLabel(ra.metric);
    out.push({ label: ra.metric, va, vb, delta: deltaCellUi(na, nb, hb) });
  }
  for (const rb of bRows) {
    if (seen.has(rb.metric)) continue;
    const va = "—";
    const vb = rb.best;
    const na = parseNumericFromBestDisplay(va);
    const nb = parseNumericFromBestDisplay(vb);
    out.push({ label: rb.metric, va, vb, delta: deltaCellUi(na, nb, higherBetterForMetricLabel(rb.metric)) });
  }
  return out;
}

type HopBest = { test: string; best: string; date: string };

function mergeHopRows(aRows: HopBest[], bRows: HopBest[]): AthleteVsAthleteRow[] {
  const bMap = new Map(bRows.map((r) => [r.test, r]));
  const seen = new Set<string>();
  const out: AthleteVsAthleteRow[] = [];
  for (const ra of aRows) {
    seen.add(ra.test);
    const rb = bMap.get(ra.test);
    const va = ra.best;
    const vb = rb?.best ?? "—";
    const na = parseNumericFromBestDisplay(va);
    const nb = parseNumericFromBestDisplay(vb);
    out.push({
      label: ra.test,
      va,
      vb,
      delta: deltaCellUi(na, nb, true),
    });
  }
  for (const rb of bRows) {
    if (seen.has(rb.test)) continue;
    const va = "—";
    const vb = rb.best;
    const na = parseNumericFromBestDisplay(va);
    const nb = parseNumericFromBestDisplay(vb);
    out.push({
      label: rb.test,
      va,
      vb,
      delta: deltaCellUi(na, nb, true),
    });
  }
  return out;
}

export function buildAthleteVsAthleteSections(
  a: BestInRangeData,
  b: BestInRangeData
): AthleteVsAthleteSection[] {
  const sections: AthleteVsAthleteSection[] = [];

  if (a.linear.length > 0 || b.linear.length > 0) {
    const rows = mergeMetricRows(a.linear, b.linear);
    if (rows.length > 0) {
      sections.push({ id: "linear", title: "LINEAR SPRINT", rows });
    }
  }

  if (a.cmj.length > 0 && b.cmj.length > 0) {
    sections.push({ id: "cmj", title: "FORCE PLATE — CMJ", rows: mergeMetricRows(a.cmj, b.cmj) });
  }

  if (a.dj.length > 0 && b.dj.length > 0) {
    sections.push({
      id: "dj",
      title: "FORCE PLATE — DROP JUMP",
      rows: mergeMetricRows(a.dj, b.dj),
    });
  }

  if (a.hop.length > 0 && b.hop.length > 0) {
    sections.push({ id: "hop", title: "HOP TESTS", rows: mergeHopRows(a.hop, b.hop) });
  }

  return sections;
}
