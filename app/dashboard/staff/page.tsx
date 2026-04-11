"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import AddTestButton from "@/components/AddTestButton";
import { parse1080SamplesCsv } from "@/lib/parse1080Csv"; // ⬅️ NEW

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---- Types ----
type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organisation: string | null;
  team: string | null;
};

// ---- Dashboard ----
export default function StaffDashboardPage() {
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const [athletes, setAthletes] = useState<Athlete[]>([]);

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Load athletes
  async function loadAthletes() {
    const { data, error } = await supabase
      .from("athletes")
      .select("id, first_name, last_name, organisation, team")
      .order("created_at", { ascending: true });

    if (!error && data) {
      setAthletes(data as Athlete[]);
      if (!selectedAthleteId && data.length > 0) {
        setSelectedAthleteId(data[0].id);
      }
    }
  }

  // Load sessions
  async function loadSessions() {
    setLoadingSessions(true);
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);

    if (!error && data) setSessions(data);
    setLoadingSessions(false);
  }

  useEffect(() => {
    void (async () => {
      await loadAthletes();
      await loadSessions();
    })();
  }, []);

  const athleteNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of athletes) {
      const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
      m.set(a.id, name || "Unnamed athlete");
    }
    return m;
  }, [athletes]);

  // Upload handler
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
      // 1️⃣ Read file
      const text = await file.text();

      // 2️⃣ Parse samples → summary + reps + time-series
      const { summary, reps, timeSeries } = parse1080SamplesCsv(text);

      // 3️⃣ Build payload for API
      const payload = {
        athleteId: selectedAthleteId,
        fileName: file.name,
        summary,
        reps,
        timeSeries,
      };

      console.log("[staff] Upload payload:", payload);

      // 4️⃣ POST to API
      const res = await fetch("/api/upload-1080", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const textRes = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(textRes);
      } catch {
        // ignore parse error – we'll just use textRes in console
      }

      if (!res.ok) {
        console.error("[staff] upload-1080 error:", textRes);
        setError(data?.error || "Failed to create session.");
        return;
      }

      console.log("[staff] upload-1080 success:", data);
      setSuccess("1080 Sprint session uploaded successfully!");
      loadSessions();
    } catch (err: any) {
      console.error("[staff] Unexpected upload error:", err);
      setError(err?.message || "Unexpected error");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex">
      {/* SIDEBAR */}
      <aside className="hidden w-64 border-r border-slate-900 bg-slate-950/80 px-5 py-6 md:flex flex-col">
        <Image
          src="/fit2play_logo_transparent.png"
          alt="Fit2Play logo"
          width={140}
          height={60}
          className="opacity-90 mb-8"
        />

        <nav className="space-y-1 text-sm text-slate-300">
          <Link
            href="/dashboard"
            className="block rounded-lg bg-slate-900 px-3 py-2 text-lime-300"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/athletes"
            className="block rounded-lg px-3 py-2 hover:bg-slate-900 hover:text-white"
          >
            Athletes
          </Link>
        </nav>
      </aside>

      {/* MAIN */}
      <section className="flex-1 px-6 pt-6 pb-12">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-slate-400">
              Upload 1080 sessions and browse recent tests.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <AddTestButton />
            <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">
              Live • Fit2Play
            </div>
            <div className="rounded-full h-9 w-9 bg-slate-900 flex items-center justify-center">
              BF
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          {/* Upload card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-semibold text-lime-300">
              Upload 1080 Sprint
            </h2>

            {/* Athlete selector */}
            <div className="mt-4">
              <label className="block text-xs mb-1">Athlete</label>
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
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
              <p className="mt-1 text-[11px] text-slate-500">
                Manage athletes &amp; injury history on the Athletes page.
              </p>
            </div>

            {/* File input */}
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
                className="cursor-pointer inline-flex items-center rounded-full border border-slate-600 px-4 py-2 text-sm hover:border-lime-400 hover:text-lime-300"
              >
                {isUploading ? "Uploading…" : "Choose CSV file"}
              </label>
            </div>

            {error && (
              <div className="mt-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/40 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 px-3 py-2 rounded-lg">
                {success}
              </div>
            )}
          </div>

          {/* Sessions list */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-lime-300 mb-2">
              Recent Sessions
            </h2>

            {loadingSessions ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-500">No sessions yet.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => {
                  const displayName =
                    s.athlete_id != null
                      ? athleteNameMap.get(s.athlete_id) ??
                        "Unknown athlete"
                      : "Unknown athlete";
                  return (
                  <Link
                    href={`/dashboard/session/${s.id}`}
                    key={s.id}
                    className="block p-3 rounded-xl bg-slate-950/40 ring-1 ring-slate-800 hover:bg-slate-900 transition"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {displayName}
                      </span>
                      <span className="text-lime-300 text-xs">
                        {s.test_type || "1080 Sprint"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                      <span>
                        {new Date(s.created_at).toLocaleString("en-AU")}
                      </span>
                      <span>{s.id.slice(0, 8)}…</span>
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