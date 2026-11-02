import { describe, expect, it } from "vitest";
import { computeRetestDue, latestTestByAthlete, perthToday, type RetestAthlete } from "@/lib/retestDue";

const a = (id: string, intervalWeeks: number | null = null, status = "active", teamName: string | null = "Squad"): RetestAthlete => ({
  id, name: id, status, teamName, intervalWeeks,
});

describe("latestTestByAthlete", () => {
  it("keeps the latest date per athlete and ignores blanks", () => {
    const m = latestTestByAthlete([
      { athlete_id: "x", session_date: "2026-08-01" },
      { athlete_id: "x", session_date: "2026-10-01T00:00:00" },
      { athlete_id: "y", session_date: null },
      { athlete_id: null, session_date: "2026-10-05" },
    ]);
    expect(m.get("x")).toBe("2026-10-01");
    expect(m.has("y")).toBe(false);
  });
});

describe("computeRetestDue", () => {
  const today = "2026-11-02";

  it("uses 12 weeks when the team has no interval", () => {
    const [r] = computeRetestDue([a("x")], new Map([["x", "2026-08-10"]]), today);
    expect(r!.intervalWeeks).toBe(12);
    expect(r!.dueDate).toBe("2026-11-02");
    expect(r!.status).toBe("due_soon"); // due today
    expect(r!.daysOverdue).toBe(0);
  });

  it("uses the team interval", () => {
    const [r] = computeRetestDue([a("x", 4)], new Map([["x", "2026-10-01"]]), today);
    expect(r!.dueDate).toBe("2026-10-29");
    expect(r!.status).toBe("overdue");
    expect(r!.daysOverdue).toBe(4);
  });

  it("is due soon within 7 days, ok after that", () => {
    const rows = computeRetestDue([a("soon", 4), a("later", 4)], new Map([["soon", "2026-10-12"], ["later", "2026-10-20"]]), today);
    expect(rows.find((r) => r.athleteId === "soon")!.status).toBe("due_soon"); // due 9 Nov
    expect(rows.find((r) => r.athleteId === "later")!.status).toBe("ok"); // due 17 Nov
  });

  it("lists never-tested active athletes and skips archived", () => {
    const rows = computeRetestDue([a("new"), a("old", null, "archived")], new Map(), today);
    expect(rows.map((r) => [r.athleteId, r.status])).toEqual([["new", "never"]]);
  });

  it("orders overdue (most overdue first), then due soon, then never tested", () => {
    const rows = computeRetestDue(
      [a("never"), a("soon", 4), a("late", 4), a("later", 4)],
      new Map([["soon", "2026-10-07"], ["late", "2026-09-01"], ["later", "2026-10-01"]]),
      today
    );
    expect(rows.map((r) => r.athleteId)).toEqual(["late", "later", "soon", "never"]);
  });
});

describe("perthToday", () => {
  it("uses Perth time, not UTC", () => {
    expect(perthToday(new Date("2026-11-01T17:30:00Z"))).toBe("2026-11-02"); // 1:30am Perth
    expect(perthToday(new Date("2026-11-01T15:00:00Z"))).toBe("2026-11-01"); // 11pm Perth
  });
});
