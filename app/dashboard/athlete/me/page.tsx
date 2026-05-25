"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import AddTestButton from "@/components/AddTestButton";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AthleteMePage() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login"); // adjust if different
        return;
      }

      // We assume athlete.profile.id === auth.user.id
      router.replace(`/dashboard/athlete/${user.id}`);
    }

    run();
  }, [router]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50 flex items-center justify-center">
      <p className="text-xs text-slate-400">Loading your athlete dashboard…</p>
    </main>
  );
}