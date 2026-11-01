import { supabase } from "@/lib/supabaseClient";

/**
 * Headers for dashboard calls to staff-only API routes. Sends the signed-in
 * user's Supabase access token; the route checks it belongs to a staff profile.
 */
export async function staffAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { ...extra, Authorization: `Bearer ${session.access_token}` }
    : { ...extra };
}
