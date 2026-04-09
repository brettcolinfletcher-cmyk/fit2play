"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardRouter() {
  const router = useRouter();

  useEffect(() => {
    async function load() {
      // 🔸 1. Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login"); // or your login route
        return;
      }

      // 🔸 2. Get profile role
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || !profile) {
        console.error("Profile load error:", error);
        router.push("/dashboard/staff");
        return;
      }

      const role = profile.role;

      // 🔸 3. Redirect based on role
      if (role === "staff") {
        router.push("/dashboard/staff");
      } else if (role === "organisation") {
        router.push("/dashboard/organisation"); // (future)
      } else if (role === "athlete") {
        router.push("/dashboard/athlete/me"); // (future)
      } else {
        router.push("/dashboard/staff"); // fallback
      }
    }

    load();
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
      <p className="text-xs text-slate-400">Loading dashboard…</p>
    </main>
  );
}