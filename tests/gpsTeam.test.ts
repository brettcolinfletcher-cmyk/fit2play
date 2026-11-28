import { describe, expect, it } from "vitest";
import { athleteStatus, sessionLoad, statusFlags, type MetricRow, type TeamSession } from "@/lib/gpsTeam";
import { bandsFromThresholds } from "@/lib/speedBands";

const bands = bandsFromThresholds([7, 14.4, 19.8, 25.2]);
const all = new Set(bands.map((b) => b.id));

function rows(dist: number, top: number, buckets?: [number, number][]): MetricRow[] {
  const r: MetricRow[] = [
    { key: "gps_total_distance_m", value: dist, rep_index: null },
    { key: "gps_max_speed_kph", value: top, rep_index: null },
    { key: "gps_high_speed_run_distance_m", value: dist / 20, rep_index: null },
  ];
  for (const [kph, m] of buckets ?? []) r.push({ key: "gps_dist_at_kph", value: m, rep_index: kph * 10 });
  return r;
}

describe("team GPS", () => {
  it("session load uses selected bands, falls back to total only when all bands are on", () => {
    const withBuckets = rows(1000, 25, [[3, 600], [10, 300], [26, 100]]);
    expect(sessionLoad(withBuckets, "bands", bands, all)).toBe(1000);
    expect(sessionLoad(withBuckets, "bands", bands, new Set(["b5"]))).toBe(100);
    const noBuckets = rows(1000, 25);
    expect(sessionLoad(noBuckets, "bands", bands, all)).toBe(1000);
    expect(sessionLoad(noBuckets, "bands", bands, new Set(["b5"]))).toBeNull();
  });

  it("works out MV exposure and flags staleness", () => {
    const sessions: TeamSession[] = [
      { id: "s1", athleteId: "a", date: "2026-08-01", type: "Match", name: "Match" },
      { id: "s2", athleteId: "a", date: "2026-09-01", type: "Training", name: "Training" },
    ];
    const metrics = new Map([
      ["s1", rows(8000, 29)],
      ["s2", rows(5000, 22)],
    ]);
    const st = athleteStatus({
      athleteId: "a",
      sessions,
      metrics,
      loadKey: "bands",
      bands,
      enabled: all,
      chronicDays: 28,
      rangeStart: "2026-07-01",
      rangeEnd: "2026-09-10",
      setMaxVelocity: 30,
      best1080: null,
    });
    expect(st.sessionsInRange).toBe(2);
    expect(st.distanceInRange).toBe(13000);
    expect(st.lastPctMv).toBeCloseTo(73.3, 1);
    expect(st.lastHit90).toBe("2026-08-01");
    expect(st.daysSince90).toBe(40);
    expect(statusFlags(st).some((f) => f.text.includes("days since 90%"))).toBe(true);
  });
});
