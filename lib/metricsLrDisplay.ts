/** Left/right asymmetry % — matches upload formula */
export function asymmetryPctLR(left: number, right: number): number {
  const m = Math.max(Math.abs(left), Math.abs(right));
  if (m === 0 || !Number.isFinite(m)) return 0;
  return (Math.abs(left - right) / m) * 100;
}

export function asymmetryCellClass(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  if (pct > 15) return "text-red-500 font-semibold";
  if (pct > 10) return "text-amber-400 font-semibold";
  return "text-slate-300";
}

export type SummaryMap = Record<string, number>;

export function buildSummaryMap(
  metrics: { key: string; value: number | null; rep_index: number | null }[]
): SummaryMap {
  const m: SummaryMap = {};
  for (const row of metrics) {
    if (row.rep_index != null) continue;
    if (row.value != null && typeof row.value === "number")
      m[row.key] = row.value;
  }
  return m;
}

export type LrDisplayRow = {
  id: string;
  label: string;
  left: number | null;
  right: number | null;
  both: number | null;
  asymPct: number | null;
  bandKey: string;
};

/** Pair _left / _right keys; otherwise single "both" row */
export function buildLrDisplayRows(map: SummaryMap): LrDisplayRow[] {
  const keys = Object.keys(map).sort();
  const used = new Set<string>();
  const rows: LrDisplayRow[] = [];

  const tryPair = (leftK: string, rightK: string, label: string) => {
    if (map[leftK] == null || map[rightK] == null) return false;
    used.add(leftK);
    used.add(rightK);
    const L = map[leftK];
    const R = map[rightK];
    rows.push({
      id: leftK,
      label,
      left: L,
      right: R,
      both: null,
      asymPct: asymmetryPctLR(L, R),
      bandKey: label.replace(/\s+/g, "_").toLowerCase(),
    });
    return true;
  };

  for (const k of keys) {
    if (used.has(k)) continue;

    if (k.endsWith("_left")) {
      const base = k.slice(0, -5);
      const rk = `${base}_right`;
      if (tryPair(k, rk, humanLabel(base))) continue;
    }

    if (k.endsWith("_l_n_best")) {
      const base = k.replace(/_l_n_best$/, "");
      const rk = `${base}_r_n_best`;
      if (tryPair(k, rk, humanLabel(base))) continue;
    }
  }

  for (const k of keys) {
    if (used.has(k)) continue;
    used.add(k);
    rows.push({
      id: k,
      label: humanLabel(k),
      left: null,
      right: null,
      both: map[k],
      asymPct: null,
      bandKey: k,
    });
  }

  return rows;
}

function humanLabel(key: string): string {
  return key
    .replace(/^fp_/, "")
    .replace(/^dyno_/, "")
    .replace(/_/g, " ")
    .replace(/\b(best|left|right)\b/gi, "")
    .trim();
}
