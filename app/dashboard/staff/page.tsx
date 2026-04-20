"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organisation: string | null;
  team: string | null;
};

export default function StaffDashboardPage() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);

  async function loadAthletes() {
    const { data, error: err } = await supabase()
      .from("athletes")
      .select("id, first_name, last_name, organisation, team")
      .order("created_at", { ascending: true });
    if (!err && data) setAthletes(data as Athlete[]);
  }

  async function loadSessions() {
    setLoadingSessions(true);
    const sb = supabase();

    const { data, error: err } = await sb
      .from("sessions")
      .select("*")
      .order("session_date", { ascending: false })
      .limit(5);
    if (!err && data) setSessions(data);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count } = await sb
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .gte("session_date", weekAgo.toISOString().split("T")[0]);
    setSessionsThisWeek(count ?? 0);

    const { data: syncData } = await sb
      .from("sessions")
      .select("session_date")
      .eq("source", "1080")
      .order("session_date", { ascending: false })
      .limit(1);
    if (syncData && syncData.length > 0) {
      setLastSyncDate(String(syncData[0].session_date));
    }

    setLoadingSessions(false);
  }

  useEffect(() => {
    void (async () => {
      const sb = supabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile, error: profileError } = await sb
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profileError || profile?.role !== "staff") {
        router.replace("/dashboard/athlete/me");
        return;
      }
      await loadAthletes();
      await loadSessions();
    })();
  }, [router]);

  const athleteNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of athletes) {
      const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
      m.set(a.id, name || "Unnamed athlete");
    }
    return m;
  }, [athletes]);

  function fmtDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function fmtTestType(raw: string) {
    return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function typeColor(t: string) {
    if (t.startsWith("force_plate")) return "text-violet-300";
    if (t.startsWith("sprint") || t === "1080") return "text-lime-300";
    if (t.startsWith("dynamom")) return "text-sky-300";
    if (t.startsWith("hop")) return "text-amber-300";
    return "text-slate-400";
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Dashboard
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Overview of your athletes and recent testing activity.
            </p>
          </div>
          <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            Live · Fit2Play
          </div>
        </header>

        {/* Quick stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Athletes</p>
            <p className="mt-2 text-3xl font-semibold text-slate-50">{athletes.length}</p>
            <Link href="/dashboard/athletes" className="mt-2 inline-block text-[0.7rem] text-lime-400 hover:underline">
              Manage →
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Sessions this week</p>
            <p className="mt-2 text-3xl font-semibold text-slate-50">{sessionsThisWeek}</p>
            <p className="mt-2 text-[0.7rem] text-slate-500">last 7 days</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Last 1080 sync</p>
            <p className="mt-2 text-sm font-medium text-slate-200">
              {lastSyncDate ? fmtDate(lastSyncDate) : "—"}
            </p>
            <Link href="/dashboard/sync" className="mt-2 inline-block text-[0.7rem] text-lime-400 hover:underline">
              Sync now →
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Quick actions</p>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/dashboard/upload"
                className="rounded-lg border border-lime-400/30 bg-lime-400/10 px-3 py-1.5 text-center text-xs text-lime-300 hover:bg-lime-400/20"
              >
                Add data
              </Link>
              <Link
                href="/dashboard/athletes/compare"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-center text-xs text-slate-300 hover:border-slate-500"
              >
                Compare athletes
              </Link>
            </div>
          </div>
        </div>

        {/* Recent sessions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-lime-300">
              Recent sessions
            </h2>
            <Link href="/dashboard/athletes" className="text-[0.7rem] text-slate-400 hover:text-lime-300">
              View all via athletes →
            </Link>
          </div>

          {loadingSessions ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-slate-500">No sessions yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {sessions.map((s) => {
                const id = String(s.id ?? "");
                const displayName =
                  s.athlete_id != null
                    ? athleteNameMap.get(String(s.athlete_id)) ?? "Unknown athlete"
                    : "Unknown athlete";
                const testType = String(s.test_type ?? "");
                const sessionDate = String(s.session_date ?? s.created_at ?? "");
                return (
                  <Link
                    href={`/dashboard/session/${id}`}
                    key={id}
                    className="block rounded-xl border border-slate-800 bg-slate-950/40 p-3 transition hover:border-lime-400/30 hover:bg-slate-900"
                  >
                    <p className="truncate text-sm font-medium text-slate-200">{displayName}</p>
                    <p className={`mt-1 text-xs font-medium ${typeColor(testType)}`}>
                      {fmtTestType(testType)}
                    </p>
                    <p className="mt-1 text-[0.65rem] text-slate-500">
                      {sessionDate ? fmtDate(sessionDate) : "—"}
                    </p>
                    {s.test_sub_type ? (
                      <p className="mt-0.5 text-[0.65rem] text-slate-600">{String(s.test_sub_type)}</p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
