import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runHawkinsSync } from "@/lib/sync/hawkinsSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function syncAuthorized(request: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-sync-secret");
  const q = new URL(request.url).searchParams.get("secret");
  return header === secret || q === secret;
}

export async function GET(request: Request) {
  if (!syncAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?debug=true — returns raw Hawkins API payloads without writing to DB
  const url = new URL(request.url);
  if (url.searchParams.get("debug") === "true") {
    const refreshToken = process.env.HAWKINS_REFRESH_TOKEN;
    const apiBase = process.env.HAWKINS_API_BASE;
    const tokenUrl = process.env.HAWKINS_TOKEN_URL;
    const tokenRes = await fetch(tokenUrl!, {
      method: "GET",
      headers: { Authorization: `Bearer ${refreshToken}`, Accept: "application/json" },
    });
    const tokenText = await tokenRes.text();
    let accessToken: string | null = null;
    try {
      const tokenJson = JSON.parse(tokenText) as { access_token?: string };
      accessToken = tokenJson.access_token ?? null;
    } catch { /* ignore */ }
    if (!accessToken) return NextResponse.json({ error: "no access token", tokenStatus: tokenRes.status, tokenText });
    const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
    const fromUnix = Math.floor(Date.now() / 1000) - 86400 * 90;
    const nowUnix = Math.floor(Date.now() / 1000);
    // Probe candidate param schemes. syncFrom/syncTo (paired) is the
    // documented incremental-sync mode per connect.hawkindynamics.com/api —
    // from/to alone is for month-granularity bulk export, and syncFrom
    // without syncTo fetches unbounded-to-now (both were confirmed to 500).
    const probes = [
      `${apiBase}?syncFrom=${fromUnix}&syncTo=${nowUnix}`,
      `${apiBase}?from=${fromUnix}&to=${nowUnix}&sync=true`,
      `${apiBase}?from=${fromUnix}&to=${nowUnix}`,
      `${apiBase}?syncFrom=${fromUnix}`,
    ];
    const probeResults: Record<string, { status: number; body: string }> = {};
    for (const endpoint of probes) {
      const r = await fetch(endpoint, { headers: authHeaders });
      probeResults[endpoint] = { status: r.status, body: (await r.text()).slice(0, 500) };
    }
    // Also return the first test from the canonical endpoint. Guarded: this
    // endpoint can return a 500 with an empty/non-JSON body, and an unguarded
    // .json() parse would throw and crash the whole debug response before
    // probeResults is ever returned.
    let firstTest: unknown = null;
    let fullStatus: number | null = null;
    try {
      const fullRes = await fetch(`${apiBase}?syncFrom=${fromUnix}&syncTo=${nowUnix}`, { headers: authHeaders });
      fullStatus = fullRes.status;
      const fullText = await fullRes.text();
      try {
        const fullJson = JSON.parse(fullText) as { data?: unknown[] };
        firstTest = Array.isArray(fullJson.data) ? fullJson.data[0] : fullJson;
      } catch {
        firstTest = { parseError: true, raw: fullText.slice(0, 500) };
      }
    } catch (e) {
      firstTest = { fetchError: String(e) };
    }
    return NextResponse.json({ apiBase, fullStatus, probeResults, firstTest });
  }

  const supabase = serviceClient();
  const range = parseBackfillRange(request);
  const result = await runHawkinsSync(supabase, range);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!syncAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = serviceClient();
  const range = parseBackfillRange(request);
  const result = await runHawkinsSync(supabase, range);
  return NextResponse.json(result);
}

// Manual backfill: /api/sync/hawkins?secret=...&from=<unixSeconds>&to=<unixSeconds>
// Keep each call's window narrow (a few days) — Hawkins' /tests endpoint 500s
// on large windows, which is exactly the bug this parameter exists to work
// around for historical gaps instead of the automatic (small) daily window.
function parseBackfillRange(
  request: Request
): { fromUnix: number; toUnix: number } | undefined {
  const url = new URL(request.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  if (!fromStr || !toStr) return undefined;
  const fromUnix = Number(fromStr);
  const toUnix = Number(toStr);
  if (!Number.isFinite(fromUnix) || !Number.isFinite(toUnix)) return undefined;
  return { fromUnix, toUnix };
}
