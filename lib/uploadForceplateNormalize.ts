/**
 * Normalize Hawkins / client metric keys to canonical DB keys and derive asymmetry rows.
 */

const G = 9.80665;

/** Exact verbose CSV / export column names → canonical metric keys */
export const VERBOSE_FORCEPLATE_KEY_MAP: Record<string, string> = {
  "Concentric Impulse (Ns)":           "fp_concentric_impulse",
  "Concentric Impulse (N\u00b7s)":     "fp_concentric_impulse",
  "Concentric Impulse [Ns]":           "fp_concentric_impulse",
  "Concentric Impulse [N\u00b7s]":     "fp_concentric_impulse",
  "Concentric Impulse [N s]":          "fp_concentric_impulse",
  "Propulsive Impulse (Ns)":           "fp_concentric_impulse",
  "Propulsive Impulse (N\u00b7s)":     "fp_concentric_impulse",
  "Propulsive Impulse [Ns]":           "fp_concentric_impulse",
  "Propulsive Impulse [N\u00b7s]":     "fp_concentric_impulse",
  "Propulsive Impulse [N s]":          "fp_concentric_impulse",
  "Propulsive Net Impulse (Ns)":       "fp_concentric_impulse",
  "Propulsive Net Impulse (N\u00b7s)": "fp_concentric_impulse",
  "Propulsive Net Impulse [Ns]":       "fp_concentric_impulse",
  "Propulsive Net Impulse [N\u00b7s]": "fp_concentric_impulse",
  "Propulsive Net Impulse [N s]":      "fp_concentric_impulse",
  "Eccentric Impulse (Ns)":            "fp_eccentric_impulse",
  "Eccentric Impulse (N\u00b7s)":      "fp_eccentric_impulse",
  "Eccentric Impulse [Ns]":            "fp_eccentric_impulse",
  "Eccentric Impulse [N\u00b7s]":      "fp_eccentric_impulse",
  "Eccentric Impulse [N s]":           "fp_eccentric_impulse",
  "Braking Impulse (Ns)":              "fp_eccentric_impulse",
  "Braking Impulse (N\u00b7s)":        "fp_eccentric_impulse",
  "Braking Impulse [Ns]":              "fp_eccentric_impulse",
  "Braking Impulse [N\u00b7s]":        "fp_eccentric_impulse",
  "Braking Impulse [N s]":             "fp_eccentric_impulse",
  "Braking Net Impulse (Ns)":          "fp_eccentric_impulse",
  "Braking Net Impulse (N\u00b7s)":    "fp_eccentric_impulse",
  "Braking Net Impulse [Ns]":          "fp_eccentric_impulse",
  "Braking Net Impulse [N\u00b7s]":    "fp_eccentric_impulse",
  "Braking Net Impulse [N s]":         "fp_eccentric_impulse",
  "Peak Braking Force (N)":            "fp_peak_braking_force",
  "Peak Propulsive Force (N)":         "fp_peak_propulsive_force",
  "Peak Force (N)":                    "fp_peak_force_n_best",
  "RSI Modified":                      "fp_rsi_best",
  "RSI-Modified":                      "fp_rsi_best",
  "RSI Mod":                           "fp_rsi_best",
  RSI:                                 "fp_rsi_best",
  "Jump Height (cm)":                  "fp_jump_height_cm_best",
  "Contact Time (s)":                  "fp_contact_time_s_best",
  "Flight Time (s)":                   "fp_flight_time_s_best",
  "Body Weight (N)":                   "fp_body_mass_kg",
  "Body Mass (kg)":                    "fp_body_mass_kg",
  "Time to Peak Force (s)":            "isometric_time_to_peak",
  "RFD 0-100ms (N/s)":                 "isometric_rfd",
};

const SKIP_COLUMNS = new Set(
  [
    "TestId",
    "Date",
    "Time",
    "Name",
    "Segment",
    "Position",
    "Type",
    "Excluded",
    "Tags",
  ].map((c) => c.toLowerCase())
);

export type MetricMap = Record<string, number | null>;

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Converts any CSV column name to a snake_case DB key (Hawkins exports).
 */
export function normalizeColumnKey(col: string): string {
  let s = col.trim().toLowerCase();
  s = s.replace(/l\|r/g, "lr");
  s = s.replace(/p1\|p2/g, "p1p2");
  s = s.replace(/avg\./g, "avg");
  s = s.replace(/[.()[\]·]/g, "");
  s = s.replace(/[^a-z0-9_]+/g, "_");
  s = s.replace(/_+/g, "_");
  s = s.replace(/^_|_$/g, "");
  if (!s.startsWith("fp_") && !s.startsWith("isometric_")) {
    s = `fp_${s}`;
  }
  return s;
}

function maybeConvertBodyWeightNToKg(
  key: string,
  value: number
): { key: string; value: number } {
  if (key === "fp_body_mass_kg" && value > 120) {
    return { key, value: value / G };
  }
  return { key, value };
}

function isRsiModifiedLabel(label: string): boolean {
  const t = label.toLowerCase();
  return t.includes("modified") || t.includes("rsi mod");
}

function isEmptyOrNa(rawVal: unknown): boolean {
  if (rawVal == null) return true;
  if (typeof rawVal === "string") {
    const t = rawVal.trim();
    if (t === "") return true;
    if (t.toLowerCase() === "n/a") return true;
  }
  return false;
}

function isRsiAggregateKey(derivedKey: string): boolean {
  if (derivedKey === "fp_rsi" || derivedKey === "fp_rsi_best") return true;
  if (/(^|_)left($|_)|(^|_)right($|_)/.test(derivedKey)) return false;
  return derivedKey.startsWith("fp_rsi");
}

/**
 * Map incoming metrics (verbose labels or canonical keys) to canonical keys.
 */
export function normalizeForceplateMetrics(
  raw: Record<string, unknown>
): MetricMap {
  const out: MetricMap = {};
  let rsiPlain: number | null = null;
  let rsiModified: number | null = null;

  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const k = rawKey.trim();
    if (SKIP_COLUMNS.has(k.toLowerCase())) continue;
    if (isEmptyOrNa(rawVal)) continue;

    if (k === "Impact Peak") {
      if (typeof rawVal === "string") {
        const t = rawVal.trim().toLowerCase();
        if (t === "yes") out.fp_impact_peak = 1;
        else if (t === "no") out.fp_impact_peak = 0;
      }
      continue;
    }

    const mappedVerbose = VERBOSE_FORCEPLATE_KEY_MAP[k];
    if (mappedVerbose === "fp_rsi_best") {
      const v = num(rawVal);
      if (v == null) continue;
      if (isRsiModifiedLabel(k)) rsiModified = v;
      else rsiPlain = v;
      continue;
    }
    if (mappedVerbose != null) {
      const v = num(rawVal);
      if (v == null) continue;
      let { key, value } = maybeConvertBodyWeightNToKg(mappedVerbose, v);
      out[key] = value;
      continue;
    }

    if (/^mrsi$/i.test(k)) {
      const v = num(rawVal);
      if (v != null) out.fp_mrsi = v;
      continue;
    }

    const derivedKey = normalizeColumnKey(k);
    if (isRsiAggregateKey(derivedKey)) {
      const v = num(rawVal);
      if (v == null) continue;
      if (isRsiModifiedLabel(k) || derivedKey.includes("modified")) {
        rsiModified = v;
      } else {
        rsiPlain = v;
      }
      continue;
    }

    const v = num(rawVal);
    if (v == null) continue;

    let { key, value } = maybeConvertBodyWeightNToKg(derivedKey, v);
    out[key] = value;
  }

  const rsi = rsiModified ?? rsiPlain;
  if (rsi != null) out.fp_rsi_best = rsi;

  return out;
}

export function asymmetryPercent(left: number, right: number): number {
  const m = Math.max(Math.abs(left), Math.abs(right));
  if (m === 0 || !Number.isFinite(m)) return 0;
  return (Math.abs(left - right) / m) * 100;
}

export type AsymInsert = {
  session_id: string;
  metric_key: string;
  left_value: number;
  right_value: number;
  asymmetry_percent: number;
};

const LR_PAIRS: [string, string, string][] = [
  ["fp_jump_height_cm_left", "fp_jump_height_cm_right", "fp_jump_height_cm"],
  ["fp_rsi_left", "fp_rsi_right", "fp_rsi"],
  ["fp_peak_force_n_left", "fp_peak_force_n_right", "fp_peak_force_n"],
  [
    "fp_concentric_impulse_left",
    "fp_concentric_impulse_right",
    "fp_concentric_impulse",
  ],
  [
    "fp_eccentric_impulse_left",
    "fp_eccentric_impulse_right",
    "fp_eccentric_impulse",
  ],
  ["fp_peak_force_l_n_best", "fp_peak_force_r_n_best", "fp_peak_force_lr"],
  ["fp_conc_impulse_l_n_s_best", "fp_conc_impulse_r_n_s_best", "fp_conc_impulse"],
  ["fp_ecc_impulse_l_n_s_best", "fp_ecc_impulse_r_n_s_best", "fp_ecc_impulse"],
  [
    "fp_left_avg_braking_force",
    "fp_right_avg_braking_force",
    "fp_lr_avg_braking_force",
  ],
  [
    "fp_left_avg_propulsive_force",
    "fp_right_avg_propulsive_force",
    "fp_lr_avg_propulsive_force",
  ],
  [
    "fp_left_avg_braking_rfd",
    "fp_right_avg_braking_rfd",
    "fp_lr_avg_braking_rfd",
  ],
  [
    "fp_left_avg_landing_force",
    "fp_right_avg_landing_force",
    "fp_lr_avg_landing_force",
  ],
];

export function buildAsymmetryResultRows(
  sessionId: string,
  metrics: MetricMap
): AsymInsert[] {
  const rows: AsymInsert[] = [];
  for (const [leftK, rightK, baseKey] of LR_PAIRS) {
    const L = metrics[leftK];
    const R = metrics[rightK];
    if (L == null || R == null) continue;
    rows.push({
      session_id: sessionId,
      metric_key: baseKey,
      left_value: L,
      right_value: R,
      asymmetry_percent: asymmetryPercent(L, R),
    });
  }
  return rows;
}
