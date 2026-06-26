/**
 * qualityModel.ts
 * ------------------------------------------------------------------
 * Single source of truth for how each performance "quality" ring is
 * composed. A quality is a latent construct measured by several tests,
 * so each ring is a WEIGHTED BLEND of contributing metrics rather than a
 * single number.
 *
 * Pipeline:
 *   raw metric value
 *     -> per-metric 0-100 score (interim band now; sex/stage norms later)
 *     -> quality ring = weighted blend of its contributors
 *     -> overall score = blend of the six qualities
 *
 * Rules:
 *  - Missing contributors (no data yet) drop out; remaining weights
 *    renormalise, so a ring works on day one with whatever exists and
 *    gets richer as tethered/COD tests are added.
 *  - `magnitude: true` scores on abs(value) so a sign convention
 *    (e.g. deceleration stored as negative) cannot invert the ring.
 *  - `status` is documentation only: "live" = data present today for the
 *    demo athlete, "pending" = awaiting that test/sync.
 *
 * WEIGHTS AND INTERIM BANDS BELOW ARE PLACEHOLDERS — tune once the
 * normative dataset (by sex/stage) is in. When norms land, replace
 * scoreInterim() with a percentile lookup; the structure stays identical.
 */

export type ScoreDirection = "higher_is_better" | "lower_is_better";

export type QualityContributor = {
  /** session.test_type this metric is read from */
  testType: string;
  /** canonical metrics.key / athlete_session_summary column */
  metricKey: string;
  /** human-readable label */
  label: string;
  /** relative weight within the quality (renormalised over present contributors) */
  weight: number;
  direction: ScoreDirection;
  /** score on abs(value) — used where sign convention is ambiguous (deceleration) */
  magnitude?: boolean;
  /** interim 0-100 mapping until norms: raw value at 0 and at 100 */
  interimMin: number;
  interimMax: number;
  status: "live" | "pending";
};

export type Quality = {
  key: string;
  /** clinician-facing label */
  label: string;
  /** plain-language label for the athlete view */
  athleteLabel: string;
  contributors: QualityContributor[];
};

export const QUALITY_MODEL: Quality[] = [
  {
    key: "speed",
    label: "Speed",
    athleteLabel: "Sprint speed",
    contributors: [
      {
        testType: "1080_sprint",
        metricKey: "top_speed",
        label: "Top speed",
        weight: 0.7,
        direction: "higher_is_better",
        interimMin: 5,
        interimMax: 9,
        status: "live",
      },
      {
        testType: "1080_sprint",
        metricKey: "split_20m_time",
        label: "20m sprint time",
        weight: 0.2,
        direction: "lower_is_better",
        interimMin: 4.0,
        interimMax: 2.8,
        status: "pending",
      },
      {
        testType: "1080_sprint",
        metricKey: "split_40m_time",
        label: "40m sprint time",
        weight: 0.1,
        direction: "lower_is_better",
        interimMin: 6.5,
        interimMax: 5.0,
        status: "pending",
      },
    ],
  },
  {
    key: "acceleration",
    label: "Acceleration",
    athleteLabel: "Acceleration",
    contributors: [
      {
        testType: "1080_sprint",
        metricKey: "accel_max",
        label: "Max acceleration",
        weight: 0.55,
        direction: "higher_is_better",
        interimMin: 3,
        interimMax: 8,
        status: "live",
      },
      {
        testType: "1080_sprint",
        metricKey: "split_5m_time",
        label: "5m split time",
        weight: 0.25,
        direction: "lower_is_better",
        interimMin: 1.4,
        interimMax: 0.9,
        status: "live",
      },
      {
        testType: "cod_5_10_5",
        metricKey: "reaccel_max",
        label: "Re-acceleration (5-10-5)",
        weight: 0.2,
        direction: "higher_is_better",
        interimMin: 3,
        interimMax: 8,
        status: "pending",
      },
    ],
  },
  {
    key: "deceleration",
    label: "Deceleration",
    athleteLabel: "Deceleration",
    contributors: [
      {
        testType: "cod_5_10_5",
        metricKey: "decel_max",
        label: "Peak deceleration (5-10-5)",
        weight: 0.6,
        direction: "higher_is_better",
        magnitude: true,
        interimMin: 3,
        interimMax: 9,
        status: "pending",
      },
      {
        testType: "force_plate_cmj",
        metricKey: "fp_peak_braking_force",
        label: "Eccentric braking force (CMJ)",
        weight: 0.25,
        direction: "higher_is_better",
        interimMin: 1500,
        interimMax: 4000,
        status: "live",
      },
      {
        testType: "1080_sprint",
        metricKey: "decel_max",
        label: "Sprint deceleration",
        weight: 0.15,
        direction: "higher_is_better",
        magnitude: true,
        interimMin: 3,
        interimMax: 9,
        status: "live",
      },
    ],
  },
  {
    key: "power",
    label: "Power",
    athleteLabel: "Power",
    contributors: [
      {
        testType: "force_plate_cmj",
        metricKey: "fp_jump_height",
        label: "CMJ jump height",
        weight: 0.35,
        direction: "higher_is_better",
        interimMin: 0.15,
        interimMax: 0.45,
        status: "live",
      },
      {
        testType: "force_plate_cmj",
        metricKey: "fp_peak_propulsive_force",
        label: "CMJ peak propulsive force",
        weight: 0.15,
        direction: "higher_is_better",
        interimMin: 1500,
        interimMax: 4000,
        status: "live",
      },
      {
        testType: "1080_sprint",
        metricKey: "peak_power",
        label: "Sprint power output",
        weight: 0.25,
        direction: "higher_is_better",
        interimMin: 800,
        interimMax: 2200,
        status: "live",
      },
      {
        testType: "broad_jump",
        metricKey: "distance",
        label: "Broad jump distance (tethered)",
        weight: 0.15,
        direction: "higher_is_better",
        interimMin: 1.6,
        interimMax: 3.0,
        status: "pending",
      },
      {
        testType: "hop_for_distance",
        metricKey: "distance",
        label: "Hop-for-distance (tethered)",
        weight: 0.1,
        direction: "higher_is_better",
        interimMin: 1.2,
        interimMax: 2.4,
        status: "pending",
      },
    ],
  },
  {
    key: "reactive_strength",
    label: "Reactive strength",
    athleteLabel: "Reactive strength",
    contributors: [
      {
        testType: "force_plate_dj",
        metricKey: "fp_rsi_best",
        label: "Drop-jump RSI",
        weight: 0.55,
        direction: "higher_is_better",
        interimMin: 0.8,
        interimMax: 2.5,
        status: "live",
      },
      {
        testType: "force_plate_dj_single",
        metricKey: "fp_rsi_best",
        label: "Single-leg drop-jump RSI",
        weight: 0.3,
        direction: "higher_is_better",
        interimMin: 0.6,
        interimMax: 2.2,
        status: "live",
      },
      {
        testType: "force_plate_cmj",
        metricKey: "fp_mrsi",
        label: "CMJ mRSI",
        weight: 0.15,
        direction: "higher_is_better",
        interimMin: 0.2,
        interimMax: 0.7,
        status: "live",
      },
    ],
  },
  {
    key: "strength",
    label: "Strength",
    athleteLabel: "Leg strength",
    contributors: [
      {
        testType: "force_plate_isometric",
        metricKey: "peak_force",
        label: "IMTP peak force (L & R)",
        weight: 0.4,
        direction: "higher_is_better",
        interimMin: 150,
        interimMax: 450,
        status: "live",
      },
      {
        testType: "force_plate_isometric",
        metricKey: "net_impulse",
        label: "IMTP net impulse",
        weight: 0.2,
        direction: "higher_is_better",
        interimMin: 100,
        interimMax: 400,
        status: "live",
      },
      {
        testType: "force_plate_isometric",
        metricKey: "peak_rfd",
        label: "IMTP rate of force development",
        weight: 0.15,
        direction: "higher_is_better",
        interimMin: 2000,
        interimMax: 9000,
        status: "live",
      },
      {
        testType: "force_plate_cmj",
        metricKey: "fp_peak_propulsive_force",
        label: "CMJ peak propulsive force",
        weight: 0.15,
        direction: "higher_is_better",
        interimMin: 1500,
        interimMax: 4000,
        status: "live",
      },
      {
        testType: "hop_for_distance",
        metricKey: "peak_force",
        label: "Tethered hop/jump force output",
        weight: 0.1,
        direction: "higher_is_better",
        interimMin: 1000,
        interimMax: 3500,
        status: "pending",
      },
    ],
  },
];

/** Equal-weighted by default; tune per quality once norms exist. */
export const OVERALL_WEIGHTS: Record<string, number> = {
  speed: 1,
  acceleration: 1,
  deceleration: 1,
  power: 1,
  reactive_strength: 1,
  strength: 1,
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Interim per-metric 0-100. Linear between interimMin (0) and interimMax (100),
 * honouring direction and magnitude. Replace with a norm percentile lookup
 * (by sex/stage) when the dataset lands — signature stays the same.
 */
export function scoreInterim(
  contributor: QualityContributor,
  rawValue: number | null
): number | null {
  if (rawValue == null || Number.isNaN(rawValue)) return null;
  const v = contributor.magnitude ? Math.abs(rawValue) : rawValue;
  const { interimMin, interimMax } = contributor;
  // interimMin maps to 0, interimMax to 100, regardless of which is larger
  // (lower_is_better contributors set interimMin > interimMax).
  const pct = (v - interimMin) / (interimMax - interimMin);
  return Math.round(clamp(pct, 0, 1) * 100);
}

/**
 * Blend a quality's contributor scores by weight, dropping contributors with
 * no value and renormalising the remaining weights. Returns null if nothing
 * present for that quality.
 */
export function scoreQuality(
  quality: Quality,
  values: Record<string, number | null>
): number | null {
  let weighted = 0;
  let weightSum = 0;
  for (const c of quality.contributors) {
    const raw = values[`${c.testType}:${c.metricKey}`] ?? null;
    const s = scoreInterim(c, raw);
    if (s == null) continue;
    weighted += s * c.weight;
    weightSum += c.weight;
  }
  if (weightSum === 0) return null;
  return Math.round(weighted / weightSum);
}

/** Overall = weighted mean of present quality scores. */
export function scoreOverall(
  qualityScores: Record<string, number | null>
): number | null {
  let weighted = 0;
  let weightSum = 0;
  for (const [key, w] of Object.entries(OVERALL_WEIGHTS)) {
    const s = qualityScores[key];
    if (s == null) continue;
    weighted += s * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  return Math.round(weighted / weightSum);
}

export type ScoreBand = {
  key: string;
  /** athlete-facing label */
  label: string;
  /** ring / score colour */
  color: string;
  /** inclusive lower bound on the 0-100 scale */
  min: number;
};

/**
 * Five athlete-facing bands, ordered high → low. Single source of truth for
 * both ring colour and the headline label so they can never drift apart.
 * Cutpoints are interim (placeholder, like the interim scores) — retune
 * alongside the norm dataset.
 */
export const SCORE_BANDS: ScoreBand[] = [
  { key: "elite", label: "Elite", color: "#34d399", min: 85 },
  { key: "strong", label: "Strong", color: "#a3e635", min: 70 },
  { key: "solid", label: "Solid", color: "#38bdf8", min: 55 },
  { key: "building", label: "Building", color: "#fbbf24", min: 40 },
  { key: "developing", label: "Developing", color: "#fb923c", min: 0 },
];

/** Resolve a 0-100 score to its band. Returns null only for null/NaN input. Exported for ring panel + overall label. */
export function scoreBand(score: number | null): ScoreBand | null {
  if (score == null || Number.isNaN(score)) return null;
  return (
    SCORE_BANDS.find((b) => score >= b.min) ??
    SCORE_BANDS[SCORE_BANDS.length - 1]
  );
}
