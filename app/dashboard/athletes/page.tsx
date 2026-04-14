"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

type AthleteRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  primary_sport: string | null;
};

type SessionRow = {
  athlete_id: string | null;
  session_date: string | null;
};

function displayName(a: AthleteRow): string {
  const n = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  return n || "—";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AthletesListPage() {
  const staffOk = useRequireDashboardStaff();
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!staffOk) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: aData, error: aErr } = await supabase
        .from("athletes")
        .select("id, first_name, last_name, team, primary_sport")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });

      if (cancelled) return;
      if (aErr) {
        setError(aErr.message);
        setLoading(false);
        return;
      }

      const { data: sData, error: sErr } = await supabase
        .from("sessions")
        .select("athlete_id, session_date");

      if (cancelled) return;
      if (sErr) {
        setError(sErr.message);
        setLoading(false);
        return;
      }

      setAthletes((aData ?? []) as AthleteRow[]);
      setSessions((sData ?? []) as SessionRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk]);

  const statsByAthlete = useMemo(() => {
    const m = new Map<
      string,
      { count: number; lastSession: string | null }
    >();
    for (const s of sessions) {
      const aid = s.athlete_id;
      if (!aid) continue;
      const cur = m.get(aid) ?? { count: 0, lastSession: null as string | null };
      cur.count += 1;
      const sd = s.session_date;
      if (sd) {
        if (!cur.lastSession || new Date(sd) > new Date(cur.lastSession)) {
          cur.lastSession = sd;
        }
      }
      m.set(aid, cur);
    }
    return m;
  }, [sessions]);

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Athletes
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage roster, sessions, and profiles.
            </p>
          </div>
          <Link
            href="/dashboard/athletes/new"
            className="rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110"
          >
            New Athlete
          </Link>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="mt-8 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Team</th>
                <th className="px-4 py-3 font-medium">Sport</th>
                <th className="px-4 py-3 font-medium">Sessions</th>
                <th className="px-4 py-3 font-medium">Last Session</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Loading…
                  </td>
                </tr>
              ) : athletes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No athletes yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                athletes.map((a) => {
                  const st = statsByAthlete.get(a.id);
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-slate-800/80 hover:bg-slate-900/80"
                    >
                      <td className="px-4 py-3 text-slate-100">
                        {displayName(a)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {a.team ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {a.primary_sport ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-300">
                        {st?.count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {formatDate(st?.lastSession)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/athletes/${a.id}`}
                          className="mr-2 text-xs text-lime-300 hover:underline"
                        >
                          View
                        </Link>
                        <Link
                          href={`/dashboard/athletes/${a.id}/edit`}
                          className="text-xs text-slate-300 hover:text-lime-300 hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
