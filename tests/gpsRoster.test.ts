import { describe, expect, it } from "vitest";
import { readXlsx, writeXlsxBytes } from "@/lib/practice/xlsx";
import { changeFor, matchAthlete, parseDate, parseRoster, planRoster, rosterExportRows, type UnitLite } from "@/lib/practice/gpsRoster";

// Same layout as the PlayerData roster: title B1, header row 3, blank row 4, data from row 5.
const GRID = [
  ["", "PlayerData Roster"],
  [],
  ["", "Unit ID", "Last Name", "Name", "DOB", "Sport ", "Gender", "Level ", "Hired to"],
  [],
  ["", "AAAA1111", "Citizen", "Jane", "14/03/2008", "Football", "F", "Junior", ""],
  ["", "bbbb2222", "Small", "", "", "", "", "", "Perth FC"],
  ["", "CCCC3333", "Medium", "", "", "", "", "", ""],
  ["", "", "Nobody", "No Unit", "", "", "", "", ""],
  ["", "AAAA1111", "Dup", "Row", "", "", "", "", ""],
];

describe("xlsx round trip + roster parse", () => {
  it("reads back what it writes and finds the PlayerData header", async () => {
    const bytes = await writeXlsxBytes(GRID, { headerRow: 2, titleRow: 0 });
    const grid = await readXlsx(bytes);
    const p = parseRoster(grid);
    expect(p.headerLine).toBe(3);
    expect(p.rows).toHaveLength(5);
    expect(p.rows[0]).toMatchObject({ line: 5, unitCode: "AAAA1111", lastName: "Citizen", firstName: "Jane", dob: "2008-03-14", gender: "female", level: "junior" });
    expect(p.rows[1]).toMatchObject({ unitCode: "BBBB2222", lastName: "", size: "S", hiredTo: "Perth FC" });
    expect(p.rows[2]).toMatchObject({ unitCode: "CCCC3333", size: "M" });
  });
});

describe("parseDate", () => {
  it("handles AU dates, ISO and Excel serials", () => {
    expect(parseDate("01/02/2005")).toBe("2005-02-01");
    expect(parseDate("2005-02-01")).toBe("2005-02-01");
    expect(parseDate("38384")).toBe("2005-02-01");
    expect(parseDate("31/02/2005")).toBeNull();
  });
});

describe("matchAthlete", () => {
  const ath = [
    { id: "a1", first_name: "Jane", last_name: "Citizen", date_of_birth: "2008-03-14" },
    { id: "a2", first_name: "Jane", last_name: "Citizen", date_of_birth: "2001-01-01" },
    { id: "a3", first_name: "Sam", last_name: "Lee", date_of_birth: null },
    { id: "a4", first_name: "Sam", last_name: "Lee", date_of_birth: null },
  ];
  it("uses DOB to separate same-name athletes", () => {
    expect(matchAthlete({ firstName: "jane", lastName: "CITIZEN", dob: "2008-03-14" }, ath)).toEqual({ kind: "matched", id: "a1" });
    expect(matchAthlete({ firstName: "Jane", lastName: "Citizen", dob: null }, ath).kind).toBe("ambiguous");
    expect(matchAthlete({ firstName: "Jane", lastName: "Citizen", dob: "1999-09-09" }, ath).kind).toBe("none");
    expect(matchAthlete({ firstName: "Sam", lastName: "Lee", dob: null }, ath).kind).toBe("ambiguous");
    expect(matchAthlete({ firstName: "", lastName: "", dob: null }, ath).kind).toBe("empty");
  });
});

describe("planRoster", () => {
  const units: UnitLite[] = [
    { id: "u1", unit_code: "AAAA1111", size: null, status: "hired", current_hire_id: "h-old", current_athlete_id: null, current_holder_name: "Someone Else" },
    { id: "u3", unit_code: "CCCC3333", size: "M", status: "hired", current_hire_id: "h1", current_athlete_id: null, current_holder_name: null },
  ];
  const ctx = {
    units,
    hires: [
      { id: "h1", client_name: "Perth FC", team_id: "t1", status: "active" },
      { id: "h2", client_name: "Juniors", team_id: "t2", status: "active" },
      { id: "h-old", client_name: "Old", team_id: null, status: "ended" },
    ],
    teams: [{ id: "t1", name: "Perth FC" }, { id: "t2", name: "Juniors" }],
    athletes: [{ id: "a1", first_name: "Jane", last_name: "Citizen", date_of_birth: "2008-03-14" }],
    memberships: [{ athlete_id: "a1", team_id: "t2" }],
    defaultHireId: null,
  };
  it("resolves hire from column, athlete team, then the unit's current hire", () => {
    const p = parseRoster(GRID);
    const plan = planRoster(p.rows, ctx);
    expect(plan[0]).toMatchObject({ hireId: "h2", hireSource: "team", athlete: { kind: "matched", id: "a1" } });
    expect(plan[1]).toMatchObject({ hireId: "h1", hireSource: "column", unit: null });
    expect(plan[2]).toMatchObject({ hireId: "h1", hireSource: "current" });
    expect(plan[3].skip).toBe(true);
    expect(plan[4].skip).toBe(true);
  });
  it("describes changes", () => {
    expect(changeFor(null, { hireId: "h1", athleteId: null, holderName: null })).toBe("new");
    expect(changeFor(units[0], { hireId: "h2", athleteId: "a1", holderName: null })).toBe("reassign");
    expect(changeFor(units[1], { hireId: "h1", athleteId: null, holderName: null })).toBe("none");
    expect(changeFor({ ...units[1], current_hire_id: null }, { hireId: "h1", athleteId: null, holderName: null })).toBe("assign");
  });
});

describe("rosterExportRows", () => {
  it("writes the PlayerData layout and puts size in Last Name for spare units", () => {
    const rows = rosterExportRows([
      { unit_code: "B2", size: "S", hire_name: "Perth FC", athlete: null, holder_name: null },
      { unit_code: "A1", size: null, hire_name: "Perth FC", athlete: { first_name: "Jane", last_name: "Citizen", date_of_birth: "2008-03-14", primary_sport: "Football", sex: "female", level: "junior" }, holder_name: null },
    ]);
    expect(rows[2].slice(1, 8)).toEqual(["Unit ID", "Last Name", "Name", "DOB", "Sport", "Gender", "Level"]);
    expect(rows[4]).toEqual([null, "A1", "Citizen", "Jane", "14/03/2008", "Football", "Female", "Junior", "Perth FC"]);
    expect(rows[5].slice(1, 4)).toEqual(["B2", "S", ""]);
  });
});
