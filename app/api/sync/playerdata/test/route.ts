import { NextResponse } from "next/server";
import { staffOrServerAuthorized } from "@/lib/routeAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * PlayerData connection test. Read-only, writes nothing to the DB.
 *
 * GET /api/sync/playerdata/test            -> token check + sessions in the last 30 days
 * GET /api/sync/playerdata/test?days=90    -> widen the window
 * GET /api/sync/playerdata/test?clubId=ID  -> also pull per-athlete distance/top speed for that club
 *
 * Auth: staff session or x-sync-secret header.
 * Docs: https://playerdata.github.io/playerdatapy/
 */

const TOKEN_URL = "https://app.playerdata.co.uk/oauth/token";
const GRAPHQL_URL = "https://app.playerdata.co.uk/api/graphql";

async function getToken() {
  const clientId = process.env.PLAYERDATA_CLIENT_ID;
  const clientSecret = process.env.PLAYERDATA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false as const, error: "PLAYERDATA_CLIENT_ID or PLAYERDATA_CLIENT_SECRET not set" };
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });
  const text = await res.text();
  let json: { access_token?: string; expires_in?: number; token_type?: string } = {};
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  if (!res.ok || !json.access_token) {
    return { ok: false as const, error: "token request failed", status: res.status, body: text.slice(0, 300) };
  }
  return { ok: true as const, token: json.access_token, expiresIn: json.expires_in, tokenType: json.token_type };
}

async function gql(token: string, query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { data?: unknown; errors?: unknown };
    return { status: res.status, data: json.data ?? null, errors: json.errors ?? null };
  } catch {
    return { status: res.status, data: null, errors: [{ raw: text.slice(0, 300) }] };
  }
}

// Probe 1: bare minimum fields, so a schema mismatch elsewhere can't hide whether access works.
const SESSIONS_MIN = `
query($from: ISO8601DateTime, $clubId: ID) {
  sessions(filter: { startTimeGteq: $from, clubIdEq: $clubId }, limit: 30, offset: 0) {
    __typename
    id
    startTime
    endTime
    sessionParticipationsCount
  }
}`;

// Probe 2: adds the club so we can see which clubs the credentials reach.
const SESSIONS_WITH_CLUB = `
query($from: ISO8601DateTime, $clubId: ID) {
  sessions(filter: { startTimeGteq: $from, clubIdEq: $clubId }, limit: 30, offset: 0) {
    id
    startTime
    club { id name }
  }
}`;

// Probe 3 (clubId only): per-athlete metrics, matching the docs example.
const SESSION_METRICS = `
query($from: ISO8601DateTime, $clubId: ID!) {
  sessions(filter: { clubIdEq: $clubId, startTimeGteq: $from }, limit: 3, offset: 0) {
    __typename
    id
    startTime
    sessionParticipations {
      __typename
      athlete { id name }
      ... on TrainingSessionParticipation {
        athleteMetricSet { totalDistanceM maxSpeedKph }
      }
      ... on MatchSessionParticipation {
        metricSet { totalDistanceM maxSpeedKph }
      }
    }
  }
}`;

export async function GET(request: Request) {
  if (!(await staffOrServerAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const clubId = url.searchParams.get("clubId") || null;
  const from = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const tok = await getToken();
  if (!tok.ok) return NextResponse.json({ step: "token", ...tok }, { status: 502 });

  const minimal = await gql(tok.token, SESSIONS_MIN, { from, clubId });
  const withClub = await gql(tok.token, SESSIONS_WITH_CLUB, { from, clubId });

  // Summarise distinct clubs seen
  const clubs: Record<string, { name: string; sessions: number }> = {};
  const rows = ((withClub.data as { sessions?: { club?: { id: string; name: string } | null }[] } | null)?.sessions) ?? [];
  for (const s of rows) {
    if (!s.club) continue;
    clubs[s.club.id] ??= { name: s.club.name, sessions: 0 };
    clubs[s.club.id].sessions++;
  }

  const metrics = clubId ? await gql(tok.token, SESSION_METRICS, { from, clubId }) : null;

  const sessionCount = ((minimal.data as { sessions?: unknown[] } | null)?.sessions ?? []).length;

  return NextResponse.json({
    token: { ok: true, tokenType: tok.tokenType, expiresIn: tok.expiresIn },
    window: { from, days, clubId },
    verdict:
      minimal.errors
        ? "Token works but the sessions query errored, see probes.minimal.errors"
        : sessionCount === 0
          ? "Token works but no sessions returned. Either nothing in this window (try ?days=180) or the organisation is not linked."
          : `Access confirmed: ${sessionCount} session(s) found${sessionCount === 30 ? " (first page only)" : ""}.`,
    clubs,
    probes: { minimal, withClub, metrics },
  });
}
