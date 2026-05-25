"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

const TEST_OPTIONS = [
  { value: "slhd", label: "Single Leg Hop (SLHD)" },
  { value: "thd", label: "Triple Hop (THD)" },
  { value: "thcod", label: "Triple Hop Crossover (THCOD)" },
  { value: "medial_hop", label: "Medial Hop" },
  { value: "lateral_hop", label: "Lateral Hop" },
] as const;

type HopTestRow = {
  id: string;
  athlete_id: string;
  session_date: string;
  test_type: string;
  side: string;
  trial_1_cm: number | null;
  trial_2_cm: number | null;
  trial_3_cm: number | null;
  best_cm: number | null;
  clinician_notes: string | null;
  created_at: string;
};

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

function todayDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseTrialCm(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function bestFromTrials(t1: string, t2: string, t3: string): number | null {
  const vals = [parseTrialCm(t1), parseTrialCm(t2), parseTrialCm(t3)].filter(
    (v): v is number => v != null
  );
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

function computeLsi(leftBest: number | null, rightBest: number | null): number | null {
  if (leftBest == null || rightBest == null) return null;
  const lo = Math.min(leftBest, rightBest);
  const hi = Math.max(leftBest, rightBest);
  if (hi <= 0) return null;
  return Math.round((lo / hi) * 100);
}

function lsiColorClass(lsi: number | null): string {
  if (lsi == null) return "text-slate-500";
  if (lsi >= 90) return "text-lime-400";
  if (lsi >= 80) return "text-amber-400";
  return "text-rose-400";
}

export default function HopTestsPage() {
  const { id: athleteId } = useParams<{ id: string }>();
  const staffOk = useRequireDashboardStaff();

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [history, setHistory] = useState<HopTestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [sessionDate, setSessionDate] = useState(todayDateLocal);
  const [testType, setTestType] = useState<string>("slhd");
  const [leftTrials, setLeftTrials] = useState<[string, string, string]>(["", "", ""]);
  const [rightTrials, setRightTrials] = useState<[string, string, string]>(["", "", ""]);
  const [hopFormNotes, setHopFormNotes] = useState("");

  const load = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    setError(null);
    const { data: a, error: aErr } = await supabase
      .from("athletes")
      .select("id, first_name, last_name")
      .eq("id", athleteId)
      .maybeSingle();
    if (aErr || !a) {
      setError(aErr?.message ?? "Athlete not found");
      setAthlete(null);
      setHistory([]);
      setLoading(false);
      return;
    }
    setAthlete(a as Athlete);

    const { data: hops, error: hErr } = await supabase
      .from("hop_tests")
      .select(
        "id, athlete_id, session_date, test_type, side, trial_1_cm, trial_2_cm, trial_3_cm, best_cm, clinician_notes, created_at"
      )
      .eq("athlete_id", athleteId)
      .order("session_date", { ascending: false })
      .order("test_type")
      .order("side");

    if (hErr) {
      setError(hErr.message);
      setHistory([]);
    } else {
      setHistory((hops ?? []) as HopTestRow[]);
    }
    setLoading(false);
  }, [athleteId]);

  useEffect(() => {
    if (!staffOk || !athleteId) return;
    void load();
  }, [staffOk, athleteId, load]);

  const leftBest = useMemo(
    () => bestFromTrials(leftTrials[0], leftTrials[1], leftTrials[2]),
    [leftTrials]
  );
  const rightBest = useMemo(
    () => bestFromTrials(rightTrials[0], rightTrials[1], rightTrials[2]),
    [rightTrials]
  );
  const lsi = useMemo(() => computeLsi(leftBest, rightBest), [leftBest, rightBest]);

  const historyByDate = useMemo(() => {
    const map = new Map<string, HopTestRow[]>();
    for (const r of history) {
      const d = String(r.session_date).slice(0, 10);
      const list = map.get(d) ?? [];
      list.push(r);
      map.set(d, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  const name = athlete
    ? `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() || "Athlete"
    : "";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!athleteId) return;
    setSaveMsg(null);
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const notes = hopFormNotes.trim() || null;

      const rows = [
        {
          athlete_id: athleteId,
          session_id: null,
          session_date: sessionDate,
          test_type: testType,
          side: "left",
          trial_1_cm: parseTrialCm(leftTrials[0]),
          trial_2_cm: parseTrialCm(leftTrials[1]),
          trial_3_cm: parseTrialCm(leftTrials[2]),
          clinician_notes: notes,
          created_by: user?.id ?? null,
        },
        {
          athlete_id: athleteId,
          session_id: null,
          session_date: sessionDate,
          test_type: testType,
          side: "right",
          trial_1_cm: parseTrialCm(rightTrials[0]),
          trial_2_cm: parseTrialCm(rightTrials[1]),
          trial_3_cm: parseTrialCm(rightTrials[2]),
          clinician_notes: notes,
          created_by: user?.id ?? null,
        },
      ];

      const { error: upErr } = await supabase.from("hop_tests").upsert(rows, {
        onConflict: "athlete_id,session_date,test_type,side",
      });

      if (upErr) {
        setSaveMsg(upErr.message);
      } else {
        setSaveMsg("Saved.");
        setLeftTrials(["", "", ""]);
        setRightTrials(["", "", ""]);
        setHopFormNotes("");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

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
      <section className="mx-auto max-w-3xl px-4 pt-8 pb-20">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/dashboard/athletes/${athleteId}`}
            className="text-xs text-slate-400 hover:text-lime-300"
          >
            ← Back to athlete
          </Link>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : error && !athlete ? (
          <p className="mt-8 text-sm text-rose-400">{error}</p>
        ) : (
          <>
            <header className="mt-6">
              <h1 className="text-xl font-semibold text-slate-50">{name}</h1>
              <p className="mt-1 text-xs text-slate-500">Hop test entry</p>
            </header>

            <form
              onSubmit={handleSave}
              className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-400">
                    Session date
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400">
                    Test type
                  </label>
                  <select
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  >
                    {TEST_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                      <th className="py-2 pr-3">Side</th>
                      <th className="py-2 pr-3">Trial 1 (cm)</th>
                      <th className="py-2 pr-3">Trial 2 (cm)</th>
                      <th className="py-2 pr-3">Trial 3 (cm)</th>
                      <th className="py-2">Best (cm)</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    <tr className="border-b border-slate-800/80">
                      <td className="py-3 pr-3 font-medium text-lime-300/90">Left</td>
                      {[0, 1, 2].map((i) => (
                        <td key={`l-${i}`} className="py-2 pr-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={leftTrials[i]}
                            onChange={(e) => {
                              const next = [...leftTrials] as [string, string, string];
                              next[i] = e.target.value;
                              setLeftTrials(next);
                            }}
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-mono"
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="py-2 font-mono text-lime-300">
                        {leftBest != null ? leftBest.toFixed(1) : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 font-medium text-sky-300/90">Right</td>
                      {[0, 1, 2].map((i) => (
                        <td key={`r-${i}`} className="py-2 pr-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rightTrials[i]}
                            onChange={(e) => {
                              const next = [...rightTrials] as [string, string, string];
                              next[i] = e.target.value;
                              setRightTrials(next);
                            }}
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-mono"
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="py-2 font-mono text-sky-300">
                        {rightBest != null ? rightBest.toFixed(1) : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-800 pt-4">
                <span className="text-xs font-medium text-slate-400">
                  LSI (limb symmetry index)
                </span>
                <span className={`text-lg font-semibold tabular-nums ${lsiColorClass(lsi)}`}>
                  {lsi != null ? `${lsi}%` : "—"}
                </span>
              </div>
              <p className="mt-1 text-[0.65rem] text-slate-500">
                Lower score side treated as involved: (min / max) × 100. ≥90% green, 80–89% amber,
                &lt;80% red.
              </p>

              <div className="mt-6">
                <label className="block text-xs font-medium text-slate-400">
                  Clinician notes (optional)
                </label>
                <textarea
                  value={hopFormNotes}
                  onChange={(e) => setHopFormNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                  placeholder="Notes for this hop test entry…"
                />
              </div>

              {saveMsg && (
                <p
                  className={`mt-3 text-xs ${saveMsg === "Saved." ? "text-lime-400" : "text-rose-400"}`}
                >
                  {saveMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-6 rounded-full bg-lime-400 px-6 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save test"}
              </button>
            </form>

            <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-lime-300">
              Past hop tests
            </h2>
            <div className="mt-4 space-y-8">
              {historyByDate.length === 0 ? (
                <p className="text-xs text-slate-500">No hop tests recorded yet.</p>
              ) : (
                historyByDate.map(([date, rows]) => (
                  <div
                    key={date}
                    className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                  >
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {date}
                    </h3>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500">
                            <th className="py-2 pr-2">Test</th>
                            <th className="py-2 pr-2">Side</th>
                            <th className="py-2 pr-2">T1</th>
                            <th className="py-2 pr-2">T2</th>
                            <th className="py-2 pr-2">T3</th>
                            <th className="py-2 pr-2">Best</th>
                            <th className="py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-300">
                          {rows.map((r) => (
                            <tr key={r.id} className="border-b border-slate-800/60">
                              <td className="py-2 pr-2 font-mono">{r.test_type}</td>
                              <td className="py-2 pr-2 capitalize">{r.side}</td>
                              <td className="py-2 pr-2 font-mono">
                                {r.trial_1_cm != null ? String(r.trial_1_cm) : "—"}
                              </td>
                              <td className="py-2 pr-2 font-mono">
                                {r.trial_2_cm != null ? String(r.trial_2_cm) : "—"}
                              </td>
                              <td className="py-2 pr-2 font-mono">
                                {r.trial_3_cm != null ? String(r.trial_3_cm) : "—"}
                              </td>
                              <td className="py-2 pr-2 font-mono text-lime-300/90">
                                {r.best_cm != null ? String(r.best_cm) : "—"}
                              </td>
                              <td className="max-w-[200px] truncate py-2 text-slate-500" title={r.clinician_notes ?? ""}>
                                {r.clinician_notes ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
