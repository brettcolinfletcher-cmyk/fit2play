import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Allows Vercel cron (x-vercel-cron) or staff verified via Bearer JWT + profiles (service role).
 * Returns a NextResponse to send, or null to continue.
 */
export async function authorizeSyncRequest(
  req: Request
): Promise<NextResponse | null> {
  const cron = req.headers.get("x-vercel-cron");
  if (cron != null && cron !== "") {
    return null;
  }

  const token = req.headers
    .get("Authorization")
    ?.replace("Bearer ", "")
    .trim();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile, error: profileError } = await supabaseService
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
