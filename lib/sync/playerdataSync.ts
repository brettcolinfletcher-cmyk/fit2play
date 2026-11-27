import type { SupabaseClient } from "@supabase/supabase-js";
import { insertSyncLog } from "./syncLog";
import { matchAthlete, type MatchCandidate } from "./playerdataMatch";
import { FALLBACK_FIELDS, metricKey, metricUnit, type MetricSetType } from "./playerdataFields";

/**
 * PlayerData GPS sync (client credentials, read-only GraphQL).
 * Docs: https://playerdata.github.io/playerdatapy/
 *
 * One Fit2Play session per athlete per PlayerData session:
 *   source 'playerdata', test_type 'gps', test_sub_type 'Match' | 'Training',
 *   external_id '<pdSessionId>:<pdAthleteId>', sync_dedupe_key 'playerdata:<external_id>'.
 * Every numeric metric-set field is stored as metrics key 'gps_<snake_case>'.
 *
 * Athletes link by athletes.playerdata_external_id. Unknown PlayerData athletes are
 * name-matched (lib/sync/playerdataMatch.ts); misses go to playerdata_unmatched_athletes
 * and their sessions are skipped until staff link them (then run a backfill).
 */

const BASE = "https://app.playerdata.co.uk";
const TOKEN_URL = `${BASE}/oauth/token`;
const GRAPHQL_URL = `${BASE}/api/graphql`;
const PAGE = 30; // PlayerData max page size
const DEFAULT_DAYS = 14;
const MAX_DAYS = 730;

export type PlayerdataSyncResult = {
  ok: boolean;
  sessionsProcessed: number;
  playerdataSessions: number;
  athletesLinked: number;
  unmatched: number;
  days?: number;
  noMetricSet?: number;
  droppedFields?: string[];
  error?: string;
};

type GqlError = { message: string; path?: (string | number)[] };
type Gql = <T>(query: string, variables?: Record<string, unknown>) => Promise<{ data: T | null; errors: GqlError[] | null }>;

async function getToken(): Promise<string> {
  const clientId = process.env.PLAYERDATA_CLIENT_ID;
  const clientSecret = process.env.PLAYERDATA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PLAYERDATA_CLIENT_ID or PLAYERDATA_CLIENT_SECRET not set");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  });
  const text = await res.text();
  let token: string | undefined;
  try { token = (JSON.parse(text) as { access_token?: string }).access_token; } catch { /* non-JSON */ }
  if (!res.ok || !token) throw new Error(`PlayerData token ${res.status}: ${text.slice(0, 200)}`);
  return token;
}

function makeGql(token: string): Gql {
  return async (query, variables = {}) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
      });
      if (res.status === 429) {
        // Rate limited: back off with jitter (docs: 100 req / 5 s per token)
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
        continue;
      }
      const text = await res.text();
      try {
        const json = JSON.parse(text) as { data?: unknown; errors?: GqlError[] };
        return { data: (json.data ?? null) as never, errors: json.errors ?? null };
      } catch {
        return { data: null, errors: [{ message: `HTTP ${res.status}: ${text.slice(0, 200)}` }] };
      }
    }
    return { data: null, errors: [{ message: "Rate limited (429) after retries" }] };
  };
}

/** Numeric scalar fields per metric-set type, from introspection, else the docs fallback. */
async function resolveFields(gql: Gql): Promise<Record<MetricSetType, string[]>> {
  type F = { name: string; type: { kind: string; name: string | null; ofType: { kind: string; name: string | null } | null } };
  const q = `{
    m: __type(name: "MatchSessionAthleteMetricSet") { fields { name type { kind name ofType { kind name } } } }
    t: __type(name: "TrainingSessionAthleteMetricSet") { fields { name type { kind name ofType { kind name } } } }
  }`;
  const { data } = await gql<{ m: { fields: F[] } | null; t: { fields: F[] } | null }>(q);
  const numeric = (fields: F[] | undefined) =>
    (fields ?? [])
      .filter((f) => {
        const t = f.type.kind === "NON_NULL" ? f.type.ofType : f.type;
        return t?.kind === "SCALAR" && (t.name === "Float" || t.name === "Int");
      })
      .map((f) => f.name);
  const m = numeric(data?.m?.fields);
  const t = numeric(data?.t?.fields);
  return {
    MatchSessionAthleteMetricSet: m.length ? m : FALLBACK_FIELDS.MatchSessionAthleteMetricSet,
    TrainingSessionAthleteMetricSet: t.length ? t : FALLBACK_FIELDS.TrainingSessionAthleteMetricSet,
  };
}

/** Drop fields the API says don't exist, so one renamed field can't break the whole sync. */
function pruneUnknownFields(errors: GqlError[], fields: Record<MetricSetType, string[]>, dropped: Set<string>): boolean {
  let pruned = false;
  for (const e of errors) {
    // A field that errors while resolving (path ends in the field name) nulls the
    // whole metric set, so drop that field and retry.
    const last = e.path?.[e.path.length - 1];
    if (typeof last === "string") {
      for (const t of ["MatchSessionAthleteMetricSet", "TrainingSessionAthleteMetricSet"] as MetricSetType[]) {
        const i = fields[t].indexOf(last);
        if (i >= 0) { fields[t].splice(i, 1); pruned = true; dropped.add(last); }
      }
    }
    const m = /Field '(\w+)' doesn't exist on type '(\w+)'/.exec(e.message);
    if (m && (m[2] === "MatchSessionAthleteMetricSet" || m[2] === "TrainingSessionAthleteMetricSet")) {
      const list = fields[m[2] as MetricSetType];
      const i = list.indexOf(m[1]);
      if (i >= 0) { list.splice(i, 1); pruned = true; dropped.add(m[1]); }
    }
  }
  return pruned;
}

type PdAthlete = { id: string; name: string; dateOfBirth: string | null };
type PdParticipation = {
  __typename: string;
  id: string;
  athlete: PdAthlete;
  athleteMetricSet?: Record<string, unknown> | null;
  metricSet?: Record<string, unknown> | null;
};
type PdSession = {
  __typename: string;
  id: string;
  startTime: string;
  timezone: string | null;
  club: { name: string } | null;
  sessionParticipations: PdParticipation[] | null;
};

function sessionQuery(fields: Record<MetricSetType, string[]>, withMetrics: boolean): string {
  const metrics = withMetrics
    ? `... on TrainingSessionParticipation { athleteMetricSet { ${fields.TrainingSessionAthleteMetricSet.join(" ")} } }
       ... on MatchSessionParticipation { metricSet { ${fields.MatchSessionAthleteMetricSet.join(" ")} } }`
    : "";
  return `query($id: ID!) {
    session(id: $id) {
      __typename id startTime timezone club { name }
      sessionParticipations { __typename id athlete { id name dateOfBirth } ${metrics} }
    }
  }`;
}

/** Fetch one session with all metrics; falls back to one query per participation if the big query is refused. */
async function fetchSession(
  gql: Gql,
  id: string,
  fields: Record<MetricSetType, string[]>,
  dropped: Set<string>
): Promise<PdSession> {
  let lastErrors: GqlError[] | null = null;
  for (let i = 0; i < 25; i++) {
    const { data, errors } = await gql<{ session: PdSession | null }>(sessionQuery(fields, true), { id });
    if (!errors && data?.session) return data.session;
    lastErrors = errors;
    if (errors && pruneUnknownFields(errors, fields, dropped)) continue;
    break;
  }
  if (lastErrors) console.warn(`[playerdata] session ${id} full query failed: ${lastErrors.map((e) => e.message).join("; ").slice(0, 500)}`);
  // Fallback (e.g. query complexity limit): participations first, then metrics one by one.
  const { data, errors } = await gql<{ session: PdSession | null }>(sessionQuery(fields, false), { id });
  if (errors || !data?.session) throw new Error(`session ${id}: ${errors?.map((e) => e.message).join("; ") ?? "not found"}`);
  const s = data.session;
  for (const p of s.sessionParticipations ?? []) {
    if (p.__typename === "MatchSessionParticipation") {
      const r = await gql<{ matchSessionParticipation: { metricSet: Record<string, unknown> | null } | null }>(
        `query($id: ID!) { matchSessionParticipation(id: $id) { metricSet { ${fields.MatchSessionAthleteMetricSet.join(" ")} } } }`,
        { id: p.id }
      );
      p.metricSet = r.data?.matchSessionParticipation?.metricSet ?? null;
    } else if (p.__typename === "TrainingSessionParticipation") {
      const r = await gql<{ trainingSessionParticipation: { athleteMetricSet: Record<string, unknown> | null } | null }>(
        `query($id: ID!) { trainingSessionParticipation(id: $id) { athleteMetricSet { ${fields.TrainingSessionAthleteMetricSet.join(" ")} } } }`,
        { id: p.id }
      );
      p.athleteMetricSet = r.data?.trainingSessionParticipation?.athleteMetricSet ?? null;
    }
  }
  return s;
}

/** Session date in the session's own timezone (falls back to Perth). */
function localDate(iso: string, tz: string | null): string {
  const d = new Date(iso);
  for (const zone of [tz, "Australia/Perth"]) {
    if (!zone) continue;
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    } catch { /* bad zone name */ }
  }
  return iso.slice(0, 10);
}

export async function runPlayerdataSync(
  supabase: SupabaseClient,
  opts: { days?: number } = {}
): Promise<PlayerdataSyncResult> {
  const errors: string[] = [];
  let sessionsProcessed = 0;
  let playerdataSessions = 0;
  let athletesLinked = 0;
  const unmatchedSeen = new Set<string>();
  const droppedFields = new Set<string>();
  let noMetricSet = 0;
  let windowDays = 0;

  try {
    // Until any PlayerData session has been saved, pull a full year; after that the nightly window is 14 days.
    let requested = opts.days;
    if (requested == null) {
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("source", "playerdata");
      requested = (count ?? 0) === 0 ? 365 : DEFAULT_DAYS;
    }
    const days = Math.min(Math.max(Math.round(requested), 1), MAX_DAYS);
    windowDays = days;
    const from = new Date(Date.now() - days * 86400_000).toISOString();
    const gql = makeGql(await getToken());
    const fields = await resolveFields(gql);

    // ── Session list (all clubs these credentials can see) ──────────────────
    const sessionIds: string[] = [];
    for (let offset = 0; offset < PAGE * 100; offset += PAGE) {
      const { data, errors: e } = await gql<{ sessions: { id: string }[] | null }>(
        `query($from: ISO8601DateTime, $clubId: ID, $offset: Int) {
          sessions(filter: { startTimeGteq: $from, clubIdEq: $clubId }, limit: ${PAGE}, offset: $offset) { id }
        }`,
        { from, clubId: null, offset }
      );
      if (e) throw new Error(`sessions list: ${e.map((x) => x.message).join("; ")}`);
      const page = data?.sessions ?? [];
      sessionIds.push(...page.map((s) => s.id));
      if (page.length < PAGE) break;
    }
    playerdataSessions = sessionIds.length;

    // ── Lookups ─────────────────────────────────────────────────────────────
    const [athRes, aliasRes, unmatchedRes, excludedRes] = await Promise.all([
      supabase.from("athletes").select("id, first_name, last_name, date_of_birth, status, playerdata_external_id"),
      supabase.from("athlete_external_aliases").select("external_id, athlete_id").eq("source", "playerdata"),
      supabase.from("playerdata_unmatched_athletes").select("external_id, ignored"),
      supabase.from("sync_excluded_sessions").select("external_id").eq("source", "playerdata"),
    ]);
    if (athRes.error) throw new Error(`athletes: ${athRes.error.message}`);
    if (unmatchedRes.error) throw new Error(`unmatched table: ${unmatchedRes.error.message}`);

    const byPdId = new Map<string, string>();
    const candidates: MatchCandidate[] = [];
    for (const a of athRes.data ?? []) {
      if (a.playerdata_external_id) byPdId.set(String(a.playerdata_external_id), String(a.id));
      else if (a.status !== "archived") candidates.push(a as MatchCandidate);
    }
    for (const a of aliasRes.data ?? []) byPdId.set(String(a.external_id), String(a.athlete_id));
    const ignored = new Set((unmatchedRes.data ?? []).filter((u) => u.ignored).map((u) => String(u.external_id)));
    const wasUnmatched = new Set((unmatchedRes.data ?? []).map((u) => String(u.external_id)));
    const excluded = new Set((excludedRes.data ?? []).map((r) => String(r.external_id)));
    const decided = new Map<string, string | null>(); // pd athlete id -> fit2play id (null = unmatched this run)

    async function resolveAthlete(a: PdAthlete, clubName: string | null): Promise<string | null> {
      if (byPdId.has(a.id)) return byPdId.get(a.id)!;
      if (ignored.has(a.id)) return null;
      if (decided.has(a.id)) return decided.get(a.id)!;

      const m = matchAthlete(a.name, a.dateOfBirth, candidates);
      if (m.athleteId !== null) {
        const { error } = await supabase
          .from("athletes")
          .update({ playerdata_external_id: a.id })
          .eq("id", m.athleteId)
          .is("playerdata_external_id", null);
        if (error) {
          errors.push(`link ${a.name}: ${error.message}`);
          decided.set(a.id, null);
          return null;
        }
        athletesLinked += 1;
        byPdId.set(a.id, m.athleteId);
        const i = candidates.findIndex((c) => c.id === m.athleteId);
        if (i >= 0) candidates.splice(i, 1);
        if (wasUnmatched.has(a.id)) {
          await supabase.from("playerdata_unmatched_athletes").delete().eq("external_id", a.id);
        }
        return m.athleteId;
      }

      unmatchedSeen.add(a.id);
      decided.set(a.id, null);
      const { error } = await supabase.from("playerdata_unmatched_athletes").upsert(
        {
          external_id: a.id,
          name: a.name,
          date_of_birth: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : null,
          club_name: clubName,
          reason: m.reason,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "external_id" }
      );
      if (error) errors.push(`unmatched ${a.name}: ${error.message}`);
      return null;
    }

    // ── Sessions → per-athlete Fit2Play sessions + metrics ─────────────────
    for (const sid of sessionIds) {
      let s: PdSession;
      try {
        s = await fetchSession(gql, sid, fields, droppedFields);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        continue;
      }
      const subType = s.__typename === "MatchSession" ? "Match" : s.__typename === "TrainingSession" ? "Training" : s.__typename;
      const sessionDate = localDate(s.startTime, s.timezone);

      for (const p of s.sessionParticipations ?? []) {
        if (!p?.athlete?.id) continue;
        const externalId = `${s.id}:${p.athlete.id}`;
        if (excluded.has(externalId)) continue;
        const metricSet = p.metricSet ?? p.athleteMetricSet ?? null;
        if (!metricSet) {
          noMetricSet += 1; // no GPS data, or PlayerData returned an error for it
          continue;
        }

        const athleteId = await resolveAthlete(p.athlete, s.club?.name ?? null);
        if (!athleteId) continue;

        const rows = Object.entries(metricSet)
          .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
          .map(([field, v]) => ({
            key: metricKey(field),
            value: v as number,
            rep_index: null as number | null,
            side: null as string | null,
            unit: metricUnit(field),
          }));
        if (rows.length === 0) continue;

        const { data: sess, error: sErr } = await supabase
          .from("sessions")
          .upsert(
            {
              athlete_id: athleteId,
              test_type: "gps",
              test_sub_type: subType,
              file_name: null,
              source: "playerdata",
              external_id: externalId,
              session_date: sessionDate,
              device: "PlayerData",
              sync_dedupe_key: `playerdata:${externalId}`,
            },
            { onConflict: "sync_dedupe_key" }
          )
          .select("id")
          .single();
        if (sErr || !sess?.id) {
          errors.push(`session ${externalId}: ${sErr?.message ?? "no id"}`);
          continue;
        }
        const sessionId = sess.id as string;
        await supabase.from("metrics").delete().eq("session_id", sessionId);
        const { error: mErr } = await supabase
          .from("metrics")
          .insert(rows.map((r) => ({ ...r, session_id: sessionId })));
        if (mErr) {
          errors.push(`metrics ${externalId}: ${mErr.message}`);
          continue;
        }
        sessionsProcessed += 1;
      }
    }

    if (playerdataSessions > 0 && sessionsProcessed === 0 && noMetricSet > 0 && unmatchedSeen.size === 0) {
      errors.push(`${noMetricSet} athlete session(s) came back with no metrics from PlayerData`);
    }
    const errStr = errors.length ? errors.join(" | ") : null;
    await insertSyncLog(supabase, "playerdata", sessionsProcessed, errStr);
    return {
      ok: errors.length === 0,
      sessionsProcessed,
      playerdataSessions,
      athletesLinked,
      unmatched: unmatchedSeen.size,
      days: windowDays,
      noMetricSet,
      droppedFields: [...droppedFields],
      error: errStr ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    await insertSyncLog(supabase, "playerdata", sessionsProcessed, errors.join(" | "));
    return { ok: false, sessionsProcessed, playerdataSessions, athletesLinked, unmatched: unmatchedSeen.size, error: msg };
  }
}
