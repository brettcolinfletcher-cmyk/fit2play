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
    // Probe multiple candidate endpoints to find where tests live
    const probes = [
      `${apiBase}/tests?syncFrom=${fromUnix}`,
      `${apiBase}?syncFrom=${fromUnix}`,
      `${apiBase}/trials?syncFrom=${fromUnix}`,
      `${apiBase}/data?syncFrom=${fromUnix}`,
    ];
    const probeResults: Record<string, { status: number; body: string }> = {};
    for (const endpoint of probes) {
      const r = await fetch(endpoint, { headers: authHeaders });
      probeResults[endpoint] = { status: r.status, body: (await r.text()).slice(0, 500) };
    }
    // Also return full first test object from the working endpoint
    const fullRes = await fetch(`${apiBase}?syncFrom=${fromUnix}`, { headers: authHeaders });
    const fullJson = await fullRes.json() as { data?: unknown[] };
    const firstTest = Array.isArray(fullJson.data) ? fullJson.data[0] : fullJson;
    return NextResponse.json({ apiBase, probeResults, firstTest });
  }

  const supabase = serviceClient();
  const result = await runHawkinsSync(supabase);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!syncAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = serviceClient();
  const result = await runHawkinsSync(supabase);
  return NextResponse.json(result);
}
