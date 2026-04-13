import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

/**
 * Allows Vercel cron (x-vercel-cron: 1) or authenticated staff.
 * Returns a NextResponse to send, or null to continue.
 */
export async function authorizeSyncRequest(
  req: Request
): Promise<NextResponse | null> {
  if (req.headers.get("x-vercel-cron") === "1") {
    return null;
  }
  const { user, profile } = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile?.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
