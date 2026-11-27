/**
 * PlayerData metric-set fields.
 *
 * The sync asks the API (GraphQL introspection) which numeric fields each
 * metric-set type has, so new PlayerData metrics flow through automatically.
 * If introspection is unavailable it falls back to this list, taken from the
 * schema docs (playerdata.github.io/playerdatapy, 27 Nov 2026).
 *
 * Every numeric field is stored as metrics.key = "gps_" + snake_case(field).
 */

const ZONES5 = ["One", "Two", "Three", "Four", "Five"];
const ZONES7 = [...ZONES5, "TwoPlus", "ThreePlus"];
const BANDS = ["HighIntensity", "HighSpeedRunning", "Jogging", "LowIntensity", "MediumIntensity", "Sprint"];

function zoneFields(): string[] {
  const out: string[] = [];
  for (const scope of ["club", "individual"]) {
    for (const z of ZONES5) {
      for (const d of ["Acceleration", "Deceleration"]) {
        out.push(`${scope}IMUZone${z}${d}DurationS`, `${scope}IMUZone${z}${d}Events`);
      }
    }
    for (const z of scope === "club" ? ZONES7 : ZONES5) {
      for (const d of ["Acceleration", "Deceleration"]) {
        out.push(`${scope}Zone${z}${d}DistanceM`, `${scope}Zone${z}${d}DurationS`, `${scope}Zone${z}${d}Events`);
      }
    }
    for (const b of BANDS) {
      out.push(`${scope}Zone${b}DistanceM`, `${scope}Zone${b}DurationS`, `${scope}Zone${b}Events`);
    }
  }
  return out;
}

const COMMON = [
  "accelerationEvents", "accelerationLoad", "accelerationLoadPerContributingMinutes", "activeMinutes",
  "averageJumpHeightCm", "avgHeartrateBpm", "avgPassDistanceM", "avgPassVelocityMps", "avgSpeedKph",
  "avgTimeToFeet", "decelerationEvents", "diveEvents", "explosiveDistanceM", "highDiveEvents",
  "highImpactEvents", "highIntensityEvents", "highJumpEvents", "highKickLoadEvents",
  "highMetabolicLoadDistanceM", "highMetabolicLoadEvents", "highSpeedRunDistanceM", "highSpeedRunEvents",
  "kickEvents", "kickLoad", "lateralAccelerationEvents", "leftAvgTimeToFeet", "leftDiveEvents",
  "leftHighDiveEvents", "leftLowDiveEvents", "linearAccelerationHighEvents", "linearAccelerationLowEvents",
  "linearAccelerationMediumEvents", "linearDecelerationHighEvents", "linearDecelerationLowEvents",
  "linearDecelerationMediumEvents", "longPassEvents", "lowDiveEvents", "lowImpactEvents", "lowJumpEvents",
  "lowKickLoadEvents", "maxAcceleration", "maxDeceleration", "maxHeartrateBpm", "maxIMUAcceleration",
  "maxIMUDeceleration", "maxJumpHeightCm", "maxSpeedKph", "mediumJumpEvents", "mediumKickLoadEvents",
  "mediumPassEvents", "metresPerMinute", "ninetyPercentOfMaxSpeedDistanceM", "ninetyPercentOfMaxSpeedDurationS",
  "ninetyPercentOfMaxSpeedEvents", "ninetyPercentOfRawMaxSpeedDistanceM", "ninetyPercentOfRawMaxSpeedDurationS",
  "ninetyPercentOfRawMaxSpeedEvents", "passEvents", "percentageMaxSpeedKph", "percentageRawMaxSpeedKph",
  "possessionDisplacementM", "rawMaxSpeedKph", "rightAvgTimeToFeet", "rightDiveEvents", "rightHighDiveEvents",
  "rightLowDiveEvents", "shortPassEvents", "sprintEvents", "successfulPassEvents", "timeOnBallSeconds",
  "totalDistanceM", "totalHighIntensityDistanceM", "totalMediumIntensityDistanceM", "totalSprintDistanceM",
  "touchEvents", "touchesPerPossession", "verticalAccelerationEvents", "work", "workload",
  "workloadIntensity", "workloadVolume", "zoneOneHeartrateDurationS", "zoneTwoHeartrateDurationS",
  "zoneThreeHeartrateDurationS", "zoneFourHeartrateDurationS", "zoneFiveHeartrateDurationS",
  ...zoneFields(),
];

export const FALLBACK_FIELDS: Record<MetricSetType, string[]> = {
  MatchSessionAthleteMetricSet: COMMON,
  TrainingSessionAthleteMetricSet: [
    ...COMMON,
    "averageSpeedKph", "highIntensityRunDistanceM", "sprintCount", "sprintDistanceM",
  ],
};

export type MetricSetType = "MatchSessionAthleteMetricSet" | "TrainingSessionAthleteMetricSet";

/** totalDistanceM -> gps_total_distance_m, maxIMUAcceleration -> gps_max_imu_acceleration */
export function metricKey(field: string): string {
  const snake = field
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
  return `gps_${snake}`;
}

/** Unit from the field-name suffix. */
export function metricUnit(field: string): string | null {
  if (/^percentage/.test(field)) return "%";
  if (/^max(IMU)?(Acceleration|Deceleration)$/.test(field)) return "m/s²";
  if (/Kph$/.test(field)) return "km/h";
  if (/Mps$/.test(field)) return "m/s";
  if (/Bpm$/.test(field)) return "bpm";
  if (/Cm$/.test(field)) return "cm";
  if (/(DurationS|Seconds)$/.test(field)) return "s";
  if (/Minutes$/.test(field)) return "min";
  if (/(DistanceM|Displacement?M|DisplacementM)$/.test(field)) return "m";
  if (/PerMinute$/.test(field)) return "m/min";
  if (/(Events|Count)$/.test(field)) return "count";
  return null;
}
