// app/dashboard/session/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import SprintTimeSeriesGraphs from "@/components/graphs/SprintTimeSeriesGraphs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Types ----------
type Session = {
  id: string;
  athlete_id: string | null;
  created_at: string;
  test_type: string | null;
  file_name: string | null;
};

type Metric = {
  id: string;
  session_id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
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

// ---------- Helpers ----------
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

// RTS for 1080-like sessions from metrics
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

// Force plate summary helper
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
  };
}

// ---------- Page ----------
export default function SessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [athlete, setAthlete] = useState<Athlete>(null);
  const [sprintSeries, setSprintSeries] = useState<SprintSeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    async function load() {
      setLoading(true);
      setError(null);

      // 1) Session
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

      // 2) Metrics
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

      // 3) Athlete
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

      // 4) 1080 / COD sprint time-series
      const isSprintLikeBySess =
        sess.test_type === "1080_sprint" ||
        sess.test_type?.startsWith("cod_");

      if (isSprintLikeBySess) {
        const { data: seriesRows, error: seriesError } =
          await supabase
            .from("sprint_time_series")
            .select("rep_index, series")
            .eq("session_id", sessionId)
            .order("rep_index", { ascending: true });

        console.log("[session-page] sprint_time_series:", {
          seriesRows,
          seriesError,
        });

        if (!seriesError && seriesRows) {
          const mapped = seriesRows.map((row: any) => ({
            rep_index: row.rep_index,
            series: row.series,
          })) as SprintSeriesRow[];

          setSprintSeries(mapped);
        } else {
          setSprintSeries([]);
        }
      } else {
        setSprintSeries([]);
      }

      setLoading(false);
    }

    load();
  }, [sessionId]);

  // ---------- Derived flags ----------
  const hasForcePlateMetrics = metrics.some((m) =>
    m.key.startsWith("fp_")
  );

  const isForcePlate =
    (session?.test_type ?? "")
      .toLowerCase()
      .includes("force_plate") || hasForcePlateMetrics;

  const isSprintLike =
    session?.test_type === "1080_sprint" ||
    session?.test_type?.startsWith("cod_");

  const forcePlateSummary = isForcePlate
    ? buildForcePlateSummary(metrics)
    : null;

  const rtsScore = isSprintLike
    ? computeRTSFromMetrics(metrics)
    : null;

  const athleteName = athlete
    ? `${athlete.first_name ?? ""} ${
        athlete.last_name ?? ""
      }`.trim() || "Unnamed athlete"
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

  // ---------- UI ----------
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-5xl px-6 pt-8 pb-20">
        {/* Back + title */}
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
            {/* HEADER */}
            <header className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                  {headerTag}
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight">
                  {athleteName}
                </h1>
                <p className="mt-1 text-xs text-slate-400">
                  {dateLabel}
                </p>
                {athlete && (
                  <p className="mt-1 text-[0.7rem] text-slate-500">
                    {athlete.organisation &&
                      `${athlete.organisation} • `}
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

            {/* RTS CARD – 1080 + COD */}
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
                    RTS is derived from peak speed, 20m split and
                    rep-to-rep consistency.
                  </p>
                </div>
              </section>
            )}

            {/* 1080 / COD Sprint time-series graphs */}
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

            {/* FORCE PLATE SUMMARY */}
            {isForcePlate && forcePlateSummary && (
              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                <h2 className="text-sm font-semibold text-lime-300 mb-3">
                  Force plate summary
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Jump height
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.jumpHeight != null
                        ? `${forcePlateSummary.jumpHeight.toFixed(
                            1
                          )} cm`
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Body mass
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.bodyMass != null
                        ? `${forcePlateSummary.bodyMass.toFixed(
                            1
                          )} kg`
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Peak force (total)
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.peakForce != null
                        ? `${forcePlateSummary.peakForce.toFixed(
                            0
                          )} N`
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Peak force – left
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.peakForceLeft != null
                        ? `${forcePlateSummary.peakForceLeft.toFixed(
                            0
                          )} N`
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Peak force – right
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.peakForceRight != null
                        ? `${forcePlateSummary.peakForceRight.toFixed(
                            0
                          )} N`
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Peak force asymmetry
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.peakForceAsym != null
                        ? `${forcePlateSummary.peakForceAsym.toFixed(
                            1
                          )} %`
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Contact time
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.contactTime != null
                        ? `${forcePlateSummary.contactTime.toFixed(
                            3
                          )} s`
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Flight time
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.flightTime != null
                        ? `${forcePlateSummary.flightTime.toFixed(
                            3
                          )} s`
                        : "--"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      RSI
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {forcePlateSummary.rsi != null
                        ? forcePlateSummary.rsi.toFixed(2)
                        : "--"}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* RAW METRICS TABLE */}
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
              <h2 className="text-sm font-semibold text-lime-300 mb-3">
                Raw metrics (debug view)
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
                        <th className="py-1 px-2 text-left">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => (
                        <tr
                          key={m.id}
                          className="border-t border-slate-800"
                        >
                          <td className="py-1 px-2 font-mono">
                            {m.key}
                          </td>
                          <td className="py-1 px-2">
                            {m.rep_index == null ? "—" : m.rep_index}
                          </td>
                          <td className="py-1 px-2">
                            {m.value != null ? m.value : "—"}
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