import type { SupabaseClient } from "@supabase/supabase-js";
import { METRIC_REGISTRY, type Direction, type MetricTarget } from "@/lib/performanceSummary";

export type TargetProfile = {
  id: string;
  name: string;
  sport: string | null;
  age_group: string | null;
  gender: string | null;
  level: string | null;
  is_default: boolean;
};

export function profileDescriptor(p: TargetProfile): string {
  const bits = [p.sport, p.age_group, p.gender, p.level].filter(Boolean);
  return bits.length ? bits.join(" · ") : p.is_default ? "Applies to any athlete without a profile set" : "";
}

export async function fetchTargetProfiles(supabase: SupabaseClient): Promise<TargetProfile[]> {
  const { data, error } = await supabase
    .from("performance_target_profiles")
    .select("id, name, sport, age_group, gender, level, is_default")
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data as TargetProfile[];
}

export async function fetchTargetsForProfile(
  supabase: SupabaseClient,
  profileId: string
): Promise<Record<string, MetricTarget>> {
  const { data, error } = await supabase
    .from("performance_targets")
    .select("metric_id, target, direction")
    .eq("profile_id", profileId);
  if (error || !data) return {};
  const map: Record<string, MetricTarget> = {};
  for (const row of data as { metric_id: string; target: number | string; direction: Direction }[]) {
    map[row.metric_id] = { target: Number(row.target), direction: row.direction };
  }
  return map;
}

/** Resolves which profile applies to an athlete (their own, or the clinic default) and its targets. */
export async function fetchTargetOverridesForAthlete(
  supabase: SupabaseClient,
  athleteTargetProfileId: string | null | undefined
): Promise<{ profileId: string | null; targets: Record<string, MetricTarget> }> {
  let profileId: string | null = athleteTargetProfileId ?? null;
  if (!profileId) {
    const { data } = await supabase
      .from("performance_target_profiles")
      .select("id")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    profileId = (data as { id: string } | null)?.id ?? null;
  }
  if (!profileId) return { profileId: null, targets: {} };
  const targets = await fetchTargetsForProfile(supabase, profileId);
  return { profileId, targets };
}

export async function setAthleteTargetProfile(
  supabase: SupabaseClient,
  athleteId: string,
  profileId: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("athletes")
    .update({ target_profile_id: profileId })
    .eq("id", athleteId);
  return { error: error?.message ?? null };
}

export async function createTargetProfile(
  supabase: SupabaseClient,
  fields: { name: string; sport?: string | null; age_group?: string | null; gender?: string | null; level?: string | null }
): Promise<{ profile: TargetProfile | null; error: string | null }> {
  const { data, error } = await supabase
    .from("performance_target_profiles")
    .insert({
      name: fields.name,
      sport: fields.sport || null,
      age_group: fields.age_group || null,
      gender: fields.gender || null,
      level: fields.level || null,
    })
    .select("id, name, sport, age_group, gender, level, is_default")
    .single();
  if (error) return { profile: null, error: error.message };

  // New profile starts from the metric registry's defaults so every metric
  // has a row to edit immediately, instead of silently falling through to
  // hardcoded values with no visible way to change them.
  const seedRows = METRIC_REGISTRY.map((m) => ({
    profile_id: data.id,
    metric_id: m.id,
    target: m.defaultTarget,
    direction: m.direction,
    unit: m.unit,
  }));
  const { error: seedError } = await supabase.from("performance_targets").insert(seedRows);
  if (seedError) return { profile: data as TargetProfile, error: seedError.message };

  return { profile: data as TargetProfile, error: null };
}

export async function deleteTargetProfile(
  supabase: SupabaseClient,
  profileId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("performance_target_profiles").delete().eq("id", profileId);
  return { error: error?.message ?? null };
}

export async function upsertTarget(
  supabase: SupabaseClient,
  profileId: string,
  metricId: string,
  target: number,
  direction: Direction,
  unit: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("performance_targets").upsert(
    { profile_id: profileId, metric_id: metricId, target, direction, unit, updated_at: new Date().toISOString() },
    { onConflict: "profile_id,metric_id" }
  );
  return { error: error?.message ?? null };
}
