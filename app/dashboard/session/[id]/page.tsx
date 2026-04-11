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

function buildForcePlateSummary(metrics: Metric[]) {
  const get = (key: string) =>
    metrics.find(
      (m) =>
        m.key === key &&
        (m.rep_index === null || m.rep_index === undefined)
    )?.value ?? null;

  return {
    jumpHeight: get("fp_jump_height_cm_best"),
    peakForce: get("fp_peak_force_n_best"),
    peakForceLeft: get("fp_peak_force_n_left"),
    peakForceRight: get("fp_peak_force_n_right"),
    peakForceAsym: get("fp_peak_force_n_asym_pct"),
    contactTime: get("fp_contact_time_s_best"),
    flightTime: get("fp_flight_time_s_best"),
    rsi: get("fp_rsi_best"),
    bodyMass: get("fp_body_mass_kg"),
    concentricImpulse: get("fp_concentric_impulse"),
    eccentricImpulse: get("fp_eccentric_impulse"),
    peakBraking: get("fp_peak_braking_force"),
    peakPropulsive: get("fp_peak_propulsive_force"),
  };
}

function MetricValueWithBand({
  valueText,
  metricKey,
  numericValue,
  bands,
}: {
  valueText: string;
  metricKey: string;
  numericValue: number | null;
  bands: NormalizedPerformanceBand[];
}) {
  const band = resolveBandForMetric(metricKey, numericValue, bands);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{valueText}</span>
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
          const mapped = seriesRows.map((row: Record<string, unknown>) => ({
            rep_index: row.rep_index as number | null,
            series: row.series as SprintSeriesRow["series"],
          })) as SprintSeriesRow[];

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

  const isForcePlate =
    (session?.test_type ?? "").toLowerCase().includes("force_plate") ||
    hasForcePlateMetrics;

  const isSprintLike =
    session?.test_type === "1080_sprint" ||
    (typeof session?.test_type === "string" &&
      session.test_type.startsWith("cod_"));

  const isCod5105 = session?.test_type === "cod_5_10_5";

  const forcePlateSummary = isForcePlate
    ? buildForcePlateSummary(metrics)
    : null;

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

  const headerTag = isForcePlate
    ? session?.test_type || "Force plate test"
    : isSprintLike
      ? "1080 Sprint session"
      : session?.test_type || "Test session";

  const summaryOnly = useMemo(
    () => metrics.filter((m) => m.rep_index == null),
    [metrics]
  );

  const getSummary = (keys: string[]) => {
    for (const k of keys) {
      const v = summaryOnly.find((m) => m.key === k)?.value;
      if (v != null && typeof v === "number" && !Number.isNaN(v)) return v;
    }
    return null;
  };

  const excelTotalTime = getSummary([
    "total_time",
    "totalTime",
    "time_s",
    "Time [s]",
  ]);
  const excelPeakSpeed = getSummary(["peakSpeed", "topSpeed", "peak_speed"]);
  const excelSplit05 = getSummary([
    "split5m",
    "split_0_5m",
    "split05m",
    "split_5m",
  ]);
  const excelMaxAccel = getSummary([
    "max_acceleration",
    "maxAcceleration",
    "MaxAcceleration",
  ]);

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

      <section className="mx-auto max-w-5xl px-6 pt-8 pb-20">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs text-slate-400 hover:text-lime-300"
          >
            ← Back to dashboard
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
                <h1 className="mt-1 text-xl font-semibold tracking-tight">
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
              <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Session summary (Excel-style)
                </h2>
                <p className="text-xs text-slate-500">
                  Key outcome metrics with performance band (TopSpeed bands:
                  Elite ≥7.5, Good 7.0–7.5, Fair 6.0–7.0, Poor &lt;6.0 m/s).
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4 font-medium">Client</th>
                        <th className="py-2 pr-4 font-medium">Session date</th>
                        <th className="py-2 pr-4 font-medium">Time [s]</th>
                        <th className="py-2 pr-4 font-medium">TopSpeed</th>
                        <th className="py-2 pr-4 font-medium">0–5m time</th>
                        <th className="py-2 pr-4 font-medium">Max accel.</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium">{athleteName}</td>
                        <td className="py-2 pr-4">{dateLabel}</td>
                        <td className="py-2 pr-4">
                          <MetricValueWithBand
                            valueText={
                              excelTotalTime != null
                                ? excelTotalTime.toFixed(3)
                                : "—"
                            }
                            metricKey="total_time"
                            numericValue={excelTotalTime}
                            bands={performanceBands}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <MetricValueWithBand
                            valueText={
                              excelPeakSpeed != null
                                ? `${excelPeakSpeed.toFixed(2)} m/s`
                                : "—"
                            }
                            metricKey="peakSpeed"
                            numericValue={excelPeakSpeed}
                            bands={performanceBands}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <MetricValueWithBand
                            valueText={
                              excelSplit05 != null
                                ? `${excelSplit05.toFixed(3)} s`
                                : "—"
                            }
                            metricKey="split5m"
                            numericValue={excelSplit05}
                            bands={performanceBands}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <MetricValueWithBand
                            valueText={
                              excelMaxAccel != null
                                ? `${excelMaxAccel.toFixed(2)} m/s²`
                                : "—"
                            }
                            metricKey="max_acceleration"
                            numericValue={excelMaxAccel}
                            bands={performanceBands}
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
                <h2 className="text-sm font-semibold text-lime-300 mb-3">
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
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isSprintLike && (
              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs flex items-center justify-between">
                <div>
                  <p className="text-[0.7rem] text-slate-400">
                    RTS readiness (this session)
                  </p>
                  <p
                    className={`mt-1 text-3xl font-bold ${
                      rtsScore == null
                        ? "text-slate-300"
                        : rtsScore >= 80
                          ? "text-emerald-300"
                          : rtsScore >= 60
                            ? "text-amber-300"
                            : "text-rose-300"
                    }`}
                  >
                    {rtsScore ?? "--"}
                  </p>
                </div>
                <div className="text-right text-[0.7rem] text-slate-400">
                  <p className="mb-1">
                    Test type:{" "}
                    <span className="text-slate-100">
                      {session.test_type ?? "1080 Sprint"}
                    </span>
                  </p>
                  <p>
                    RTS is derived from peak speed, 20m split and rep-to-rep
                    consistency.
                  </p>
                </div>
              </section>
            )}

            {isSprintLike && (
              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                <h2 className="text-sm font-semibold text-lime-300 mb-3">
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

            {isForcePlate && forcePlateSummary && (
              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                <h2 className="text-sm font-semibold text-lime-300 mb-3">
                  Force plate summary
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    {
                      label: "Jump height",
                      key: "fp_jump_height_cm_best",
                      v: forcePlateSummary.jumpHeight,
                      fmt: (x: number) => `${x.toFixed(1)} cm`,
                    },
                    {
                      label: "Body mass",
                      key: "fp_body_mass_kg",
                      v: forcePlateSummary.bodyMass,
                      fmt: (x: number) => `${x.toFixed(1)} kg`,
                    },
                    {
                      label: "Peak force (total)",
                      key: "fp_peak_force_n_best",
                      v: forcePlateSummary.peakForce,
                      fmt: (x: number) => `${x.toFixed(0)} N`,
                    },
                    {
                      label: "Peak force – left",
                      key: "fp_peak_force_n_left",
                      v: forcePlateSummary.peakForceLeft,
                      fmt: (x: number) => `${x.toFixed(0)} N`,
                    },
                    {
                      label: "Peak force – right",
                      key: "fp_peak_force_n_right",
                      v: forcePlateSummary.peakForceRight,
                      fmt: (x: number) => `${x.toFixed(0)} N`,
                    },
                    {
                      label: "Peak force asymmetry",
                      key: "fp_peak_force_n_asym_pct",
                      v: forcePlateSummary.peakForceAsym,
                      fmt: (x: number) => `${x.toFixed(1)} %`,
                    },
                    {
                      label: "Contact time",
                      key: "fp_contact_time_s_best",
                      v: forcePlateSummary.contactTime,
                      fmt: (x: number) => `${x.toFixed(3)} s`,
                    },
                    {
                      label: "Flight time",
                      key: "fp_flight_time_s_best",
                      v: forcePlateSummary.flightTime,
                      fmt: (x: number) => `${x.toFixed(3)} s`,
                    },
                    {
                      label: "RSI",
                      key: "fp_rsi_best",
                      v: forcePlateSummary.rsi,
                      fmt: (x: number) => x.toFixed(2),
                    },
                    {
                      label: "Concentric impulse",
                      key: "fp_concentric_impulse",
                      v: forcePlateSummary.concentricImpulse,
                      fmt: (x: number) => x.toFixed(2),
                    },
                    {
                      label: "Eccentric impulse",
                      key: "fp_eccentric_impulse",
                      v: forcePlateSummary.eccentricImpulse,
                      fmt: (x: number) => x.toFixed(2),
                    },
                    {
                      label: "Peak braking force",
                      key: "fp_peak_braking_force",
                      v: forcePlateSummary.peakBraking,
                      fmt: (x: number) => `${x.toFixed(0)} N`,
                    },
                    {
                      label: "Peak propulsive force",
                      key: "fp_peak_propulsive_force",
                      v: forcePlateSummary.peakPropulsive,
                      fmt: (x: number) => `${x.toFixed(0)} N`,
                    },
                  ].map((cell) => (
                    <div key={cell.label}>
                      <p className="text-[0.7rem] text-slate-400">
                        {cell.label}
                      </p>
                      <div className="text-sm font-semibold text-slate-50">
                        {cell.v != null ? (
                          <MetricValueWithBand
                            valueText={cell.fmt(cell.v)}
                            metricKey={cell.key}
                            numericValue={cell.v}
                            bands={performanceBands}
                          />
                        ) : (
                          "--"
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
              <h2 className="text-sm font-semibold text-lime-300 mb-3">
                All metrics
              </h2>
              {metrics.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No metrics stored for this session.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[0.7rem]">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="py-1 px-2 text-left">Key</th>
                        <th className="py-1 px-2 text-left">Rep</th>
                        <th className="py-1 px-2 text-left">Side</th>
                        <th className="py-1 px-2 text-left">Unit</th>
                        <th className="py-1 px-2 text-left">Value</th>
                        <th className="py-1 px-2 text-left">Band</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => (
                        <tr
                          key={m.id}
                          className="border-t border-slate-800"
                        >
                          <td className="py-1 px-2 font-mono">{m.key}</td>
                          <td className="py-1 px-2">
                            {m.rep_index == null ? "—" : m.rep_index}
                          </td>
                          <td className="py-1 px-2">
                            {m.side ?? "—"}
                          </td>
                          <td className="py-1 px-2">
                            {m.unit ?? "—"}
                          </td>
                          <td className="py-1 px-2">
                            {m.value != null ? m.value : "—"}
                          </td>
                          <td className="py-1 px-2">
                            <PerformanceBandPill
                              band={resolveBandForMetric(
                                m.key,
                                m.value,
                                performanceBands
                              )}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
