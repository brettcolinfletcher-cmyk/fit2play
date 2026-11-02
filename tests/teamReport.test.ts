import { describe, expect, it } from "vitest";
import {
  bandTone,
  buildTeamReport,
  defaultRound,
  rankValues,
  squadTone,
  worsening,
  type TeamReportInput,
} from "@/lib/teamReport";
import type { NormalizedPerformanceBand } from "@/lib/performanceBands";

const band = (metricKey: string, testType: string | null, label: string, min: number, max: number | null): NormalizedPerformanceBand => ({
  metricKey,
  testType,
  label,
  minValue: min,
  maxValue: max,
  sortOrder: 0,
});

const BANDS: NormalizedPerformanceBand[] = [
  band("top_speed", "linear_sprint_unresisted", "Poor", 0, 6),
  band("top_speed", "linear_sprint_unresisted", "Fair", 6, 7),
  band("top_speed", "linear_sprint_unresisted", "Good", 7, 7.5),
  band("top_speed", "linear_sprint_unresisted", "Elite", 7.5, null),
];

function input(over: Partial<TeamReportInput> = {}): TeamReportInput {
  return {
    teamName: "U13 Girls",
    intervalWeeks: 8,
    athletes: [
      { id: "a", name: "Amy" },
      { id: "b", name: "Bea" },
      { id: "c", name: "Cat" },
    ],
    results: [
      { athlete_id: "a", metric: "max_speed", d: "2026-10-01", v: "27", prev_d: null, prev_v: null },
      { athlete_id: "b", metric: "max_speed", d: "2026-10-01", v: 20, prev_d: null, prev_v: null },
      { athlete_id: "a", metric: "cod", d: "2026-10-01", v: 2.3, prev_d: "2026-07-01", prev_v: 2.0 },
      { athlete_id: "b", metric: "cod", d: "2026-10-01", v: 2.1, prev_d: null, prev_v: null },
      { athlete_id: "a", metric: "jump_height", d: "2026-10-01", v: 28, prev_d: "2026-07-01", prev_v: 30 },
      { athlete_id: "b", metric: "jump_height", d: "2026-05-01", v: 25, prev_d: null, prev_v: null },
    ],
    lsi: new Map([
      ["a", [{ label: "Knee extension", lsi: 84.2, date: "2026-10-01" }]],
      ["b", [{ label: "Single leg hop", lsi: 80, date: "2026-05-01" }]],
    ]),
    testDates: new Map([
      ["a", ["2026-07-01", "2026-10-01"]],
      ["b", ["2026-05-01", "2026-10-01"]],
    ]),
    from: "2026-09-20",
    to: "2026-10-05",
    today: "2026-11-02",
    protocolTests: null,
    colourMode: "bands",
    bands: BANDS,
    ...over,
  };
}

describe("rankValues", () => {
  it("gives ties the same rank and skips the next", () => {
    const r = rankValues(
      [
        { id: "x", value: 10 },
        { id: "y", value: 12 },
        { id: "z", value: 12 },
        { id: "w", value: 9 },
      ],
      false
    );
    expect([r.get("y"), r.get("z"), r.get("x"), r.get("w")]).toEqual([1, 1, 3, 4]);
  });
  it("ranks lowest first when lower is better", () => {
    const r = rankValues([{ id: "x", value: 2.1 }, { id: "y", value: 1.9 }], true);
    expect(r.get("y")).toBe(1);
  });
});

describe("worsening", () => {
  it("is positive when a higher-is-better value falls", () => {
    expect(worsening(27, 30, false)).toBeCloseTo(10);
  });
  it("is positive when a lower-is-better time rises", () => {
    expect(worsening(2.3, 2.0, true)).toBeCloseTo(15);
  });
  it("returns null without a usable previous value", () => {
    expect(worsening(2, 0, false)).toBeNull();
  });
});

describe("tones", () => {
  it("converts km/h to m/s for speed bands", () => {
    expect(bandTone("max_speed", 27, BANDS)).toBe("elite"); // 7.5 m/s
    expect(bandTone("max_speed", 20, BANDS)).toBe("poor"); // 5.6 m/s
  });
  it("is neutral where no band is configured", () => {
    expect(bandTone("cod", 2.0, BANDS)).toBe("neutral");
  });
  it("splits the squad into thirds", () => {
    expect(squadTone(1, 9)).toBe("good");
    expect(squadTone(4, 9)).toBe("fair");
    expect(squadTone(9, 9)).toBe("poor");
    expect(squadTone(1, 2)).toBe("neutral");
  });
});

describe("buildTeamReport", () => {
  const rep = buildTeamReport(input());

  it("only shows tests with data when there is no protocol", () => {
    expect(rep.metrics.map((m) => m.metric)).toEqual(["max_speed", "cod", "jump_height"]);
  });

  it("follows the protocol when one is set", () => {
    const r = buildTeamReport(input({ protocolTests: ["cmj", "adductor_squeeze"] }));
    expect(r.metrics.map((m) => m.metric)).toEqual(["jump_height", "adductor"]);
  });

  it("marks results from before the round as stale", () => {
    const bea = rep.rows.find((r) => r.name === "Bea")!;
    expect(bea.cells.jump_height!.stale).toBe(true);
    expect(bea.cells.max_speed!.stale).toBe(false);
    expect(bea.lastTest).toBe("2026-10-01");
  });

  it("ranks and averages each test", () => {
    const cod = rep.rankings.find((r) => r.metric.metric === "cod")!;
    expect(cod.top.map((t) => t.name)).toEqual(["Bea", "Amy"]);
    expect(cod.average).toBeCloseTo(2.2);
    expect(cod.count).toBe(2);
  });

  it("flags low LSI and drops over 10% in this round only", () => {
    const f = rep.flags.map((x) => `${x.name}:${x.kind}:${x.test}`);
    expect(f).toContain("Amy:lsi:Knee extension");
    expect(f).toContain("Amy:drop:Change of direction");
    // 30 -> 28 cm is 6.7% worse: no flag. Bea's LSI is from an old test.
    expect(f).not.toContain("Amy:drop:Jump height");
    expect(f.some((x) => x.startsWith("Bea:"))).toBe(false);
  });

  it("reports coverage", () => {
    expect(rep.coverage.tested).toEqual(["Amy", "Bea"]);
    expect(rep.coverage.missed).toEqual(["Cat"]);
    expect(rep.coverage.incomplete).toEqual([{ name: "Bea", missing: ["Jump height"] }]);
    const retest = rep.coverage.retest.map((r) => `${r.name}:${r.status}`);
    expect(retest).toContain("Cat:never");
    // Last test 1 Oct, 8-week interval -> due 26 Nov: not listed yet.
    expect(retest.some((x) => x.startsWith("Amy"))).toBe(false);
  });

  it("colours by squad thirds when asked", () => {
    const r = buildTeamReport(input({ colourMode: "squad" }));
    // Only 2 values per test, too few to split into thirds.
    expect(r.rows[0]!.cells.max_speed!.tone).toBe("neutral");
  });
});

describe("defaultRound", () => {
  it("covers the 28 days up to the latest test", () => {
    expect(defaultRound(new Map([["a", ["2026-09-01", "2026-10-01"]]]))).toEqual({
      from: "2026-09-04",
      to: "2026-10-01",
    });
  });
  it("is null with no tests", () => {
    expect(defaultRound(new Map())).toBeNull();
  });
});
