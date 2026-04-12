/** Map CSV movement labels to stable metric key segments */
export function movementSlug(movement: string): string {
  const t = movement.trim().toLowerCase();
  if (t.includes("knee") && t.includes("ext")) return "knee_ext";
  if (t.includes("knee") && (t.includes("flex") || t.includes("flx")))
    return "knee_flex";
  if (t.includes("hip") && t.includes("abd") && !t.includes("add"))
    return "hip_abd";
  if (t.includes("hip") && t.includes("add")) return "hip_add";
  return t
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64) || "movement";
}

export function legSuffix(leg: string): "left" | "right" | null {
  const t = leg.trim().toLowerCase();
  if (t === "left" || t === "l") return "left";
  if (t === "right" || t === "r") return "right";
  return null;
}

/** Minimal CSV line split — handles quoted fields with commas */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Expects columns: Movement, Leg, Peak Force (N), optional RFD (N/s)
 * Each row → dyno_{slug}_peak_force_{left|right}, dyno_{slug}_rfd_{left|right}
 */
export function parseDynamometerCsvToMetrics(
  text: string
): Record<string, number> {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idxMov = header.findIndex((h) => /^movement$/i.test(h));
  const idxLeg = header.findIndex((h) => /^leg$/i.test(h));
  const idxPf = header.findIndex(
    (h) => /peak\s*force/i.test(h) || /^peak$/i.test(h)
  );
  const idxRfd = header.findIndex(
    (h) => /^rfd$/i.test(h) || /rfd/i.test(h)
  );

  if (idxMov < 0 || idxLeg < 0 || idxPf < 0) {
    throw new Error(
      "CSV must include columns: Movement, Leg, Peak Force (N)"
    );
  }

  const out: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const movement = cells[idxMov]?.trim() ?? "";
    const legRaw = cells[idxLeg]?.trim() ?? "";
    if (!movement) continue;

    const slug = movementSlug(movement);
    const leg = legSuffix(legRaw);
    if (!leg) continue;

    const pfRaw = cells[idxPf]?.trim() ?? "";
    const pf = Number(pfRaw.replace(",", "."));
    if (!Number.isNaN(pf) && pfRaw !== "") {
      out[`dyno_${slug}_peak_force_${leg}`] = pf;
    }

    if (idxRfd >= 0) {
      const rfdRaw = cells[idxRfd]?.trim() ?? "";
      const rfd = Number(rfdRaw.replace(",", "."));
      if (!Number.isNaN(rfd) && rfdRaw !== "") {
        out[`dyno_${slug}_rfd_${leg}`] = rfd;
      }
    }
  }

  if (Object.keys(out).length === 0) {
    throw new Error(
      "No valid rows with Movement, Leg (Left/Right), and numeric peak force."
    );
  }

  return out;
}
