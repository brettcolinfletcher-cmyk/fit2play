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

export type CMJDataPoint = {
  date: string;
  t: number;
  jump_height: number | null;
  propulsive_impulse: number | null;
  braking_impulse: number | null;
  peak_propulsive_force: number | null;
  peak_braking_force: number | null;
  mrsi: number | null;
};

export type MetricLite = { key: string; value: number | null; rep_index: number | null };

type SessionLite = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type?: string | null;
};

function isCmjSession(s: SessionLite): boolean {
  const tt = (s.test_type ?? "").toLowerCase();
  const st = (s.test_sub_type ?? "").toLowerCase();
  if (tt === "force_plate_dj") return false;
  if (tt === "force_plate_cmj") return true;
  if (tt.includes("dj") || tt.includes("drop")) return false;
  if (tt.includes("cmj")) return true;
  if (st.includes("dj") || st.includes("drop")) return false;
  if (st.includes("cmj")) return true;
  return false;
}

function maxMetric(rows: MetricLite[], key: string): number | null {
  const vals = rows
    .filter((r) => r.key === key && r.value != null)
    .map((r) => r.value!);
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(30 41 59)",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

type MetricId =
  | "jump_height"
  | "propulsive_impulse"
  | "braking_impulse"
  | "peak_propulsive_force"
  | "peak_braking_force"
  | "mrsi";

const CMJ_PILLS: { id: MetricId; label: string }[] = [
  { id: "jump_height", label: "Jump Height" },
  { id: "propulsive_impulse", label: "Propulsive Impulse" },
  { id: "braking_impulse", label: "Braking Impulse" },
  { id: "peak_propulsive_force", label: "Peak Propulsive Force" },
  { id: "peak_braking_force", label: "Peak Braking Force" },
  { id: "mrsi", label: "mRSI" },
];

const METRIC_META: Record<
  MetricId,
  { field: keyof CMJDataPoint; unit: string; decimals: number; title: string }
> = {
  jump_height: {
    field: "jump_height",
    unit: "cm",
    decimals: 1,
    title: "Jump height",
  },
  propulsive_impulse: {
    field: "propulsive_impulse",
    unit: "N·s",
    decimals: 1,
    title: "Propulsive impulse",
  },
  braking_impulse: {
    field: "braking_impulse",
    unit: "N·s",
    decimals: 1,
    title: "Braking impulse",
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
  mrsi: { field: "mrsi", unit: "", decimals: 3, title: "mRSI" },
};

type Props = {
  athleteId: string;
  data: CMJDataPoint[];
  sectionComment: string | null;
};

export default function ForcePlateCMJSection({
  athleteId,
  data,
  sectionComment,
}: Props) {
  const [visible, setVisible] = useState<Set<MetricId>>(
    () => new Set(CMJ_PILLS.map((p) => p.id))
  );

  const chartData = useMemo(() => [...data].sort((a, b) => a.t - b.t), [data]);

  function toggle(id: MetricId) {
    setVisible((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (data.length === 0) return null;

  return (
    <section id="cmj" className="scroll-mt-28 mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
        Force plate — CMJ
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {CMJ_PILLS.map(({ id, label }) => {
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
        {CMJ_PILLS.filter((p) => visible.has(p.id)).map((pill) => {
          const meta = METRIC_META[pill.id];
          const pts = chartData
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
                        tickFormatter={(v) =>
                          meta.decimals === 0
                            ? String(Math.round(Number(v)))
                            : Number(v).toFixed(meta.decimals)
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
        section="cmj"
        initialComment={sectionComment}
      />
    </section>
  );
}

export function buildCmjDataPoints(
  sessions: SessionLite[],
  metricsBySession: Map<string, MetricLite[]>
): CMJDataPoint[] {
  const out: CMJDataPoint[] = [];
  const sorted = [...sessions].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });

  for (const s of sorted) {
    if (!s.session_date || !isCmjSession(s)) continue;

    const rows = metricsBySession.get(s.id) ?? [];
    const byRep = new Map<number, Record<string, number>>();
    for (const r of rows) {
      if (r.rep_index == null || r.value == null) continue;
      const k = r.key;
      if (!k.startsWith("fp_")) continue;
      const m = byRep.get(r.rep_index) ?? {};
      m[k] = r.value;
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
      if (score > bestScore) {
        bestScore = score;
        bestRep = m;
      }
    }

    if (!bestRep || bestScore === -Infinity) {
      const jhM = maxMetric(rows, "fp_jump_height");
      const jhCm = maxMetric(rows, "fp_jump_height_cm_best");
      const pi = maxMetric(rows, "fp_propulsive_impulse");
      const bi = maxMetric(rows, "fp_braking_impulse");
      const ppf = maxMetric(rows, "fp_peak_propulsive_force");
      const pbf = maxMetric(rows, "fp_peak_braking_force");
      const mrsi = maxMetric(rows, "fp_mrsi");
      if (
        jhM == null &&
        jhCm == null &&
        pi == null &&
        bi == null &&
        ppf == null &&
        pbf == null &&
        mrsi == null
      ) {
        continue;
      }
      const jhAgg = jhM != null ? jhM * 100 : jhCm;
      out.push({
        date: new Date(s.session_date).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          timeZone: "Australia/Sydney",
        }),
        t: new Date(s.session_date).getTime(),
        jump_height: jhAgg != null && Number.isFinite(jhAgg) ? jhAgg : null,
        propulsive_impulse: pi,
        braking_impulse: bi,
        peak_propulsive_force: ppf,
        peak_braking_force: pbf,
        mrsi,
      });
      continue;
    }

    const jh =
      bestRep.fp_jump_height != null
        ? bestRep.fp_jump_height * 100
        : bestRep.fp_jump_height_cm_best ?? null;

    out.push({
      date: new Date(s.session_date).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        timeZone: "Australia/Sydney",
      }),
      t: new Date(s.session_date).getTime(),
      jump_height: jh != null && Number.isFinite(jh) ? jh : null,
      propulsive_impulse: bestRep.fp_propulsive_impulse ?? null,
      braking_impulse: bestRep.fp_braking_impulse ?? null,
      peak_propulsive_force: bestRep.fp_peak_propulsive_force ?? null,
      peak_braking_force: bestRep.fp_peak_braking_force ?? null,
      mrsi: bestRep.fp_mrsi ?? null,
    });
  }
  return out;
}
