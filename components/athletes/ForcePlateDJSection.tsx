"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SectionComment from "./SectionComment";

export type DJDataPoint = {
  date: string;
  t: number;
  rsi: number | null;
  jump_height_cm: number | null;
  contact_time_ms: number | null;
  peak_propulsive_force: number | null;
  peak_braking_force: number | null;
};

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(30 41 59)",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

type MetricId =
  | "rsi"
  | "jump_height_cm"
  | "contact_time_ms"
  | "peak_propulsive_force"
  | "peak_braking_force";

const DJ_PILLS: { id: MetricId; label: string }[] = [
  { id: "rsi", label: "RSI" },
  { id: "jump_height_cm", label: "Jump Height" },
  { id: "contact_time_ms", label: "Contact Time" },
  { id: "peak_propulsive_force", label: "Peak Propulsive Force" },
  { id: "peak_braking_force", label: "Peak Braking Force" },
];

const DJ_META: Record<
  MetricId,
  { field: keyof DJDataPoint; unit: string; decimals: number; title: string }
> = {
  rsi: { field: "rsi", unit: "", decimals: 3, title: "RSI" },
  jump_height_cm: {
    field: "jump_height_cm",
    unit: "cm",
    decimals: 1,
    title: "Jump height",
  },
  contact_time_ms: {
    field: "contact_time_ms",
    unit: "ms",
    decimals: 1,
    title: "Contact time",
  },
  peak_propulsive_force: {
    field: "peak_propulsive_force",
    unit: "N",
    decimals: 0,
    title: "Peak propulsive force",
  },
  peak_braking_force: {
    field: "peak_braking_force",
    unit: "N",
    decimals: 0,
    title: "Peak braking force",
  },
};

type Props = {
  athleteId: string;
  data: DJDataPoint[];
  sectionComment: string | null;
};

export default function ForcePlateDJSection({
  athleteId,
  data,
  sectionComment,
}: Props) {
  const [visible, setVisible] = useState<Set<MetricId>>(
    () => new Set(DJ_PILLS.map((p) => p.id))
  );

  const chartRows = useMemo(
    () => [...data].sort((a, b) => a.t - b.t),
    [data]
  );

  function toggle(id: MetricId) {
    setVisible((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (data.length === 0) return null;

  return (
    <section id="drop_jump" className="scroll-mt-28 mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
        Force plate — Drop jump
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {DJ_PILLS.map(({ id, label }) => {
          const on = visible.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? "border-lime-400 bg-lime-400/15 text-lime-300"
                  : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {DJ_PILLS.filter((p) => visible.has(p.id)).map((pill) => {
          const meta = DJ_META[pill.id];
          const pts = chartRows
            .map((row) => {
              const v = row[meta.field] as number | null;
              if (v == null || !Number.isFinite(v)) return null;
              return { label: row.date, v };
            })
            .filter(Boolean) as { label: string; v: number }[];
          const enough = pts.length >= 1;
          return (
            <div
              key={pill.id}
              className="rounded-lg border border-slate-800 bg-slate-900/50 p-4"
            >
              <h3 className="mb-3 text-xs font-medium text-slate-400">{meta.title}</h3>
              {!enough ? (
                <p className="py-12 text-center text-xs text-slate-500">Not enough data</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pts}>
                      <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={AXIS_TICK}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke="#64748b"
                        tick={AXIS_TICK}
                        tickFormatter={(val) =>
                          meta.decimals === 0
                            ? String(Math.round(Number(val)))
                            : Number(val).toFixed(meta.decimals)
                        }
                        label={{
                          value: meta.unit || "—",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#94a3b8",
                          fontSize: 11,
                        }}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(label) => String(label)}
                        formatter={(v: number | string) => [
                          typeof v === "number"
                            ? v.toFixed(meta.decimals)
                            : String(v),
                          meta.title,
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke="#84cc16"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <SectionComment
        athleteId={athleteId}
        section="drop_jump"
        initialComment={sectionComment}
      />
    </section>
  );
}

type SessionLite = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type?: string | null;
};

type MetricLite = { key: string; value: number | null; rep_index: number | null };

function isDjSession(s: SessionLite): boolean {
  const tt = (s.test_type ?? "").toLowerCase();
  const st = (s.test_sub_type ?? "").toLowerCase();
  if (tt === "force_plate_dj") return true;
  if (tt === "force_plate_cmj") return false;
  if (tt.includes("dj") || tt.includes("drop")) return true;
  if (st.includes("dj") || st.includes("drop")) return true;
  return false;
}

function toContactMs(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw > 25) return raw;
  return raw * 1000;
}

export function buildDjDataPoints(
  sessions: SessionLite[],
  metricsBySession: Map<string, MetricLite[]>
): DJDataPoint[] {
  const out: DJDataPoint[] = [];
  const sorted = [...sessions].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });

  for (const s of sorted) {
    if (!s.session_date || !isDjSession(s)) continue;

    const rows = metricsBySession.get(s.id) ?? [];
    const byRep = new Map<number, Record<string, number>>();
    for (const r of rows) {
      if (r.rep_index == null || r.value == null) continue;
      if (!r.key.startsWith("fp_")) continue;
      const m = byRep.get(r.rep_index) ?? {};
      m[r.key] = r.value;
      byRep.set(r.rep_index, m);
    }

    let bestRep: Record<string, number> | null = null;
    let bestScore = -Infinity;
    for (const m of byRep.values()) {
      const jm = m.fp_jump_height;
      const jcm = m.fp_jump_height_cm_best;
      let score = -Infinity;
      if (jm != null && Number.isFinite(jm)) score = Math.max(score, jm * 100);
      if (jcm != null && Number.isFinite(jcm)) score = Math.max(score, jcm);
      if (score === -Infinity && m.fp_rsi_best != null && Number.isFinite(m.fp_rsi_best)) {
        score = m.fp_rsi_best;
      }
      if (score > bestScore) {
        bestScore = score;
        bestRep = m;
      }
    }

    if (!bestRep || bestScore === -Infinity) {
      const rsi = maxMetric(rows, "fp_rsi_best");
      const jhM = maxMetric(rows, "fp_jump_height");
      const jhCm = maxMetric(rows, "fp_jump_height_cm_best");
      const ct =
        minMetric(rows, "fp_contact_time") ??
        minMetric(rows, "fp_contact_time_s_best");
      const ppf = maxMetric(rows, "fp_peak_propulsive_force");
      const pbf = maxMetric(rows, "fp_peak_braking_force");
      if (
        rsi == null &&
        jhM == null &&
        jhCm == null &&
        ct == null &&
        ppf == null &&
        pbf == null
      ) {
        continue;
      }
      const jhCmVal = jhM != null ? jhM * 100 : jhCm;
      out.push(
        djRow(
          s.session_date,
          rsi,
          jhCmVal,
          toContactMs(ct),
          ppf,
          pbf
        )
      );
      continue;
    }

    const rsi = bestRep.fp_rsi_best ?? null;
    const jhCm =
      bestRep.fp_jump_height != null
        ? bestRep.fp_jump_height * 100
        : bestRep.fp_jump_height_cm_best ?? null;
    const ctRaw =
      bestRep.fp_contact_time ?? bestRep.fp_contact_time_s_best ?? null;
    out.push(
      djRow(
        s.session_date,
        rsi,
        jhCm,
        toContactMs(ctRaw),
        bestRep.fp_peak_propulsive_force ?? null,
        bestRep.fp_peak_braking_force ?? null
      )
    );
  }
  return out;
}

function maxMetric(rows: MetricLite[], key: string): number | null {
  const vals = rows
    .filter((r) => r.key === key && r.value != null)
    .map((r) => r.value!);
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

function minMetric(rows: MetricLite[], key: string): number | null {
  const vals = rows
    .filter((r) => r.key === key && r.value != null)
    .map((r) => r.value!);
  if (vals.length === 0) return null;
  return Math.min(...vals);
}

function djRow(
  sessionDate: string,
  rsi: number | null,
  jumpHeightCm: number | null,
  contactMs: number | null,
  peakPropulsive: number | null,
  peakBraking: number | null
): DJDataPoint {
  return {
    date: new Date(sessionDate).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "Australia/Sydney",
    }),
    t: new Date(sessionDate).getTime(),
    rsi,
    jump_height_cm: jumpHeightCm,
    contact_time_ms: contactMs,
    peak_propulsive_force: peakPropulsive,
    peak_braking_force: peakBraking,
  };
}
