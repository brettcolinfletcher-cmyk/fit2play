"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/**
 * Client gate for routes that only staff may access. Redirects non-staff to
 * /dashboard/athlete/me and unauthenticated users to /login.
 * Returns true only after role === "staff" is confirmed.
 */
export function useRequireDashboardStaff() {
  const router = useRouter();
  const [confirmedStaff, setConfirmedStaff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      if (error || profile?.role !== "staff") {
        router.replace("/dashboard/athlete/me");
        return;
      }
      setConfirmedStaff(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return confirmedStaff;
}
