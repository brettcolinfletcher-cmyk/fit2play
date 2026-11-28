import { supabase } from "@/lib/supabaseClient";

/** Season phase (block) shaded behind workload charts. Table: season_phases. */
export type PhaseType = "preseason" | "competition" | "tournament" | "deload" | "off_season" | "rehab" | "other";

export type SeasonPhase = {
  id: string;
  name: string;
  phase_type: PhaseType;
  start_date: string;
  end_date: string;
  team_id: string | null;
  athlete_id: string | null;
  notes: string | null;
};

export const PHASE_TYPES: { value: PhaseType; label: string; fill: string; text: string }[] = [
  { value: "preseason", label: "Preseason", fill: "#ede9fe", text: "#6d28d9" },
  { value: "competition", label: "Competition", fill: "#fef3c7", text: "#b45309" },
  { value: "tournament", label: "Tournament", fill: "#ffedd5", text: "#c2410c" },
  { value: "deload", label: "Deload / recovery", fill: "#fce7f3", text: "#be185d" },
  { value: "off_season", label: "Off-season", fill: "#dbeafe", text: "#1d4ed8" },
  { value: "rehab", label: "Rehab / RTP", fill: "#ccfbf1", text: "#0f766e" },
  { value: "other", label: "Other", fill: "#f1f5f9", text: "#475569" },
];

export function phaseStyle(t: PhaseType | string) {
  return PHASE_TYPES.find((p) => p.value === t) ?? PHASE_TYPES[PHASE_TYPES.length - 1];
}

export type AthleteTeam = { id: string; name: string };

/**
 * Phases that apply to an athlete: their own, their teams', and everyone's.
 * `missing` is true when the season_phases table doesn't exist yet.
 */
export async function loadAthletePhases(
  athleteId: string
): Promise<{ phases: SeasonPhase[]; teams: AthleteTeam[]; missing: boolean; error: string | null }> {
  const { data: links } = await supabase.from("athlete_teams").select("team_id, teams(id, name)").eq("athlete_id", athleteId);
  const teams: AthleteTeam[] = [];
  for (const l of (links ?? []) as { team_id: string; teams: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
    const t = Array.isArray(l.teams) ? l.teams[0] : l.teams;
    if (t) teams.push({ id: t.id, name: t.name });
  }
  const teamIds = teams.map((t) => t.id);
  const scope = [`athlete_id.eq.${athleteId}`, "and(team_id.is.null,athlete_id.is.null)"];
  if (teamIds.length) scope.push(`team_id.in.(${teamIds.join(",")})`);

  const { data, error } = await supabase
    .from("season_phases")
    .select("id, name, phase_type, start_date, end_date, team_id, athlete_id, notes")
    .or(scope.join(","))
    .order("start_date");
  if (error) {
    const missing = /season_phases/.test(error.message) && /(does not exist|schema cache)/.test(error.message);
    return { phases: [], teams, missing, error: missing ? null : error.message };
  }
  return { phases: (data ?? []) as SeasonPhase[], teams, missing: false, error: null };
}
