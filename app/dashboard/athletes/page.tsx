"use client";

import { useEffect, useMemo, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import { parse1080SamplesCsv, type Parsed1080 } from "@/lib/parse1080Csv";

// ---------- Supabase client ----------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Small helper
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------- Types ----------
type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organisation: string | null;
  team: string | null;
  primary_sport: string | null;
  profile_image_url?: string | null;
  tags?: string[] | null;
};

/** Seed / placeholder rows used in development */
function isPlaceholderTestAthlete(a: Athlete): boolean {
  const f = (a.first_name ?? "").trim().toLowerCase();
  const l = (a.last_name ?? "").trim().toLowerCase();
  return f === "test" && l === "athlete";
}

type Session = {
  id: string;
  athlete_id: string | null;
  created_at: string;
  file_name?: string | null;
};

export default function DashboardPage() {
  const router = useRouter();

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CSV upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(
    null
  );

  // Tag filtering
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [athleteIdsWithSession, setAthleteIdsWithSession] = useState<
    Set<string>
  >(() => new Set());

  // ---------- Load athletes + sessions ----------
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      // Athletes with tags
      const { data: athletesData, error: athletesError } = await supabase
        .from("athletes")
        .select(
          "id, first_name, last_name, organisation, team, primary_sport, profile_image_url, tags"
        )
        .order("last_name", { ascending: true });

      if (athletesError) {
        console.error(athletesError);
        setError("Failed to load athletes");
        setLoading(false);
        return;
      }

      setAthletes((athletesData ?? []) as Athlete[]);

      // Distinct athletes that have at least one session (for roster filtering)
      const { data: sessionAthleteRows, error: sessionAthletesError } =
        await supabase.from("sessions").select("athlete_id");

      if (sessionAthletesError) {
        console.error(sessionAthletesError);
      } else {
        setAthleteIdsWithSession(
          new Set(
            (sessionAthleteRows ?? [])
              .map((r) => r.athlete_id)
              .filter((id): id is string => typeof id === "string" && id !== "")
          )
        );
      }

      // Recent sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, athlete_id, created_at, file_name")
        .order("created_at", { ascending: false })
        .limit(20);

      if (sessionsError) {
        console.error(sessionsError);
        setError("Failed to load sessions");
        setLoading(false);
        return;
      }

      setSessions((sessionsData ?? []) as Session[]);
      setLoading(false);
    }

    load();
  }, []);

  // ---------- Derived data ----------
  const rosterAthletes = useMemo(
    () =>
      athletes.filter(
        (a) =>
          !isPlaceholderTestAthlete(a) && athleteIdsWithSession.has(a.id)
      ),
    [athletes, athleteIdsWithSession]
  );

  const totalAthletes = rosterAthletes.length;
  const totalSessions = sessions.length;

  const allTags = Array.from(
    new Set(rosterAthletes.flatMap((a) => (a.tags ?? []) as string[]))
  ).sort();

  const filteredAthletes =
    activeTag == null
      ? rosterAthletes
      : rosterAthletes.filter((a) =>
          (a.tags ?? []).includes(activeTag)
        );

  // Map athlete id → display name (for sessions list)
  const athleteNameMap = new Map<string, string>();
  athletes.forEach((a) => {
    const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
    athleteNameMap.set(a.id, name || "Unknown athlete");
  });

  // ---------- CSV upload ----------
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setUploadStatus(null);
  }

  async function handleUpload() {
    if (!file) {
      setUploadStatus("Please select a CSV file first.");
      return;
    }
    if (!selectedAthleteId) {
      setUploadStatus("Please select an athlete.");
      return;
    }

    setUploading(true);
    setUploadStatus(null);

    try {
      const text = await file.text();

      let parsed: Parsed1080;
      try {
        parsed = parse1080SamplesCsv(text);
      } catch (err) {
        console.error("parse1080SamplesCsv error:", err);
        setUploadStatus(
          "Could not parse 1080 CSV. Please check you selected the correct export."
        );
        setUploading(false);
        return;
      }

      const { testType, summary, reps, timeSeries } = parsed;

      // Map summary to the API's MetricsSummary shape (no repIndex)
      const summaryForApi = {
        peakSpeed: summary.peakSpeed,
        peakForce: summary.peakForce,
        peakPower: summary.peakPower,
        split5m: summary.split5m,
        split10m: summary.split10m,
        split20m: summary.split20m,
      };

      const repsForApi = reps.map((r) => ({
        repIndex: r.repIndex,
        peakSpeed: r.peakSpeed,
        peakForce: r.peakForce,
        peakPower: r.peakPower,
        split5m: r.split5m,
        split10m: r.split10m,
        split20m: r.split20m,
      }));

      const body = {
        athleteId: selectedAthleteId,
        fileName: file.name,
        // if we detect "other", omit testType (backend will default)
        testType: testType === "other" ? undefined : testType,
        summary: summaryForApi,
        reps: repsForApi,
        timeSeries, // full time-series per rep
      };

      const res = await fetch("/api/upload-1080", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Upload failed:", data);
        setUploadStatus(
          data?.error || "Failed to upload & create session."
        );
        setUploading(false);
        return;
      }

      const data = await res.json();
      setUploadStatus(
        `Session created successfully${
          testType && testType !== "other" ? ` (${testType})` : ""
        }.`
      );

      // Optionally refresh sessions list
      if (data.sessionId) {
        const { data: newSessions } = await supabase
          .from("sessions")
          .select("id, athlete_id, created_at, file_name")
          .order("created_at", { ascending: false })
          .limit(20);

        setSessions((newSessions ?? []) as Session[]);
      }
    } catch (err) {
      console.error(err);
      setUploadStatus("Unexpected error during upload.");
    } finally {
      setUploading(false);
    }
  }

  // ---------- UI ----------
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        {/* Heading */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Fit2Play dashboard
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Manage athletes, upload 1080 Sprint tests and review recent
              sessions.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[0.7rem] text-slate-400 hover:text-lime-300"
          >
            <Image
              src="/fit2play_logo_transparent.png"
              alt="Fit2Play"
              width={280}
              height={120}
              className="h-16 w-auto"
            />
          </Link>
        </header>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        )}

        {/* Top summary cards */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
            <p className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
              Total athletes
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-50">
              {totalAthletes}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
            <p className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
              Total sessions
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-50">
              {totalSessions}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
            <p className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
              Tag categories in use
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-50">
              {allTags.length}
            </p>
          </div>
        </div>

        {/* Upload + latest sessions */}
        <div className="mb-8 grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)]">
          {/* Upload card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-lime-300">
              Upload new 1080 Sprint test
            </h2>
            <p className="mb-3 text-[0.7rem] text-slate-400">
              Choose an athlete, select a CSV file from the 1080 system and
              Fit2Play will create a new session with full time-series data.
            </p>

            <div className="space-y-3">
              {/* Athlete selector */}
              <div>
                <p className="mb-1 text-[0.7rem] text-slate-400">
                  Athlete
                </p>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[0.8rem]"
                  value={selectedAthleteId ?? ""}
                  onChange={(e) =>
                    setSelectedAthleteId(
                      e.target.value || null
                    )
                  }
                >
                  <option value="">Select athlete…</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {`${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() ||
                        a.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>

              {/* File input */}
              <div>
                <p className="mb-1 text-[0.7rem] text-slate-400">
                  1080 CSV file
                </p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="w-full text-[0.75rem] text-slate-200 file:mr-3 file:rounded-full file:border-none file:bg-lime-400 file:px-3 file:py-1 file:text-[0.7rem] file:font-semibold file:text-slate-950 hover:file:brightness-110"
                />
                {file && (
                  <p className="mt-1 text-[0.7rem] text-slate-500">
                    Selected: {file.name}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : "Create session"}
                </button>

                {uploadStatus && (
                  <p className="text-[0.7rem] text-slate-400">
                    {uploadStatus}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Recent sessions */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
              Recent sessions
            </h2>

            {loading ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No sessions yet. Upload your first CSV to create a test.
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => {
                  const name =
                    (s.athlete_id &&
                      athleteNameMap.get(s.athlete_id)) ||
                    "Unknown athlete";
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
                            {formatDateTime(s.created_at)}
                          </p>
                        </div>
                        <div className="text-right text-[0.65rem] text-slate-500">
                          {s.file_name && (
                            <p className="font-mono truncate max-w-[150px]">
                              {s.file_name}
                            </p>
                          )}
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

        {/* Athletes list with tag filters */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-lime-300">
              Athletes
            </h2>
            <p className="text-[0.7rem] text-slate-400">
              Click an athlete to open their profile, injury history and
              RTS trend.
            </p>
          </div>

          {/* Tag filter bar */}
          {allTags.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.7rem]">
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className={`rounded-full px-3 py-1 border ${
                  activeTag === null
                    ? "bg-lime-400 text-slate-950 border-lime-400"
                    : "bg-slate-900 text-slate-200 border-slate-600 hover:border-lime-400"
                }`}
              >
                All athletes
              </button>

              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setActiveTag((current) =>
                      current === tag ? null : tag
                    )
                  }
                  className={`rounded-full px-3 py-1 border ${
                    activeTag === tag
                      ? "bg-lime-400 text-slate-950 border-lime-400"
                      : "bg-slate-900 text-lime-300 border-lime-400/50 hover:bg-slate-800"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Athlete list */}
          <div className="grid gap-3 md:grid-cols-2">
            {loading ? (
              <p className="text-xs text-slate-500">
                Loading athletes…
              </p>
            ) : filteredAthletes.length === 0 ? (
              <p className="text-xs text-slate-500">
                No athletes match this filter.
              </p>
            ) : (
              filteredAthletes.map((athlete) => {
                const name = `${athlete.first_name ?? ""} ${
                  athlete.last_name ?? ""
                }`.trim();

                const initials = `${athlete.first_name?.[0] ?? ""}${
                  athlete.last_name?.[0] ?? ""
                }`.toUpperCase();

                const tags = ((athlete.tags ?? []) as string[]) || [];

                return (
                  <button
                    key={athlete.id}
                    onClick={() =>
                      router.push(
                        `/dashboard/athlete/${athlete.id}`
                      )
                    }
                    className="flex w-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-left hover:border-lime-400/60 hover:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-[0.75rem] font-semibold text-slate-100 overflow-hidden">
                          {athlete.profile_image_url ? (
                            <Image
                              src={athlete.profile_image_url}
                              alt={name || "Athlete"}
                              fill
                              sizes="36px"
                              className="object-cover"
                            />
                          ) : (
                            <span>{initials || "A"}</span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-50">
                            {name || "Unnamed athlete"}
                          </p>
                          <p className="text-[0.7rem] text-slate-400">
                            {athlete.organisation &&
                              `${athlete.organisation} • `}
                            {athlete.team && `${athlete.team} • `}
                            {athlete.primary_sport}
                          </p>
                        </div>
                      </div>
                    </div>

                    {tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full bg-slate-900 border border-lime-400/40 px-2 py-1 text-[0.65rem] text-lime-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
