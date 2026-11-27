import { describe, expect, it } from "vitest";
import { matchAthlete, normaliseName } from "@/lib/sync/playerdataMatch";
import { metricKey, metricUnit } from "@/lib/sync/playerdataFields";

const people = [
  { id: "a1", first_name: "Adam", last_name: "Radi", date_of_birth: null },
  { id: "s1", first_name: "Scarlett", last_name: "Pike", date_of_birth: "2009-04-02" },
  { id: "s2", first_name: "Scarlett", last_name: "Price", date_of_birth: "2010-01-15" },
  { id: "j1", first_name: "Jo", last_name: "Smith", date_of_birth: "2001-01-01" },
  { id: "j2", first_name: "Jo", last_name: "Smith", date_of_birth: "2003-03-03" },
  { id: "z1", first_name: "Zoë", last_name: "O'Neill", date_of_birth: null },
];

describe("playerdata name matching", () => {
  it("matches full name regardless of case", () => {
    expect(matchAthlete("adam RADI", null, people)).toEqual({ athleteId: "a1", how: "full_name" });
  });
  it("ignores accents and punctuation", () => {
    expect(normaliseName("Zoë O'Neill")).toBe("zoe oneill");
    expect(matchAthlete("Zoe ONeill", null, people)).toMatchObject({ athleteId: "z1" });
  });
  it("uses DOB to split same-name athletes", () => {
    expect(matchAthlete("Jo Smith", "2003-03-03", people)).toEqual({ athleteId: "j2", how: "full_name_dob" });
    expect(matchAthlete("Jo Smith", null, people).athleteId).toBeNull();
  });
  it("accepts surname initial only with matching DOB", () => {
    expect(matchAthlete("Scarlett P", "2009-04-02", people)).toEqual({ athleteId: "s1", how: "initial_dob" });
    expect(matchAthlete("Scarlett P", null, people).athleteId).toBeNull();
    expect(matchAthlete("Scarlett P", "1999-01-01", people).athleteId).toBeNull();
  });
  it("leaves unknown names unmatched", () => {
    expect(matchAthlete("Nobody Here", null, people)).toEqual({ athleteId: null, reason: "No athlete with this name" });
  });
});

describe("playerdata metric keys", () => {
  it("snake cases with gps_ prefix", () => {
    expect(metricKey("totalDistanceM")).toBe("gps_total_distance_m");
    expect(metricKey("maxIMUAcceleration")).toBe("gps_max_imu_acceleration");
    expect(metricKey("clubIMUZoneFiveAccelerationEvents")).toBe("gps_club_imu_zone_five_acceleration_events");
  });
  it("derives units", () => {
    expect(metricUnit("maxSpeedKph")).toBe("km/h");
    expect(metricUnit("highSpeedRunDistanceM")).toBe("m");
    expect(metricUnit("sprintEvents")).toBe("count");
    expect(metricUnit("zoneOneHeartrateDurationS")).toBe("s");
    expect(metricUnit("metresPerMinute")).toBe("m/min");
    expect(metricUnit("workload")).toBeNull();
  });
});
