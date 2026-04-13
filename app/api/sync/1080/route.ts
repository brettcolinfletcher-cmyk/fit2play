import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeSyncRequest } from "@/lib/sync/authorizeSyncRequest";
import { runMotion1080Sync } from "@/lib/sync/motion1080Sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: Request) {
  const denied = await authorizeSyncRequest(req);
  if (denied) return denied;
  const supabase = serviceClient();
  const result = await runMotion1080Sync(supabase);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = await authorizeSyncRequest(req);
  if (denied) return denied;
  const supabase = serviceClient();
  const result = await runMotion1080Sync(supabase);
  return NextResponse.json(result);
}
