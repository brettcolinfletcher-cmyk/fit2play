"use client";

import { useEffect, useRef } from "react";
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

/** Animated SVG ring — draws from 0 to target on mount. Exported so other
 *  score panels (e.g. RtpScorePanel) render pixel-identical rings. */
export function Ring({
  score,
  size,
  stroke,
  animate = false,
  color,
}: {
  score: number | null;
  size: number;
  stroke: number;
  animate?: boolean;
  /** Override the band-derived colour (RtpScorePanel uses pass/warn/fail, not quality bands) */
  color?: string;
}) {
  const arcRef = useRef<SVGCircleElement>(null);
  const resolvedColor = color ?? scoreBand(score)?.color ?? "#475569";
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const targetOffset = score == null ? c : c * (1 - score / 100);

  useEffect(() => {
    if (!animate || !arcRef.current || score == null) return;
    const el = arcRef.current;
    el.style.strokeDashoffset = String(c);
    const raf = requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1)";
      el.style.strokeDashoffset = String(targetOffset);
    });
    return () => cancelAnimationFrame(raf);
  }, [animate, c, targetOffset, score]);

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
        stroke="#334155"
        strokeWidth={stroke}
      />
      <circle
        ref={arcRef}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={resolvedColor}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={animate ? c : targetOffset}
        style={animate ? {} : undefined}
      />
    </svg>
  );
}

function ScoreTrend({ score, prev }: { score: number | null; prev: number | null }) {
  if (score == null || prev == null) return null;
  const diff = score - prev;
  if (diff === 0) return <span className="text-[0.7rem] text-slate-500">—</span>;
  const up = diff > 0;
  return (
    <span className={`text-[0.7rem] tabular-nums font-medium ${up ? "text-emerald-400" : "text-rose-400"}`}>
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
  const band = scoreBand(overall);

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 shadow-2xl"
      style={{
        backgroundColor: "rgba(2,6,23,0.7)",
        border: "1px solid #334155",
        boxShadow: `0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.10), 0 0 50px -12px rgba(163,230,53,0.18), 0 0 40px -16px ${band?.color ?? "#a3e635"}1a`,
      }}
    >
      {/* Radial glow behind overall ring */}
      <div
        className="pointer-events-none absolute -left-8 -top-8 h-64 w-64 rounded-full opacity-10 blur-2xl"
        style={{ background: band?.color ?? "#a3e635" }}
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
        {/* Overall score */}
        <div className="flex shrink-0 items-center gap-5">
          <div className="relative h-36 w-36 shrink-0">
            <Ring score={overall} size={144} stroke={11} animate />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums text-slate-50 leading-none">
                {overall ?? "—"}
              </span>
              <span className="mt-1 text-[0.6rem] uppercase tracking-widest text-slate-500">/ 100</span>
            </div>
          </div>
          <div>
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Overall score</p>
            <p
              className="mt-1 text-2xl font-bold tracking-tight"
              style={{ color: band?.color ?? "#e2e8f0" }}
            >
              {band?.label ?? "—"}
            </p>
            <p className="mt-1.5 max-w-[180px] text-xs leading-relaxed text-slate-400">
              Composite of six performance qualities
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden h-28 w-px bg-slate-800 lg:block" />

        {/* Six quality rings */}
        <div className="grid flex-1 grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-6">
          {rows.map(({ q, score, prevScore, count }) => {
            const qBand = scoreBand(score);
            return (
              <div
                key={q.key}
                className="flex flex-col items-center rounded-xl px-2 py-3 text-center transition-colors"
                style={{
                  backgroundColor: "rgba(2,6,23,0.5)",
                  border: "1px solid rgba(30,41,59,0.9)",
                  ...(qBand?.color ? { boxShadow: `inset 0 0 20px -8px ${qBand.color}33, 0 0 12px -4px ${qBand.color}22` } : {}),
                }}
              >
                <div className="relative h-16 w-16">
                  <Ring score={score} size={64} stroke={6} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="text-base font-bold tabular-nums"
                      style={{ color: qBand?.color ?? "#475569" }}
                    >
                      {score ?? "—"}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-[0.72rem] font-semibold text-slate-200 leading-tight">
                  {q.label}
                </p>
                <p className="mt-0.5 text-[0.62rem] text-slate-500">
                  {count} test{count === 1 ? "" : "s"}
                </p>
                <div className="mt-1">
                  <ScoreTrend score={score} prev={prevScore} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
