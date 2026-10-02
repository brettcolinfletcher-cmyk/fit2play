// Plain-language wording for the PDF's Performance Summary, written for athletes,
// parents and coaches rather than clinicians. Keyed by metric id from
// METRIC_REGISTRY (lib/performanceSummary.ts). A metric with no entry here falls
// back to its registry label and shows no explanation line, so adding a new
// metric to the registry never breaks the PDF.
//
// Edit the wording here; layout lives in components/athletes/AthletePdfDocument.tsx.

export const PDF_CATEGORY_TITLE: Record<string, string> = {
  cmj: "Jumping",
  power: "Power",
  speed: "Speed",
  accel: "Acceleration",
  decel: "Braking",
  cod: "Change of direction",
  strength: "Strength",
};

export const PDF_METRIC_COPY: Record<string, { label: string; hint: string }> = {
  cmj_jump_height: { label: "Jump height", hint: "How high they jump" },
  cmj_conc_peak_force: { label: "Peak push-off force", hint: "Strongest push into the ground during the jump" },
  cmj_propulsive_impulse: { label: "Push-off impulse", hint: "Total push produced while driving upward" },
  power_cmj_peak_power: { label: "Jump power", hint: "Highest power output during the jump" },
  power_cmj_rsi_mod: { label: "Jump efficiency (RSI-mod)", hint: "Jump height compared with the time taken to jump" },
  power_1080_peak_power: { label: "Sprint power", hint: "Highest power output while sprinting" },
  speed_40m: { label: "40 m sprint", hint: "Time to run 40 m (left and right starts)" },
  speed_30m: { label: "30 m sprint", hint: "Time to run 30 m (left and right starts)" },
  accel_5m: { label: "5 m sprint time", hint: "Time to cover 5 metres" },
  accel_10m: { label: "10 m sprint time", hint: "Time to cover 10 metres" },
  accel_505_max_accel: { label: "Peak acceleration", hint: "How quickly they can speed up (5-0-5 test)" },
  decel_cmj_rfd: { label: "Jump braking rate", hint: "How quickly they can slow their body down in the jump" },
  decel_505_max_decel: { label: "Peak braking", hint: "How hard they can slow down (5-0-5 test)" },
  cod_505_total_time: { label: "Change of direction (5-0-5)", hint: "Time to sprint, turn around and sprint back" },
  strength_hip_abduction: { label: "Hip abduction strength", hint: "Strength moving the leg outwards" },
  strength_hip_adduction: { label: "Hip adduction strength", hint: "Strength moving the leg inwards" },
  strength_knee_extension: { label: "Knee extension strength", hint: "Strength straightening the knee" },
  strength_knee_flexion: { label: "Knee flexion strength", hint: "Strength bending the knee" },
  strength_groin_squeeze: { label: "Groin squeeze strength", hint: "Strongest squeeze between the legs" },
};

/** "≥ 42 cm" -> "Target 42 cm or more"; "≤ 2.5 s (weaker side)" -> "Target 2.5 s or less". */
export function plainTarget(targetLabel: string): string {
  const t = targetLabel.replace(/\s*\(weaker side\)\s*$/i, "").trim();
  if (t.startsWith("\u2265")) return `Target ${t.slice(1).trim()} or more`;
  if (t.startsWith("\u2264")) return `Target ${t.slice(1).trim()} or less`;
  return `Target ${t}`;
}

/** "L 6.71 \u00b7 R 6.67 s" -> "Left 6.71 \u00b7 Right 6.67 s". Other values pass through. */
export function plainValue(displayValue: string): string {
  return displayValue.replace(/^L\s/, "Left ").replace(/\s\u00b7\sR\s/, " \u00b7 Right ");
}
