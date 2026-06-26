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
import AthleteRingPanel from "@/components/AthleteRingPanel";
import AthleteTestSummary from "@/components/AthleteTestSummary";
import SprintTrendPanel, {
  type SprintReportRow,
} from "@/components/SprintTrendPanel";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { NormalizedSession } from "@/lib/athleteDashboardData";
import { formatDisplayDate } from "@/lib/dateDisplay";
import {
  BENCHMARK_JUMP_HEIGHT_CM,
  formatTestTypeLabel,
  isDynamometerType,
  isForcePlateType,
  isSprintLikeType,
} from "@/lib/athleteDashboardData";

type AthleteRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_sport: string | null;
  team: string | null;
  organisation: string | null;
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
    if (s.peakSpeed != null) {
      parts.push(`Peak ${s.peakSpeed.toFixed(2)} m/s`);
    }
    if (s.split05m != null) {
      parts.push(`5m ${s.split05m.toFixed(2)} s`);
    }
    return parts.length ? parts.join(" · ") : "—";
  }
  if (isForcePlateType(s.testType)) {
    const parts: string[] = [];
    if (s.jumpHeightCm != null) {
      parts.push(`Jump ${s.jumpHeightCm.toFixed(1)} cm`);
    }
    if (s.rsi != null) {
      parts.push(`RSI ${s.rsi.toFixed(2)}`);
    }
    return parts.length ? parts.join(" · ") : "—";
  }
  if (isDynamometerType(s.testType)) {
    const parts: string[] = [];
    if (s.dynoPeakForce != null) {
      parts.push(`PF ${s.dynoPeakForce.toFixed(0)} N`);
    }
    if (s.dynoRfd != null) {
      parts.push(`RFD ${s.dynoRfd.toFixed(0)}`);
    }
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
  const [metricLatest, setMetricLatest] = useState<Record<string, number>>({});
  const [metricPrev, setMetricPrev] = useState<Record<string, number>>({});
  const [metricSides, setMetricSides] = useState<Record<string, number>>({});
  const [sectionComments, setSectionComments] = useState<Record<string, string>>({});
  const [showAllSessions, setShowAllSessions] = useState(false);

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
        setMetricLatest({});
        setMetricPrev({});
        setMetricSides({});
        return;
      }
      setAthlete(json.athlete as AthleteRow);
      setSessions((json.sessions as NormalizedSession[]) ?? []);
      setInjuries((json.injuries as InjuryRow[]) ?? []);
      setMetricLatest((json.metricLatest as Record<string, number>) ?? {});
      setMetricPrev((json.metricPrev as Record<string, number>) ?? {});
      setMetricSides((json.metricSides as Record<string, number>) ?? {});
      setSectionComments((json.sectionComments as Record<string, string>) ?? {});
    } catch {
      setLoadError("Failed to load athlete");
      setAthlete(null);
      setMetricLatest({});
      setMetricPrev({});
      setMetricSides({});
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

  const sprintChrono = useMemo(
    () =>
      sessions
        .filter((s) => isSprintLikeType(s.testType))
        .sort(
          (a, b) =>
            new Date(a.sessionDate ?? a.createdAt).getTime() -
            new Date(b.sessionDate ?? b.createdAt).getTime()
        ),
    [sessions]
  );

  const fpChrono = useMemo(
    () =>
      sessions
        .filter((s) => isForcePlateType(s.testType))
        .sort(
          (a, b) =>
            new Date(a.sessionDate ?? a.createdAt).getTime() -
            new Date(b.sessionDate ?? b.createdAt).getTime()
        ),
    [sessions]
  );

  const dynoChrono = useMemo(
    () =>
      sessions
        .filter((s) => isDynamometerType(s.testType))
        .sort(
          (a, b) =>
            new Date(a.sessionDate ?? a.createdAt).getTime() -
            new Date(b.sessionDate ?? b.createdAt).getTime()
        ),
    [sessions]
  );

  const cmjChrono = useMemo(
    () => fpChrono.filter((s) => s.testType === "force_plate_cmj"),
    [fpChrono]
  );

  const lastTestDate = useMemo(() => {
    if (!sessions.length) return null;
    const t = Math.max(
      ...sessions.map((s) => new Date(s.sessionDate ?? s.createdAt).getTime())
    );
    return new Date(t);
  }, [sessions]);

  // One sprint row per date (best peak speed) so "vs previous" compares dates,
  // not two runs on the same day.
  const sprintByDate = useMemo(() => {
    const map = new Map<string, NormalizedSession>();
    for (const s of sprintChrono) {
      const d = (s.sessionDate ?? s.createdAt).slice(0, 10);
      const cur = map.get(d);
      if (!cur || (s.peakSpeed ?? -Infinity) > (cur.peakSpeed ?? -Infinity)) {
        map.set(d, s);
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        new Date(a.sessionDate ?? a.createdAt).getTime() -
        new Date(b.sessionDate ?? b.createdAt).getTime()
    );
  }, [sprintChrono]);

  const lastSprintDomain = useMemo(() => {
    const arr = sessions.filter((s) => isSprintLikeType(s.testType));
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.sessionDate ?? s.createdAt).getTime()))
    );
  }, [sessions]);

  const lastForcePlateDomain = useMemo(() => {
    const arr = sessions.filter((s) => isForcePlateType(s.testType));
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.sessionDate ?? s.createdAt).getTime()))
    );
  }, [sessions]);

  const lastDynoDomain = useMemo(() => {
    const arr = sessions.filter((s) => isDynamometerType(s.testType));
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.sessionDate ?? s.createdAt).getTime()))
    );
  }, [sessions]);

  const sprintReportRows = useMemo<SprintReportRow[]>(
    () =>
      sprintByDate.map((s) => ({
        date: formatDisplayDate(s.sessionDate ?? s.createdAt),
        rawDate: s.sessionDate ?? s.createdAt,
        topSpeed: s.peakSpeed,
        totalTime: s.totalTime,
        split5m: s.split05m,
        maxAcceleration: s.maxAcceleration,
      })),
    [sprintByDate]
  );

  const jumpChartData = useMemo(
    () =>
      cmjChrono
        .filter((s) => s.jumpHeightCm != null)
        .map((s) => ({
          label: formatDisplayDate(s.sessionDate ?? s.createdAt),
          jumpHeight: s.jumpHeightCm,
        })),
    [cmjChrono]
  );

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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm text-slate-400 hover:text-lime-300"
          >
            ← Back to dashboard
          </button>
          <Link
            href={`/dashboard/athlete/${athleteId}/compare`}
            className="rounded-full border border-slate-800 bg-slate-900/40 px-4 py-1.5 text-xs font-medium text-slate-200 transition hover:border-lime-400/40 hover:text-lime-300"
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
            {/* Header */}
            <header className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 shadow-xl shadow-lime-400/10">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-slate-50">
                    {athlete.first_name} {athlete.last_name}
                  </h1>
                  <p className="mt-1 text-sm text-slate-400">
                    {[athlete.primary_sport, athlete.team]
                      .filter(Boolean)
                      .join(" · ")}
                    {athlete.organisation ? ` · ${athlete.organisation}` : ""}
                  </p>
                </div>
                <dl className="flex flex-wrap gap-6 text-sm md:text-right">
                  <div>
                    <dt className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Last test (any)
                    </dt>
                    <dd className="font-medium text-slate-50">
                      {lastTestDate ? formatDisplayDate(lastTestDate) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Sprint last
                    </dt>
                    <dd className="font-medium text-slate-50">
                      {lastSprintDomain ? formatDisplayDate(lastSprintDomain) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Force plate last
                    </dt>
                    <dd className="font-medium text-slate-50">
                      {lastForcePlateDomain ? formatDisplayDate(lastForcePlateDomain) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Dynamometer last
                    </dt>
                    <dd className="font-medium text-slate-50">
                      {lastDynoDomain ? formatDisplayDate(lastDynoDomain) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Sessions
                    </dt>
                    <dd className="font-medium text-slate-50">
                      {sessions.length}
                    </dd>
                  </div>
                </dl>
              </div>
            </header>

            {/* Performance rings */}
            <div className="mt-6">
              <AthleteRingPanel
                metricLatest={metricLatest}
                metricPrev={metricPrev}
              />
            </div>

            <AthleteTestSummary
              metricLatest={metricLatest}
              metricPrev={metricPrev}
              metricSides={metricSides}
              sectionComments={sectionComments}
            />

            {/* Sprint trend — chart + longitudinal table */}
            <div className="mt-6">
              <SprintTrendPanel rows={sprintReportRows} />
            </div>

            {/* Jump height trend */}
            <div className="mt-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <h2 className="text-xs uppercase tracking-wide text-slate-500">
                  Force plate — jump height
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Benchmark {BENCHMARK_JUMP_HEIGHT_CM} cm (dashed)
                </p>
                {jumpChartData.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-400">
                    No jump height data in force plate sessions yet.
                  </p>
                ) : (
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={jumpChartData}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                        />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            border: "1px solid #334155",
                            borderRadius: 10,
                            fontSize: 12,
                            color: "#e2e8f0",
                          }}
                        />
                        <ReferenceLine
                          y={BENCHMARK_JUMP_HEIGHT_CM}
                          stroke="#94a3b8"
                          strokeDasharray="6 4"
                        />
                        <Line
                          type="monotone"
                          dataKey="jumpHeight"
                          name="Jump height"
                          stroke="#84cc16"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="text-xs uppercase tracking-wide text-slate-500">
                Dynamometer
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Last tested:{" "}
                {lastDynoDomain ? formatDisplayDate(lastDynoDomain) : "—"}
              </p>
              {dynoChrono.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">
                  No dynamometer sessions yet.
                </p>
              ) : (
                <div className="mt-3 text-xs text-slate-200">
                  <p>
                    Latest session:{" "}
                    <span className="font-semibold tabular-nums text-slate-50">
                      {keyResultsLine(dynoChrono[dynoChrono.length - 1])}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Session history */}
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <h2 className="text-xs uppercase tracking-wide text-slate-500">
                  Session history
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAllSessions((v) => !v)}
                  className="text-xs font-medium text-slate-400 transition hover:text-lime-300"
                >
                  {showAllSessions
                    ? "Hide"
                    : `View all sessions (${sortedDesc.length})`}
                </button>
              </div>
              {showAllSessions && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Test type</th>
                      <th className="px-5 py-3">Key results</th>
                      <th className="px-5 py-3">File</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {sortedDesc.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-center text-xs text-slate-400"
                        >
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
                          onClick={() =>
                            router.push(`/dashboard/session/${s.sessionId}`)
                          }
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
            <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="text-xs uppercase tracking-wide text-slate-500">
                Injury &amp; rehab
              </h2>

              <div className="mt-4 space-y-4">
                {injuries.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No injuries recorded.
                  </p>
                ) : (
                  injuries.map((inj) => (
                    <div
                      key={inj.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm"
                    >
                      <p className="font-semibold text-slate-50">
                        {inj.diagnosis}
                      </p>
                      <p className="mt-1 text-slate-300">
                        {inj.body_region}
                        {inj.side ? ` (${inj.side})` : ""}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        Injured:{" "}
                        {inj.date_injured ? formatDisplayDate(inj.date_injured) : "—"}
                        {inj.date_rtp ? ` · RTP: ${formatDisplayDate(inj.date_rtp)}` : ""}
                      </p>
                      {inj.status && (
                        <p className="mt-1 text-xs text-emerald-400">
                          Status: {inj.status}
                        </p>
                      )}
                      {inj.notes && (
                        <p className="mt-2 text-slate-300">{inj.notes}</p>
                      )}
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleAddInjury}
                className="mt-8 space-y-3 border-t border-slate-800 pt-6"
              >
                <p className="text-sm font-medium text-slate-50">
                  Add injury record
                </p>
                <input
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none"
                  placeholder="Diagnosis"
                  value={injuryForm.diagnosis}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setInjuryForm((f) => ({
                      ...f,
                      diagnosis: e.target.value,
                    }))
                  }
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none"
                    placeholder="Body region"
                    value={injuryForm.body_region}
                    onChange={(e) =>
                      setInjuryForm((f) => ({
                        ...f,
                        body_region: e.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none"
                    placeholder="Side"
                    value={injuryForm.side}
                    onChange={(e) =>
                      setInjuryForm((f) => ({ ...f, side: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs text-slate-400">Date injured</p>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-lime-500 focus:outline-none"
                      value={injuryForm.date_injured}
                      onChange={(e) =>
                        setInjuryForm((f) => ({
                          ...f,
                          date_injured: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-400">RTP date</p>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-lime-500 focus:outline-none"
                      value={injuryForm.date_rtp}
                      onChange={(e) =>
                        setInjuryForm((f) => ({
                          ...f,
                          date_rtp: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <input
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none"
                  placeholder="Status"
                  value={injuryForm.status}
                  onChange={(e) =>
                    setInjuryForm((f) => ({ ...f, status: e.target.value }))
                  }
                />
                <textarea
                  className="min-h-[72px] w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none"
                  placeholder="Notes"
                  value={injuryForm.notes}
                  onChange={(e) =>
                    setInjuryForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
                {injuryError && (
                  <p className="text-xs text-rose-400">{injuryError}</p>
                )}
                <button
                  type="submit"
                  disabled={injurySaving}
                  className="rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
                >
                  {injurySaving ? "Saving…" : "Add injury"}
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

