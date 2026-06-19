import { supabase } from "@/lib/supabaseClient";

export type ReportSection = {
  key: string;
  label: string;
  source: "1080" | "hawkins" | "mixed";
};

export const REPORT_SECTIONS: ReportSection[] = [
  { key: "linear", label: "Sprint — Linear", source: "1080" },
  { key: "cod", label: "Change of direction", source: "1080" },
  { key: "lr_settings", label: "Left/Right (1080)", source: "1080" },
  { key: "cmj", label: "Countermovement jump", source: "hawkins" },
  { key: "drop_jump", label: "Drop jump", source: "hawkins" },
  { key: "drop_jump_single", label: "Drop jump — single leg", source: "hawkins" },
  { key: "dynamometry", label: "Strength (HHD)", source: "hawkins" },
  { key: "hop_tests", label: "Hop tests", source: "mixed" },
];

const HHD_SKIP_TOKENS = new Set([
  "left",
  "right",
  "bilateral",
  "supine",
  "prone",
  "seated",
  "standing",
]);

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normaliseSubType(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw.trim().replace(/\s+/g, " ");
}

export function parseHhdMovement(subType: string | null | undefined): string {
  const normalised = normaliseSubType(subType);
  if (!normalised) return "";

  const remainder = normalised.replace(/^TS\s+Isometric\s+Test-/i, "");
  const parts = remainder.split("-").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const token = part.replace(/:\d+$/, "").trim();
    if (!token) continue;
    if (HHD_SKIP_TOKENS.has(token.toLowerCase())) continue;
    if (/^\d+$/.test(token)) continue;
    return titleCase(token);
  }

  return titleCase(normalised);
}

function visibilityMapKey(section: string, subKey: string): string {
  return `${section}|${subKey}`;
}

export type ReportVisibility = {
  isSectionVisible: (section: string) => boolean;
  isSubtestVisible: (section: string, subKey: string) => boolean;
  raw: Map<string, boolean>;
};

export async function fetchReportVisibility(
  athleteId: string
): Promise<ReportVisibility> {
  const { data, error } = await supabase
    .from("athlete_report_sections")
    .select("section, sub_key, visible")
    .eq("athlete_id", athleteId);

  if (error) {
    console.error("fetchReportVisibility:", error.message);
  }

  const raw = new Map<string, boolean>();
  for (const row of data ?? []) {
    raw.set(
      visibilityMapKey(row.section, row.sub_key ?? ""),
      row.visible
    );
  }

  return {
    raw,
    isSectionVisible(section: string) {
      const stored = raw.get(visibilityMapKey(section, ""));
      return stored ?? true;
    },
    isSubtestVisible(section: string, subKey: string) {
      const stored = raw.get(
        visibilityMapKey(section, normaliseSubType(subKey))
      );
      return stored ?? true;
    },
  };
}

export async function setReportVisibility(args: {
  athleteId: string;
  section: string;
  subKey?: string;
  visible: boolean;
  updatedBy?: string;
}): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = {
    athlete_id: args.athleteId,
    section: args.section,
    sub_key: normaliseSubType(args.subKey ?? ""),
    visible: args.visible,
    updated_at: new Date().toISOString(),
  };

  if (args.updatedBy) {
    row.updated_by = args.updatedBy;
  }

  const { error } = await supabase
    .from("athlete_report_sections")
    .upsert(row, { onConflict: "athlete_id,section,sub_key" });

  return { error: error?.message ?? null };
}

export type CriteriaResolver = {
  isCriterion: (section: string, subKey: string) => boolean;
  passCutoff: (section: string, subKey: string) => number;
  warnCutoff: (section: string, subKey: string) => number;
};

export const ALL_CRITERIA: CriteriaResolver = {
  isCriterion: () => true,
  passCutoff: () => 90,
  warnCutoff: () => 80,
};

export async function fetchReportCriteria(athleteId: string): Promise<CriteriaResolver> {
  const { data: defs } = await supabase
    .from("report_criteria_defaults")
    .select("section, sub_key, is_criterion_default, lsi_pass");

  const { data: rows } = await supabase
    .from("athlete_report_sections")
    .select("section, sub_key, is_criterion, lsi_pass")
    .eq("athlete_id", athleteId);

  const dMap = new Map<string, { crit: boolean; pass: number }>();
  for (const d of defs ?? []) {
    dMap.set(`${d.section}|${d.sub_key}`, {
      crit: d.is_criterion_default,
      pass: Number(d.lsi_pass),
    });
  }

  const oMap = new Map<string, { crit: boolean | null; pass: number | null }>();
  for (const r of rows ?? []) {
    oMap.set(`${r.section}|${r.sub_key}`, {
      crit: r.is_criterion,
      pass: r.lsi_pass == null ? null : Number(r.lsi_pass),
    });
  }

  const key = (s: string, sub: string) => `${s}|${normaliseSubType(sub)}`;

  const passCutoff = (s: string, sub: string) => {
    const k = key(s, sub);
    const o = oMap.get(k);
    if (o && o.pass != null) return o.pass;
    const d = dMap.get(k);
    if (d && Number.isFinite(d.pass)) return d.pass;
    return 90;
  };

  return {
    isCriterion: (s, sub) => {
      const k = key(s, sub);
      const o = oMap.get(k);
      if (o && o.crit != null) return o.crit;
      const d = dMap.get(k);
      if (d) return d.crit;
      return true;
    },
    passCutoff,
    warnCutoff: (s, sub) => passCutoff(s, sub) - 10,
  };
}

export async function setReportCriterion(a: {
  athleteId: string;
  section: string;
  subKey?: string;
  isCriterion: boolean | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("athlete_report_sections").upsert(
    {
      athlete_id: a.athleteId,
      section: a.section,
      sub_key: normaliseSubType(a.subKey ?? ""),
      is_criterion: a.isCriterion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "athlete_id,section,sub_key" }
  );
  return { error: error?.message ?? null };
}

export async function setReportCutoff(a: {
  athleteId: string;
  section: string;
  subKey?: string;
  lsiPass: number | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("athlete_report_sections").upsert(
    {
      athlete_id: a.athleteId,
      section: a.section,
      sub_key: normaliseSubType(a.subKey ?? ""),
      lsi_pass: a.lsiPass,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "athlete_id,section,sub_key" }
  );
  return { error: error?.message ?? null };
}

export async function setClinicDefault(a: {
  section: string;
  subKey?: string;
  lsiPass: number;
  isCriterion: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("report_criteria_defaults").upsert(
    {
      section: a.section,
      sub_key: normaliseSubType(a.subKey ?? ""),
      lsi_pass: a.lsiPass,
      is_criterion_default: a.isCriterion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "section,sub_key" }
  );
  return { error: error?.message ?? null };
}
