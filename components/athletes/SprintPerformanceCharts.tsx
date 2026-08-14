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
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import {
  computeForceVelocityProfile,
  estimateSideSymmetry,
  movingAverage,
  normalizeDisplacement,
  parseSprintSeriesValue,
  pickBestDecelRep,
  pickBestRep,
  type SprintRep,
} from "@/lib/sprintSeries";

type Props = {
  athleteId: string;
};

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

/**
 * Recreates 1080 Motion's own Speed / Acceleration / Deceleration / Symmetry
 * report charts (Brett's reference: 1080's PDF export) using the per-sample
 * time-series data already synced into sprint_time_series, plus a
 * simplified Force-Velocity-Power profile (Samozino et al. 2016 method).
 *
 * Self-fetches: latest 1080 session with time-series data, its raw samples,
 * and athlete mass/height (falling back to a mass derived from the latest
 * Hawkins CMJ system weight when athletes.weight_kg isn't populated).
 */
export default function SprintPerformanceCharts({ athleteId }: Props) {
  const [loading, setLoading] = useState(true);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [bestRep, setBestRep] = useState<SprintRep | null>(null);
  const [decelRep, setDecelRep] = useState<SprintRep | null>(null);
  const [massKg, setMassKg] = useState<number | null>(null);
  const [massIsEstimated, setMassIsEstimated] = useState(false);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  // Whole-session values already computed by the 1080 sync — preferred over
  // deriving from raw per-sample data for the headline stat tiles, since
  // the raw acceleration channel is noisy (verified against real data; see
  // MIN_FV_R_SQUARED in lib/sprintSeries.ts). Chart lines still use the raw
  // samples (lightly smoothed for display), just not the summary numbers.
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

      let mass = athlete?.weight_kg != null ? Number(athlete.weight_kg) : null;
      let estimated = false;
      if (mass == null) {
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
            estimated = true;
          }
        }
      }

      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, session_date, test_sub_type")
        .eq("athlete_id", athleteId)
        .eq("source", "1080")
        .order("session_date", { ascending: false })
        .limit(10);

      let reps: SprintRep[] = [];
      let label: string | null = null;
      let chosenSessionId: string | null = null;
      for (const s of sessions ?? []) {
        const { data: seriesRows } = await supabase
          .from("sprint_time_series")
          .select("rep_index, series")
          .eq("session_id", s.id as string);
        if (!seriesRows?.length) continue;
        const parsed = seriesRows
          .map((r) => ({
            repIndex: r.rep_index as number | null,
            samples: parseSprintSeriesValue(r.series),
          }))
          .filter((r) => r.samples.length > 1);
        if (parsed.length) {
          reps = parsed;
          label = s.session_date ? new Date(s.session_date as string).toLocaleDateString("en-AU") : null;
          chosenSessionId = s.id as string;
          break;
        }
      }

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

      const best = pickBestRep(reps);
      const decel = pickBestDecelRep(reps);
      setBestRep(best ? { ...best, samples: normalizeDisplacement(best.samples) } : null);
      setDecelRep(decel ? { ...decel, samples: normalizeDisplacement(decel.samples) } : null);
      setSessionLabel(label);
      setMassKg(mass);
      setMassIsEstimated(estimated);
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

  // Raw per-sample acceleration is noisy — smooth it for the chart line
  // (matches 1080's own app, which defaults to a "Smooth" view for the same
  // reason). Stat tiles below prefer the session's own computed value.
  const smoothedAccel = useMemo(
    () => (bestRep ? movingAverage(bestRep.samples.map((s) => s.a), 15) : []),
    [bestRep]
  );
  const smoothedDecelSpeed = useMemo(
    () => (decelRep ? movingAverage(decelRep.samples.map((s) => s.v), 15) : []),
    [decelRep]
  );
  const smoothedDecelAccel = useMemo(
    () => (decelRep ? movingAverage(decelRep.samples.map((s) => s.a), 15) : []),
    [decelRep]
  );

  const speedData = useMemo(
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
  const topSpeedKmh =
    sessionTopSpeedKmh ?? (bestRep?.samples.length ? Math.max(...bestRep.samples.map((s) => s.v)) * 3.6 : null);
  const maxAccel = sessionMaxAccel ?? (smoothedAccel.length ? Math.max(...smoothedAccel) : null);
  const maxDecel =
    sessionMaxDecel ?? (smoothedDecelAccel.length ? Math.abs(Math.min(...smoothedDecelAccel)) : null);

  const symmetry = useMemo(() => (bestRep ? estimateSideSymmetry(bestRep.samples) : null), [bestRep]);

  const fvProfile = useMemo(
    () => (bestRep ? computeForceVelocityProfile(bestRep.samples, massKg, heightCm) : null),
    [bestRep, massKg, heightCm]
  );

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
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={speedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                label={{ value: "Position (m)", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#9ca3af" } }}
              />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => v.toFixed(0)} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(2)} km/h`, "Speed"]}
                labelFormatter={(l: number) => `${l.toFixed(1)} m`}
              />
              <Line type="monotone" dataKey="v" dot={false} stroke="#f87171" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>

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
              {massIsEstimated || fvProfile.usedDefaultHeight ? (
                <p className="mt-2 text-[0.6rem] text-slate-500">
                  {massIsEstimated ? "Mass estimated from Hawkins CMJ system weight. " : ""}
                  {fvProfile.usedDefaultHeight ? "Height not on file — using a population average (175cm) for the air-resistance correction." : ""}
                </p>
              ) : null}
            </div>
          ) : massKg == null ? (
            <p className="mt-3 text-[0.65rem] text-slate-500">
              Force-Velocity Profile needs athlete body mass — add it on the athlete profile, or record a Hawkins
              CMJ test, to unlock this.
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
          stats={<StatTile label="Max Acceleration" value={maxAccel != null ? `${maxAccel.toFixed(2)} m/s²` : "—"} />}
        >
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={accelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                label={{ value: "Position (m)", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#9ca3af" } }}
              />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => v.toFixed(1)} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(2)} m/s²`, "Acceleration"]}
                labelFormatter={(l: number) => `${l.toFixed(1)} m`}
              />
              <Line type="monotone" dataKey="a" dot={false} stroke="#a3e635" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Deceleration"
          subtitle={decelRep?.repIndex !== bestRep?.repIndex ? "Strongest braking rep in this session" : null}
          stats={<StatTile label="Max Deceleration" value={maxDecel != null ? `${maxDecel.toFixed(2)} m/s²` : "—"} />}
        >
          {decelData.length ? (
            <ResponsiveContainer width="100%" height={200}>
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
                <Line type="monotone" dataKey="v" dot={false} stroke="#f87171" strokeWidth={2} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-slate-500">No rep with a clear braking phase found.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Symmetry"
          subtitle="Peak force, step length &amp; frequency — estimated from step detection, not a direct 1080 measurement"
        >
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={speedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                label={{ value: "Position (m)", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#9ca3af" } }}
              />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => v.toFixed(0)} />
              <Tooltip formatter={(value: number) => [`${value.toFixed(2)} km/h`, "Speed"]} labelFormatter={(l: number) => `${l.toFixed(1)} m`} />
              <Line type="monotone" dataKey="v" dot={false} stroke="#38bdf8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>

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
          ) : (
            <p className="mt-3 text-[0.65rem] text-slate-500">Could not detect distinct steps in this rep.</p>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
