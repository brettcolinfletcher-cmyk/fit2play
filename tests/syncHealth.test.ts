import { describe, expect, it } from "vitest";
import { evaluateSyncHealth, hasSyncProblem, type SyncLogRow } from "@/lib/sync/syncHealth";

const run = (source: string, iso: string, errors: string | null = null): SyncLogRow => ({ source, synced_at: iso, errors });
const nightly = (day: string): SyncLogRow[] => [run("hawkins", `${day}T14:00:47Z`), run("1080", `${day}T14:01:09Z`)];
// The alert runs at 23:00 UTC (7am Perth).
const morning = (day: string) => new Date(`${day}T23:00:00Z`);

describe("evaluateSyncHealth", () => {
  it("is ok the morning after a good nightly run", () => {
    const h = evaluateSyncHealth(nightly("2026-11-01"), morning("2026-11-01"));
    expect(h.map((x) => x.status)).toEqual(["ok", "ok"]);
    expect(hasSyncProblem(h)).toBe(false);
  });

  it("flags overdue the first morning after a missed run", () => {
    const h = evaluateSyncHealth(nightly("2026-11-01"), morning("2026-11-02"));
    expect(h.every((x) => x.status === "overdue")).toBe(true);
    expect(h[0]!.message).toContain("32 hours");
  });

  it("would have caught the October gap (last success 7 Oct, nothing until 26 Oct)", () => {
    const h = evaluateSyncHealth(nightly("2026-10-07"), morning("2026-10-08"));
    expect(hasSyncProblem(h)).toBe(true);
  });

  it("flags errors when the latest run failed but a recent run succeeded", () => {
    const rows = [...nightly("2026-11-01"), run("hawkins", "2026-11-01T20:00:00Z", "Hawkins tests 500: ")];
    const h = evaluateSyncHealth(rows, morning("2026-11-01"));
    expect(h.find((x) => x.source === "hawkins")!.status).toBe("errors");
    expect(h.find((x) => x.source === "1080")!.status).toBe("ok");
  });

  it("a run with errors does not count as a success", () => {
    const rows = [run("hawkins", "2026-11-01T14:00:00Z", "athlete X: no local athlete"), run("hawkins", "2026-10-26T01:41:00Z")];
    const h = evaluateSyncHealth(rows, morning("2026-11-01"))[0]!;
    expect(h.status).toBe("overdue");
    expect(h.lastSuccessAt).toBe("2026-10-26T01:41:00Z");
    expect(h.lastRunAt).toBe("2026-11-01T14:00:00Z");
  });

  it("treats a source with no history as overdue", () => {
    const h = evaluateSyncHealth([run("hawkins", "2026-11-01T14:00:00Z")], morning("2026-11-01"));
    expect(h.find((x) => x.source === "1080")!.message).toBe("No successful sync on record.");
  });

  it("ignores row order", () => {
    const rows = [...nightly("2026-10-30"), ...nightly("2026-11-01"), ...nightly("2026-10-31")].reverse();
    expect(hasSyncProblem(evaluateSyncHealth(rows, morning("2026-11-01")))).toBe(false);
  });
});
