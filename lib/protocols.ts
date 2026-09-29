// Resolves which testing protocol applies to an athlete.
// Order: athlete's own protocol -> their team's protocol -> none.
// Per-athlete add/remove overrides are then applied on top.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TestKey } from "@/lib/testCatalogue";

export type ResolvedTest = { key: TestKey; options: Record<string, unknown> };

export type ResolvedProtocol = {
  protocolId: string | null;
  protocolName: string | null;
  /** "athlete" = set directly on the athlete, "team" = inherited. */
  inheritedFrom: "athlete" | "team" | null;
  teamName: string | null;
  tests: ResolvedTest[];
  /** True when the athlete has add/remove overrides on top of the protocol. */
  modified: boolean;
  added: TestKey[];
  removed: TestKey[];
};

const EMPTY: ResolvedProtocol = {
  protocolId: null,
  protocolName: null,
  inheritedFrom: null,
  teamName: null,
  tests: [],
  modified: false,
  added: [],
  removed: [],
};

export async function resolveAthleteProtocol(
  supabase: SupabaseClient,
  athleteId: string
): Promise<ResolvedProtocol> {
  const [athRes, teamRes, ovRes] = await Promise.all([
    supabase.from("athletes").select("protocol_id").eq("id", athleteId).maybeSingle(),
    supabase
      .from("athlete_teams")
      .select("joined_at, teams(name, protocol_id)")
      .eq("athlete_id", athleteId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("athlete_protocol_overrides")
      .select("test_key, action, options")
      .eq("athlete_id", athleteId),
  ]);

  const athleteProtocolId = (athRes.data?.protocol_id as string | null) ?? null;

  type TeamJoin = { teams: { name: string; protocol_id: string | null } | null };
  const teamRows = ((teamRes.data ?? []) as unknown as TeamJoin[])
    .map((r) => r.teams)
    .filter((t): t is { name: string; protocol_id: string | null } => !!t);
  const teamWithProtocol = teamRows.find((t) => t.protocol_id);
  const teamName = teamWithProtocol?.name ?? teamRows[0]?.name ?? null;

  const protocolId = athleteProtocolId ?? teamWithProtocol?.protocol_id ?? null;
  const inheritedFrom: ResolvedProtocol["inheritedFrom"] = athleteProtocolId
    ? "athlete"
    : teamWithProtocol
      ? "team"
      : null;

  const overrides = (ovRes.data ?? []) as {
    test_key: TestKey;
    action: "add" | "remove";
    options: Record<string, unknown> | null;
  }[];

  if (!protocolId && overrides.length === 0) return { ...EMPTY, teamName };

  let protocolName: string | null = null;
  let base: ResolvedTest[] = [];
  if (protocolId) {
    const [pRes, tRes] = await Promise.all([
      supabase.from("test_protocols").select("name").eq("id", protocolId).maybeSingle(),
      supabase
        .from("protocol_tests")
        .select("test_key, options, sort_order")
        .eq("protocol_id", protocolId)
        .order("sort_order", { ascending: true }),
    ]);
    protocolName = (pRes.data?.name as string | null) ?? null;
    base = ((tRes.data ?? []) as { test_key: TestKey; options: Record<string, unknown> | null }[]).map(
      (t) => ({ key: t.test_key, options: t.options ?? {} })
    );
  }

  const removed = overrides.filter((o) => o.action === "remove").map((o) => o.test_key);
  const added = overrides
    .filter((o) => o.action === "add" && !base.some((b) => b.key === o.test_key))
    .map((o) => o.test_key);

  const tests: ResolvedTest[] = [
    ...base.filter((b) => !removed.includes(b.key)),
    ...overrides
      .filter((o) => o.action === "add" && added.includes(o.test_key))
      .map((o) => ({ key: o.test_key, options: o.options ?? {} })),
  ];

  return {
    protocolId,
    protocolName,
    inheritedFrom,
    teamName,
    tests,
    modified: added.length > 0 || removed.length > 0,
    added,
    removed,
  };
}

/** No protocol set = show everything (current behaviour). */
export function protocolIncludes(p: ResolvedProtocol, key: TestKey): boolean {
  if (!p.protocolId && p.tests.length === 0) return true;
  return p.tests.some((t) => t.key === key);
}
