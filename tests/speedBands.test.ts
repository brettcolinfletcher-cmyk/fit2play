import { describe, expect, it } from "vitest";
import { bandsFromThresholds, sessionBandDistances } from "@/lib/speedBands";

describe("speed bands", () => {
  const bands = bandsFromThresholds([7, 14.4, 19.8, 25.2]);
  it("builds contiguous bands from thresholds", () => {
    expect(bands.map((b) => [b.from, b.to])).toEqual([[0, 7], [7, 14.4], [14.4, 19.8], [19.8, 25.2], [25.2, null]]);
  });
  it("sums bucket distance into bands by bucket start (tenths of km/h)", () => {
    const rows = [
      { key: "gps_dist_at_kph", value: 100, rep_index: 30 }, // 3 km/h
      { key: "gps_dist_at_kph", value: 50, rep_index: 70 }, // 7 km/h -> band 2
      { key: "gps_dist_at_kph", value: 20, rep_index: 140 }, // 14 -> band 2
      { key: "gps_dist_at_kph", value: 10, rep_index: 150 }, // 15 -> band 3
      { key: "gps_dist_at_kph", value: 5, rep_index: 300 }, // 30 -> band 5
      { key: "gps_total_distance_m", value: 999, rep_index: null },
    ];
    expect(sessionBandDistances(rows, bands)).toEqual([100, 70, 10, 0, 5]);
  });
  it("returns null without buckets", () => {
    expect(sessionBandDistances([{ key: "gps_total_distance_m", value: 1, rep_index: null }], bands)).toBeNull();
  });
});
