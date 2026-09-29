// Competition level for athletes and teams. Keys match the CHECK constraint on
// athletes.level and teams.level in Supabase. An athlete with no level set
// inherits their team's level for comparisons.

export type AthleteLevel = "elite" | "semi_pro" | "amateur" | "junior";

export const LEVELS: { value: AthleteLevel; label: string }[] = [
  { value: "elite", label: "Elite" },
  { value: "semi_pro", label: "Semi-professional" },
  { value: "amateur", label: "Amateur" },
  { value: "junior", label: "Junior" },
];

export function levelLabel(v: string | null | undefined): string | null {
  return LEVELS.find((l) => l.value === v)?.label ?? null;
}
