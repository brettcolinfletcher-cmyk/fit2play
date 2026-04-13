"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import AddTestButton from "@/components/AddTestButton";
import DashboardNav from "@/components/DashboardNav";
import { parse1080SamplesCsv } from "@/lib/parse1080Csv";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organisation: string | null;
  team: string | null;
};

export default function StaffDashboardPage() {
  const router = useRouter();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const [athletes, setAthletes] = useState<Athlete[]>([]);

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  async function loadAthletes() {
    const { data, error: err } = await supabase
      .from("athletes")
      .select("id, first_name, last_name, organisation, team")
      .order("created_at", { ascending: true });

    if (!err && data) {
      setAthletes(data as Athlete[]);
      if (!selectedAthleteId && data.length > 0) {
        setSelectedAthleteId(data[0].id);
      }
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    const { data, error: err } = await supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);

    if (!err && data) setSessions(data);
    setLoadingSessions(false);
  }

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile, error: profileError } = await supabase
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

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedAthleteId) {
      setError("Please select an athlete first.");
      e.target.value = "";
      return;
    }

    setError(null);
    setSuccess(null);
    setIsUploading(true);

    try {
      const text = await file.text();
      const { summary, reps, timeSeries } = parse1080SamplesCsv(text);

      const payload = {
        athleteId: selectedAthleteId,
        fileName: file.name,
        summary,
        reps,
        timeSeries,
      };

      const res = await fetch("/api/upload-1080", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const textRes = await res.text();
      let data: { error?: string } = {};
      try {
        data = JSON.parse(textRes) as { error?: string };
      } catch {
        /* ignore */
      }

      if (!res.ok) {
        setError(data?.error || "Failed to create session.");
        return;
      }

      setSuccess("1080 Sprint session uploaded successfully!");
      loadSessions();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unexpected error"
      );
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Staff dashboard
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Upload 1080 sessions and browse recent tests.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AddTestButton />
            <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              Live • Fit2Play
            </div>
            <Link
              href="/dashboard/athletes"
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-lime-400/50 hover:text-lime-300"
            >
              Athletes →
            </Link>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-lime-300">
              Upload 1080 Sprint
            </h2>

            <div className="mt-4">
              <label className="mb-1 block text-[0.7rem] uppercase tracking-widest text-slate-400">
                Athlete
              </label>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                value={selectedAthleteId}
                onChange={(e) => setSelectedAthleteId(e.target.value)}
              >
                {athletes.length === 0 && (
                  <option value="">No athletes yet</option>
                )}
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() ||
                      "Unnamed athlete"}
                    {a.team ? ` • ${a.team}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[0.7rem] text-slate-500">
                Manage athletes on the Athletes page.
              </p>
            </div>

            <div className="mt-5">
              <input
                type="file"
                accept=".csv"
                id="fileUpload"
                className="hidden"
                onChange={onFileSelect}
              />
              <label
                htmlFor="fileUpload"
                className="inline-flex cursor-pointer items-center rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-lime-400 hover:text-lime-300"
              >
                {isUploading ? "Uploading…" : "Choose CSV file"}
              </label>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {success}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
              Recent sessions
            </h2>

            {loadingSessions ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-500">No sessions yet.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => {
                  const id = String(s.id ?? "");
                  const displayName =
                    s.athlete_id != null
                      ? athleteNameMap.get(String(s.athlete_id)) ??
                        "Unknown athlete"
                      : "Unknown athlete";
                  return (
                    <Link
                      href={`/dashboard/session/${id}`}
                      key={id}
                      className="block rounded-xl border border-slate-800 bg-slate-950/40 p-3 ring-1 ring-slate-800/80 transition hover:border-lime-400/30 hover:bg-slate-900"
                    >
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-200">
                          {displayName}
                        </span>
                        <span className="text-xs text-lime-300">
                          {String(s.test_type || "1080 Sprint")}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-[0.7rem] text-slate-400">
                        <span>
                          {new Date(
                            String(s.created_at)
                          ).toLocaleString("en-AU")}
                        </span>
                        <span className="font-mono">{id.slice(0, 8)}…</span>
                      </div>
                    </Link>
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
