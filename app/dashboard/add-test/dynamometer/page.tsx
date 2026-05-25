"use client";

import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import { parseDynamometerCsvToMetrics } from "@/lib/dynamometerCsv";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";

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

type EntryMode = "manual" | "csv";

export default function AddTestDynamometerPage() {
  const router = useRouter();
  const staffOk = useRequireDashboardStaff();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [mode, setMode] = useState<EntryMode>("manual");
  const [testSubType, setTestSubType] = useState("hip_abduction");
  const [peakForce, setPeakForce] = useState("");
  const [rfd, setRfd] = useState("");
  const [asymmetryPct, setAsymmetryPct] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!athleteId) {
      setMsg("Select an athlete.");
      return;
    }

    let metrics: Record<string, number | null> = {};
    let fileName: string | null = null;
    let subForSession: string | null = null;

    if (mode === "manual") {
      subForSession = testSubType;
      const pf = peakForce.trim() ? Number(peakForce) : null;
      const r = rfd.trim() ? Number(rfd) : null;
      const asym = asymmetryPct.trim() ? Number(asymmetryPct) : null;
      if (pf != null && !Number.isNaN(pf)) metrics.dyno_peak_force = pf;
      if (r != null && !Number.isNaN(r)) metrics.dyno_rfd = r;
      if (asym != null && !Number.isNaN(asym)) metrics.dyno_asymmetry_pct = asym;
    } else {
      try {
        metrics = parseDynamometerCsvToMetrics(csvText) as Record<
          string,
          number | null
        >;
        fileName = csvFileName;
        subForSession = "csv_import";
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Invalid CSV.");
        return;
      }
    }

    if (Object.keys(metrics).length === 0) {
      setMsg(
        mode === "manual"
          ? "Enter at least one metric."
          : "No metrics parsed from CSV."
      );
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
          testSubType: subForSession,
          fileName,
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

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsvFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsText(f);
  }

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-lime-500 focus:outline-none";
  const labelCls = "text-[11px] font-medium uppercase tracking-wider text-slate-500";
  const subLabelCls = "text-xs text-slate-400";

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
            Handheld dynamometer
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Manual entry or upload a CSV with Movement, Leg, Peak Force (N), and
            optional RFD (N/s).
          </p>
        </header>

        <div className="mb-4 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("manual");
              setMsg(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
              mode === "manual"
                ? "bg-lime-400 text-slate-950"
                : "text-slate-300 hover:bg-slate-800/60"
            }`}
          >
            Manual entry
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("csv");
              setMsg(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
              mode === "csv"
                ? "bg-lime-400 text-slate-950"
                : "text-slate-300 hover:bg-slate-800/60"
            }`}
          >
            Upload CSV
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-lime-400/10"
        >
          <div>
            <label className={labelCls}>Athlete</label>
            <select
              className={inputCls}
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

          {mode === "manual" ? (
            <>
              <div>
                <label className={labelCls}>Test</label>
                <select
                  className={inputCls}
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
                <label className={subLabelCls}>Peak force (N)</label>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={peakForce}
                  onChange={(e) => setPeakForce(e.target.value)}
                />
              </div>
              <div>
                <label className={subLabelCls}>
                  Rate of force development (N/s)
                </label>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={rfd}
                  onChange={(e) => setRfd(e.target.value)}
                />
              </div>
              <div>
                <label className={subLabelCls}>Asymmetry (%)</label>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={asymmetryPct}
                  onChange={(e) => setAsymmetryPct(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={labelCls}>CSV file</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-lime-400 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950 hover:file:brightness-110"
                  onChange={onFileChange}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Columns:{" "}
                  <span className="font-mono text-[0.65rem] text-slate-400">
                    Movement, Leg, Peak Force (N), RFD (N/s)
                  </span>
                  . Leg must be Left or Right per row.
                </p>
              </div>
              <div>
                <label className={subLabelCls}>Or paste CSV text</label>
                <textarea
                  className="mt-1 min-h-[140px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={`Movement,Leg,Peak Force (N),RFD (N/s)\nKnee Extension,Left,120,450\nKnee Extension,Right,118,440`}
                />
              </div>
            </>
          )}

          {msg && <p className="text-sm text-rose-400">{msg}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-lime-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create session"}
          </button>
        </form>
      </section>
    </main>
  );
}
