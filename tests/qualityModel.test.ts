import { describe, expect, it } from "vitest";
import {
  QUALITY_MODEL,
  SCORE_BANDS,
  scoreBand,
  scoreInterim,
  scoreOverall,
  scoreQuality,
  type Quality,
  type QualityContributor,
} from "@/lib/qualityModel";

const higher: QualityContributor = {
  testType: "t", metricKey: "a", label: "A", weight: 1,
  direction: "higher_is_better", interimMin: 5, interimMax: 9, status: "live",
};
const lower: QualityContributor = {
  testType: "t", metricKey: "b", label: "B", weight: 1,
  direction: "lower_is_better", interimMin: 4.0, interimMax: 2.8, status: "live",
};

describe("scoreInterim", () => {
  it("maps interimMin to 0 and interimMax to 100 linearly", () => {
    expect(scoreInterim(higher, 5)).toBe(0);
    expect(scoreInterim(higher, 7)).toBe(50);
    expect(scoreInterim(higher, 9)).toBe(100);
  });
  it("clamps to 0 to 100", () => {
    expect(scoreInterim(higher, 2)).toBe(0);
    expect(scoreInterim(higher, 12)).toBe(100);
  });
  it("handles lower-is-better (faster time scores higher)", () => {
    expect(scoreInterim(lower, 4.0)).toBe(0);
    expect(scoreInterim(lower, 3.4)).toBe(50);
    expect(scoreInterim(lower, 2.8)).toBe(100);
  });
  it("scores on magnitude when flagged, so a negative deceleration is not inverted", () => {
    const decel = { ...higher, magnitude: true };
    expect(scoreInterim(decel, -7)).toBe(scoreInterim(decel, 7));
  });
  it("returns null for missing data", () => {
    expect(scoreInterim(higher, null)).toBeNull();
    expect(scoreInterim(higher, Number.NaN)).toBeNull();
  });
});

describe("scoreQuality", () => {
  const q: Quality = {
    key: "q", label: "Q", athleteLabel: "Q",
    contributors: [{ ...higher, weight: 0.75 }, { ...lower, weight: 0.25 }],
  } as Quality;

  it("blends contributor scores by weight", () => {
    // 50 * 0.75 + 100 * 0.25 = 62.5 -> 63
    expect(scoreQuality(q, { "t:a": 7, "t:b": 2.8 })).toBe(63);
  });
  it("drops missing contributors and renormalises the rest", () => {
    expect(scoreQuality(q, { "t:a": 7 })).toBe(50);
  });
  it("returns null when no contributor has data", () => {
    expect(scoreQuality(q, {})).toBeNull();
  });
});

describe("scoreOverall", () => {
  it("averages the qualities that have a score", () => {
    expect(scoreOverall({ speed: 80, power: 60 })).toBe(70);
  });
  it("returns null when nothing is scored", () => {
    expect(scoreOverall({})).toBeNull();
  });
});

describe("scoreBand", () => {
  it("uses inclusive lower bounds 85 / 70 / 55 / 40", () => {
    expect(scoreBand(85)?.key).toBe("elite");
    expect(scoreBand(84)?.key).toBe("strong");
    expect(scoreBand(70)?.key).toBe("strong");
    expect(scoreBand(55)?.key).toBe("solid");
    expect(scoreBand(40)?.key).toBe("building");
    expect(scoreBand(39)?.key).toBe("developing");
    expect(scoreBand(0)?.key).toBe("developing");
  });
  it("returns null for no score", () => {
    expect(scoreBand(null)).toBeNull();
  });
  it("bands are ordered high to low", () => {
    const mins = SCORE_BANDS.map((b) => b.min);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
  });
});

describe("QUALITY_MODEL configuration", () => {
  const all = QUALITY_MODEL.flatMap((q) => q.contributors.map((c) => ({ q: q.key, c })));

  it("every contributor has a positive weight and a non-zero range", () => {
    for (const { q, c } of all) {
      expect(c.weight, `${q}/${c.metricKey}`).toBeGreaterThan(0);
      expect(c.interimMin, `${q}/${c.metricKey}`).not.toBe(c.interimMax);
    }
  });
  it("range direction matches the declared direction", () => {
    for (const { q, c } of all) {
      const ok =
        c.direction === "higher_is_better" ? c.interimMax > c.interimMin : c.interimMin > c.interimMax;
      expect(ok, `${q}/${c.metricKey} (${c.direction} ${c.interimMin} -> ${c.interimMax})`).toBe(true);
    }
  });
  it("covers the six qualities used by the overall score", () => {
    expect(QUALITY_MODEL.map((q) => q.key).sort()).toEqual(
      ["acceleration", "deceleration", "power", "reactive_strength", "speed", "strength"]
    );
  });
});
