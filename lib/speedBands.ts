/**
 * GPS speed bands built from PlayerData distance-at-speed buckets.
 * Stored by the sync as metrics key `gps_dist_at_kph`, value = metres,
 * rep_index = bucket start in tenths of km/h. Bands are km/h thresholds
 * [from, to), so together they add up to total distance.
 */

export const SPEED_BUCKET_KEY = "gps_dist_at_kph";

export type SpeedBand = { id: string; label: string; from: number; to: number | null; color: string };

const COLORS = ["#7cbd6b", "#dfeb94", "#fde68a", "#f0855a", "#e11d48", "#7c3aed"];

/** Inner thresholds (km/h) between bands. Default: walk, jog, run, HSR, sprint. */
export const DEFAULT_THRESHOLDS = [7, 14.4, 19.8, 25.2];

export function bandsFromThresholds(thresholds: number[]): SpeedBand[] {
  const t = [...thresholds].filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const edges = [0, ...t];
  return edges.map((from, i) => {
    const to = i + 1 < edges.length ? edges[i + 1] : null;
    return {
      id: `b${i + 1}`,
      label: `Band ${i + 1}`,
      from,
      to,
      color: COLORS[i % COLORS.length],
    };
  });
}

export function bandRangeLabel(b: SpeedBand): string {
  return b.to == null ? `${b.from}+ km/h` : `${b.from}–${b.to} km/h`;
}

/** Band distances (m) for one session from its bucket rows; null when the session has no buckets. */
export function sessionBandDistances(
  rows: { key: string; value: number | null; rep_index: number | null }[],
  bands: SpeedBand[]
): number[] | null {
  const out = bands.map(() => 0);
  let any = false;
  for (const r of rows) {
    if (r.key !== SPEED_BUCKET_KEY || r.value == null || r.rep_index == null) continue;
    any = true;
    const kph = r.rep_index / 10;
    const i = bands.findIndex((b) => kph >= b.from && (b.to == null || kph < b.to));
    if (i >= 0) out[i] += Number(r.value);
  }
  return any ? out : null;
}

const STORE = "f2p.gpsSpeedBands";

export function loadThresholds(): number[] {
  try {
    const raw = window.localStorage.getItem(STORE);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(v) && v.every((x) => typeof x === "number")) return v as number[];
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_THRESHOLDS;
}

export function saveThresholds(t: number[]) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(t));
  } catch {
    /* storage unavailable */
  }
}
