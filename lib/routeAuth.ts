import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

/**
 * Server-side auth for API route handlers.
 *
 * Accepts, in order:
 *  1. Vercel cron: `Authorization: Bearer <CRON_SECRET>` (Vercel sends this
 *     automatically when CRON_SECRET is set in the project's env vars).
 *  2. Server-to-server scripts: `x-sync-secret: <SYNC_SECRET>` header.
 *     Never expose SYNC_SECRET to the browser.
 *  3. A signed-in staff user: `Authorization: Bearer <supabase access token>`,
 *     sent by the dashboard via staffAuthHeaders() in lib/staffAuthHeaders.ts.
 */

function safeEqual(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() || null : null;
}

/** True for Vercel cron (CRON_SECRET) or a server script (x-sync-secret). */
export function isServerSecretRequest(req: Request): boolean {
  if (safeEqual(bearerToken(req), process.env.CRON_SECRET)) return true;
  if (safeEqual(req.headers.get("x-sync-secret"), process.env.SYNC_SECRET)) return true;
  return false;
}

/** Returns the staff user's id if the Bearer token belongs to a staff profile. */
export async function staffUserFromRequest(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);
  if (error || !user) return null;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "staff" ? user.id : null;
}

/** Cron, server script, or signed-in staff. */
export async function staffOrServerAuthorized(req: Request): Promise<boolean> {
  if (isServerSecretRequest(req)) return true;
  return (await staffUserFromRequest(req)) !== null;
}
