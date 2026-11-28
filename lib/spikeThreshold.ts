/** Load spike threshold (% acute above/below chronic), shared by athlete and team GPS views, saved per browser. */
export const SPIKE_OPTIONS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100] as const;
const KEY = "f2p.gpsSpikeThreshold";

export function loadSpikeThreshold(): number {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    /* storage unavailable */
  }
  return 50;
}

export function saveSpikeThreshold(v: number) {
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    /* storage unavailable */
  }
}
