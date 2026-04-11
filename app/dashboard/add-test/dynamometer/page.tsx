"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

const TEST_OPTIONS = [
  { value: "hip_abduction", label: "Hip abduction" },
  { value: "hip_adduction", label: "Hip adduction" },
  { value: "knee_extension_30", label: "Knee extension (30°)" },
  { value: "knee_extension_90", label: "Knee extension (90°)" },
  { value: "knee_flexion_30", label: "Knee flexion (30°)" },
];

export default function AddTestDynamometerPage() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [testSubType, setTestSubType] = useState("hip_abduction");
  const [peakForce, setPeakForce] = useState("");
  const [rfd, setRfd] = useState("");
  const [asymmetryPct, setAsymmetryPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
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
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!athleteId) {
      setMsg("Select an athlete.");
      return;
    }
    const pf = peakForce.trim() ? Number(peakForce) : null;
    const r = rfd.trim() ? Number(rfd) : null;
    const asym = asymmetryPct.trim() ? Number(asymmetryPct) : null;
    const metrics: Record<string, number | null> = {};
    if (pf != null && !Number.isNaN(pf)) metrics.dyno_peak_force = pf;
    if (r != null && !Number.isNaN(r)) metrics.dyno_rfd = r;
    if (asym != null && !Number.isNaN(asym)) metrics.dyno_asymmetry_pct = asym;

    if (Object.keys(metrics).length === 0) {
      setMsg("Enter at least one metric.");
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/upload-dynamometer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          testSubType,
          metrics,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "Save failed.");
        setSaving(false);
        return;
      }
      if (data.sessionId) router.push(`/dashboard/session/${data.sessionId}`);
    } catch {
      setMsg("Unexpected error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <DashboardNav />
      <section className="mx-auto max-w-xl px-6 py-10 pb-20">
        <div className="mb-6">
          <Link
            href="/dashboard/add-test"
            className="text-sm text-sky-700 hover:underline"
          >
            ← All test types
          </Link>
        </div>

        <header className="mb-6 rounded-2xl bg-slate-900 px-6 py-5 text-white">
          <h1 className="text-xl font-semibold">Handheld dynamometer</h1>
          <p className="mt-1 text-sm text-slate-400">
            Record peak force, RFD, and asymmetry % for the selected test.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="text-xs font-medium uppercase text-slate-500">
              Athlete
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              required
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
            <label className="text-xs font-medium uppercase text-slate-500">
              Test
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={testSubType}
              onChange={(e) => setTestSubType(e.target.value)}
            >
              {TEST_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-600">Peak force (N)</label>
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={peakForce}
              onChange={(e) => setPeakForce(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">
              Rate of force development
            </label>
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={rfd}
              onChange={(e) => setRfd(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">Asymmetry (%)</label>
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={asymmetryPct}
              onChange={(e) => setAsymmetryPct(e.target.value)}
            />
          </div>

          {msg && <p className="text-sm text-red-600">{msg}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create session"}
          </button>
        </form>
      </section>
    </main>
  );
}
