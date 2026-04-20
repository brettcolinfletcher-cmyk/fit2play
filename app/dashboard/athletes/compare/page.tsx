"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import {
  computeBestInRangeData,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import { buildAthleteVsAthleteSections } from "@/lib/athleteVsAthleteComparison";
import { supabase } from "@/lib/supabaseClient";

type AthleteOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type InjuryRow = {
  id: string;
  athlete_id: string;
  body_region: string | null;
  date_injured: string | null;
  date_rtp: string | null;
};

function displayName(a: Pick<AthleteOption, "first_name" | "last_name">): string {
  const n = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  return n || "Athlete";
}

function regionKey(r: string | null | undefined): string {
  return (r ?? "").trim().toLowerCase();
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function unionWindowsForRegion(injuries: InjuryRow[], regionNorm: string): { start: string; end: string }[] {
  return injuries
    .filter((i) => regionKey(i.body_region) === regionNorm && i.date_injured)
    .map((i) => ({
      start: i.date_injured!.slice(0, 10),
      end: (i.date_rtp ?? todayYmd()).slice(0, 10),
    }));
}

function sessionInAnyWindow(sessionDate: string | null, windows: { start: string; end: string }[]): boolean {
  if (!sessionDate || windows.length === 0) return false;
  const d = sessionDate.slice(0, 10);
  return windows.some((w) => d >= w.start && d <= w.end);
}

function commonBodyRegionLabels(injA: InjuryRow[], injB: InjuryRow[]): string[] {
  const keysB = new Set(injB.map((i) => regionKey(i.body_region)).filter(Boolean));
  const map = new Map<string, string>();
  for (const i of injA) {
    const k = regionKey(i.body_region);
    if (!k || !keysB.has(k)) continue;
    if (!map.has(k)) map.set(k, (i.body_region ?? "").trim());
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

async function fetchMetricsMap(sessionIds: string[]): Promise<Map<string, ReportMetricRow[]>> {
  const map = new Map<string, ReportMetricRow[]>();
  if (sessionIds.length === 0) return map;
  const { data: mrows, error } = await supabase
    .from("metrics")
    .select("session_id, key, value, rep_index")
    .in("session_id", sessionIds);
  if (error) throw new Error(error.message);
  for (const row of (mrows ?? []) as ReportMetricRow[]) {
    const list = map.get(row.session_id) ?? [];
    list.push(row);
    map.set(row.session_id, list);
  }
  return map;
}

export default function AthleteComparePage() {
  const staffOk = useRequireDashboardStaff();
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [athleteAId, setAthleteAId] = useState<string>("");
  const [athleteBId, setAthleteBId] = useState<string>("");
  const [injuryFilter, setInjuryFilter] = useState(false);
  const [bodyRegion, setBodyRegion] = useState<string>("");
  const [injuriesA, setInjuriesA] = useState<InjuryRow[]>([]);
  const [injuriesB, setInjuriesB] = useState<InjuryRow[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [sections, setSections] = useState<ReturnType<typeof buildAthleteVsAthleteSections>>([]);
  const [compared, setCompared] = useState(false);

  useEffect(() => {
    if (!staffOk) return;
    let cancelled = false;
    (async () => {
      setLoadingAthletes(true);
      const { data, error: e } = await supabase
        .from("athletes")
        .select("id, first_name, last_name")
        .order("last_name", { ascending: true });
      if (cancelled) return;
      if (e) {
        setError(e.message);
        setLoadingAthletes(false);
        return;
      }
      setAthletes((data ?? []) as AthleteOption[]);
      setLoadingAthletes(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk]);

  const loadInjuries = useCallback(async (aId: string, bId: string) => {
    if (!aId || !bId) {
      setInjuriesA([]);
      setInjuriesB([]);
      setBodyRegion("");
      return;
    }
    const [ia, ib] = await Promise.all([
      supabase.from("injuries").select("id, athlete_id, body_region, date_injured, date_rtp").eq("athlete_id", aId),
      supabase.from("injuries").select("id, athlete_id, body_region, date_injured, date_rtp").eq("athlete_id", bId),
    ]);
    setInjuriesA((ia.data ?? []) as InjuryRow[]);
    setInjuriesB((ib.data ?? []) as InjuryRow[]);
    setBodyRegion("");
  }, []);

  useEffect(() => {
    if (!staffOk || !injuryFilter) return;
    if (!athleteAId || !athleteBId) return;
    void loadInjuries(athleteAId, athleteBId);
  }, [staffOk, injuryFilter, athleteAId, athleteBId, loadInjuries]);

  const commonRegions = useMemo(
    () => commonBodyRegionLabels(injuriesA, injuriesB),
    [injuriesA, injuriesB]
  );

  const injuryWarning =
    injuryFilter && athleteAId && athleteBId && commonRegions.length === 0;

  const runCompare = useCallback(async () => {
    setError(null);
    setCompared(false);
    setSections([]);
    if (!athleteAId || !athleteBId) {
      setError("Select both athletes.");
      return;
    }
    if (athleteAId === athleteBId) {
      setError("Choose two different athletes.");
      return;
    }

    let injA: InjuryRow[] = [];
    let injB: InjuryRow[] = [];
    if (injuryFilter) {
      const [ia, ib] = await Promise.all([
        supabase
          .from("injuries")
          .select("id, athlete_id, body_region, date_injured, date_rtp")
          .eq("athlete_id", athleteAId),
        supabase
          .from("injuries")
          .select("id, athlete_id, body_region, date_injured, date_rtp")
          .eq("athlete_id", athleteBId),
      ]);
      injA = (ia.data ?? []) as InjuryRow[];
      injB = (ib.data ?? []) as InjuryRow[];
      setInjuriesA(injA);
      setInjuriesB(injB);
      const regions = commonBodyRegionLabels(injA, injB);
      if (regions.length === 0) {
        setError("No matching injury history found for both athletes.");
        return;
      }
      if (!bodyRegion.trim() || !regions.includes(bodyRegion)) {
        setError("Select a body region for the injury filter.");
        return;
      }
    }

    setCompareLoading(true);
    try {
      const aOpt = athletes.find((x) => x.id === athleteAId);
      const bOpt = athletes.find((x) => x.id === athleteBId);
      setNameA(aOpt ? displayName(aOpt) : "");
      setNameB(bOpt ? displayName(bOpt) : "");

      const [aSessionsRes, bSessionsRes] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, session_date, test_type, test_sub_type, source")
          .eq("athlete_id", athleteAId)
          .order("session_date", { ascending: true }),
        supabase
          .from("sessions")
          .select("id, session_date, test_type, test_sub_type, source")
          .eq("athlete_id", athleteBId)
          .order("session_date", { ascending: true }),
      ]);
      if (aSessionsRes.error) throw new Error(aSessionsRes.error.message);
      if (bSessionsRes.error) throw new Error(bSessionsRes.error.message);

      let sessionsA = (aSessionsRes.data ?? []) as ReportSessionRow[];
      let sessionsB = (bSessionsRes.data ?? []) as ReportSessionRow[];

      if (injuryFilter && bodyRegion.trim()) {
        const rk = regionKey(bodyRegion);
        const wa = unionWindowsForRegion(injA, rk);
        const wb = unionWindowsForRegion(injB, rk);
        sessionsA = sessionsA.filter((s) => sessionInAnyWindow(s.session_date, wa));
        sessionsB = sessionsB.filter((s) => sessionInAnyWindow(s.session_date, wb));
      }

      const idsA = sessionsA.map((s) => s.id);
      const idsB = sessionsB.map((s) => s.id);
      const [mapA, mapB, hopARes, hopBRes] = await Promise.all([
        fetchMetricsMap(idsA),
        fetchMetricsMap(idsB),
        supabase
          .from("hop_tests")
          .select("session_date, test_type, side, best_cm")
          .eq("athlete_id", athleteAId)
          .order("session_date", { ascending: true }),
        supabase
          .from("hop_tests")
          .select("session_date, test_type, side, best_cm")
          .eq("athlete_id", athleteBId)
          .order("session_date", { ascending: true }),
      ]);
      if (hopARes.error) throw new Error(hopARes.error.message);
      if (hopBRes.error) throw new Error(hopBRes.error.message);

      let hopsA = (hopARes.data ?? []) as ReportHopTestRow[];
      let hopsB = (hopBRes.data ?? []) as ReportHopTestRow[];

      if (injuryFilter && bodyRegion.trim()) {
        const rk = regionKey(bodyRegion);
        const wa = unionWindowsForRegion(injA, rk);
        const wb = unionWindowsForRegion(injB, rk);
        hopsA = hopsA.filter((h) => sessionInAnyWindow(h.session_date, wa));
        hopsB = hopsB.filter((h) => sessionInAnyWindow(h.session_date, wb));
      }

      const bestA = computeBestInRangeData(sessionsA, mapA, hopsA);
      const bestB = computeBestInRangeData(sessionsB, mapB, hopsB);
      setSections(buildAthleteVsAthleteSections(bestA, bestB));
      setCompared(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setCompareLoading(false);
    }
  }, [athleteAId, athleteBId, athletes, bodyRegion, injuryFilter]);

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  const tableWrap = "mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/50";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-20">
        <h1 className="text-xl font-semibold uppercase tracking-wide text-lime-300">
          Athlete comparison
        </h1>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-400">Athlete A</label>
            <select
              value={athleteAId}
              onChange={(e) => setAthleteAId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">—</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {displayName(a)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Athlete B</label>
            <select
              value={athleteBId}
              onChange={(e) => setAthleteBId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">—</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {displayName(a)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={injuryFilter}
              onChange={(e) => {
                setInjuryFilter(e.target.checked);
                if (!e.target.checked) setBodyRegion("");
              }}
              className="rounded border-slate-600 bg-slate-950 text-lime-500"
            />
            Injury filter
          </label>
          {injuryFilter ? (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-400">Body region</label>
              <select
                value={bodyRegion}
                onChange={(e) => setBodyRegion(e.target.value)}
                disabled={commonRegions.length === 0}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
              >
                <option value="">— Select —</option>
                {commonRegions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {injuryWarning ? (
                <p className="mt-2 text-xs text-amber-300/90">
                  No matching injury history found for both athletes.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void runCompare()}
          disabled={compareLoading || loadingAthletes}
          className="mt-6 rounded-full border border-lime-500/50 bg-lime-500/15 px-6 py-2 text-sm font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50"
        >
          {compareLoading ? "Comparing…" : "Compare"}
        </button>

        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

        {compared && !error ? (
          <div className="mt-10 space-y-8">
            {sections.length === 0 ? (
              <p className="text-sm text-slate-500">No overlapping comparison data for these athletes.</p>
            ) : (
              sections.map((sec) => (
                <div key={sec.id}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {sec.title}
                  </h2>
                  <div className={tableWrap}>
                    <table className="w-full min-w-[420px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                          <th className="px-3 py-2 font-medium">Metric</th>
                          <th className="px-3 py-2 font-medium">{nameA || "Athlete A"}</th>
                          <th className="px-3 py-2 font-medium">{nameB || "Athlete B"}</th>
                          <th className="px-3 py-2 font-medium">Δ</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        {sec.rows.map((row) => (
                          <tr key={row.label} className="border-b border-slate-800/80">
                            <td className="px-3 py-2 text-slate-400">{row.label}</td>
                            <td className="px-3 py-2 font-mono">{row.va}</td>
                            <td className="px-3 py-2 font-mono">{row.vb}</td>
                            <td className={`px-3 py-2 font-mono ${row.delta.className}`}>{row.delta.text}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
