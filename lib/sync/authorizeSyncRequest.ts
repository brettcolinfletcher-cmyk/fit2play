import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

function syncSecretsMatch(
  provided: string | null,
  expected: string | undefined
): boolean {
  if (!provided || !expected) return false;
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Allows Vercel cron, or requests bearing SYNC_SECRET.
 * Returns a NextResponse to send, or null to continue.
 */
export async function authorizeSyncRequest(
  req: Request
): Promise<NextResponse | null> {
  const cron = req.headers.get("x-vercel-cron");
  if (cron != null && cron !== "") {
    return null;
  }

  const provided = req.headers.get("x-sync-secret");
  if (syncSecretsMatch(provided, process.env.SYNC_SECRET)) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
