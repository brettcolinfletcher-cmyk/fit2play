import { describe, expect, it } from "vitest";
import { dailyTotals, ewmaSeries } from "@/lib/ewma";

describe("ewma", () => {
  it("sums sessions on the same day", () => {
    const t = dailyTotals([
      { date: "2026-08-03", value: 100 },
      { date: "2026-08-03T10:00:00Z", value: 50 },
      { date: "2026-08-04", value: 20 },
    ]);
    expect(t.get("2026-08-03")).toBe(150);
    expect(t.get("2026-08-04")).toBe(20);
  });

  it("applies lambda = 2/(N+1) from a zero start, with zero-load rest days", () => {
    const s = ewmaSeries(new Map([["2026-08-01", 800]]), { acuteDays: 7, chronicDays: 28, endDate: "2026-08-03" });
    expect(s.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
    expect(s[0].acute).toBeCloseTo(800 * 0.25);
    expect(s[0].chronic).toBeCloseTo((800 * 2) / 29);
    expect(s[1].load).toBeNull();
    expect(s[1].acute).toBeCloseTo(200 * 0.75);
  });

  it("converges to a steady load and gives ACWR 1 once built", () => {
    const totals = new Map<string, number>();
    const start = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 200; i++) totals.set(new Date(start + i * 86_400_000).toISOString().slice(0, 10), 500);
    const s = ewmaSeries(totals, { acuteDays: 7, chronicDays: 28, endDate: "2026-07-19" });
    const last = s[s.length - 1];
    expect(last.chronic).toBeCloseTo(500, 0);
    expect(last.acwr).toBeCloseTo(1, 2);
    expect(last.diffPct).toBeCloseTo(0, 0);
    expect(s[10].acwr).toBeNull();
    expect(s[10].building).toBe(true);
  });

  it("spike % compares acute on consecutive session days, after the acute warm-up", () => {
    const totals = new Map([
      ["2026-08-03", 2583], ["2026-08-06", 6610], ["2026-08-09", 8087],
      ["2026-08-13", 4081], ["2026-08-15", 10297],
    ]);
    const s = ewmaSeries(totals, { acuteDays: 7, chronicDays: 28, endDate: "2026-08-15" });
    const byDate = new Map(s.map((p) => [p.date, p]));
    expect(byDate.get("2026-08-03")!.spikePct).toBeNull(); // first session
    expect(byDate.get("2026-08-06")!.spikePct).toBeNull(); // acute still building
    expect(byDate.get("2026-08-04")!.spikePct).toBeNull(); // rest day
    expect(byDate.get("2026-08-13")!.spikePct).toBeCloseTo(-32.4, 0);
    expect(byDate.get("2026-08-15")!.spikePct).toBeCloseTo(90.6, 0);
  });

  it("returns nothing without load", () => {
    expect(ewmaSeries(new Map(), { acuteDays: 7, chronicDays: 28, endDate: "2026-01-01" })).toEqual([]);
  });
});
