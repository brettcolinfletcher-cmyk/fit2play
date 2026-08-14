// Shared helpers for 1080 Motion per-sample sprint time-series data
// (the `sprint_time_series` table). Used by both the session detail page's
// SprintTimeSeriesGraphs component and the athlete report page's
// SprintPerformanceCharts — extracted here so the parsing / step-detection
// / force-velocity math lives in one place instead of drifting apart.

export type SprintSample = {
  t: number;
  x: number;
  v: number;
  a: number;
  f: number;
  p: number;
};

export type SprintRep = {
  repIndex: number | null;
  samples: SprintSample[];
};

/**
 * `sprint_time_series.series` comes back from Supabase in one of two shapes
 * depending on when it was synced: an array of per-sample objects (current
 * 1080 sync format) or an object of parallel arrays (older format). Handles
 * both, same as the conversion previously inlined in the session detail page.
 */
export function parseSprintSeriesValue(raw: unknown): SprintSample[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const samples: SprintSample[] = [];
    for (const s of raw as Record<string, number>[]) {
      samples.push({
        t: s.t ?? 0,
        x: s.position ?? s.x ?? 0,
        v: s.speed ?? s.v ?? 0,
        a: s.acceleration ?? s.a ?? 0,
        f: s.force ?? s.f ?? 0,
        p: s.p ?? (s.force ?? 0) * (s.speed ?? 0),
      });
    }
    return samples;
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as { t?: number[]; x?: number[]; v?: number[]; a?: number[]; f?: number[]; p?: number[] };
    const { t, x, v, a, f, p } = obj;
    if (!t || !x || !v || !a || !f) return [];
    const len = Math.min(t.length, x.length, v.length, a.length, f.length, p?.length ?? Infinity);
    const samples: SprintSample[] = [];
    for (let i = 0; i < len; i++) {
      samples.push({
        t: t[i] ?? 0,
        x: x[i] ?? 0,
        v: v[i] ?? 0,
        a: a[i] ?? 0,
        f: f[i] ?? 0,
        p: p ? p[i] ?? 0 : (f[i] ?? 0) * (v[i] ?? 0),
      });
    }
    return samples;
  }

  return [];
}

/**
 * Picks the rep with the greatest net displacement — the "real" maximal
 * sprint effort in a session that also contains short calibration blips,
 * walk-back/recovery segments, and shorter build-up reps (all observed in
 * real synced data). `x` is a raw absolute position coordinate (can be
 * negative, doesn't start at 0), so distance must be the displacement from
 * first to last sample, not the max x value.
 */
export function pickBestRep(reps: SprintRep[]): SprintRep | null {
  let best: SprintRep | null = null;
  let bestDist = -Infinity;
  for (const rep of reps) {
    if (rep.samples.length < 2) continue;
    const first = rep.samples[0];
    const last = rep.samples[rep.samples.length - 1];
    const dist = Math.abs(last.x - first.x);
    if (dist > bestDist) {
      bestDist = dist;
      best = rep;
    }
  }
  return best;
}

/**
 * Picks the rep with the strongest braking effort (most negative
 * instantaneous acceleration) — separate from pickBestRep, since the
 * longest/fastest sprint rep doesn't necessarily contain a deceleration
 * phase (real synced data includes short accel-decel drills as distinct
 * reps from the maximal-effort sprint reps).
 */
export function pickBestDecelRep(reps: SprintRep[]): SprintRep | null {
  let best: SprintRep | null = null;
  let bestDecel = Infinity;
  for (const rep of reps) {
    if (!rep.samples.length) continue;
    const minA = Math.min(...rep.samples.map((s) => s.a));
    if (Number.isFinite(minA) && minA < bestDecel) {
      bestDecel = minA;
      best = rep;
    }
  }
  return best;
}

/**
 * `x` is a raw absolute position coordinate — can run in either direction
 * and doesn't start at 0. Returns a copy of the samples with position
 * rebased to start at 0 and increase in the direction of travel, so charts
 * and step-length calculations read as a normal "distance covered" axis.
 */
export function normalizeDisplacement(samples: SprintSample[]): SprintSample[] {
  if (samples.length < 2) return samples;
  const x0 = samples[0].x;
  const direction = samples[samples.length - 1].x >= x0 ? 1 : -1;
  return samples.map((s) => ({ ...s, x: (s.x - x0) * direction }));
}

/** Detects step-contact peaks from the force curve — same peak-picking approach used on the session detail page's L/R split. */
export function detectStepIndices(f: number[]): number[] {
  const n = f.length;
  if (!n) return [];

  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const fi = f[i];
    if (fi > f[i - 1] && fi >= f[i + 1]) peaks.push(i);
  }
  if (!peaks.length) return [];

  const maxPeak = Math.max(...peaks.map((i) => f[i]));
  if (!Number.isFinite(maxPeak) || maxPeak <= 0) return [];

  const threshold = 0.3 * maxPeak;
  return peaks.filter((i) => f[i] >= threshold).sort((a, b) => a - b);
}

export type SideSymmetry = {
  leftPeakForce: number | null;
  rightPeakForce: number | null;
  /** Estimated from step-detection on the force curve, NOT a direct 1080 measurement — distance/time between consecutive same-side steps. */
  leftStepLength: number | null;
  rightStepLength: number | null;
  leftFrequency: number | null;
  rightFrequency: number | null;
  leftSteps: number;
  rightSteps: number;
};

/**
 * Estimates left/right step metrics from step-contact detection on the
 * force curve, alternating legs starting with `leadLeg`. This is a rough
 * estimate (there's no ground-truth left/right tag in the raw 1080 stream),
 * not a direct device measurement — surfaced to the UI as "estimated".
 */
export function estimateSideSymmetry(samples: SprintSample[], leadLeg: "left" | "right" = "left"): SideSymmetry {
  const fArr = samples.map((s) => s.f);
  const stepIdx = detectStepIndices(fArr);

  if (stepIdx.length < 2) {
    return {
      leftPeakForce: null,
      rightPeakForce: null,
      leftStepLength: null,
      rightStepLength: null,
      leftFrequency: null,
      rightFrequency: null,
      leftSteps: 0,
      rightSteps: 0,
    };
  }

  const legPerStep: ("left" | "right")[] = [];
  let current = leadLeg;
  for (let i = 0; i < stepIdx.length; i++) {
    legPerStep.push(current);
    current = current === "left" ? "right" : "left";
  }

  const leftForces: number[] = [];
  const rightForces: number[] = [];
  const leftStepLens: number[] = [];
  const rightStepLens: number[] = [];
  const leftStepTimes: number[] = [];
  const rightStepTimes: number[] = [];

  for (let i = 0; i < stepIdx.length; i++) {
    const idx = stepIdx[i];
    const leg = legPerStep[i];
    const force = samples[idx]?.f ?? null;
    if (force != null) (leg === "left" ? leftForces : rightForces).push(force);

    if (i > 0) {
      const prevIdx = stepIdx[i - 1];
      const dist = samples[idx].x - samples[prevIdx].x;
      const time = samples[idx].t - samples[prevIdx].t;
      if (Number.isFinite(dist) && dist > 0) (leg === "left" ? leftStepLens : rightStepLens).push(dist);
      if (Number.isFinite(time) && time > 0) (leg === "left" ? leftStepTimes : rightStepTimes).push(time);
    }
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const avgFreq = (times: number[]) => {
    const t = avg(times);
    return t != null && t > 0 ? 1 / t : null;
  };

  return {
    leftPeakForce: avg(leftForces),
    rightPeakForce: avg(rightForces),
    leftStepLength: avg(leftStepLens),
    rightStepLength: avg(rightStepLens),
    leftFrequency: avgFreq(leftStepTimes),
    rightFrequency: avgFreq(rightStepTimes),
    leftSteps: leftForces.length,
    rightSteps: rightForces.length,
  };
}

export type ForceVelocityProfile = {
  /** N/kg */
  f0: number;
  /** m/s */
  v0: number;
  /** W/kg */
  pmax: number;
  /** R² of the F–v linear regression over the acceleration phase — a rough fit-quality indicator. */
  rSquared: number;
  /** True when no athlete height was available and a population-average default was used for the (small) air-resistance correction term. */
  usedDefaultHeight: boolean;
};

const AIR_DENSITY = 1.2; // kg/m^3
const DRAG_COEFFICIENT = 0.9; // dimensionless, standard sprint-running assumption (Samozino et al. 2016)
const DEFAULT_HEIGHT_M = 1.75;

/**
 * A fit below this R² isn't trustworthy enough to show as a number. Verified
 * against Adam Radi's real synced 40m rep (confirmed clean single effort —
 * total_distance/total_time both matched to that rep, 200Hz, 6.606s, 40.0m):
 * a centred moving average tops out around R²=0.54 no matter the window
 * size, but a proper zero-phase Butterworth low-pass (see filtfiltLowpass)
 * with a cutoff below sprint stride frequency recovers R²>0.9 with
 * physically sane F0/V0/Pmax. So a low R² here means the specific rep's
 * signal doesn't support a clean fit (e.g. it mixes multiple efforts) —
 * not that the filtering gave up too early.
 */
export const MIN_FV_R_SQUARED = 0.85;

/** Cutoff for the Force-Velocity profile's velocity smoothing — well below sprint stride frequency (~3-4 Hz) so step-to-step force oscillation is removed but the accel/decel trend survives. */
const FV_LOWPASS_CUTOFF_HZ = 1.0;

/** Centred moving average — used for chart-line display smoothing (Acceleration/Deceleration lines). */
export function movingAverage(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

/** Median sample interval → Hz. Data comes in at ~200Hz but this is derived rather than assumed, in case a device/firmware ever differs. */
function estimateSampleRateHz(samples: SprintSample[]): number {
  if (samples.length < 3) return 0;
  const dts: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt > 0) dts.push(dt);
  }
  if (!dts.length) return 0;
  dts.sort((a, b) => a - b);
  const medianDt = dts[Math.floor(dts.length / 2)];
  return medianDt > 0 ? 1 / medianDt : 0;
}

type BiquadCoeffs = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** RBJ-cookbook low-pass biquad, Q=1/√2 (maximally flat / Butterworth response). */
function biquadLowpassCoeffs(cutoffHz: number, sampleRateHz: number): BiquadCoeffs {
  const Q = Math.SQRT1_2;
  const w0 = (2 * Math.PI * cutoffHz) / sampleRateHz;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosw0) / 2 / a0,
    b1: (1 - cosw0) / a0,
    b2: (1 - cosw0) / 2 / a0,
    a1: (-2 * cosw0) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(values: number[], c: BiquadCoeffs): number[] {
  const out = new Array(values.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < values.length; i++) {
    const xi = values[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = yi;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
  }
  return out;
}

/**
 * Zero-phase 2nd-order Butterworth low-pass ("filtfilt" — forward pass then
 * a reversed backward pass, cancelling phase lag) used to denoise velocity
 * before differentiating for acceleration in the Force-Velocity regression.
 * Chosen over a plain moving average after verifying against real synced
 * data — see MIN_FV_R_SQUARED for the comparison.
 */
export function filtfiltLowpass(values: number[], cutoffHz: number, sampleRateHz: number): number[] {
  if (values.length < 4 || !(sampleRateHz > 0) || !(cutoffHz > 0) || cutoffHz >= sampleRateHz / 2) {
    return values.slice();
  }
  const coeffs = biquadLowpassCoeffs(cutoffHz, sampleRateHz);
  const forward = applyBiquad(values, coeffs);
  const backward = applyBiquad(forward.slice().reverse(), coeffs);
  return backward.reverse();
}

/**
 * Simplified sprint force-velocity-power profile (Samozino et al. 2016
 * method). The device's raw per-sample acceleration channel is too noisy
 * for a direct regression (verified against real data — see
 * MIN_FV_R_SQUARED), so acceleration is instead derived by differentiating
 * a smoothed velocity signal. Horizontal force at each sample is net
 * driving force (mass × acceleration) plus an aerodynamic drag correction,
 * then F is linearly regressed against v over the acceleration phase
 * (start to top speed): the v-intercept and slope give F0/V0, and
 * Pmax = F0·V0/4. Returns null (rather than a low-confidence guess) when
 * the fit quality is below MIN_FV_R_SQUARED — callers should show "not
 * available" rather than a number in that case.
 *
 * Requires athlete body mass — returns null without it (mass isn't
 * something we're willing to guess for a metric presented as measured).
 * Height only affects the small air-resistance term, so a population
 * average is an acceptable fallback there (flagged via usedDefaultHeight).
 */
export function computeForceVelocityProfile(
  samples: SprintSample[],
  massKg: number | null,
  heightCm: number | null
): ForceVelocityProfile | null {
  if (massKg == null || !Number.isFinite(massKg) || massKg <= 0) return null;
  if (samples.length < 100) return null;

  const sampleRateHz = estimateSampleRateHz(samples);
  if (!(sampleRateHz > 0)) return null;

  const usedDefaultHeight = heightCm == null || !Number.isFinite(heightCm) || heightCm <= 0;
  const heightM = usedDefaultHeight ? DEFAULT_HEIGHT_M : heightCm! / 100;

  // Frontal area (Dubois-derived, per Arsac & Locatelli 2002 / Samozino et al. 2016).
  const frontalArea = 0.2025 * Math.pow(heightM, 0.725) * Math.pow(massKg, 0.425) * 0.266;

  const vSmooth = filtfiltLowpass(samples.map((s) => s.v), FV_LOWPASS_CUTOFF_HZ, sampleRateHz);

  // Acceleration phase: start of the rep through top (smoothed) speed.
  let topSpeedIdx = 0;
  for (let i = 1; i < vSmooth.length; i++) {
    if (vSmooth[i] > vSmooth[topSpeedIdx]) topSpeedIdx = i;
  }
  const topSpeedTimeSec = samples[topSpeedIdx].t - samples[0].t;
  if (topSpeedTimeSec < 0.3) return null; // too short to be a real acceleration phase

  const points: { v: number; force: number }[] = [];
  for (let i = 0; i <= topSpeedIdx; i++) {
    const v = vSmooth[i];
    if (v < 0) continue;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(samples.length - 1, i + 1);
    const dt = samples[i1].t - samples[i0].t;
    const a = dt > 0 ? (vSmooth[i1] - vSmooth[i0]) / dt : 0;
    const drag = 0.5 * AIR_DENSITY * frontalArea * DRAG_COEFFICIENT * v * v;
    const force = massKg * a + drag;
    points.push({ v, force });
  }
  if (points.length < 5) return null;

  // Linear regression: force = intercept + slope * v
  const n = points.length;
  const sumV = points.reduce((sum, p) => sum + p.v, 0);
  const sumF = points.reduce((sum, p) => sum + p.force, 0);
  const meanV = sumV / n;
  const meanF = sumF / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.v - meanV) * (p.force - meanF);
    den += (p.v - meanV) * (p.v - meanV);
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = meanF - slope * meanV;

  if (slope >= 0 || intercept <= 0) return null; // not a sane decelerating F-v relationship

  const f0Total = intercept;
  const v0 = -intercept / slope;
  const pmaxTotal = (f0Total * v0) / 4;

  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const predicted = intercept + slope * p.v;
    ssRes += (p.force - predicted) ** 2;
    ssTot += (p.force - meanF) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  if (rSquared < MIN_FV_R_SQUARED) return null;

  return {
    f0: f0Total / massKg,
    v0,
    pmax: pmaxTotal / massKg,
    rSquared,
    usedDefaultHeight,
  };
}
