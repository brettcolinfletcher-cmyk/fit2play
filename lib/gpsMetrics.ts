/**
 * GPS (PlayerData) metric catalogue for display: label, unit, category and
 * chart kind for any `gps_*` metric key written by lib/sync/playerdataSync.ts.
 * Rule-based so new PlayerData metrics get a sensible label automatically.
 */

export type GpsKind = "volume" | "intensity";

export type GpsMetricInfo = {
  key: string;
  label: string;
  unit: string;
  category: string;
  /** volume = bars (amounts per session); intensity = lines (peaks, rates, %) */
  kind: GpsKind;
};

/** Headline metrics, in display order. */
export const GPS_CORE_KEYS = [
  "gps_total_distance_m",
  "gps_high_speed_run_distance_m",
  "gps_total_sprint_distance_m",
  "gps_max_speed_kph",
  "gps_metres_per_minute",
  "gps_high_metabolic_load_distance_m",
  "gps_acceleration_events",
  "gps_deceleration_events",
  "gps_workload",
] as const;

/** KPI tiles at the top of the section. */
export const GPS_TILE_KEYS = [
  "gps_total_distance_m",
  "gps_high_speed_run_distance_m",
  "gps_total_sprint_distance_m",
  "gps_max_speed_kph",
  "gps_metres_per_minute",
  "gps_acceleration_events",
] as const;

export const GPS_CATEGORY_ORDER = [
  "Distance and running",
  "Speed",
  "Accelerations and decelerations",
  "Load",
  "Speed zones (club)",
  "Speed zones (individual)",
  "Accel/decel zones (club)",
  "Accel/decel zones (individual)",
  "IMU accel/decel zones",
  "Heart rate",
  "Ball, kicks and jumps",
  "Other",
];

const LABEL_OVERRIDES: Record<string, string> = {
  gps_total_distance_m: "Total distance",
  gps_high_speed_run_distance_m: "High-speed running",
  gps_high_speed_run_events: "High-speed running efforts",
  gps_total_sprint_distance_m: "Sprint distance",
  gps_sprint_distance_m: "Sprint distance (training)",
  gps_sprint_events: "Sprint efforts",
  gps_sprint_count: "Sprint count",
  gps_max_speed_kph: "Top speed",
  gps_raw_max_speed_kph: "Top speed (raw)",
  gps_avg_speed_kph: "Average speed",
  gps_average_speed_kph: "Average speed (training)",
  gps_metres_per_minute: "Metres per minute",
  gps_percentage_max_speed_kph: "Top speed, % of max",
  gps_percentage_raw_max_speed_kph: "Top speed (raw), % of max",
  gps_high_metabolic_load_distance_m: "High metabolic load distance",
  gps_high_metabolic_load_events: "High metabolic load efforts",
  gps_explosive_distance_m: "Explosive distance",
  gps_total_high_intensity_distance_m: "High-intensity distance",
  gps_total_medium_intensity_distance_m: "Medium-intensity distance",
  gps_high_intensity_run_distance_m: "High-intensity running (training)",
  gps_high_intensity_events: "High-intensity efforts",
  gps_acceleration_events: "Accelerations",
  gps_deceleration_events: "Decelerations",
  gps_max_acceleration: "Peak acceleration",
  gps_max_deceleration: "Peak deceleration",
  gps_max_imu_acceleration: "Peak acceleration (IMU)",
  gps_max_imu_deceleration: "Peak deceleration (IMU)",
  gps_acceleration_load: "Acceleration load",
  gps_acceleration_load_per_contributing_minutes: "Acceleration load per minute",
  gps_active_minutes: "Active minutes",
  gps_work: "Work",
  gps_workload: "Workload",
  gps_workload_intensity: "Workload intensity",
  gps_workload_volume: "Workload volume",
  gps_ninety_percent_of_max_speed_distance_m: "Distance above 90% max speed",
  gps_ninety_percent_of_max_speed_duration_s: "Time above 90% max speed",
  gps_ninety_percent_of_max_speed_events: "Efforts above 90% max speed",
  gps_ninety_percent_of_raw_max_speed_distance_m: "Distance above 90% raw max speed",
  gps_ninety_percent_of_raw_max_speed_duration_s: "Time above 90% raw max speed",
  gps_ninety_percent_of_raw_max_speed_events: "Efforts above 90% raw max speed",
  gps_avg_heartrate_bpm: "Average heart rate",
  gps_max_heartrate_bpm: "Peak heart rate",
};

const NUM: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5" };
const BAND: Record<string, string> = {
  high_intensity: "high intensity",
  high_speed_running: "high-speed running",
  jogging: "jogging",
  low_intensity: "low intensity",
  medium_intensity: "medium intensity",
  sprint: "sprint",
};
const MEASURE: Record<string, string> = { distance_m: "distance", duration_s: "time", events: "efforts" };

function zoneLabel(rest: string): string | null {
  // e.g. "five_acceleration_distance_m", "two_plus_deceleration_events", "sprint_duration_s"
  const acc = /^(one|two|three|four|five)(_plus)?_(acceleration|deceleration)_(distance_m|duration_s|events)$/.exec(rest);
  if (acc) {
    return `Zone ${NUM[acc[1]]}${acc[2] ? "+" : ""} ${acc[3] === "acceleration" ? "accel" : "decel"} ${MEASURE[acc[4]]}`;
  }
  const band = /^(high_intensity|high_speed_running|jogging|low_intensity|medium_intensity|sprint)_(distance_m|duration_s|events)$/.exec(rest);
  if (band) return `${cap(BAND[band[1]])} ${MEASURE[band[2]]}`;
  return null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function genericLabel(key: string): string {
  const body = key.replace(/^gps_/, "");
  for (const [prefix, scope] of [
    ["club_imu_zone_", "IMU, club"],
    ["individual_imu_zone_", "IMU, individual"],
    ["club_zone_", "club"],
    ["individual_zone_", "individual"],
  ] as const) {
    if (body.startsWith(prefix)) {
      const z = zoneLabel(body.slice(prefix.length));
      if (z) return `${z} (${scope})`;
    }
  }
  const words = body
    .replace(/_(m|s|kph|bpm|cm|mps)$/, "")
    .replace(/_duration$/, "_time")
    .split("_")
    .map((w) => NUM[w] ?? (w === "imu" ? "IMU" : w));
  return cap(words.join(" ").replace(/\bevents\b/, "efforts"));
}

export function gpsUnit(key: string): string {
  const k = key.replace(/^gps_/, "");
  if (k.startsWith("percentage_")) return "%";
  if (/^max(_imu)?_(acceleration|deceleration)$/.test(k)) return "m/s²";
  if (k === "metres_per_minute") return "m/min";
  if (k.endsWith("_kph")) return "km/h";
  if (k.endsWith("_mps")) return "m/s";
  if (k.endsWith("_bpm")) return "bpm";
  if (k.endsWith("_cm")) return "cm";
  if (k.endsWith("_duration_s") || k.endsWith("_seconds") || k.endsWith("time_to_feet")) return "s";
  if (k.endsWith("_minutes")) return "min";
  if (k.endsWith("_m")) return "m";
  if (k.endsWith("_events") || k.endsWith("_count")) return "";
  return "";
}

function gpsCategory(key: string): string {
  const k = key.replace(/^gps_/, "");
  if (k.includes("imu_zone_")) return "IMU accel/decel zones";
  if (/^(club|individual)_zone_/.test(k)) {
    const scope = k.startsWith("club") ? "club" : "individual";
    return /(acceleration|deceleration)/.test(k) ? `Accel/decel zones (${scope})` : `Speed zones (${scope})`;
  }
  if (/heartrate|bpm/.test(k)) return "Heart rate";
  if (/(pass|kick|dive|touch|jump|impact|possession|on_ball|time_to_feet)/.test(k)) return "Ball, kicks and jumps";
  if (/(acceleration|deceleration)/.test(k)) return "Accelerations and decelerations";
  if (/^(work|workload)/.test(k)) return "Load";
  if (k.startsWith("ninety_percent_")) return "Speed";
  if (/(speed|kph)/.test(k) && !k.endsWith("_distance_m") && !k.endsWith("_events") && !k.endsWith("_duration_s")) return "Speed";
  if (/(distance|metres|sprint|intensity|metabolic|minutes|run)/.test(k)) return "Distance and running";
  return "Other";
}

function gpsKind(key: string): GpsKind {
  const k = key.replace(/^gps_/, "");
  if (/^(max|raw_max|avg|average|percentage)_/.test(k)) return "intensity";
  if (/(per_minute|per_contributing|_intensity$|per_possession|time_to_feet)/.test(k)) return "intensity";
  if (k === "workload" || k === "workload_volume") return "intensity"; // PlayerData's 0-10 style scores
  return "volume";
}

export function gpsMetricInfo(key: string): GpsMetricInfo {
  return {
    key,
    label: LABEL_OVERRIDES[key] ?? genericLabel(key),
    unit: gpsUnit(key),
    category: gpsCategory(key),
    kind: gpsKind(key),
  };
}

/** Session label: staff-typed name, else the source system's name, else the session type. */
export function sessionDisplayName(s: {
  session_name?: string | null;
  external_name?: string | null;
  test_sub_type?: string | null;
}): string {
  const ext = s.external_name?.trim();
  // PlayerData "descriptions" are often long athlete notes, not names: only short ones are used as a name.
  const extName = ext && ext.length <= EXTERNAL_NAME_MAX ? ext : null;
  return s.session_name?.trim() || extName || s.test_sub_type || "Session";
}

export const EXTERNAL_NAME_MAX = 60;

/** Long source descriptions are treated as session notes. */
export function sessionNote(s: { external_name?: string | null }): string | null {
  const ext = s.external_name?.trim();
  return ext && ext.length > EXTERNAL_NAME_MAX ? ext : null;
}
