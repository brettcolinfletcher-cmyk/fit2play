import type { SupabaseClient } from "@supabase/supabase-js";

export type ExternalTeam = { extId: string; name: string };
export type ExternalMembership = { athleteExtId: string; teamExtId: string };
export type ExternalTeamsResult = { teamsCreated: number; teamsLinked: number; membersAdded: number };

// Catch-all buckets that shouldn't become teams.
const SKIP_NAME = /^(default|none|no group|ungrouped|unassigned|all|all athletes)$/i;
const ZERO_ID = /^[0-]+$/;

/**
 * Normalised team name for matching across sources. Deliberately strict:
 * ignores case, punctuation, apostrophes and spacing, and treats "Under 13",
 * "U-13", "U13's" and "U13s" the same. Nothing fuzzier, so two different
 * squads are never joined. Anything else is fixed with Merge on the Teams page.
 */
export function teamKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019`]/g, "")
    .replace(/\bunder[\s-]*(\d+)/g, "u$1")
    .replace(/\bu[\s-]+(\d+)/g, "u$1")
    .replace(/(\d+)s\b/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Add-only team sync from Hawkins teams or 1080 groups.
 * - Finds a team by its link in team_external_ids, else one team whose
 *   normalised name matches (see teamKey) and links it, else creates it.
 *   A team can hold any number of links, so merged teams keep receiving data.
 * - Adds athletes to those teams. Never removes a link, deletes or renames a team,
 *   so anything set up by hand in Fit2Play is left alone.
 * Never throws: problems are logged, so team linking can't fail the data sync
 * (a failed sync would stop the sync window advancing).
 */
export async function syncExternalTeams(
  supabase: SupabaseClient,
  source: "hawkins" | "1080",
  teams: ExternalTeam[],
  memberships: ExternalMembership[]
): Promise<ExternalTeamsResult> {
  const res: ExternalTeamsResult = { teamsCreated: 0, teamsLinked: 0, membersAdded: 0 };
  const tag = `[${source} sync] teams:`;
  const athCol = source === "hawkins" ? "hawkins_external_id" : "motion1080_external_id";

  try {
    const wanted = new Map<string, string>();
    for (const t of teams) {
      const name = t.name?.trim();
      if (!t.extId || ZERO_ID.test(t.extId) || !name || SKIP_NAME.test(name)) continue;
      wanted.set(t.extId, name);
    }
    if (wanted.size === 0) return res;

    // ── Teams ────────────────────────────────────────────────────────────────
    const [{ data: existing, error: exErr }, { data: links, error: lkErr }] = await Promise.all([
      supabase.from("teams").select("id, name"),
      supabase.from("team_external_ids").select("team_id, source, external_id"),
    ]);
    if (exErr) throw exErr;
    if (lkErr) throw lkErr;
    const byExt = new Map<string, string>();
    const sourceLinked = new Set<string>(); // teams already linked to this source
    for (const l of links ?? []) {
      if (l.source !== source) continue;
      byExt.set(String(l.external_id), String(l.team_id));
      sourceLinked.add(String(l.team_id));
    }
    // Normalised name -> team ids (several = ambiguous, never auto-linked)
    const byKey = new Map<string, string[]>();
    for (const r of existing ?? []) {
      const key = teamKey(String(r.name ?? ""));
      if (key) byKey.set(key, [...(byKey.get(key) ?? []), String(r.id)]);
    }

    const teamIdByExt = new Map<string, string>();
    for (const [extId, name] of wanted) {
      let id = byExt.get(extId);
      if (!id) {
        const key = teamKey(name);
        const matches = (byKey.get(key) ?? []).filter((tid) => !sourceLinked.has(tid));
        if (matches.length === 1) {
          id = matches[0];
          res.teamsLinked++;
        } else {
          if (matches.length > 1) console.warn(tag, `"${name}" matches ${matches.length} teams; creating a new one to merge by hand`);
          const { data: ins, error } = await supabase.from("teams").insert({ name }).select("id").single();
          if (error || !ins) { console.warn(tag, `create "${name}": ${error?.message}`); continue; }
          id = ins.id as string;
          byKey.set(key, [...(byKey.get(key) ?? []), id]);
          res.teamsCreated++;
        }
        const { error: le } = await supabase
          .from("team_external_ids")
          .upsert({ team_id: id, source, external_id: extId, external_name: name }, { onConflict: "source,external_id", ignoreDuplicates: true });
        if (le) { console.warn(tag, `link "${name}": ${le.message}`); continue; }
        byExt.set(extId, id);
        sourceLinked.add(id);
      }
      teamIdByExt.set(extId, id);
    }
    if (teamIdByExt.size === 0) return res;

    // ── Members ──────────────────────────────────────────────────────────────
    const relevant = memberships.filter((m) => teamIdByExt.has(m.teamExtId));
    const athExtIds = [...new Set(relevant.map((m) => m.athleteExtId))];
    const athByExt = new Map<string, string>();
    for (let i = 0; i < athExtIds.length; i += 200) {
      const chunk = athExtIds.slice(i, i + 200);
      const [{ data: direct }, { data: aliases }] = await Promise.all([
        supabase.from("athletes").select(`id, ${athCol}`).in(athCol, chunk),
        supabase.from("athlete_external_aliases").select("external_id, athlete_id").eq("source", source).in("external_id", chunk),
      ]);
      for (const a of (direct ?? []) as unknown as Record<string, unknown>[]) athByExt.set(String(a[athCol]), a.id as string);
      for (const a of aliases ?? []) athByExt.set(String(a.external_id), String(a.athlete_id));
    }

    const want = new Map<string, { athlete_id: string; team_id: string }>();
    for (const m of relevant) {
      const athlete_id = athByExt.get(m.athleteExtId);
      const team_id = teamIdByExt.get(m.teamExtId);
      if (athlete_id && team_id) want.set(`${athlete_id}:${team_id}`, { athlete_id, team_id });
    }
    if (want.size === 0) return res;

    const { data: have } = await supabase
      .from("athlete_teams")
      .select("athlete_id, team_id")
      .in("team_id", [...new Set(teamIdByExt.values())]);
    for (const h of have ?? []) want.delete(`${h.athlete_id}:${h.team_id}`);
    const rows = [...want.values()];
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from("athlete_teams")
        .upsert(rows.slice(i, i + 200), { onConflict: "athlete_id,team_id", ignoreDuplicates: true });
      if (error) console.warn(tag, `add members: ${error.message}`);
      else res.membersAdded += rows.slice(i, i + 200).length;
    }
  } catch (e) {
    console.warn(tag, "skipped:", e instanceof Error ? e.message : e);
  }
  return res;
}
