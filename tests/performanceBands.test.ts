import { describe, expect, it } from "vitest";
import {
  matchPerformanceBand,
  normalizePerformanceBandRow,
  resolveBandForMetric,
  type NormalizedPerformanceBand,
} from "@/lib/performanceBands";

// Shaped like real performance_bands rows (no sort_order column exists).
const rows = [
  ["fp_jump_height_cm_best", null, "Poor", 0, 20],
  ["fp_jump_height_cm_best", null, "Fair", 20, 28],
  ["fp_jump_height_cm_best", null, "Good", 28, 35],
  ["fp_jump_height_cm_best", null, "Elite", 35, 999],
  ["fp_jump_height_cm_best", "force_plate_cmj", "Poor", 0, 24],
  ["fp_jump_height_cm_best", "force_plate_cmj", "Fair", 24, 32],
  ["fp_jump_height_cm_best", "force_plate_cmj", "Good", 32, 40],
  ["fp_jump_height_cm_best", "force_plate_cmj", "Elite", 40, 999],
  ["isometric_peak_force", "force_plate_imtp", "Poor", 0, 2000],
  ["isometric_peak_force", "force_plate_imtp", "Fair", 2000, 2800],
  ["isometric_peak_force", "force_plate_imtp", "Good", 2800, 3500],
  ["isometric_peak_force", "force_plate_imtp", "Elite", 3500, 999],
] as const;

const bands: NormalizedPerformanceBand[] = rows
  .map(([metric_key, test_type, band_label, min_value, max_value]) =>
    normalizePerformanceBandRow({ metric_key, test_type, band_label, min_value, max_value })
  )
  .filter((b): b is NormalizedPerformanceBand => b !== null);

const label = (key: string, v: number, tt?: string) =>
  matchPerformanceBand(key, v, bands, tt)?.label ?? null;

describe("normalizePerformanceBandRow", () => {
  it("reads numeric strings (PostgREST returns numeric as text)", () => {
    const b = normalizePerformanceBandRow({ metric_key: "x", band_label: "Good", min_value: "2.5", max_value: "3.0" });
    expect(b?.minValue).toBe(2.5);
    expect(b?.maxValue).toBe(3);
  });
  it("rejects rows without a metric or label", () => {
    expect(normalizePerformanceBandRow({ band_label: "Good" })).toBeNull();
    expect(normalizePerformanceBandRow({ metric_key: "x" })).toBeNull();
  });
});

describe("matchPerformanceBand", () => {
  it("uses test-type-specific bands when they exist", () => {
    expect(label("fp_jump_height_cm_best", 30, "force_plate_cmj")).toBe("Fair");
  });
  it("falls back to generic bands for other test types", () => {
    expect(label("fp_jump_height_cm_best", 30, "force_plate_sj")).toBe("Good");
    expect(label("fp_jump_height_cm_best", 30)).toBe("Good");
  });
  it("places values inside each range", () => {
    expect(label("fp_jump_height_cm_best", 10, "force_plate_cmj")).toBe("Poor");
    expect(label("fp_jump_height_cm_best", 36, "force_plate_cmj")).toBe("Good");
    expect(label("fp_jump_height_cm_best", 45, "force_plate_cmj")).toBe("Elite");
  });
  it("IMTP above 3500 N is Elite (top band stored as 3500..999, so this relies on the fallback)", () => {
    expect(label("isometric_peak_force", 3800, "force_plate_imtp")).toBe("Elite");
  });
  it("returns null for an unknown metric", () => {
    expect(label("not_a_metric", 5)).toBeNull();
  });
});

describe("resolveBandForMetric", () => {
  it("returns null for missing values", () => {
    expect(resolveBandForMetric("fp_jump_height_cm_best", null, bands)).toBeNull();
  });
  it("uses the default top speed bands when the database has none", () => {
    expect(resolveBandForMetric("topSpeed", 7.6, [])?.label).toBe("Elite");
    expect(resolveBandForMetric("topSpeed", 7.2, [])?.label).toBe("Good");
    expect(resolveBandForMetric("topSpeed", 6.5, [])?.label).toBe("Fair");
    expect(resolveBandForMetric("topSpeed", 5.5, [])?.label).toBe("Poor");
  });
});
