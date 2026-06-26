"use client";

import {
  QUALITY_MODEL,
  scoreQuality,
  scoreOverall,
  scoreBand,
} from "@/lib/qualityModel";

type Props = {
  metricLatest: Record<string, number>;
  metricPrev: Record<string, number>;
};

function ringColor(score: number | null): string {
  return scoreBand(score)?.color ?? "#475569";
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

function ScoreTrend({
  score,
  prev,
}: {
  score: number | null;
  prev: number | null;
}) {
  if (score == null || prev == null) return null;
  const diff = score - prev;
  if (diff === 0) return <span className="text-xs text-slate-400">—</span>;
  const up = diff > 0;
  return (
    <span
      className={`text-xs tabular-nums ${
        up ? "text-emerald-400" : "text-rose-400"
      }`}
    >
      {up ? "↑" : "↓"} {Math.abs(diff)} pts
    </span>
  );
}

export default function AthleteRingPanel({ metricLatest, metricPrev }: Props) {
  const qualityScores: Record<string, number | null> = {};
  const rows = QUALITY_MODEL.map((q) => {
    const score = scoreQuality(q, metricLatest);
    const prevScore = scoreQuality(q, metricPrev);
    qualityScores[q.key] = score;
    const count = q.contributors.filter(
      (c) => metricLatest[`${c.testType}:${c.metricKey}`] != null
    ).length;
    return { q, score, prevScore, count };
  });
  const overall = scoreOverall(qualityScores);

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
            {overall == null ? "Not enough data" : scoreBand(overall)?.label}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Composite of the six qualities below.
          </p>
        </div>
      </div>

      {/* Quality rings */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map(({ q, score, prevScore, count }) => (
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
              {count} test{count === 1 ? "" : "s"}
            </p>
            <div className="mt-1">
              <ScoreTrend score={score} prev={prevScore} />
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
