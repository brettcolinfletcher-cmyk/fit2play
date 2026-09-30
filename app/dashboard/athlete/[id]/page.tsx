"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  FormEvent,
  ChangeEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import AthleteAvatar from "@/components/AthleteAvatar";
import AthleteDashboardBody, {
  parseAthleteViewData,
  type AthleteViewData,
} from "@/components/athletes/AthleteDashboardBody";
import { athleteHeaderStats } from "@/lib/athleteHeaderStats";
import {
  resolveTopView,
  visibilityFromRows,
  type AthleteViewSettings,
} from "@/lib/athleteViewSettings";
import type { NormalizedSession } from "@/lib/athleteDashboardData";
import { formatDisplayDate } from "@/lib/dateDisplay";
import {
  formatTestTypeLabel,
  isSprintLikeType,
  isForcePlateType,
} from "@/lib/athleteDashboardData";

type AthleteRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_sport: string | null;
  team: string | null;
  organisation: string | null;
  profile_image_url: string | null;
  top_view: string | null;
};

type InjuryRow = {
  id: string;
  diagnosis: string | null;
  body_region: string | null;
  side: string | null;
  date_injured: string | null;
  date_rtp: string | null;
  status: string | null;
  notes: string | null;
};

function createSupabaseBrowser() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function keyResultsLine(s: NormalizedSession): string {
  if (isSprintLikeType(s.testType)) {
    const parts: string[] = [];
    if (s.peakSpeed != null) parts.push(`Peak ${s.peakSpeed.toFixed(2)} m/s`);
    if (s.split05m != null) parts.push(`5m ${s.split05m.toFixed(2)} s`);
    return parts.length ? parts.join(" · ") : "—";
  }
  if (isForcePlateType(s.testType)) {
    const parts: string[] = [];
    if (s.jumpHeightCm != null) parts.push(`Jump ${s.jumpHeightCm.toFixed(1)} cm`);
    if (s.rsi != null) parts.push(`RSI ${s.rsi.toFixed(2)}`);
    return parts.length ? parts.join(" · ") : "—";
  }
  return "—";
}

export default function AthleteProfilePage() {
  const { id: athleteId } = useParams<{ id: string }>();
  const router = useRouter();

  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [sessions, setSessions] = useState<NormalizedSession[]>([]);
  const [injuries, setInjuries] = useState<InjuryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [injuryForm, setInjuryForm] = useState({
    diagnosis: "",
    body_region: "",
    side: "",
    date_injured: "",
    date_rtp: "",
    status: "",
    notes: "",
  });
  const [injurySaving, setInjurySaving] = useState(false);
  const [injuryError, setInjuryError] = useState<string | null>(null);
  const [viewData, setViewData] = useState<AthleteViewData | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  // Theme: Frosted (hardcoded)
  const t = {
    bg: "bg-[#f8fafc]",
    card: "bg-white",
    border: "border-gray-200",
    text: "text-slate-900",
    dataTheme: "light",
  };

  const loadData = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = createSupabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role === "athlete") {
        const { data: ownRecord } = await supabase
          .from("athletes")
          .select("id")
          .eq("id", athleteId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!ownRecord) {
          router.replace("/dashboard/athlete/me");
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/athlete-dashboard/${athleteId}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json?.error || "Failed to load athlete");
        setAthlete(null);
        setSessions([]);
        setInjuries([]);
        setViewData(null);
        return;
      }
      setAthlete(json.athlete as AthleteRow);
      setSessions((json.sessions as NormalizedSession[]) ?? []);
      setInjuries((json.injuries as InjuryRow[]) ?? []);
      setViewData(parseAthleteViewData(json));
    } catch {
      setLoadError("Failed to load athlete");
      setAthlete(null);
      setViewData(null);
    } finally {
      setLoading(false);
    }
  }, [athleteId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedDesc = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.sessionDate ?? b.createdAt).getTime() -
          new Date(a.sessionDate ?? a.createdAt).getTime()
      ),
    [sessions]
  );

  const headerStats = useMemo(
    () =>
      athleteHeaderStats(
        sessions.map((s) => ({ testType: s.testType, date: s.sessionDate ?? s.createdAt }))
      ),
    [sessions]
  );

  // What the practitioner has chosen this athlete sees (report builder, protocol,
  // and which top panel to open on). Resolved server-side in /api/athlete-dashboard
  // because those tables are staff-only under RLS.
  const viewSettings = useMemo<AthleteViewSettings | null>(
    () =>
      viewData
        ? { visibility: visibilityFromRows(viewData.reportVisibility), protocol: viewData.protocol }
        : null,
    [viewData]
  );
  const topView = resolveTopView(athlete?.top_view, viewData?.protocol ?? null);

  async function handleAddInjury(e: FormEvent) {
    e.preventDefault();
    if (!athleteId) return;

    setInjurySaving(true);
    setInjuryError(null);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("injuries").insert({
      athlete_id: athleteId,
      ...injuryForm,
    });

    if (error) {
      console.error(error);
      setInjuryError("Failed to save injury");
      setInjurySaving(false);
      return;
    }

    const { data } = await supabase
      .from("injuries")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("date_injured", { ascending: false });

    setInjuries((data as InjuryRow[]) || []);

    setInjuryForm({
      diagnosis: "",
      body_region: "",
      side: "",
      date_injured: "",
      date_rtp: "",
      status: "",
      notes: "",
    });

    setInjurySaving(false);
  }

  return (
    <main className={`min-h-screen ${t.bg} ${t.text} athlete-frosted`} data-theme={t.dataTheme}>
      <DashboardNav lightTheme />

      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm text-slate-500 hover:text-slate-800 transition"
          >
            ← Back to dashboard
          </button>
          <Link
            href={`/dashboard/athlete/${athleteId}/compare`}
            className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-gray-300 hover:text-slate-900"
          >
            Compare pre / post
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading athlete…</p>
        ) : loadError ? (
          <p className="text-sm text-rose-400">{loadError}</p>
        ) : !athlete ? (
          <p className="text-sm text-rose-400">Athlete not found.</p>
        ) : (
          <>
            {/* ── Header ─────────────────────────────────────────────── */}
            <header className={`relative overflow-hidden rounded-2xl border ${t.border} ${t.card} px-6 py-5`}>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#a3e63508_0%,_transparent_60%)]" />
              <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <AthleteAvatar
                    url={athlete.profile_image_url}
                    firstName={athlete.first_name}
                    lastName={athlete.last_name}
                    size={72}
                  />
                  <div>
                    <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">Athlete profile</p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-50">
                      {athlete.first_name} {athlete.last_name}
                    </h1>
                    <p className="mt-1 text-sm text-slate-400">
                      {[athlete.primary_sport, athlete.team].filter(Boolean).join(" · ")}
                      {athlete.organisation ? ` · ${athlete.organisation}` : ""}
                    </p>
                  </div>
                </div>
                <dl className="flex flex-wrap gap-5 md:text-right">
                  {headerStats.map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-[0.62rem] uppercase tracking-widest text-slate-500">{label}</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </header>

            {/* ── Dashboard body ──────────────────────────────────────── */}
            {/* Same component the practitioner's page renders, so both see the same thing.
                What shows here follows the practitioner's report builder, protocol and
                top-panel choice (see /api/athlete-dashboard). */}
            {viewData && viewSettings ? (
              <AthleteDashboardBody data={viewData} settings={viewSettings} topView={topView} />
            ) : null}

            {/* ── Admin (collapsed) ───────────────────────────────────── */}
            <div className="mt-12 space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-800" />
                <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">Admin</p>
                <div className="h-px flex-1 bg-slate-800" />
              </div>

              {/* Session history */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                  <h2 className="text-xs font-medium text-slate-400">Session history</h2>
                  <button
                    type="button"
                    onClick={() => setShowAllSessions((v) => !v)}
                    className="text-xs text-slate-500 transition hover:text-lime-300"
                  >
                    {showAllSessions ? "Hide" : `View all (${sortedDesc.length})`}
                  </button>
                </div>
                {showAllSessions && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3">Type</th>
                          <th className="px-5 py-3">Key results</th>
                          <th className="px-5 py-3">File</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {sortedDesc.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-xs text-slate-400">
                              No sessions recorded.
                            </td>
                          </tr>
                        ) : (
                          sortedDesc.map((s) => (
                            <tr
                              key={s.sessionId}
                              tabIndex={0}
                              role="link"
                              aria-label={`Open session ${formatTestTypeLabel(s.testType)}`}
                              className="cursor-pointer transition-colors hover:bg-slate-800/40"
                              onClick={() => router.push(`/dashboard/session/${s.sessionId}`)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  router.push(`/dashboard/session/${s.sessionId}`);
                                }
                              }}
                            >
                              <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-200">
                                {formatDisplayDate(s.sessionDate ?? s.createdAt)}
                              </td>
                              <td className="px-5 py-3 text-xs text-slate-200">
                                {formatTestTypeLabel(s.testType)}
                              </td>
                              <td className="px-5 py-3 text-xs text-slate-200">
                                {keyResultsLine(s)}
                              </td>
                              <td className="max-w-[200px] truncate px-5 py-3 text-xs text-slate-400">
                                {s.fileName ?? "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Injury / rehab */}
              <details className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <h2 className="text-xs font-medium text-slate-400">Injury &amp; rehab</h2>
                  <span className="text-xs text-slate-500 transition group-open:text-lime-300">
                    {injuries.length > 0 ? `${injuries.length} record${injuries.length !== 1 ? "s" : ""}` : "Add record"} ▾
                  </span>
                </summary>
                <div className="border-t border-slate-800 px-5 pb-5 pt-4">
                  <div className="space-y-4">
                    {injuries.length === 0 ? (
                      <p className="text-sm text-slate-400">No injuries recorded.</p>
                    ) : (
                      injuries.map((inj) => (
                        <div key={inj.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm">
                          <p className="font-semibold text-slate-50">{inj.diagnosis}</p>
                          <p className="mt-1 text-slate-300">
                            {inj.body_region}{inj.side ? ` (${inj.side})` : ""}
                          </p>
                          <p className="mt-2 text-xs text-slate-400">
                            Injured: {inj.date_injured ? formatDisplayDate(inj.date_injured) : "—"}
                            {inj.date_rtp ? ` · RTP: ${formatDisplayDate(inj.date_rtp)}` : ""}
                          </p>
                          {inj.status && <p className="mt-1 text-xs text-emerald-400">Status: {inj.status}</p>}
                          {inj.notes && <p className="mt-2 text-slate-300">{inj.notes}</p>}
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={handleAddInjury} className="mt-6 space-y-3 border-t border-slate-800 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Add record</p>
                    <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Diagnosis" value={injuryForm.diagnosis} onChange={(e: ChangeEvent<HTMLInputElement>) => setInjuryForm((f) => ({ ...f, diagnosis: e.target.value }))} required />
                    <div className="grid grid-cols-2 gap-3">
                      <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Body region" value={injuryForm.body_region} onChange={(e) => setInjuryForm((f) => ({ ...f, body_region: e.target.value }))} />
                      <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Side" value={injuryForm.side} onChange={(e) => setInjuryForm((f) => ({ ...f, side: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-1 text-xs text-slate-500">Date injured</p>
                        <input type="date" className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-lime-500 focus:outline-none" value={injuryForm.date_injured} onChange={(e) => setInjuryForm((f) => ({ ...f, date_injured: e.target.value }))} required />
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-slate-500">RTP date</p>
                        <input type="date" className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-lime-500 focus:outline-none" value={injuryForm.date_rtp} onChange={(e) => setInjuryForm((f) => ({ ...f, date_rtp: e.target.value }))} />
                      </div>
                    </div>
                    <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Status" value={injuryForm.status} onChange={(e) => setInjuryForm((f) => ({ ...f, status: e.target.value }))} />
                    <textarea className="min-h-[72px] w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Notes" value={injuryForm.notes} onChange={(e) => setInjuryForm((f) => ({ ...f, notes: e.target.value }))} />
                    {injuryError && <p className="text-xs text-rose-400">{injuryError}</p>}
                    <button type="submit" disabled={injurySaving} className="rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50">
                      {injurySaving ? "Saving…" : "Add injury"}
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

