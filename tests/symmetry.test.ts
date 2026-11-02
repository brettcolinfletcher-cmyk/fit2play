import { describe, expect, it } from "vitest";
import { isoLsi, isoSideFromGroupKey } from "@/lib/isometricGrouping";
import { lsiColorClass } from "@/lib/sideColors";
import { asymmetryCellClass, asymmetryPctLR } from "@/lib/metricsLrDisplay";

describe("isoLsi (limb symmetry index)", () => {
  it("is weaker / stronger x 100", () => {
    expect(isoLsi(400, 320)).toBe(80);
    expect(isoLsi(250, 250)).toBe(100);
  });
  it("does not depend on which side is stronger", () => {
    expect(isoLsi(320, 400)).toBe(isoLsi(400, 320));
  });
  it("returns 100 when both sides are zero", () => {
    expect(isoLsi(0, 0)).toBe(100);
  });
  it("returns 0 when one side is zero", () => {
    expect(isoLsi(300, 0)).toBe(0);
  });
});

describe("asymmetryPctLR", () => {
  it("is |L - R| / stronger x 100", () => {
    expect(asymmetryPctLR(100, 80)).toBeCloseTo(20);
    expect(asymmetryPctLR(80, 100)).toBeCloseTo(20);
  });
  it("is 100 - LSI for positive values", () => {
    for (const [l, r] of [[410, 352], [2.1, 2.6], [31, 29.5]]) {
      expect(asymmetryPctLR(l, r)).toBeCloseTo(100 - isoLsi(l, r), 6);
    }
  });
  it("uses magnitudes, so negative (deceleration) values work", () => {
    expect(asymmetryPctLR(-5, -4)).toBeCloseTo(20);
  });
  it("returns 0 for zero or non-finite input", () => {
    expect(asymmetryPctLR(0, 0)).toBe(0);
    expect(asymmetryPctLR(Infinity, 1)).toBe(0);
  });
});

describe("colour thresholds", () => {
  it("LSI: green from 90, amber 80 to 89.9, red below 80", () => {
    expect(lsiColorClass(90)).toBe("text-lime-400");
    expect(lsiColorClass(89.9)).toBe("text-amber-400");
    expect(lsiColorClass(80)).toBe("text-amber-400");
    expect(lsiColorClass(79.9)).toBe("text-rose-400");
  });
  it("asymmetry table: amber above 10%, red above 15%", () => {
    expect(asymmetryCellClass(null)).toBe("text-slate-400");
    expect(asymmetryCellClass(10)).toBe("text-slate-300");
    expect(asymmetryCellClass(10.1)).toContain("amber");
    expect(asymmetryCellClass(15)).toContain("amber");
    expect(asymmetryCellClass(15.1)).toContain("red");
  });
  it("KNOWN MISMATCH: LSI 82 is amber in the LSI view but red in the asymmetry table", () => {
    // LSI 82 = 18% asymmetry. Documented so a future fix updates this test on purpose.
    expect(lsiColorClass(82)).toBe("text-amber-400");
    expect(asymmetryCellClass(100 - 82)).toContain("red");
  });
});

describe("isoSideFromGroupKey", () => {
  it("reads the side from the group key", () => {
    expect(isoSideFromGroupKey("Hip Adduction Left")).toBe("left");
    expect(isoSideFromGroupKey("knee extension right")).toBe("right");
    expect(isoSideFromGroupKey("IMTP")).toBeNull();
  });
});
