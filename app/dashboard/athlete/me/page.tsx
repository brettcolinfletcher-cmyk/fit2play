"use client";

import { useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Resolve the athlete record linked to this auth user.
      const { data: athlete, error: athleteErr } = await supabase
        .from("athletes")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (athleteErr || !athlete) {
        setError(
          "No athlete profile is linked to your account yet. Please contact your clinician."
        );
        return;
      }

      router.replace(`/dashboard/athlete/${athlete.id}`);
    }

    run();
  }, [router]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50 flex items-center justify-center">
      <p className={`text-xs ${error ? "text-rose-400" : "text-slate-400"}`}>
        {error ?? "Loading your athlete dashboard…"}
      </p>
    </main>
  );
}