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
import {
  BENCHMARK_JUMP_HEIGHT_CM,
  BENCHMARK_PEAK_SPEED_MS,
  computeReadinessScore,
  formatTestTypeLabel,
  isDynamometerType,
  isForcePlateType,
  isSprintLikeType,
  pctChange,
  pctChangeLowerIsBetter,
  readinessBullets,
  readinessComponents,
  readinessLabel,
  readinessRingColor,
} from "@/lib/athleteDashboardData";
import PerformanceBandPill from "@/components/PerformanceBandPill";
import {
  resolveBandForMetric,
  type NormalizedPerformanceBand,
} from "@/lib/performanceBands";

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

function formatPct(p: number | null): string {
  if (p == null) return "—";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function keyResultsLine(s: NormalizedSession): string {
  if (isSprintLikeType(s.testType)) {
    const parts: string[] = [];
    if (s.peakSpeed != null) {
      parts.push(`Peak ${s.peakSpeed.toFixed(2)} m/s`);
    }
    if (s.split10m != null) {
      parts.push(`10m ${s.split10m.toFixed(2)} s`);
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
  const [performanceBands, setPerformanceBands] = useState<
    NormalizedPerformanceBand[]
  >([]);

  const loadData = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/athlete-dashboard/${athleteId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json?.error || "Failed to load athlete");
        setAthlete(null);
        setSessions([]);
        setInjuries([]);
        setPerformanceBands([]);
        return;
      }
      setAthlete(json.athlete as AthleteRow);
      setSessions((json.sessions as NormalizedSession[]) ?? []);
      setInjuries((json.injuries as InjuryRow[]) ?? []);
      setPerformanceBands(
        (json.performanceBands as NormalizedPerformanceBand[]) ?? []
      );
    } catch {
      setLoadError("Failed to load athlete");
      setAthlete(null);
      setPerformanceBands([]);
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedDesc = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [sessions]
  );

  const sprintChrono = useMemo(
    () =>
      sessions
        .filter((s) => isSprintLikeType(s.testType))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [sessions]
  );

  const fpChrono = useMemo(
    () =>
      sessions
        .filter((s) => isForcePlateType(s.testType))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [sessions]
  );

  const dynoChrono = useMemo(
    () =>
      sessions
        .filter((s) => isDynamometerType(s.testType))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [sessions]
  );

  const fpWithJumpHeight = useMemo(
    () => fpChrono.filter((s) => s.jumpHeightCm != null),
    [fpChrono]
  );
  const fpWithRsi = useMemo(
    () => fpChrono.filter((s) => s.rsi != null),
    [fpChrono]
  );

  const lastTestDate = useMemo(() => {
    if (!sessions.length) return null;
    const t = Math.max(
      ...sessions.map((s) => new Date(s.createdAt).getTime())
    );
    return new Date(t);
  }, [sessions]);

  const latestSprint = sprintChrono[sprintChrono.length - 1];
  const prevSprint =
    sprintChrono.length >= 2 ? sprintChrono[sprintChrono.length - 2] : null;

  const latestFpJump =
    fpWithJumpHeight[fpWithJumpHeight.length - 1] ?? null;
  const prevFpJump =
    fpWithJumpHeight.length >= 2
      ? fpWithJumpHeight[fpWithJumpHeight.length - 2]
      : null;

  const latestFpRsi = fpWithRsi[fpWithRsi.length - 1] ?? null;
  const prevFpRsi =
    fpWithRsi.length >= 2 ? fpWithRsi[fpWithRsi.length - 2] : null;

  const lastSprintDomain = useMemo(() => {
    const arr = sessions.filter((s) => isSprintLikeType(s.testType));
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.createdAt).getTime()))
    );
  }, [sessions]);

  const lastForcePlateDomain = useMemo(() => {
    const arr = sessions.filter((s) => isForcePlateType(s.testType));
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.createdAt).getTime()))
    );
  }, [sessions]);

  const lastDynoDomain = useMemo(() => {
    const arr = sessions.filter((s) => isDynamometerType(s.testType));
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.createdAt).getTime()))
    );
  }, [sessions]);

  const readiness = useMemo(() => {
    if (!latestSprint) return null;
    return computeReadinessScore(
      latestSprint.peakSpeed,
      latestSprint.split20m,
      null
    );
  }, [latestSprint]);

  const components = useMemo(() => {
    if (!latestSprint) return null;
    return readinessComponents(
      latestSprint.peakSpeed,
      latestSprint.split20m,
      null
    );
  }, [latestSprint]);

  const hasFpMetrics = useMemo(
    () =>
      fpChrono.some(
        (s) => s.jumpHeightCm != null || s.rsi != null
      ),
    [fpChrono]
  );

  const readinessExplain = useMemo(
    () => readinessBullets(readiness, components, hasFpMetrics),
    [readiness, components, hasFpMetrics]
  );

  const peakDelta = pctChange(
    latestSprint?.peakSpeed ?? null,
    prevSprint?.peakSpeed ?? null
  );
  const split10Delta = pctChangeLowerIsBetter(
    latestSprint?.split10m ?? null,
    prevSprint?.split10m ?? null
  );
  const jhDelta = pctChange(
    latestFpJump?.jumpHeightCm ?? null,
    prevFpJump?.jumpHeightCm ?? null
  );
  const rsiDelta = pctChange(
    latestFpRsi?.rsi ?? null,
    prevFpRsi?.rsi ?? null
  );

  const sprintChartData = useMemo(
    () =>
      sprintChrono.map((s) => ({
        label: new Date(s.createdAt).toLocaleDateString("en-AU", {
          day: "2-digit",
          month: "short",
        }),
        peakSpeed: s.peakSpeed,
      })),
    [sprintChrono]
  );

  const jumpChartData = useMemo(
    () =>
      fpChrono
        .filter((s) => s.jumpHeightCm != null)
        .map((s) => ({
          label: new Date(s.createdAt).toLocaleDateString("en-AU", {
            day: "2-digit",
            month: "short",
          }),
          jumpHeight: s.jumpHeightCm,
        })),
    [fpChrono]
  );

  const ringColor =
    readiness != null ? readinessRingColor(readiness) : "#94a3b8";
  const r = 52;
  const c = 2 * Math.PI * r;
  const dashOffset =
    readiness != null ? c * (1 - readiness / 100) : c;

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
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <DashboardNav />

      <section className="mx-auto max-w-6xl px-6 pt-8 pb-20">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Back to dashboard
          </button>
          <Link
            href={`/dashboard/athlete/${athleteId}/compare`}
            className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Compare pre / post
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading athlete…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : !athlete ? (
          <p className="text-sm text-red-600">Athlete not found.</p>
        ) : (
          <>
            {/* Header */}
            <header className="rounded-2xl bg-slate-900 px-6 py-6 text-white shadow-lg">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
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
                    <dt className="text-[0.65rem] uppercase tracking-wide text-slate-500">
                      Last test (any)
                    </dt>
                    <dd className="font-medium text-white">
                      {lastTestDate
                        ? lastTestDate.toLocaleDateString("en-AU", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-wide text-slate-500">
                      Sprint last
                    </dt>
                    <dd className="font-medium text-white">
                      {lastSprintDomain
                        ? lastSprintDomain.toLocaleDateString("en-AU", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-wide text-slate-500">
                      Force plate last
                    </dt>
                    <dd className="font-medium text-white">
                      {lastForcePlateDomain
                        ? lastForcePlateDomain.toLocaleDateString("en-AU", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-wide text-slate-500">
                      Dynamometer last
                    </dt>
                    <dd className="font-medium text-white">
                      {lastDynoDomain
                        ? lastDynoDomain.toLocaleDateString("en-AU", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.65rem] uppercase tracking-wide text-slate-500">
                      Sessions
                    </dt>
                    <dd className="font-medium text-white">
                      {sessions.length}
                    </dd>
                  </div>
                </dl>
              </div>
            </header>

            {/* Readiness */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Readiness score
              </h2>
              <div className="mt-4 flex flex-col items-center gap-8 lg:flex-row lg:items-center">
                <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
                  <svg
                    className="h-36 w-36 -rotate-90"
                    viewBox="0 0 120 120"
                    aria-hidden
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r={r}
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="10"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r={r}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={c}
                      strokeDashoffset={dashOffset}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-bold tabular-nums text-slate-900">
                      {readiness ?? "—"}
                    </span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-slate-900">
                    {readiness != null
                      ? readinessLabel(readiness)
                      : "Insufficient data"}
                    {readiness != null && (
                      <span
                        className="ml-2 text-sm font-normal text-slate-500"
                      >
                        (latest 1080 sprint)
                      </span>
                    )}
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
                    {readinessExplain.map((line, i) => (
                      <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Key metrics */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Peak speed"
                value={
                  latestSprint?.peakSpeed != null
                    ? latestSprint.peakSpeed.toFixed(2)
                    : "—"
                }
                unit="m/s"
                delta={peakDelta}
                band={resolveBandForMetric(
                  "peakSpeed",
                  latestSprint?.peakSpeed ?? null,
                  performanceBands
                )}
              />
              <MetricCard
                title="10m split"
                value={
                  latestSprint?.split10m != null
                    ? latestSprint.split10m.toFixed(2)
                    : "—"
                }
                unit="s"
                delta={split10Delta}
                deltaTone="lowerIsBetterRaw"
                currentNumeric={latestSprint?.split10m ?? null}
                previousNumeric={prevSprint?.split10m ?? null}
                band={resolveBandForMetric(
                  "split10m",
                  latestSprint?.split10m ?? null,
                  performanceBands
                )}
              />
              <MetricCard
                title="Jump height"
                value={
                  latestFpJump?.jumpHeightCm != null
                    ? latestFpJump.jumpHeightCm.toFixed(1)
                    : "—"
                }
                unit="cm"
                delta={jhDelta}
                band={
                  resolveBandForMetric(
                    "fp_jump_height_cm_best",
                    latestFpJump?.jumpHeightCm ?? null,
                    performanceBands
                  ) ??
                  resolveBandForMetric(
                    "jump_height_cm",
                    latestFpJump?.jumpHeightCm ?? null,
                    performanceBands
                  )
                }
              />
              <MetricCard
                title="RSI"
                value={
                  latestFpRsi?.rsi != null ? latestFpRsi.rsi.toFixed(2) : "—"
                }
                unit=""
                delta={rsiDelta}
                band={resolveBandForMetric(
                  "fp_rsi_best",
                  latestFpRsi?.rsi ?? null,
                  performanceBands
                )}
              />
            </div>

            {/* Charts */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  Sprint — peak speed
                </h3>
                <p className="text-xs text-slate-500">
                  Benchmark {BENCHMARK_PEAK_SPEED_MS} m/s (dashed)
                </p>
                {sprintChartData.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500">
                    No 1080 sprint sessions yet.
                  </p>
                ) : (
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sprintChartData}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "#64748b" }}
                        />
                        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#fff",
                            border: "1px solid #e2e8f0",
                            fontSize: 12,
                          }}
                        />
                        <ReferenceLine
                          y={BENCHMARK_PEAK_SPEED_MS}
                          stroke="#94a3b8"
                          strokeDasharray="6 4"
                        />
                        <Line
                          type="monotone"
                          dataKey="peakSpeed"
                          name="Peak speed"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  Force plate — jump height
                </h3>
                <p className="text-xs text-slate-500">
                  Benchmark {BENCHMARK_JUMP_HEIGHT_CM} cm (dashed)
                </p>
                {jumpChartData.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500">
                    No jump height data in force plate sessions yet.
                  </p>
                ) : (
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={jumpChartData}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "#64748b" }}
                        />
                        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#fff",
                            border: "1px solid #e2e8f0",
                            fontSize: 12,
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

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                Dynamometer
              </h3>
              <p className="text-xs text-slate-500">
                Last tested:{" "}
                {lastDynoDomain
                  ? lastDynoDomain.toLocaleDateString("en-AU", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </p>
              {dynoChrono.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No dynamometer sessions yet.
                </p>
              ) : (
                <div className="mt-3 text-sm text-slate-700">
                  <p>
                    Latest session:{" "}
                    <span className="font-medium tabular-nums">
                      {keyResultsLine(dynoChrono[dynoChrono.length - 1])}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Session history */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Session history
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Test type</th>
                      <th className="px-5 py-3 font-medium">Key results</th>
                      <th className="px-5 py-3 font-medium">File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDesc.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-center text-slate-500"
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
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
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
                          <td className="px-5 py-3 text-slate-900 whitespace-nowrap">
                            {new Date(s.createdAt).toLocaleDateString(
                              "en-AU",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-700">
                            {formatTestTypeLabel(s.testType)}
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {keyResultsLine(s)}
                          </td>
                          <td className="px-5 py-3 text-slate-500 text-xs max-w-[200px] truncate">
                            {s.fileName ?? "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Injury / rehab */}
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Injury &amp; rehab
              </h3>

              <div className="mt-4 space-y-4">
                {injuries.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No injuries recorded.
                  </p>
                ) : (
                  injuries.map((inj) => (
                    <div
                      key={inj.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"
                    >
                      <p className="font-semibold text-slate-900">
                        {inj.diagnosis}
                      </p>
                      <p className="text-slate-600 mt-1">
                        {inj.body_region}
                        {inj.side ? ` (${inj.side})` : ""}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        Injured:{" "}
                        {inj.date_injured
                          ? new Date(inj.date_injured).toLocaleDateString(
                              "en-AU"
                            )
                          : "—"}
                        {inj.date_rtp
                          ? ` · RTP: ${new Date(
                              inj.date_rtp
                            ).toLocaleDateString("en-AU")}`
                          : ""}
                      </p>
                      {inj.status && (
                        <p className="text-xs text-emerald-700 mt-1">
                          Status: {inj.status}
                        </p>
                      )}
                      {inj.notes && (
                        <p className="mt-2 text-slate-600">{inj.notes}</p>
                      )}
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleAddInjury}
                className="mt-8 space-y-3 border-t border-slate-200 pt-6"
              >
                <p className="text-sm font-medium text-slate-900">
                  Add injury record
                </p>
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Side"
                    value={injuryForm.side}
                    onChange={(e) =>
                      setInjuryForm((f) => ({ ...f, side: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Date injured</p>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                    <p className="text-xs text-slate-500 mb-1">RTP date</p>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Status"
                  value={injuryForm.status}
                  onChange={(e) =>
                    setInjuryForm((f) => ({ ...f, status: e.target.value }))
                  }
                />
                <textarea
                  className="w-full min-h-[72px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Notes"
                  value={injuryForm.notes}
                  onChange={(e) =>
                    setInjuryForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
                {injuryError && (
                  <p className="text-xs text-red-600">{injuryError}</p>
                )}
                <button
                  type="submit"
                  disabled={injurySaving}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
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

function MetricCard({
  title,
  value,
  unit,
  delta,
  deltaTone = "default",
  currentNumeric,
  previousNumeric,
  band,
}: {
  title: string;
  value: string;
  unit: string;
  delta: number | null;
  deltaTone?: "default" | "lowerIsBetterRaw";
  currentNumeric?: number | null;
  previousNumeric?: number | null;
  band?: ReturnType<typeof resolveBandForMetric>;
}) {
  let deltaColor = "text-slate-800";
  if (deltaTone === "lowerIsBetterRaw") {
    if (
      currentNumeric != null &&
      previousNumeric != null &&
      !Number.isNaN(currentNumeric) &&
      !Number.isNaN(previousNumeric)
    ) {
      if (Math.abs(currentNumeric - previousNumeric) < 1e-9) {
        deltaColor = "text-slate-800";
      } else if (currentNumeric < previousNumeric) {
        deltaColor = "text-emerald-600";
      } else {
        deltaColor = "text-red-600";
      }
    } else if (delta != null) {
      deltaColor =
        delta > 0
          ? "text-emerald-600"
          : delta < 0
            ? "text-red-600"
            : "text-slate-800";
    }
  } else if (delta != null) {
    deltaColor =
      delta > 0
        ? "text-emerald-600"
        : delta < 0
          ? "text-red-600"
          : "text-slate-800";
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-2xl font-semibold tabular-nums text-slate-900">
          {value}
          {unit ? (
            <span className="ml-1 text-base font-normal text-slate-500">
              {unit}
            </span>
          ) : null}
        </p>
        {band ? <PerformanceBandPill band={band} /> : null}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {delta != null ? (
          <>
            <span className={`font-medium tabular-nums ${deltaColor}`}>
              {formatPct(delta)}
            </span>{" "}
            vs previous session
          </>
        ) : (
          "— vs previous session"
        )}
      </p>
    </div>
  );
}
