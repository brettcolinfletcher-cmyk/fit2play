"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import { formatDisplayDateTime } from "@/lib/dateDisplay";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  primary_sport: string | null;
};

type Session = {
  id: string;
  athlete_id: string;
  created_at: string;
  test_type?: string | null;
};

export default function OrganisationDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      // Ensure user is logged in
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Athletes (RLS will limit to this organisation)
      const { data: athleteData, error: athleteError } = await supabase
        .from("athletes")
        .select("id, first_name, last_name, team, primary_sport")
        .order("last_name", { ascending: true });

      if (athleteError) {
        console.error(athleteError);
        setError("Failed to load athletes");
        setLoading(false);
        return;
      }

      setAthletes((athleteData ?? []) as Athlete[]);

      // Recent sessions (again RLS-scoped)
      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("id, athlete_id, created_at, test_type")
        .order("created_at", { ascending: false })
        .limit(20);

      if (sessionError) {
        console.error(sessionError);
        setError("Failed to load sessions");
        setLoading(false);
        return;
      }

      setSessions((sessionData ?? []) as Session[]);
      setLoading(false);
    }

    load();
  }, [router]);

  const athleteNameMap = new Map<string, string>();
  athletes.forEach((a) => {
    const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
    athleteNameMap.set(a.id, name || "Unknown athlete");
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-6xl px-6 pt-8 pb-20">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Organisation dashboard
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              View your organisation&apos;s athletes and recent Fit2Play test
              sessions.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="text-[0.7rem] text-slate-400 hover:text-lime-300"
          >
            ← Back to main dashboard
          </Link>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs">
            <p className="text-[0.7rem] text-slate-400">Athletes</p>
            <p className="mt-1 text-2xl font-semibold text-lime-300">
              {athletes.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs">
            <p className="text-[0.7rem] text-slate-400">Recent sessions</p>
            <p className="mt-1 text-2xl font-semibold text-sky-300">
              {sessions.length}
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)]">
          {/* Athletes list */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
            <h2 className="text-sm font-semibold text-lime-300 mb-3">
              Athletes in your organisation
            </h2>
            {loading ? (
              <p className="text-xs text-slate-500">Loading athletes…</p>
            ) : athletes.length === 0 ? (
              <p className="text-xs text-slate-500">
                No athletes found for this organisation.
              </p>
            ) : (
              <div className="space-y-2">
                {athletes.map((a) => {
                  const name = `${a.first_name ?? ""} ${
                    a.last_name ?? ""
                  }`.trim();
                  return (
                    <button
                      key={a.id}
                      onClick={() =>
                        router.push(`/dashboard/athlete/${a.id}`)
                      }
                      className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 hover:border-lime-400/60 hover:bg-slate-900"
                    >
                      <p className="text-sm font-semibold text-slate-50">
                        {name || "Unnamed athlete"}
                      </p>
                      <p className="text-[0.7rem] text-slate-400">
                        {a.team && `${a.team} • `}
                        {a.primary_sport}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent sessions */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
            <h2 className="text-sm font-semibold text-lime-300 mb-3">
              Recent sessions
            </h2>
            {loading ? (
              <p className="text-xs text-slate-500">Loading sessions…</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No sessions found yet for your organisation.
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => {
                  const name = athleteNameMap.get(s.athlete_id) || "Athlete";
                  return (
                    <button
                      key={s.id}
                      onClick={() =>
                        router.push(`/dashboard/session/${s.id}`)
                      }
                      className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 hover:border-lime-400/60 hover:bg-slate-900"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[0.8rem] text-slate-100">
                            {name}
                          </p>
                          <p className="text-[0.7rem] text-slate-400">
                            {formatDisplayDateTime(s.created_at)}
                          </p>
                        </div>
                        <div className="text-right text-[0.65rem] text-slate-500">
                          <p>{s.test_type ?? "Session"}</p>
                          <p>View session →</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}