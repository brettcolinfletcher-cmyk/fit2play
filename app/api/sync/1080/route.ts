import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runMotion1080Sync } from "@/lib/sync/motion1080Sync";
import { staffOrServerAuthorized } from "@/lib/routeAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}


export async function GET(request: Request) {
  if (!(await staffOrServerAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = serviceClient();
  const result = await runMotion1080Sync(supabase);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!(await staffOrServerAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = serviceClient();
  const result = await runMotion1080Sync(supabase);
  return NextResponse.json(result);
}
