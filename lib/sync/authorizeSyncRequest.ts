import { NextResponse } from "next/server";
import { requireAuthFromRequest } from "@/lib/supabase-server";

/**
 * Allows Vercel cron (x-vercel-cron header) or authenticated staff (profiles.role).
 * Returns a NextResponse to send, or null to continue.
 */
export async function authorizeSyncRequest(
  req: Request
): Promise<NextResponse | null> {
  const cron = req.headers.get("x-vercel-cron");
  if (cron != null && cron !== "") {
    return null;
  }

  const { user, profile } = await requireAuthFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile?.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
