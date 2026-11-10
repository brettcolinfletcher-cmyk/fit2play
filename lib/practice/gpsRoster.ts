/**
 * PlayerData GPS roster import/export (pure logic, unit tested).
 *
 * Accepts the PlayerData roster layout (title row, header row with "Unit ID",
 * "Last Name", "Name", "DOB", "Sport", "Gender", "Level") plus optional
 * "Hired to" and "Size" columns. Rows where the Last Name is a size word and
 * Name is blank are read as unallocated units of that vest size.
 */

export type RosterRow = {
  line: number; // 1-based sheet row
  unitCode: string;
  lastName: string;
  firstName: string;
  dob: string | null; // ISO
  dobRaw: string;
  sport: string;
  gender: "female" | "male" | null;
  level: "elite" | "semi_pro" | "amateur" | "junior" | null;
  hiredTo: string;
  size: string;
  hiredOn: string | null; // ISO, optional "Date hired" column
  hiredOnRaw?: string;
};

type Field = "unit" | "last" | "first" | "full" | "dob" | "sport" | "gender" | "level" | "hiredTo" | "size" | "hiredOn";

const ALIASES: Record<Field, string[]> = {
  unit: ["unit id", "unit", "unit code", "unit no", "device id", "device", "serial", "serial number", "gps unit", "gps id", "pod id", "pod"],
  last: ["last name", "surname", "family name", "last", "lastname"],
  first: ["name", "first name", "given name", "first", "firstname", "preferred name"],
  full: ["player", "athlete", "full name", "player name", "athlete name"],
  dob: ["dob", "d o b", "date of birth", "birth date", "birthdate", "birthday"],
  sport: ["sport"],
  gender: ["gender", "sex"],
  level: ["level", "competition level"],
  hiredTo: ["hired to", "hirer", "team", "club", "squad", "client", "group", "organisation", "organization"],
  size: ["size", "vest size", "vest", "garment size"],
  hiredOn: ["date hired", "hired on", "hire date", "date issued", "issued", "date out", "start date", "hire start"],
};

const SIZE_WORDS: Record<string, string> = {
  xxs: "XXS", xs: "XS", "extra small": "XS", s: "S", small: "S", m: "M", medium: "M", l: "L", large: "L",
  xl: "XL", "extra large": "XL", xxl: "XXL", "2xl": "XXL", xxxl: "XXXL", "3xl": "XXXL",
  "youth small": "YS", "youth medium": "YM", "youth large": "YL", ys: "YS", ym: "YM", yl: "YL",
};

export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sizeOf(s: string): string | null {
  return SIZE_WORDS[norm(s)] ?? null;
}

/** Excel serial, dd/mm/yyyy (AU), d/m/yy, yyyy-mm-dd, "12 Mar 2005" → ISO date. */
export function parseDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 1 || n > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
    return iso(y, +m[2], +m[1]);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t + 12 * 3600000).toISOString().slice(0, 10);
  return null;
}
function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

export function parseGender(raw: string): "female" | "male" | null {
  const n = norm(raw);
  if (["f", "female", "w", "woman", "women", "girl", "girls"].includes(n)) return "female";
  if (["m", "male", "man", "men", "boy", "boys"].includes(n)) return "male";
  return null;
}
export function parseLevel(raw: string): RosterRow["level"] {
  const n = norm(raw);
  if (!n) return null;
  if (n.startsWith("elite") || n === "pro" || n === "professional") return "elite";
  if (n.startsWith("semi")) return "semi_pro";
  if (n.startsWith("amateur") || n === "community" || n === "club") return "amateur";
  if (n.startsWith("junior") || n === "youth" || /^u\s?\d+/.test(n)) return "junior";
  return null;
}

export type ParsedRoster = { rows: RosterRow[]; headerLine: number; columns: Partial<Record<Field, number>>; warnings: string[] };

export function parseRoster(grid: string[][]): ParsedRoster {
  const warnings: string[] = [];
  let headerIdx = -1;
  const columns: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = grid[i].map(norm);
    if (cells.some((c) => ALIASES.unit.includes(c))) { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    return { rows: [], headerLine: 0, columns, warnings: ['Couldn\'t find a header row with a "Unit ID" column.'] };
  }
  grid[headerIdx].forEach((h, ci) => {
    const n = norm(h);
    if (!n) return;
    for (const f of Object.keys(ALIASES) as Field[]) {
      if (columns[f] == null && ALIASES[f].includes(n)) { columns[f] = ci; return; }
    }
  });
  const get = (r: string[], f: Field) => (columns[f] == null ? "" : (r[columns[f]!] ?? "").trim());

  const rows: RosterRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((c) => !c?.trim())) continue;
    let last = get(r, "last");
    let first = get(r, "first");
    if (!last && !first && get(r, "full")) {
      const parts = get(r, "full").split(/\s+/);
      last = parts.length > 1 ? parts.pop()! : parts[0];
      first = parts.length ? parts.join(" ") : "";
    }
    let size = get(r, "size");
    if (!first && last && sizeOf(last)) { size = size || last; last = ""; }
    const dobRaw = get(r, "dob");
    rows.push({
      line: i + 1,
      unitCode: get(r, "unit").toUpperCase().replace(/\s+/g, ""),
      lastName: last,
      firstName: first,
      dob: parseDate(dobRaw),
      dobRaw,
      sport: get(r, "sport"),
      gender: parseGender(get(r, "gender")),
      level: parseLevel(get(r, "level")),
      hiredTo: get(r, "hiredTo"),
      size: size ? sizeOf(size) ?? size.toUpperCase() : "",
      hiredOn: parseDate(get(r, "hiredOn")),
      hiredOnRaw: get(r, "hiredOn"),
    });
  }
  if (!rows.length) warnings.push("No data rows under the header.");
  return { rows, headerLine: headerIdx + 1, columns, warnings };
}

// ---- matching / planning -----------------------------------------------------

export type UnitLite = { id: string; unit_code: string; size: string | null; status: string; current_hire_id: string | null; current_athlete_id: string | null; current_holder_name: string | null };
export type HireLite = { id: string; client_name: string; team_id: string | null; status: string; start_date?: string | null };
export type AthleteLite = { id: string; first_name: string | null; last_name: string | null; date_of_birth: string | null };
export type Membership = { athlete_id: string; team_id: string };
export type TeamLite = { id: string; name: string };

export type AthleteMatch =
  | { kind: "empty" }
  | { kind: "matched"; id: string }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "none" };

export function matchAthlete(row: Pick<RosterRow, "firstName" | "lastName" | "dob">, athletes: AthleteLite[]): AthleteMatch {
  const f = norm(row.firstName);
  const l = norm(row.lastName);
  if (!f && !l) return { kind: "empty" };
  const same = athletes.filter((a) => norm(a.first_name) === f && norm(a.last_name) === l);
  if (!same.length) return { kind: "none" };
  if (row.dob) {
    const exact = same.filter((a) => a.date_of_birth === row.dob);
    if (exact.length === 1) return { kind: "matched", id: exact[0].id };
    if (exact.length > 1) return { kind: "ambiguous", ids: exact.map((a) => a.id) };
    const noDob = same.filter((a) => !a.date_of_birth);
    if (noDob.length === 1) return { kind: "matched", id: noDob[0].id };
    if (noDob.length > 1) return { kind: "ambiguous", ids: noDob.map((a) => a.id) };
    return { kind: "none" }; // same name, different DOB → different person
  }
  return same.length === 1 ? { kind: "matched", id: same[0].id } : { kind: "ambiguous", ids: same.map((a) => a.id) };
}

export type HireSource = "column" | "team" | "current" | "default" | "none";

export type PlanRow = {
  row: RosterRow;
  unit: UnitLite | null;
  athlete: AthleteMatch;
  hireId: string | null;
  hireSource: HireSource;
  issues: string[];
  skip: boolean; // hard error (no unit id / duplicate)
};

export function planRoster(
  rows: RosterRow[],
  ctx: { units: UnitLite[]; hires: HireLite[]; teams: TeamLite[]; athletes: AthleteLite[]; memberships: Membership[]; defaultHireId: string | null }
): PlanRow[] {
  const unitByCode = new Map(ctx.units.map((u) => [u.unit_code.toUpperCase(), u]));
  const openHires = ctx.hires.filter((h) => h.status !== "ended");
  const teamName = new Map(ctx.teams.map((t) => [t.id, t.name]));
  const seen = new Set<string>();

  return rows.map((row) => {
    const issues: string[] = [];
    let skip = false;
    if (!row.unitCode) { issues.push("No unit ID"); skip = true; }
    else if (seen.has(row.unitCode)) { issues.push("Unit listed twice; later row ignored"); skip = true; }
    seen.add(row.unitCode);
    if (row.dobRaw && !row.dob) issues.push(`Couldn't read DOB "${row.dobRaw}"`);
    if (row.hiredOnRaw && !row.hiredOn) issues.push(`Couldn't read Date hired "${row.hiredOnRaw}"`);

    const unit = row.unitCode ? unitByCode.get(row.unitCode) ?? null : null;
    const athlete = matchAthlete(row, ctx.athletes);

    let hireId: string | null = null;
    let hireSource: HireSource = "none";
    if (row.hiredTo) {
      const n = norm(row.hiredTo);
      const hits = openHires.filter((h) => norm(h.client_name) === n || (h.team_id && norm(teamName.get(h.team_id)) === n));
      if (hits.length === 1) { hireId = hits[0].id; hireSource = "column"; }
      else if (hits.length > 1) issues.push(`More than one open hire for "${row.hiredTo}"`);
      else issues.push(`No open hire for "${row.hiredTo}"`);
    }
    if (!hireId && athlete.kind === "matched") {
      const teams = new Set(ctx.memberships.filter((m) => m.athlete_id === athlete.id).map((m) => m.team_id));
      const hits = openHires.filter((h) => h.team_id && teams.has(h.team_id));
      if (hits.length === 1) { hireId = hits[0].id; hireSource = "team"; }
    }
    if (!hireId && unit?.current_hire_id) { hireId = unit.current_hire_id; hireSource = "current"; }
    if (!hireId && ctx.defaultHireId) { hireId = ctx.defaultHireId; hireSource = "default"; }

    return { row, unit, athlete, hireId, hireSource, issues, skip };
  });
}

export type Target = { hireId: string | null; athleteId: string | null; holderName: string | null };
export type Change = "new" | "assign" | "reassign" | "unassign" | "none";

/** What applying `target` would do to `unit`. */
export function changeFor(unit: UnitLite | null, target: Target, sizeChanged = false): Change {
  if (!unit) return "new";
  const curHolder = unit.current_athlete_id ?? (unit.current_holder_name ? norm(unit.current_holder_name) : null);
  const newHolder = target.athleteId ?? (target.holderName ? norm(target.holderName) : null);
  const sameHire = (unit.current_hire_id ?? null) === (target.hireId ?? null);
  if (sameHire && curHolder === newHolder) return sizeChanged ? "reassign" : "none";
  if (!unit.current_hire_id && !curHolder) return "assign";
  if (!newHolder && !target.hireId) return "unassign";
  return "reassign";
}

export function holderLabel(r: Pick<RosterRow, "firstName" | "lastName">): string {
  return `${r.firstName} ${r.lastName}`.trim();
}

// ---- export ------------------------------------------------------------------

export type ExportUnit = {
  unit_code: string;
  size: string | null;
  hire_name: string | null;
  hired_on?: string | null;
  athlete: { first_name: string | null; last_name: string | null; date_of_birth: string | null; primary_sport: string | null; sex: string | null; level: string | null } | null;
  holder_name: string | null;
};

const LEVEL_OUT: Record<string, string> = { elite: "Elite", semi_pro: "Semi-professional", amateur: "Amateur", junior: "Junior" };

function dmy(isoDate: string | null): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Rows in the PlayerData roster layout: title in B1, header in row 3, data from row 5.
 * Columns I "Hired to" and J "Date hired" are extra (delete before sending to PlayerData if they reject them).
 */
export function rosterExportRows(units: ExportUnit[], title = "PlayerData Roster"): (string | null)[][] {
  const out: (string | null)[][] = [
    [null, title],
    [],
    [null, "Unit ID", "Last Name", "Name", "DOB", "Sport", "Gender", "Level", "Hired to", "Date hired"],
    [],
  ];
  const sorted = [...units].sort((a, b) => (a.hire_name ?? "~").localeCompare(b.hire_name ?? "~") || a.unit_code.localeCompare(b.unit_code));
  for (const u of sorted) {
    const a = u.athlete;
    let last = a?.last_name ?? "";
    let first = a?.first_name ?? "";
    if (!a && u.holder_name) {
      const parts = u.holder_name.trim().split(/\s+/);
      last = parts.length > 1 ? parts.pop()! : parts[0];
      first = parts.join(" ");
    }
    if (!last && !first && u.size) last = u.size;
    out.push([
      null,
      u.unit_code,
      last,
      first,
      dmy(a?.date_of_birth ?? null),
      a?.primary_sport ?? "",
      a?.sex === "female" ? "Female" : a?.sex === "male" ? "Male" : "",
      a?.level ? LEVEL_OUT[a.level] ?? a.level : "",
      u.hire_name ?? "",
      dmy(u.hired_on ?? null),
    ]);
  }
  return out;
}
