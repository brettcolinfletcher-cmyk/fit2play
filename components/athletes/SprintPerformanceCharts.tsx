"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
  Scatter,
  Cell,
  ReferenceDot,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import ZoomableChart from "@/components/charts/ZoomableChart";
import {
  computeForceVelocityProfile,
  estimateSampleRateHz,
  estimateSideSymmetry,
  filtfiltLowpass,
  normalizeDisplacement,
  parseSprintSeriesValue,
  pickBestDecelRep,
  pickBestRep,
  type SprintRep,
} from "@/lib/sprintSeries";

type Props = {
  athleteId: string;
};

type CandidateRep = SprintRep & { sessionId: string; sessionDate: string | null };

// Cutoff for chart-line / fallback-stat display smoothing (Speed/Acceleration
// /Deceleration). Separate from the Force-Velocity profile's 1Hz cutoff,
// which was tuned specifically for regression cleanliness — this one is
// tuned to look like 1080's own "Smooth"/"Steps" view without blunting the
// acceleration phase's early peak. See lib/sprintSeries.ts MIN_FV_R_SQUARED
// for the FV-specific verification.
const CHART_LOWPASS_HZ = 2.0;

const cardStyle: React.CSSProperties = {
  backgroundColor: "rgba(2,6,23,0.5)",
  border: "1px solid rgba(30,41,59,0.9)",
};

function StatTile({ label, value, delta }: { label: string; value: string; delta?: string | null }) {
  return (
    <div className="rounded-lg p-3" style={cardStyle}>
      <p className="text-[0.62rem] uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-lg font-bold tabular-nums text-slate-50">{value}</p>
        {delta ? <p className="text-[0.62rem] text-amber-400">{delta}</p> : null}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  stats,
}: {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
  stats?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-800/80 pb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</p>
        {subtitle ? <p className="truncate text-[0.65rem] text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="mt-3">{children}</div>
      {stats ? <div className="mt-3 grid grid-cols-2 gap-2">{stats}</div> : null}
    </div>
  );
}

type SideCompare = { lowerSide: "left" | "right"; pct: number; diff: number; unit: string } | null;

function compareSides(left: number | null, right: number | null, unit: string): SideCompare {
  if (left == null || right == null) return null;
  if (left === right) return { lowerSide: "left", pct: 0, diff: 0, unit };
  const lowerSide = left < right ? "left" : "right";
  const lowerVal = Math.min(left, right);
  const higherVal = Math.max(left, right);
  const diff = higherVal - lowerVal;
  const pct = higherVal !== 0 ? (diff / higherVal) * 100 : 0;
  return { lowerSide, pct, diff, unit };
}

function SideCompareRow({ label, cmp }: { label: string; cmp: SideCompare }) {
  if (!cmp) return null;
  const lowerLabel = cmp.lowerSide === "left" ? "Left" : "Right";
  const higherLabel = cmp.lowerSide === "left" ? "Right" : "Left";
  const dotColor = cmp.lowerSide === "left" ? "#fbbf24" : "#38bdf8";
  return (
    <div className="flex items-center gap-2 text-[0.68rem] text-slate-300">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
      <span className="text-slate-500">{label}:</span>
      <span>
        {lowerLabel} {cmp.pct.toFixed(1)}% lower than {higherLabel} ({cmp.diff.toFixed(2)} {cmp.unit})
      </span>
    </div>
  );
}

/**
 * Recreates 1080 Motion's own Speed / Acceleration / Deceleration / Symmetry
 * report charts (Brett's reference: 1080's PDF export) using the per-sample
 * time-series data already synced into sprint_time_series, plus a
 * simplified Force-Velocity-Power profile (Samozino et al. 2016 method).
 *
 * Self-fetches: the best 1080 sprint effort across the athlete's recent
 * sessions (not just the latest session — see the rep-selection comment
 * below for why), and athlete mass/height (falling back to a mass derived
 * from the latest Hawkins CMJ system weight when athletes.weight_kg isn't
 * populated).
 */
export default function SprintPerformanceCharts({ athleteId }: Props) {
  const [loading, setLoading] = useState(true);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [bestRep, setBestRep] = useState<SprintRep | null>(null);
  const [decelRep, setDecelRep] = useState<SprintRep | null>(null);
  const [massKg, setMassKg] = useState<number | null>(null);
  const [massSource, setMassSource] = useState<"hawkins" | "profile" | null>(null);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  // Whole-session values already computed by the 1080 sync — preferred over
  // deriving from raw per-sample data for the headline stat tiles, since
  // the raw acceleration/velocity channels are noisy (verified against real
  // data; see MIN_FV_R_SQUARED in lib/sprintSeries.ts). Chart lines use the
  // raw samples (filtered for display), just not the summary numbers.
  const [sessionTopSpeedKmh, setSessionTopSpeedKmh] = useState<number | null>(null);
  const [sessionMaxAccel, setSessionMaxAccel] = useState<number | null>(null);
  const [sessionMaxDecel, setSessionMaxDecel] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);

      const { data: athlete } = await supabase
        .from("athletes")
        .select("weight_kg, height_cm")
        .eq("id", athleteId)
        .maybeSingle();

      // Hawkins force-plate system weight (recorded at the start of a CMJ
      // test) is a direct force-plate measurement — preferred over a
      // manually typed profile weight, which may be stale or self-reported.
      // Falls back to athletes.weight_kg only when no CMJ test is on file.
      let mass: number | null = null;
      let massSourceVal: "hawkins" | "profile" | null = null;

      const { data: cmjSessions } = await supabase
        .from("sessions")
        .select("id, session_date")
        .eq("athlete_id", athleteId)
        .eq("source", "hawkins")
        .eq("test_type", "force_plate_cmj")
        .order("session_date", { ascending: false })
        .limit(1);
      const cmjId = cmjSessions?.[0]?.id as string | undefined;
      if (cmjId) {
        const { data: weightRows } = await supabase
          .from("metrics")
          .select("value")
          .eq("session_id", cmjId)
          .eq("key", "fp_system_weight");
        const weightN = weightRows?.length
          ? Math.max(...weightRows.map((r) => Number(r.value)).filter((v) => Number.isFinite(v)))
          : null;
        if (weightN != null && Number.isFinite(weightN)) {
          mass = weightN / 9.81; // N -> kg
          massSourceVal = "hawkins";
        }
      }
      if (mass == null && athlete?.weight_kg != null) {
        mass = Number(athlete.weight_kg);
        massSourceVal = "profile";
      }

      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, session_date")
        .eq("athlete_id", athleteId)
        .eq("source", "1080")
        .order("session_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(10);

      // Gather reps from every recent session and pick the best one by net
      // displacement across ALL of them, instead of trusting "the latest
      // session" alone. Two real bugs made that unsafe: (1) session_date has
      // no time component, so same-day 1080 sessions can tie in sort order
      // with no reliable winner, and (2) 1080's own test_sub_type label is
      // unreliable — the sync takes it from the first rep in a session, so a
      // session containing a real 40m sprint can get mislabeled as something
      // else entirely. Picking at the rep level (like findFortyMBySide in
      // lib/performanceSummary.ts) sidesteps both. Confirmed against real
      // data: this is exactly what caused a wrong "Top Speed" (18.09 km/h
      // instead of the true 25.86 km/h) for one athlete in Aug 2026.
      const candidateReps: CandidateRep[] = [];
      for (const s of sessions ?? []) {
        const { data: seriesRows } = await supabase
          .from("sprint_time_series")
          .select("rep_index, series")
          .eq("session_id", s.id as string);
        for (const r of seriesRows ?? []) {
          const samples = parseSprintSeriesValue(r.series);
          if (samples.length > 1) {
            candidateReps.push({
              repIndex: r.rep_index as number | null,
              samples,
              sessionId: s.id as string,
              sessionDate: (s.session_date as string | null) ?? null,
            });
          }
        }
        // Stop once a clearly-real sprint effort has been found (net
        // displacement >= 20m) — keeps this fast in the common case while
        // still scanning further back when the latest session(s) turn out
        // to be short drills/blips with no real sprint in them.
        const hasRealEffort = candidateReps.some(
          (r) => r.samples.length > 1 && Math.abs(r.samples[r.samples.length - 1].x - r.samples[0].x) >= 20
        );
        if (hasRealEffort) break;
      }

      const best = pickBestRep(candidateReps);
      const decel = pickBestDecelRep(candidateReps);
      const chosenSessionId = best?.sessionId ?? null;
      const label = best?.sessionDate ? new Date(best.sessionDate).toLocaleDateString("en-AU") : null;

      let topSpeedKmh: number | null = null;
      let maxAccel: number | null = null;
      let maxDecel: number | null = null;
      if (chosenSessionId) {
        const { data: sessionMetrics } = await supabase
          .from("metrics")
          .select("key, value")
          .eq("session_id", chosenSessionId)
          .in("key", ["top_speed", "accel_max", "decel_max"]);
        const byKey = (key: string) => {
          const vals = (sessionMetrics ?? [])
            .filter((r) => r.key === key)
            .map((r) => Number(r.value))
            .filter((v) => Number.isFinite(v));
          return vals.length ? Math.max(...vals) : null;
        };
        const topSpeedMs = byKey("top_speed");
        topSpeedKmh = topSpeedMs != null ? topSpeedMs * 3.6 : null;
        maxAccel = byKey("accel_max");
        maxDecel = byKey("decel_max");
      }

      if (cancelled) return;

      setBestRep(best ? { repIndex: best.repIndex, samples: normalizeDisplacement(best.samples) } : null);
      setDecelRep(decel ? { repIndex: decel.repIndex, samples: normalizeDisplacement(decel.samples) } : null);
      setSessionLabel(label);
      setMassKg(mass);
      setMassSource(massSourceVal);
      setHeightCm(athlete?.height_cm != null ? Number(athlete.height_cm) : null);
      setSessionTopSpeedKmh(topSpeedKmh);
      setSessionMaxAccel(maxAccel);
      setSessionMaxDecel(maxDecel);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  // Zero-phase low-pass filtered velocity — used for the Speed chart line
  // and as the fallback source for Top Speed / Max Accel / Max Decel when
  // the device's own session-level metric isn't available. Raw per-sample
  // velocity is noisy (verified against real data — see MIN_FV_R_SQUARED in
  // lib/sprintSeries.ts): an unfiltered max(v) overstates top speed by
  // ~9% from sample jitter alone.
  const bestSampleRateHz = useMemo(() => (bestRep ? estimateSampleRateHz(bestRep.samples) : 0), [bestRep]);
  const decelSampleRateHz = useMemo(() => (decelRep ? estimateSampleRateHz(decelRep.samples) : 0), [decelRep]);

  const smoothedSpeed = useMemo(
    () =>
      bestRep && bestSampleRateHz > 0
        ? filtfiltLowpass(bestRep.samples.map((s) => s.v), CHART_LOWPASS_HZ, bestSampleRateHz)
        : bestRep?.samples.map((s) => s.v) ?? [],
    [bestRep, bestSampleRateHz]
  );
  const smoothedAccel = useMemo(
    () =>
      bestRep && bestSampleRateHz > 0
        ? filtfiltLowpass(bestRep.samples.map((s) => s.a), CHART_LOWPASS_HZ, bestSampleRateHz)
        : bestRep?.samples.map((s) => s.a) ?? [],
    [bestRep, bestSampleRateHz]
  );
  const smoothedDecelSpeed = useMemo(
    () =>
      decelRep && decelSampleRateHz > 0
        ? filtfiltLowpass(decelRep.samples.map((s) => s.v), CHART_LOWPASS_HZ, decelSampleRateHz)
        : decelRep?.samples.map((s) => s.v) ?? [],
    [decelRep, decelSampleRateHz]
  );
  const smoothedDecelAccel = useMemo(
    () =>
      decelRep && decelSampleRateHz > 0
        ? filtfiltLowpass(decelRep.samples.map((s) => s.a), CHART_LOWPASS_HZ, decelSampleRateHz)
        : decelRep?.samples.map((s) => s.a) ?? [],
    [decelRep, decelSampleRateHz]
  );

  // Speed chart (smoothed, matches 1080's own default "Smooth" view — a
  // clean rising curve). The Symmetry chart below deliberately reuses the
  // RAW, unsmoothed velocity instead, since 1080's own Symmetry view shows
  // the step-to-step oscillation rather than hiding it.
  const speedChartData = useMemo(
    () =>
      bestRep?.samples.map((s, i) => ({
        x: Math.round(s.x * 10) / 10,
        v: Math.round(smoothedSpeed[i] * 3.6 * 100) / 100,
      })) ?? [],
    [bestRep, smoothedSpeed]
  );
  const rawSpeedData = useMemo(
    () => bestRep?.samples.map((s) => ({ x: Math.round(s.x * 10) / 10, v: Math.round(s.v * 3.6 * 100) / 100 })) ?? [],
    [bestRep]
  );
  const accelData = useMemo(
    () =>
      bestRep?.samples.map((s, i) => ({
        x: Math.round(s.x * 10) / 10,
        a: Math.round(smoothedAccel[i] * 100) / 100,
      })) ?? [],
    [bestRep, smoothedAccel]
  );
  const decelData = useMemo(
    () =>
      decelRep?.samples.map((s, i) => ({
        t: Math.round(s.t * 100) / 100,
        v: Math.round(smoothedDecelSpeed[i] * 3.6 * 100) / 100,
      })) ?? [],
    [decelRep, smoothedDecelSpeed]
  );

  const totalTime = bestRep?.samples.length ? bestRep.samples[bestRep.samples.length - 1].t : null;
  const topSpeedKmh = sessionTopSpeedKmh ?? (smoothedSpeed.length ? Math.max(...smoothedSpeed) * 3.6 : null);
  const maxAccel = sessionMaxAccel ?? (smoothedAccel.length ? Math.max(...smoothedAccel) : null);
  const maxDecel =
    sessionMaxDecel ?? (smoothedDecelAccel.length ? Math.abs(Math.min(...smoothedDecelAccel)) : null);

  // Where to draw the Speed chart's top-speed marker dot — x-position comes
  // from the local smoothed curve's own peak, y-value from the authoritative
  // topSpeedKmh (device metric when available).
  const topSpeedPoint = useMemo(() => {
    if (!bestRep || !smoothedSpeed.length || topSpeedKmh == null) return null;
    let idx = 0;
    for (let i = 1; i < smoothedSpeed.length; i++) {
      if (smoothedSpeed[i] > smoothedSpeed[idx]) idx = i;
    }
    return { x: Math.round(bestRep.samples[idx].x * 10) / 10, v: Math.round(topSpeedKmh * 100) / 100 };
  }, [bestRep, smoothedSpeed, topSpeedKmh]);

  // 1080's own Acceleration view zooms into just the acceleration phase
  // (peak accel happens almost immediately, then decays over a much shorter
  // distance than the whole sprint) rather than showing the full run —
  // matched here by cropping to where the smoothed curve has decayed to
  // 25% of its peak, instead of a hardcoded distance.
  const accelXMax = useMemo(() => {
    if (!accelData.length) return undefined;
    let peakIdx = 0;
    for (let i = 1; i < accelData.length; i++) {
      if (accelData[i].a > accelData[peakIdx].a) peakIdx = i;
    }
    const peakVal = accelData[peakIdx].a;
    if (!(peakVal > 0)) return undefined;
    const threshold = peakVal * 0.25;
    let cutIdx = accelData.length - 1;
    for (let i = peakIdx; i < accelData.length; i++) {
      if (accelData[i].a <= threshold) {
        cutIdx = i;
        break;
      }
    }
    const xAtCut = accelData[cutIdx]?.x ?? accelData[accelData.length - 1].x;
    return Math.max(2, Math.ceil(xAtCut * 1.15));
  }, [accelData]);

  const symmetry = useMemo(() => (bestRep ? estimateSideSymmetry(bestRep.samples) : null), [bestRep]);

  const symmetryStepPoints = useMemo(
    () =>
      symmetry?.steps.map((s) => ({
        x: Math.round(s.x * 10) / 10,
        v: Math.round(s.v * 3.6 * 100) / 100,
        leg: s.leg,
      })) ?? [],
    [symmetry]
  );

  const symmetryOverview = useMemo(() => {
    if (!symmetry || !symmetry.steps.length) return null;
    const allForces = symmetry.steps.map((s) => s.peakForce);
    const avgPeakForce = allForces.reduce((a, b) => a + b, 0) / allForces.length;

    const totalSteps = symmetry.leftSteps + symmetry.rightSteps;
    const weightedAvg = (left: number | null, right: number | null) => {
      if (left != null && right != null && totalSteps > 0) {
        return (left * symmetry.leftSteps + right * symmetry.rightSteps) / totalSteps;
      }
      return left ?? right ?? null;
    };
    const avgStepLength = weightedAvg(symmetry.leftStepLength, symmetry.rightStepLength);
    const avgFrequency = weightedAvg(symmetry.leftFrequency, symmetry.rightFrequency);

    const first = symmetry.steps[0];
    const last = symmetry.steps[symmetry.steps.length - 1];
    const totalDistance = Math.abs(last.x - first.x);

    return {
      avgPeakForce,
      avgStepLength,
      avgFrequency,
      totalDistance,
      peakForceCompare: compareSides(symmetry.leftPeakForce, symmetry.rightPeakForce, "N"),
      stepLengthCompare: compareSides(symmetry.leftStepLength, symmetry.rightStepLength, "m"),
      frequencyCompare: compareSides(symmetry.leftFrequency, symmetry.rightFrequency, "Hz"),
    };
  }, [symmetry]);

  const fvProfile = useMemo(
    () => (bestRep ? computeForceVelocityProfile(bestRep.samples, massKg, heightCm) : null),
    [bestRep, massKg, heightCm]
  );

  const fvChartData = useMemo(() => {
    if (!fvProfile) return null;
    const scatter = fvProfile.chartPoints.map((p) => ({
      v: Math.round(p.v * 3.6 * 100) / 100,
      force: Math.round(p.force * 100) / 100,
    }));
    const line = [
      { v: 0, force: fvProfile.f0 },
      { v: fvProfile.v0 * 3.6, force: 0 },
    ];
    const maxV = Math.max(fvProfile.v0 * 3.6, ...scatter.map((p) => p.v), 1);
    return { scatter, line, maxV };
  }, [fvProfile]);

  if (loading) return null;
  if (!bestRep) return null;

  return (
    <section className="rounded-2xl border bg-slate-950/70 p-5 f2p-dark-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Sprint Performance
          </h3>
          <p className="text-[0.65rem] text-slate-500">
            1080 Motion per-rep charts{sessionLabel ? ` · ${sessionLabel}` : ""} — best effort by distance covered.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Speed"
          stats={
            <>
              <StatTile label="Total Time" value={totalTime != null ? `${totalTime.toFixed(2)} s` : "—"} />
              <StatTile label="Top Speed" value={topSpeedKmh != null ? `${topSpeedKmh.toFixed(2)} km/h` : "—"} />
            </>
          }
        >
          <ZoomableChart title="Speed" height={200}>
            {(h) => (
              <ResponsiveContainer width="100%" height={h}>
                <LineChart data={speedChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={[0, "dataMax"]}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    label={{ value: "Position (m)", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#9ca3af" } }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => v.toFixed(0)} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(2)} km/h`, "Speed"]}
                    labelFormatter={(l: number) => `${l.toFixed(1)} m`}
                  />
                  <Line type="monotone" dataKey="v" dot={false} stroke="#f87171" strokeWidth={2} isAnimationActive={false} />
                  {topSpeedPoint ? (
                    <ReferenceDot x={topSpeedPoint.x} y={topSpeedPoint.v} r={4} fill="#ef4444" stroke="#fecaca" strokeWidth={1} />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ZoomableChart>

          {fvProfile ? (
            <div className="mt-3 rounded-lg p-3" style={cardStyle}>
              <div className="flex items-center justify-between">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">
                  Force-Velocity Profile
                </p>
                <p className="text-[0.62rem] text-slate-500">R² {fvProfile.rSquared.toFixed(2)}</p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[0.6rem] text-slate-500">F0</p>
                  <p className="text-sm font-bold tabular-nums text-slate-50">{fvProfile.f0.toFixed(1)} N/kg</p>
                </div>
                <div>
                  <p className="text-[0.6rem] text-slate-500">V0</p>
                  <p className="text-sm font-bold tabular-nums text-slate-50">{(fvProfile.v0 * 3.6).toFixed(2)} km/h</p>
                </div>
                <div>
                  <p className="text-[0.6rem] text-slate-500">Pmax</p>
                  <p className="text-sm font-bold tabular-nums text-slate-50">{fvProfile.pmax.toFixed(1)} W/kg</p>
                </div>
              </div>

              {fvChartData ? (
                <div className="mt-3">
                  <ZoomableChart title="Force-Velocity Profile" height={170}>
                    {(h) => (
                      <ResponsiveContainer width="100%" height={h}>
                        <ComposedChart margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                          <XAxis
                            type="number"
                            dataKey="v"
                            domain={[0, Math.ceil(fvChartData.maxV)]}
                            tick={{ fontSize: 9, fill: "#9ca3af" }}
                            label={{
                              value: "Velocity (km/h)",
                              position: "insideBottomRight",
                              offset: -4,
                              style: { fontSize: 9, fill: "#9ca3af" },
                            }}
                          />
                          <YAxis
                            type="number"
                            dataKey="force"
                            domain={[0, "dataMax"]}
                            tick={{ fontSize: 9, fill: "#9ca3af" }}
                            label={{ value: "Force (N/kg)", angle: -90, position: "insideLeft", style: { fontSize: 9, fill: "#9ca3af" } }}
                          />
                          <Tooltip
                            formatter={(value: number) => [`${Number(value).toFixed(2)} N/kg`, "Force"]}
                            labelFormatter={(l: number) => `${Number(l).toFixed(2)} km/h`}
                          />
                          <Scatter data={fvChartData.scatter} dataKey="force" fill="#facc15" fillOpacity={0.4} />
                          <Line
                            data={fvChartData.line}
                            type="linear"
                            dataKey="force"
                            stroke="#f87171"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </ZoomableChart>
                </div>
              ) : null}

              {massSource === "hawkins" || fvProfile.usedDefaultHeight ? (
                <p className="mt-2 text-[0.6rem] text-slate-500">
                  {massSource === "hawkins" ? "Mass from Hawkins CMJ force plate (system weight). " : ""}
                  {fvProfile.usedDefaultHeight ? "Height not on file — using a population average (175cm) for the air-resistance correction." : ""}
                </p>
              ) : null}
            </div>
          ) : massKg == null ? (
            <p className="mt-3 text-[0.65rem] text-slate-500">
              Force-Velocity Profile needs athlete body mass — record a Hawkins CMJ test (preferred, measured on the
              force plate), or add body mass on the athlete profile, to unlock this.
            </p>
          ) : (
            <p className="mt-3 text-[0.65rem] text-slate-500">
              Force-Velocity Profile not available for this rep — the fit quality was too low to trust (this effort
              likely mixes more than one running segment rather than being one clean maximal sprint).
            </p>
          )}
        </ChartCard>

        <ChartCard
          title="Acceleration"
          subtitle="Zoomed to the acceleration phase"
          stats={<StatTile label="Max Acceleration" value={maxAccel != null ? `${maxAccel.toFixed(2)} m/s²` : "—"} />}
        >
          <ZoomableChart title="Acceleration" height={200}>
            {(h) => (
              <ResponsiveContainer width="100%" height={h}>
                <LineChart data={accelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={[0, accelXMax ?? "dataMax"]}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    label={{ value: "Position (m)", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#9ca3af" } }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(2)} m/s²`, "Acceleration"]}
                    labelFormatter={(l: number) => `${l.toFixed(1)} m`}
                  />
                  <Line type="monotone" dataKey="a" dot={false} stroke="#a3e635" strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ZoomableChart>
        </ChartCard>

        <ChartCard
          title="Deceleration"
          subtitle={decelRep?.repIndex !== bestRep?.repIndex ? "Strongest braking rep in this session" : null}
          stats={<StatTile label="Max Deceleration" value={maxDecel != null ? `${maxDecel.toFixed(2)} m/s²` : "—"} />}
        >
          {decelData.length ? (
            <ZoomableChart title="Deceleration" height={200}>
              {(h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <LineChart data={decelData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      label={{ value: "Time (s)", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#9ca3af" } }}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => v.toFixed(0)} />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(2)} km/h`, "Speed"]}
                      labelFormatter={(l: number) => `${l.toFixed(2)} s`}
                    />
                    <Line type="monotone" dataKey="v" dot={false} stroke="#f87171" strokeWidth={2} strokeDasharray="4 3" isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ZoomableChart>
          ) : (
            <p className="text-xs text-slate-500">No rep with a clear braking phase found.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Symmetry"
          subtitle="Left vs right, estimated from step detection — not a direct 1080 measurement"
        >
          {rawSpeedData.length ? (
            <ZoomableChart title="Symmetry" height={190}>
              {(h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <ComposedChart margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={[0, "dataMax"]}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      label={{ value: "Position (m)", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#9ca3af" } }}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => v.toFixed(0)} />
                    <Tooltip
                      formatter={(value: number) => [`${Number(value).toFixed(2)} km/h`, "Speed"]}
                      labelFormatter={(l: number) => `${Number(l).toFixed(1)} m`}
                    />
                    <Line data={rawSpeedData} type="monotone" dataKey="v" dot={false} stroke="#38bdf8" strokeWidth={1.25} isAnimationActive={false} />
                    <Scatter data={symmetryStepPoints} dataKey="v">
                      {symmetryStepPoints.map((d, i) => (
                        <Cell key={i} fill={d.leg === "left" ? "#fbbf24" : "#0f172a"} stroke={d.leg === "left" ? "#fbbf24" : "#38bdf8"} r={3} />
                      ))}
                    </Scatter>
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ZoomableChart>
          ) : (
            <p className="text-xs text-slate-500">Could not detect distinct steps in this rep.</p>
          )}

          {symmetryOverview ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[0.68rem]">
              <div className="rounded-lg p-2" style={cardStyle}>
                <p className="text-slate-500">Average peak force</p>
                <p className="font-bold tabular-nums text-slate-50">{symmetryOverview.avgPeakForce.toFixed(1)} N</p>
              </div>
              <div className="rounded-lg p-2" style={cardStyle}>
                <p className="text-slate-500">Average step length</p>
                <p className="font-bold tabular-nums text-slate-50">
                  {symmetryOverview.avgStepLength?.toFixed(2) ?? "—"} m
                </p>
              </div>
              <div className="rounded-lg p-2" style={cardStyle}>
                <p className="text-slate-500">Total distance</p>
                <p className="font-bold tabular-nums text-slate-50">{symmetryOverview.totalDistance.toFixed(2)} m</p>
              </div>
              <div className="rounded-lg p-2" style={cardStyle}>
                <p className="text-slate-500">Average frequency</p>
                <p className="font-bold tabular-nums text-slate-50">
                  {symmetryOverview.avgFrequency?.toFixed(2) ?? "—"} Hz
                </p>
              </div>
            </div>
          ) : null}

          {symmetryOverview &&
          (symmetryOverview.peakForceCompare || symmetryOverview.stepLengthCompare || symmetryOverview.frequencyCompare) ? (
            <div className="mt-3 space-y-1.5 rounded-lg p-2" style={cardStyle}>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Side comparison</p>
              <SideCompareRow label="Peak force" cmp={symmetryOverview.peakForceCompare} />
              <SideCompareRow label="Step length" cmp={symmetryOverview.stepLengthCompare} />
              <SideCompareRow label="Frequency" cmp={symmetryOverview.frequencyCompare} />
            </div>
          ) : null}

          {symmetry && (symmetry.leftSteps > 0 || symmetry.rightSteps > 0) ? (
            <div className="mt-3 grid grid-cols-2 gap-3 text-center text-[0.7rem]">
              <div className="rounded-lg p-2" style={cardStyle}>
                <p className="text-[0.62rem] font-semibold text-amber-300">Left · {symmetry.leftSteps} steps</p>
                <p className="mt-1 text-slate-300">Peak force {symmetry.leftPeakForce?.toFixed(1) ?? "—"} N</p>
                <p className="text-slate-300">Step length {symmetry.leftStepLength?.toFixed(2) ?? "—"} m</p>
                <p className="text-slate-300">Frequency {symmetry.leftFrequency?.toFixed(2) ?? "—"} Hz</p>
              </div>
              <div className="rounded-lg p-2" style={cardStyle}>
                <p className="text-[0.62rem] font-semibold text-sky-300">Right · {symmetry.rightSteps} steps</p>
                <p className="mt-1 text-slate-300">Peak force {symmetry.rightPeakForce?.toFixed(1) ?? "—"} N</p>
                <p className="text-slate-300">Step length {symmetry.rightStepLength?.toFixed(2) ?? "—"} m</p>
                <p className="text-slate-300">Frequency {symmetry.rightFrequency?.toFixed(2) ?? "—"} Hz</p>
              </div>
            </div>
          ) : null}
        </ChartCard>
      </div>
    </section>
  );
}
