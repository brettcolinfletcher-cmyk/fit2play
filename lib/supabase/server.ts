import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll from a Server Component — safe to ignore when middleware refreshes sessions
          }
        },
      },
    }
  );
}

export type Profile = { role: "staff" | "athlete" | "organisation" };

function cookiesFromRequestHeader(request: Request): { name: string; value: string }[] {
  const header = request.headers.get("cookie");
  if (!header) return [];
  const out: { name: string; value: string }[] = [];
  for (const segment of header.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name) out.push({ name, value });
  }
  return out;
}

/**
 * Same as requireAuth but reads the session from the incoming Request Cookie header.
 * Use this in Route Handlers when cookies() from next/headers does not see the browser session.
 */
export async function requireAuthFromRequest(request: Request) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookiesFromRequestHeader(request);
        },
        setAll() {
          /* session refresh in Route Handlers is optional for auth checks */
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase, user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return { supabase, user, profile: profile as Profile | null };
}

/**
 * Returns the Supabase client plus `user` and `profile`, or `null` for user/profile when unauthenticated.
 */
export async function requireAuth() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase, user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return { supabase, user, profile: profile as Profile | null };
}
