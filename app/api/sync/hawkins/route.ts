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
    const tokenJson = await tokenRes.json() as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) return NextResponse.json({ error: "no access token", tokenJson });
    const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
    const fromUnix = Math.floor(Date.now() / 1000) - 86400 * 90; // last 90 days
    const [athletesPayload, testsPayload] = await Promise.all([
      fetch(`${apiBase}/athletes`, { headers: authHeaders }).then(r => r.json()),
      fetch(`${apiBase}/tests?syncFrom=${fromUnix}`, { headers: authHeaders }).then(r => r.json()),
    ]);
    return NextResponse.json({ athletesPayload, testsPayload });
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
