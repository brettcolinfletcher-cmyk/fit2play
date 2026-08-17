// Shared Hawkins isometric-dynamometry grouping logic — single source of
// truth for both the dashboard (components/athletes/DynamometrySection.tsx)
// and the PDF report (lib/pdfReportChartData.ts). Previously the PDF's
// "Strength" section was wired to a dead legacy `dyno_` metric key that no
// production session has ever written (0 rows in the metrics table) while
// the real isometric data — 299 Hawkins `force_plate_isometric` sessions —
// only reached the dashboard. Extracting this here means both surfaces
// parse Hawkins' segment-naming conventions and pick the same "best rep"
// the same way, so they can't drift out of alignment again.

export type IsoMetricRow = {
  key: string;
  value: string | number | null;
  side?: string | null;
};

export type IsoSession<M extends IsoMetricRow = IsoMetricRow> = {
  id: string;
  session_date: string;
  test_sub_type: string | null;
  metrics: M[];
};

export function isoMetricValue(metrics: IsoMetricRow[], key: string): number | null {
  const row = metrics.find((m) => m.key === key);
  if (!row || row.value == null) return null;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : null;
}

/** Strips the trailing rep number so every rep of the same movement+side
 * collapses into one group (e.g. "TS Iso Test Left:Hip Abduction:1" and
 * "...:2" both become the same group key). */
export function isoGroupKey(s: Pick<IsoSession, "test_sub_type">): string {
  return (s.test_sub_type ?? "Unknown").replace(/:\d+$/, "").trim();
}

// Handles two Hawkins segment-naming conventions seen in production: the
// original hyphen-suffix style ("TS Isometric Test-Abduction-Right:1") and
// Brett's Aug 2026 tag rename, which puts side as a colon-suffixed PREFIX on
// the movement name instead ("TS Iso Test Left:Hip Abduction - Long Lever (0
// degrees):1"). Both are stripped so left/right variants of the same
// movement collapse to one movementKey and pair up correctly.
export function isoMovementKey(gKey: string): string {
  return gKey
    .replace(/-Left\b/i, "")
    .replace(/-Right\b/i, "")
    .replace(/\bLeft:\s*/i, "")
    .replace(/\bRight:\s*/i, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

export function isoSideFromGroupKey(gKey: string): "left" | "right" | null {
  if (/\bleft\b/i.test(gKey)) return "left";
  if (/\bright\b/i.test(gKey)) return "right";
  return null;
}

export function isoLsi(left: number, right: number): number {
  const stronger = Math.max(left, right);
  const weaker = Math.min(left, right);
  return stronger === 0 ? 100 : (weaker / stronger) * 100;
}

export function parseIsoSegmentLabel(segment: string | null): string {
  if (!segment) return "Unknown";
  const cleaned = segment
    .replace(/^TS\s+/i, "")
    // Old tags: "Isometric Test-...". New (Aug 2026) tags: "Iso Test ...".
    .replace(/^(?:Isometric|Iso)\s+Test[-\s:]*/i, "");
  // Rep number is a trailing ":<digits>" only — NOT just "the last colon",
  // since the new naming convention also uses a colon after Left/Right
  // (e.g. "Left:Hip Abduction - Long Lever (0 degrees):1"), which a bare
  // lastIndexOf(":") would have mistaken for the rep separator.
  const repMatch = cleaned.match(/:(\d+)\s*$/);
  const name = repMatch ? cleaned.slice(0, repMatch.index) : cleaned;
  const repStr = repMatch ? repMatch[1] : "";
  const parts = name
    .replace(/^\s*(Left|Right)\s*:\s*/i, "") // side shown separately; drop it from the label
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  const label = parts.join(" – ");
  return repStr ? `${label} (rep ${repStr})` : label;
}

export function isoGroupHeading(segment: string | null): string {
  return parseIsoSegmentLabel(segment).replace(/\s*\(rep \d+\)$/, "");
}

export function isoPairedGroupHeading(mKey: string): string {
  return parseIsoSegmentLabel(mKey).replace(/\s*\(rep \d+\)$/, "");
}

export function isoBestSessionForDate<S extends IsoSession>(
  sessions: S[],
  date: string
): S | null {
  const onDate = sessions.filter((s) => s.session_date.slice(0, 10) === date.slice(0, 10));
  if (onDate.length === 0) return null;
  return onDate.reduce((best, cur) => {
    const bestPeak = isoMetricValue(best.metrics, "peak_force") ?? -Infinity;
    const curPeak = isoMetricValue(cur.metrics, "peak_force") ?? -Infinity;
    return curPeak > bestPeak ? cur : best;
  });
}

export type IsoDisplayGroup<S extends IsoSession = IsoSession> =
  | { kind: "single"; key: string; sessions: S[] }
  | { kind: "paired"; movementKey: string; left: S[]; right: S[] };

export function buildIsoDisplayGroups<S extends IsoSession>(
  groupMap: Map<string, S[]>
): IsoDisplayGroup<S>[] {
  const movementIndex = new Map<string, { leftKey?: string; rightKey?: string }>();
  const unpairedKeys: string[] = [];

  for (const gKey of groupMap.keys()) {
    const mKey = isoMovementKey(gKey);
    const side = isoSideFromGroupKey(gKey);
    if (side === "left" || side === "right") {
      const entry = movementIndex.get(mKey) ?? {};
      if (side === "left") entry.leftKey = gKey;
      else entry.rightKey = gKey;
      movementIndex.set(mKey, entry);
    } else {
      unpairedKeys.push(gKey);
    }
  }

  const pairedKeys = new Set<string>();
  const items: IsoDisplayGroup<S>[] = [];

  for (const [mKey, { leftKey, rightKey }] of movementIndex) {
    if (leftKey && rightKey) {
      items.push({
        kind: "paired",
        movementKey: mKey,
        left: groupMap.get(leftKey) ?? [],
        right: groupMap.get(rightKey) ?? [],
      });
      pairedKeys.add(leftKey);
      pairedKeys.add(rightKey);
    } else if (leftKey) {
      unpairedKeys.push(leftKey);
    } else if (rightKey) {
      unpairedKeys.push(rightKey);
    }
  }

  for (const gKey of unpairedKeys) {
    if (pairedKeys.has(gKey)) continue;
    items.push({ kind: "single", key: gKey, sessions: groupMap.get(gKey) ?? [] });
  }

  items.sort((a, b) => {
    const dateA =
      a.kind === "single"
        ? a.sessions[0]?.session_date ?? ""
        : a.left[0]?.session_date ?? a.right[0]?.session_date ?? "";
    const dateB =
      b.kind === "single"
        ? b.sessions[0]?.session_date ?? ""
        : b.left[0]?.session_date ?? b.right[0]?.session_date ?? "";
    return dateA.localeCompare(dateB);
  });

  return items;
}

export function isoLatestPairedDate<S extends IsoSession>(
  leftSessions: S[],
  rightSessions: S[]
): string | null {
  const leftDates = new Set(leftSessions.map((s) => s.session_date.slice(0, 10)));
  const rightDates = new Set(rightSessions.map((s) => s.session_date.slice(0, 10)));
  const common = [...leftDates].filter((d) => rightDates.has(d)).sort((a, b) => a.localeCompare(b));
  return common.length > 0 ? common[common.length - 1]! : null;
}
