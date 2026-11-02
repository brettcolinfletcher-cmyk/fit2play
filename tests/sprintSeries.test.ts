import { describe, expect, it } from "vitest";
import { parseSprintSeriesValue, pickBestDecelRep, pickBestRep, type SprintSample } from "@/lib/sprintSeries";

const s = (t: number, x: number, v = 0, a = 0, f = 0): SprintSample => ({ t, x, v, a, f, p: f * v });

describe("parseSprintSeriesValue", () => {
  it("reads the stored column-array format and derives power when missing", () => {
    const out = parseSprintSeriesValue({ t: [0, 0.1], x: [0, 0.5], v: [0, 5], a: [0, 10], f: [100, 200] });
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ t: 0.1, x: 0.5, v: 5, a: 10, f: 200, p: 1000 });
  });
  it("reads the API row format (position/speed/acceleration/force)", () => {
    const out = parseSprintSeriesValue([{ t: 0.2, position: 1, speed: 4, acceleration: 3, force: 150 }]);
    expect(out[0]).toEqual({ t: 0.2, x: 1, v: 4, a: 3, f: 150, p: 600 });
  });
  it("truncates to the shortest column", () => {
    expect(parseSprintSeriesValue({ t: [0, 1, 2], x: [0, 1], v: [0, 1, 2], a: [0, 1, 2], f: [0, 1, 2] })).toHaveLength(2);
  });
  it("returns [] for empty or unknown input", () => {
    expect(parseSprintSeriesValue(null)).toEqual([]);
    expect(parseSprintSeriesValue([])).toEqual([]);
    expect(parseSprintSeriesValue({ t: [0] })).toEqual([]);
  });
});

describe("pickBestRep / pickBestDecelRep", () => {
  const short = { repIndex: 1, samples: [s(0, 0), s(1, 10)] };
  const long = { repIndex: 2, samples: [s(0, 0), s(1, 20)] };
  const single = { repIndex: 3, samples: [s(0, 0)] };

  it("best rep is the one covering the most distance", () => {
    expect(pickBestRep([short, long, single])?.repIndex).toBe(2);
  });
  it("ignores reps with fewer than two samples", () => {
    expect(pickBestRep([single])).toBeNull();
  });
  it("best decel rep has the most negative acceleration", () => {
    const soft = { repIndex: 1, samples: [s(0, 0, 0, -3)] };
    const hard = { repIndex: 2, samples: [s(0, 0, 0, -6)] };
    expect(pickBestDecelRep([soft, hard])?.repIndex).toBe(2);
  });
});
