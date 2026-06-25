"use client";

import {
  QUALITY_MODEL,
  scoreQuality,
  scoreOverall,
} from "@/lib/qualityModel";

type Props = {
  metricLatest: Record<string, number>;
  metricPrev: Record<string, number>;
};

/** Headline metric shown under each ring (representative live value). */
const HEADLINE: Record<
  string,
  { mapKey: string; unit: string; digits: number; magnitude?: boolean }
> = {
  speed: { mapKey: "1080_sprint:top_speed", unit: "m/s", digits: 2 },
  acceleration: { mapKey: "1080_sprint:accel_max", unit: "m/s\u00b2", digits: 2 },
  deceleration: {
    mapKey: "1080_sprint:decel_max",
    unit: "m/s\u00b2",
    digits: 2,
    magnitude: true,
  },
  power: { mapKey: "1080_sprint:peak_power", unit: "W", digits: 0 },
  reactive_strength: {
    mapKey: "force_plate_dj:fp_rsi_best",
    unit: "RSI",
    digits: 2,
  },
  strength: {
    mapKey: "force_plate_isometric:peak_force",
    unit: "N",
    digits: 0,
  },
};

function ringColor(score: number | null): string {
  if (score == null) return "#475569";
  if (score >= 80) return "#4ade80";
  if (score >= 65) return "#38bdf8";
  return "#fbbf24";
}

function Ring({
  score,
  size,
  stroke,
}: {
  score: number | null;
  size: number;
  stroke: number;
}) {
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const off = score == null ? c : c * (1 - score / 100);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#1e293b"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={ringColor(score)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
      />
    </svg>
  );
}

function Trend({
  latest,
  prev,
  lowerIsBetter = false,
}: {
  latest: number | null;
  prev: number | null;
  lowerIsBetter?: boolean;
}) {
  if (latest == null || prev == null || prev === 0) return null;
  const pct = ((latest - prev) / Math.abs(prev)) * 100;
  const better = lowerIsBetter ? pct < 0 : pct > 0;
  if (Math.abs(pct) < 0.05) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <span
      className={`text-xs tabular-nums ${
        better ? "text-emerald-400" : "text-rose-400"
      }`}
    >
      {better ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function AthleteRingPanel({ metricLatest, metricPrev }: Props) {
  const qualityScores: Record<string, number | null> = {};
  const rows = QUALITY_MODEL.map((q) => {
    const score = scoreQuality(q, metricLatest);
    qualityScores[q.key] = score;
    const h = HEADLINE[q.key];
    const rawLatest = h ? metricLatest[h.mapKey] ?? null : null;
    const rawPrev = h ? metricPrev[h.mapKey] ?? null : null;
    const val =
      rawLatest != null && h?.magnitude ? Math.abs(rawLatest) : rawLatest;
    return { q, score, val, rawLatest, rawPrev, h };
  });
  const overall = scoreOverall(qualityScores);

  const sprint5 = metricLatest["1080_sprint:split_5m_time"] ?? null;
  const sprint5p = metricPrev["1080_sprint:split_5m_time"] ?? null;
  const sprint20 = metricLatest["1080_sprint:split_20m_time"] ?? null;
  const sprint40 = metricLatest["1080_sprint:split_40m_time"] ?? null;

  const jumpM = metricLatest["force_plate_cmj:fp_jump_height"] ?? null;
  const jumpMp = metricPrev["force_plate_cmj:fp_jump_height"] ?? null;

  return (
    <div className="space-y-4">
      {/* Overall */}
      <div className="flex items-center gap-5 rounded-xl border border-slate-800 bg-slate-900/40 p-5 shadow-xl shadow-lime-400/10">
        <div className="relative h-28 w-28 shrink-0">
          <Ring score={overall} size={112} stroke={10} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-slate-50">
              {overall ?? "—"}
            </span>
            <span className="text-[0.65rem] text-slate-400">/ 100</span>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Overall score
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {overall == null
              ? "Not enough data"
              : overall >= 80
                ? "Strong all-round"
                : overall >= 65
                  ? "Building well"
                  : "Developing"}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Composite of the six qualities below.
          </p>
        </div>
      </div>

      {/* Quality rings */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map(({ q, score, val, rawLatest, rawPrev, h }) => (
          <div
            key={q.key}
            className="flex flex-col items-center rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-center"
          >
            <div className="relative h-20 w-20">
              <Ring score={score} size={80} stroke={8} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-semibold tabular-nums text-slate-50">
                  {score ?? "—"}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-200">{q.label}</p>
            <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
              {val != null ? `${val.toFixed(h?.digits ?? 1)} ${h?.unit ?? ""}` : "—"}
            </p>
            <div className="mt-1">
              <Trend latest={rawLatest} prev={rawPrev} />
            </div>
          </div>
        ))}
      </div>

      {/* Output tiles: jump height + sprint times */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Jump height
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-50">
            {jumpM != null ? (jumpM * 100).toFixed(1) : "—"}
            <span className="ml-1 text-xs text-slate-400">cm</span>
          </p>
          <div className="mt-1">
            <Trend latest={jumpM} prev={jumpMp} />
          </div>
        </div>

        <SprintTile label="5m sprint" time={sprint5} prev={sprint5p} />
        <SprintTile label="20m sprint" time={sprint20} prev={null} />
        <SprintTile label="40m sprint" time={sprint40} prev={null} />
      </div>
    </div>
  );
}

function SprintTile({
  label,
  time,
  prev,
}: {
  label: string;
  time: number | null;
  prev: number | null;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      {time != null ? (
        <>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-50">
            {time.toFixed(2)}
            <span className="ml-1 text-xs text-slate-400">s</span>
          </p>
          <div className="mt-1">
            <Trend latest={time} prev={prev} lowerIsBetter />
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold text-slate-600">—</p>
          <p className="mt-1 text-xs text-slate-500">awaiting longer sprint</p>
        </>
      )}
    </div>
  );
}
