// app/dashboard/session/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import SprintTimeSeriesGraphs from "@/components/graphs/SprintTimeSeriesGraphs";
import PerformanceBandPill from "@/components/PerformanceBandPill";
import AsymmetryPanel, {
  parseAsymmetryResults,
  type AsymmetryRow,
} from "@/components/AsymmetryPanel";
import {
  normalizePerformanceBandRow,
  resolveBandForMetric,
  type NormalizedPerformanceBand,
} from "@/lib/performanceBands";
import {
  DynamometerSummaryPanel,
  ForcePlateIsoPanel,
  ForcePlateJumpPanel,
  fpPanelKind,
  SessionSummaryLrTable,
} from "@/components/session/SessionTestSummaryPanels";

type Session = {
  id: string;
  athlete_id: string | null;
  created_at: string;
  test_type: string | null;
  test_sub_type?: string | null;
  file_name: string | null;
};

type Metric = {
  id: string;
  session_id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
  side?: string | null;
  unit?: string | null;
};

type Athlete =
  | {
      id: string;
      first_name: string | null;
      last_name: string | null;
      organisation: string | null;
      team: string | null;
      primary_sport: string | null;
    }
  | null;

type SprintSeriesRow = {
  rep_index: number | null;
  series: {
    t: number[];
    x: number[];
    v: number[];
    a: number[];
    f: number[];
    p: number[];
  } | null;
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((s, v) => s + v, 0) / values.length
    : 0;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) * (v - m), 0) /
    values.length;
  return Math.sqrt(variance);
}

function computeRTSFromMetrics(metrics: Metric[]) {
  const summary = metrics.filter((m) => m.rep_index == null);
  const reps = metrics.filter((m) => m.rep_index != null);

  const getSummary = (key: string) =>
    summary.find((m) => m.key === key)?.value ?? null;

  const peakSpeed = getSummary("peakSpeed");
  const split20 = getSummary("split20m");

  const repSpeeds = reps
    .filter((m) => m.key === "peakSpeed" && m.value != null)
    .map((m) => m.value as number);

  if (!peakSpeed || !split20 || repSpeeds.length < 2) return null;

  const speedScore = clamp((peakSpeed - 5) / 4, 0, 1);
  const splitScore = clamp((4.5 - split20) / 1.5, 0, 1);

  const sd = stdDev(repSpeeds);
  const m = mean(repSpeeds);
  const consistency = clamp(1 - sd / m, 0, 1);

  const combined =
    0.4 * speedScore + 0.3 * splitScore + 0.3 * consistency;

  return Math.round(combined * 100);
}

function MetricValueWithBand({
  valueText,
  metricKey,
  numericValue,
  bands,
  sessionTestType,
}: {
  valueText: string;
  metricKey: string;
  numericValue: number | null;
  bands: NormalizedPerformanceBand[];
  sessionTestType?: string | null;
}) {
  const band = resolveBandForMetric(
    metricKey,
    numericValue,
    bands,
    sessionTestType
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-slate-50">{valueText}</span>
      <PerformanceBandPill band={band} />
    </div>
  );
}

export default function SessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [athlete, setAthlete] = useState<Athlete>(null);
  const [sprintSeries, setSprintSeries] = useState<SprintSeriesRow[]>([]);
  const [performanceBands, setPerformanceBands] = useState<
    NormalizedPerformanceBand[]
  >([]);
  const [asymmetryRows, setAsymmetryRows] = useState<AsymmetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    async function load() {
      setLoading(true);
      setError(null);

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data: sess, error: sessError } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessError || !sess) {
        console.error("[session-page] session error:", sessError);
        setError("Session not found");
        setLoading(false);
        return;
      }

      setSession(sess as Session);

      const { data: mets, error: metsError } = await supabase
        .from("metrics")
        .select("*")
        .eq("session_id", sessionId);

      if (metsError) {
        console.error("[session-page] metrics error:", metsError);
        setError("Failed to load metrics");
        setLoading(false);
        return;
      }

      setMetrics((mets ?? []) as Metric[]);

      if (sess.athlete_id) {
        const { data: ath, error: athError } = await supabase
          .from("athletes")
          .select(
            "id, first_name, last_name, organisation, team, primary_sport"
          )
          .eq("id", sess.athlete_id)
          .maybeSingle();

        if (!athError && ath) {
          setAthlete(ath as Athlete);
        }
      }

      const isSprintLikeBySess =
        sess.test_type === "1080_sprint" ||
        (typeof sess.test_type === "string" &&
          sess.test_type.startsWith("cod_"));

      if (isSprintLikeBySess) {
        const { data: seriesRows, error: seriesError } = await supabase
          .from("sprint_time_series")
          .select("rep_index, series")
          .eq("session_id", sessionId)
          .order("rep_index", { ascending: true });

        if (!seriesError && seriesRows) {
          const mapped = seriesRows.map((row: Record<string, unknown>) => {
            const rawSeries = row.series;
            let converted: SprintSeriesRow["series"] = null;
            if (Array.isArray(rawSeries) && rawSeries.length > 0) {
              const t: number[] = [], x: number[] = [], v: number[] = [],
                    a: number[] = [], f: number[] = [], p: number[] = [];
              for (const s of rawSeries as Record<string, number>[]) {
                t.push(s.t ?? 0);
                x.push(s.position ?? s.x ?? 0);
                v.push(s.speed ?? s.v ?? 0);
                a.push(s.acceleration ?? s.a ?? 0);
                f.push(s.force ?? s.f ?? 0);
                p.push(s.p ?? (s.force ?? 0) * (s.speed ?? 0));
              }
              converted = { t, x, v, a, f, p };
            } else if (rawSeries && !Array.isArray(rawSeries)) {
              converted = rawSeries as SprintSeriesRow["series"];
            }
            return { rep_index: row.rep_index as number | null, series: converted };
          }) as SprintSeriesRow[];

          setSprintSeries(mapped);
        } else {
          setSprintSeries([]);
        }
      } else {
        setSprintSeries([]);
      }

      const { data: bandRows } = await supabase
        .from("performance_bands")
        .select("*");

      const bands: NormalizedPerformanceBand[] = [];
      for (const row of bandRows ?? []) {
        const n = normalizePerformanceBandRow(row as Record<string, unknown>);
        if (n) bands.push(n);
      }
      setPerformanceBands(bands);

      const { data: asymData } = await supabase
        .from("asymmetry_results")
        .select("*")
        .eq("session_id", sessionId);

      setAsymmetryRows(parseAsymmetryResults((asymData ?? []) as Record<string, unknown>[]));

      setLoading(false);
    }

    load();
  }, [sessionId]);

  const hasForcePlateMetrics = metrics.some((m) => m.key.startsWith("fp_"));
  const hasDynoMetrics = metrics.some((m) => m.key.startsWith("dyno_"));

  const testTypeLc = (session?.test_type ?? "").toLowerCase();
  const isHandheldDynoSession = testTypeLc === "handheld_dynamometer";

  const isForcePlate =
    !isHandheldDynoSession &&
    (testTypeLc.includes("force_plate") || hasForcePlateMetrics);

  const showDynoPanel =
    isHandheldDynoSession || hasDynoMetrics;

  const fpKind = fpPanelKind(session?.test_type ?? null);

  const isSprintLike =
    session?.test_type === "1080_sprint" ||
    (typeof session?.test_type === "string" &&
      session.test_type.startsWith("cod_"));

  const isCod5105 = session?.test_type === "cod_5_10_5";

  const rtsScore = isSprintLike ? computeRTSFromMetrics(metrics) : null;

  const athleteName = athlete
    ? `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() ||
      "Unnamed athlete"
    : "Unknown athlete";

  const dateLabel = session
    ? new Date(session.created_at).toLocaleString("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  const headerTag = isHandheldDynoSession
    ? session?.test_type || "Handheld dynamometer"
    : isForcePlate
      ? session?.test_type || "Force plate test"
      : isSprintLike
        ? "1080 Sprint session"
        : session?.test_type || "Test session";

  const summaryOnly = useMemo(
    () => metrics.filter((m) => m.rep_index == null),
    [metrics]
  );

  // For 1080 sessions all metrics have a rep_index — fall back to best rep value
  const getBestMetric = (keys: string[], mode: "max" | "min" = "max") => {
    for (const k of keys) {
      // Try summary (rep_index == null) first
      const sv = summaryOnly.find((m) => m.key === k)?.value;
      if (sv != null && typeof sv === "number" && !Number.isNaN(sv)) return sv;
    }
    // Fall back to best rep across all reps
    for (const k of keys) {
      const vals = metrics
        .filter((m) => m.key === k && m.value != null)
        .map((m) => m.value as number);
      if (vals.length > 0)
        return mode === "max" ? Math.max(...vals) : Math.min(...vals);
    }
    return null;
  };

  const excelTotalTime = getBestMetric(["total_time", "totalTime", "time_s"], "min");
  const excelPeakSpeed = getBestMetric(["top_speed", "peak_speed", "peakSpeed", "topSpeed"], "max");
  const excelSplit05 = getBestMetric(["split_5m_time", "split5m", "split_0_5m", "split05m", "split_5m"], "min");
  const excelMaxAccel = getBestMetric(["accel_max", "max_acceleration", "maxAcceleration"], "max");

  const codExtraMetrics = useMemo(() => {
    if (!isCod5105) return [];
    return summaryOnly.filter(
      (m) =>
        m.key.toLowerCase().includes("cod") ||
        m.key.startsWith("cod_")
    );
  }, [summaryOnly, isCod5105]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => session?.athlete_id ? router.push(`/dashboard/athletes/${session.athlete_id}`) : router.push("/dashboard/athletes")}
            className="text-xs text-slate-400 hover:text-lime-300"
          >
            ← Back to athlete
          </button>

          <Link
            href="/dashboard/staff"
            className="hidden text-[0.7rem] text-slate-500 hover:text-lime-300 md:inline-flex"
          >
            Staff view →
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading session…</p>
        ) : error || !session ? (
          <p className="text-sm text-rose-400">
            {error ?? "Session not found"}
          </p>
        ) : (
          <>
            <header className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                  {headerTag}
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
                  {athleteName}
                </h1>
                <p className="mt-1 text-xs text-slate-400">{dateLabel}</p>
                {session.test_sub_type && (
                  <p className="mt-1 text-[0.7rem] text-lime-300/90">
                    Sub-type: {session.test_sub_type}
                  </p>
                )}
                {athlete && (
                  <p className="mt-1 text-[0.7rem] text-slate-500">
                    {athlete.organisation && `${athlete.organisation} • `}
                    {athlete.team && `${athlete.team} • `}
                    {athlete.primary_sport}
                  </p>
                )}
              </div>

              <div className="text-right text-[0.7rem] text-slate-400">
                <p>
                  Session ID: {sessionId?.slice(0, 8) ?? "unknown"}…
                </p>
                {session.file_name && (
                  <p className="mt-1 text-slate-300">
                    File:{" "}
                    <span className="font-mono text-[0.65rem]">
                      {session.file_name}
                    </span>
                  </p>
                )}

                {sessionId && (
                  <a
                    href={`/api/session-report/${sessionId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-2 rounded-full border border-lime-400/60 px-3 py-1 text-[0.7rem] text-lime-300 hover:bg-slate-800"
                  >
                    Download PDF report
                  </a>
                )}
              </div>
            </header>

            {asymmetryRows.length > 0 && (
              <div className="mb-6">
                <AsymmetryPanel rows={asymmetryRows} variant="dark" />
              </div>
            )}

            {isSprintLike && (
              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-lime-300">
                  Session summary (Excel-style)
                </h2>
                <p className="mt-2 text-xs text-slate-400">
                  Key outcome metrics with performance band (TopSpeed bands:
                  Elite ≥7.5, Good 7.0–7.5, Fair 6.0–7.0, Poor &lt;6.0 m/s).
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800/60 text-left">
                    <thead>
                      <tr>
                        <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                          Client
                        </th>
                        <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                          Session date
                        </th>
                        <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                          Time [s]
                        </th>
                        <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                          TopSpeed
                        </th>
                        <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                          0–5m time
                        </th>
                        <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                          Max accel.
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      <tr>
                        <td className="py-2 pr-4 text-xs font-medium text-slate-200">
                          {athleteName}
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-200">
                          {dateLabel}
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-200">
                          <MetricValueWithBand
                            valueText={
                              excelTotalTime != null
                                ? excelTotalTime.toFixed(3)
                                : "—"
                            }
                            metricKey="total_time"
                            numericValue={excelTotalTime}
                            bands={performanceBands}
                            sessionTestType={session.test_type}
                          />
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-200">
                          <MetricValueWithBand
                            valueText={
                              excelPeakSpeed != null
                                ? `${excelPeakSpeed.toFixed(2)} m/s`
                                : "—"
                            }
                            metricKey="peakSpeed"
                            numericValue={excelPeakSpeed}
                            bands={performanceBands}
                            sessionTestType={session.test_type}
                          />
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-200">
                          <MetricValueWithBand
                            valueText={
                              excelSplit05 != null
                                ? `${excelSplit05.toFixed(3)} s`
                                : "—"
                            }
                            metricKey="split5m"
                            numericValue={excelSplit05}
                            bands={performanceBands}
                            sessionTestType={session.test_type}
                          />
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-200">
                          <MetricValueWithBand
                            valueText={
                              excelMaxAccel != null
                                ? `${excelMaxAccel.toFixed(2)} m/s²`
                                : "—"
                            }
                            metricKey="max_acceleration"
                            numericValue={excelMaxAccel}
                            bands={performanceBands}
                            sessionTestType={session.test_type}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {isCod5105 && codExtraMetrics.length > 0 && (
              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
                  COD 5-10-5 metrics
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {codExtraMetrics.map((m) => (
                    <div key={m.id}>
                      <p className="text-[0.7rem] text-slate-400">{m.key}</p>
                      <MetricValueWithBand
                        valueText={
                          m.value != null ? String(m.value) : "—"
                        }
                        metricKey={m.key}
                        numericValue={m.value}
                        bands={performanceBands}
                        sessionTestType={session.test_type}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isSprintLike && (
              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
                  1080 Sprint – time-series
                </h2>

                {sprintSeries.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No time-series data stored for this rep.
                  </p>
                ) : (
                  <SprintTimeSeriesGraphs series={sprintSeries} />
                )}
              </section>
            )}

            {isForcePlate && fpKind === "jump" && (
              <ForcePlateJumpPanel
                metrics={metrics}
                testSubType={session.test_sub_type}
                sessionTestType={session.test_type}
                bands={performanceBands}
              />
            )}

            {isForcePlate && fpKind === "iso" && (
              <ForcePlateIsoPanel
                metrics={metrics}
                testSubType={session.test_sub_type}
                sessionTestType={session.test_type}
                bands={performanceBands}
              />
            )}

            {showDynoPanel && (
              <DynamometerSummaryPanel
                metrics={metrics}
                bands={performanceBands}
                sessionTestType={session.test_type}
              />
            )}

            <SessionSummaryLrTable
              metrics={metrics}
              bands={performanceBands}
              sessionTestType={session.test_type}
            />
          </>
        )}
      </section>
    </main>
  );
}
