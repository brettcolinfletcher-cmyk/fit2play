import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runPlayerdataSync } from "@/lib/sync/playerdataSync";
import { staffOrServerAuthorized } from "@/lib/routeAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * PlayerData GPS sync.
 * GET  (nightly cron) and POST (dashboard "Sync now").
 * ?days=N pulls the last N days (default 14, max 730). Use ?days=365 after linking athletes.
 */
function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function handle(request: Request) {
  if (!(await staffOrServerAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const result = await runPlayerdataSync(serviceClient(), {
    days: Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined,
  });
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
