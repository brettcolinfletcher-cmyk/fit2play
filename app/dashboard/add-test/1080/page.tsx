"use client";

import { useCallback, useEffect, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import { parse1080SamplesCsv, type Parsed1080 } from "@/lib/parse1080Csv";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export default function AddTest1080Page() {
  const router = useRouter();
  const staffOk = useRequireDashboardStaff();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const [sprintMode, setSprintMode] = useState<"linear" | "cod">("linear");
  const [linearDistance, setLinearDistance] = useState<
    "10m" | "20m" | "40m"
  >("20m");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!staffOk) return;
    async function load() {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase
        .from("athletes")
        .select("id, first_name, last_name")
        .order("last_name", { ascending: true });
      setAthletes((data as Athlete[]) ?? []);
    }
    void load();
  }, [staffOk]);

  const testSubType =
    sprintMode === "cod"
      ? "cod_5_10_5"
      : `linear_${linearDistance}`;

  const resolvedTestType =
    sprintMode === "cod" ? "cod_5_10_5" : "1080_sprint";

  const handleUpload = useCallback(async () => {
    if (!file || !selectedAthleteId) {
      setStatus("Select an athlete and CSV file.");
      return;
    }
    setUploading(true);
    setStatus(null);
    try {
      const text = await file.text();
      let parsed: Parsed1080;
      try {
        parsed = parse1080SamplesCsv(text);
      } catch (e) {
        console.error(e);
        setStatus("Could not parse 1080 CSV.");
        setUploading(false);
        return;
      }

      const { summary, reps, timeSeries } = parsed;
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

      const res = await fetch("/api/upload-1080", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          fileName: file.name,
          testType: resolvedTestType,
          testSubType: testSubType,
          summary: summaryForApi,
          reps: repsForApi,
          timeSeries,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data?.error || "Upload failed.");
        setUploading(false);
        return;
      }
      setStatus("Session created.");
      if (data.sessionId) {
        router.push(`/dashboard/session/${data.sessionId}`);
      }
    } catch (err) {
      console.error(err);
      setStatus("Unexpected error.");
    } finally {
      setUploading(false);
    }
  }, [file, selectedAthleteId, resolvedTestType, testSubType, router]);

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-xl px-4 pt-8 pb-20">
        <Link
          href="/dashboard/add-test"
          className="text-xs text-slate-400 hover:text-lime-300"
        >
          ← All test types
        </Link>

        <header className="mt-6 mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">
            1080 Sprint
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Linear or COD — then upload the 1080 samples CSV.
          </p>
        </header>

        <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-lime-400/10">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Athlete
            </p>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-lime-500 focus:outline-none"
              value={selectedAthleteId}
              onChange={(e) => setSelectedAthleteId(e.target.value)}
            >
              <option value="">Select…</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() ||
                    a.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Test mode
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSprintMode("linear")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  sprintMode === "linear"
                    ? "bg-lime-400 text-slate-950"
                    : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600"
                }`}
              >
                Linear
              </button>
              <button
                type="button"
                onClick={() => setSprintMode("cod")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  sprintMode === "cod"
                    ? "bg-lime-400 text-slate-950"
                    : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600"
                }`}
              >
                COD 5-10-5
              </button>
            </div>
          </div>

          {sprintMode === "linear" && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Distance focus
              </p>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-lime-500 focus:outline-none"
                value={linearDistance}
                onChange={(e) =>
                  setLinearDistance(e.target.value as "10m" | "20m" | "40m")
                }
              >
                <option value="10m">10 m</option>
                <option value="20m">20 m</option>
                <option value="40m">40 m</option>
              </select>
            </div>
          )}

          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              CSV file
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFile(e.target.files?.[0] ?? null)
              }
              className="w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-lime-400 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950 hover:file:brightness-110"
            />
          </div>

          {status && (
            <p className="text-sm text-slate-300" role="status">
              {status}
            </p>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="w-full rounded-full bg-lime-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Create session"}
          </button>
        </div>
      </section>
    </main>
  );
}
