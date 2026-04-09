"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";
import { createClient } from "@supabase/supabase-js";

import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  ComposedChart,
  Scatter,
} from "recharts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ----------------- HELPERS -----------------
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function mean(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length
  );
}

function computeRTS(peakSpeed: number | null, split20: number | null, repSpeeds: number[]) {
  if (!peakSpeed || !split20 || repSpeeds.length < 2) return null;

  const sd = stdDev(repSpeeds);
  const m = mean(repSpeeds);

  const consistency = clamp(1 - sd / m, 0, 1);
  const speedScore = clamp((peakSpeed - 5) / 4, 0, 1);
  const splitScore = clamp((4.5 - split20) / 1.5, 0, 1);

  const combined =
    0.4 * speedScore + 0.3 * splitScore + 0.3 * consistency;

  return Math.round(combined * 100);
}

// ----------------- PAGE -----------------
export default function ComparePage() {
  const { id: athleteId } = useParams<{ id: string }>();

  const [injuries, setInjuries] = useState<any[]>([]);
  const [selectedInjury, setSelectedInjury] = useState<string | null>(null);

  const [sessions, setSessions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // UI: how many days before/after injury?
  const [windowSize, setWindowSize] = useState(28); // 4 weeks

  // Load injuries + sessions + metrics
  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: inj } = await supabase
        .from("injuries")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("date_injured", { ascending: false });

      setInjuries(inj || []);

      const { data: sess } = await supabase
        .from("sessions")
        .select("id, created_at")
        .eq("athlete_id", athleteId)
        .order("created_at");

      setSessions(sess || []);

      if (sess?.length) {
        const ids = sess.map((s) => s.id);
        const { data: mets } = await supabase
          .from("metrics")
          .select("*")
          .in("session_id", ids);

        setMetrics(mets || []);
      }

      setLoading(false);
    }

    load();
  }, [athleteId]);

  // ----------------- If no injury selected yet -----------------
  if (!selectedInjury) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <DashboardNav />
        <section className="mx-auto max-w-4xl px-6 pt-6">
          <h1 className="text-xl font-semibold mb-4">Compare pre/post injury</h1>

          {loading ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : injuries.length === 0 ? (
            <p className="text-sm text-slate-500">No injuries recorded.</p>
          ) : (
            <div className="space-y-3">
              {injuries.map((inj) => (
                <button
                  key={inj.id}
                  onClick={() => setSelectedInjury(inj.id)}
                  className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-800"
                >
                  <p className="text-sm font-semibold text-lime-300">
                    {inj.diagnosis}
                  </p>
                  <p className="text-xs text-slate-400">
                    Injured:{" "}
                    {inj.date_injured &&
                      new Date(inj.date_injured).toLocaleDateString("en-AU")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    );
  }

  // ----------------- INJURY SELECTED -----------------
  const injury = injuries.find((i) => i.id === selectedInjury);
  if (!injury) {
    return <p>Error: injury not found.</p>;
  }

  const injDate = injury.date_injured
    ? new Date(injury.date_injured).getTime()
    : null;

  const beforeStart = injDate ? injDate - windowSize * 86400000 : null;
  const afterEnd = injDate ? injDate + windowSize * 86400000 : null;

  const beforeSessions = injDate
    ? sessions.filter((s) => {
        const t = new Date(s.created_at).getTime();
        return t >= beforeStart! && t < injDate!;
      })
    : [];

  const afterSessions = injDate
    ? sessions.filter((s) => {
        const t = new Date(s.created_at).getTime();
        return t > injDate! && t <= afterEnd!;
      })
    : [];

  function extractSummary(sessionId: string) {
    const m = metrics.filter((x) => x.session_id === sessionId);

    const peakSpeed =
      m.find((x) => x.key === "peakSpeed" && x.rep_index == null)?.value ??
      null;

    const peakForce =
      m.find((x) => x.key === "peakForce" && x.rep_index == null)?.value ??
      null;

    const peakPower =
      m.find((x) => x.key === "peakPower" && x.rep_index == null)?.value ??
      null;

    const split20 =
      m.find((x) => x.key === "split20m" && x.rep_index == null)?.value ??
      null;

    const repSpeeds = m
      .filter((x) => x.key === "peakSpeed" && x.rep_index != null)
      .map((x) => x.value);

    const rts = computeRTS(peakSpeed, split20, repSpeeds);

    return { peakSpeed, peakForce, peakPower, split20, rts };
  }

  const beforeSummaries = beforeSessions.map((s) =>
    extractSummary(s.id)
  );
  const afterSummaries = afterSessions.map((s) =>
    extractSummary(s.id)
  );

  function avgValue(arr: any[], key: string) {
    const vals = arr.map((x) => x[key]).filter((x) => x != null);
    return vals.length ? mean(vals) : null;
  }

  const beforeAvg = {
    peakSpeed: avgValue(beforeSummaries, "peakSpeed"),
    peakForce: avgValue(beforeSummaries, "peakForce"),
    peakPower: avgValue(beforeSummaries, "peakPower"),
    split20: avgValue(beforeSummaries, "split20"),
    rts: avgValue(beforeSummaries, "rts"),
  };

  const afterAvg = {
    peakSpeed: avgValue(afterSummaries, "peakSpeed"),
    peakForce: avgValue(afterSummaries, "peakForce"),
    peakPower: avgValue(afterSummaries, "peakPower"),
    split20: avgValue(afterSummaries, "split20"),
    rts: avgValue(afterSummaries, "rts"),
  };

  function delta(before: number | null, after: number | null) {
    if (before == null || after == null) return null;
    return ((after - before) / before) * 100;
  }

  const deltas = {
    peakSpeed: delta(beforeAvg.peakSpeed, afterAvg.peakSpeed),
    peakForce: delta(beforeAvg.peakForce, afterAvg.peakForce),
    peakPower: delta(beforeAvg.peakPower, afterAvg.peakPower),
    split20: delta(beforeAvg.split20, afterAvg.split20),
    rts: delta(beforeAvg.rts, afterAvg.rts),
  };

  // ----------------- UI -----------------
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-6xl px-6 pt-6 pb-10">
        <button
          onClick={() => setSelectedInjury(null)}
          className="mb-6 text-xs text-slate-400 hover:text-lime-300"
        >
          ← Back to injury list
        </button>

        <h1 className="text-xl font-semibold mb-2">
          Pre vs Post Injury Comparison
        </h1>

        <p className="text-xs text-slate-400 mb-6">
          Injury:{" "}
          <span className="text-lime-300 font-semibold">
            {injury.diagnosis}
          </span>{" "}
          •{" "}
          {new Date(injury.date_injured).toLocaleDateString("en-AU")}
        </p>

        {/* Window selector */}
        <div className="mb-8">
          <label className="text-xs text-slate-400">
            Comparison window (days either side)
          </label>
          <input
            type="number"
            className="ml-2 w-20 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs"
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
          />
        </div>

        {/* SUMMARY GRID */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {/* Before */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-300">
              Before injury
            </h2>

            {beforeSessions.length === 0 ? (
              <p className="text-xs text-slate-500">No testing data.</p>
            ) : (
              <div className="space-y-1">
                <p>
                  Peak speed:{" "}
                  <span className="text-lime-300">
                    {beforeAvg.peakSpeed?.toFixed(2) ?? "--"} m/s
                  </span>
                </p>
                <p>
                  Peak force:{" "}
                  <span className="text-lime-300">
                    {beforeAvg.peakForce?.toFixed(0) ?? "--"} N
                  </span>
                </p>
                <p>
                  Peak power:{" "}
                  <span className="text-lime-300">
                    {beforeAvg.peakPower?.toFixed(0) ?? "--"} W
                  </span>
                </p>
                <p>
                  20m split:{" "}
                  <span className="text-lime-300">
                    {beforeAvg.split20?.toFixed(2) ?? "--"} s
                  </span>
                </p>
                <p>
                  RTS:{" "}
                  <span className="text-lime-300">
                    {beforeAvg.rts?.toFixed(0) ?? "--"}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* After */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-300">
              After injury
            </h2>

            {afterSessions.length === 0 ? (
              <p className="text-xs text-slate-500">No testing data.</p>
            ) : (
              <div className="space-y-1">
                <p>
                  Peak speed:{" "}
                  <span className="text-lime-300">
                    {afterAvg.peakSpeed?.toFixed(2) ?? "--"} m/s
                  </span>
                </p>
                <p>
                  Peak force:{" "}
                  <span className="text-lime-300">
                    {afterAvg.peakForce?.toFixed(0) ?? "--"} N
                  </span>
                </p>
                <p>
                  Peak power:{" "}
                  <span className="text-lime-300">
                    {afterAvg.peakPower?.toFixed(0) ?? "--"} W
                  </span>
                </p>
                <p>
                  20m split:{" "}
                  <span className="text-lime-300">
                    {afterAvg.split20?.toFixed(2) ?? "--"} s
                  </span>
                </p>
                <p>
                  RTS:{" "}
                  <span className="text-lime-300">
                    {afterAvg.rts?.toFixed(0) ?? "--"}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* DELTAS */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs mb-10">
          <h2 className="mb-3 text-sm font-semibold text-lime-300">
            Changes after injury
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(deltas).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <p className="capitalize text-slate-300">{key}</p>
                <p
                  className={
                    value == null
                      ? "text-slate-500"
                      : value > 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }
                >
                  {value == null
                    ? "--"
                    : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CHARTS */}
        {/* RTS trend */}
        <div className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="mb-3 text-sm font-semibold text-lime-300">
            RTS trend across comparison window
          </h2>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[
                  ...beforeSessions.map((s) => {
                    const m = metrics.filter((x) => x.session_id === s.id);
                    const peak = m.find((x) => x.key === "peakSpeed" && x.rep_index == null)?.value ?? null;
                    const split20 = m.find((x) => x.key === "split20m" && x.rep_index == null)?.value ?? null;
                    const reps = m.filter((x) => x.key === "peakSpeed" && x.rep_index != null).map((x) => x.value);
                    const rts = computeRTS(peak, split20, reps);

                    return {
                      date: new Date(s.created_at).toLocaleDateString("en-AU", {
                        day: "2-digit",
                        month: "short",
                      }),
                      rts,
                      phase: "before",
                    };
                  }),
                  ...afterSessions.map((s) => {
                    const m = metrics.filter((x) => x.session_id === s.id);
                    const peak = m.find((x) => x.key === "peakSpeed" && x.rep_index == null)?.value ?? null;
                    const split20 = m.find((x) => x.key === "split20m" && x.rep_index == null)?.value ?? null;
                    const reps = m.filter((x) => x.key === "peakSpeed" && x.rep_index != null).map((x) => x.value);
                    const rts = computeRTS(peak, split20, reps);

                    return {
                      date: new Date(s.created_at).toLocaleDateString("en-AU", {
                        day: "2-digit",
                        month: "short",
                      }),
                      rts,
                      phase: "after",
                    };
                  }),
                ]}
              >
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020617",
                    borderColor: "#4b5563",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />

                <Line
                  type="monotone"
                  dataKey="rts"
                  stroke="#a3e635"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </section>
    </main>
  );
}