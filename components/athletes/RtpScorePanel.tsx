"use client";

import { Ring } from "@/components/AthleteRingPanel";
import type { GaugeItem } from "@/lib/athleteSnapshot";

type Props = {
  gauges: GaugeItem[];
  readiness: { pass: number; total: number; line: string };
};

const PASS_COLOR = "#a3e635";
const WARN_COLOR = "#fbbf24";
const FAIL_COLOR = "#f87171";

function gaugeRingColor(g: GaugeItem): string {
  if (g.lsi >= g.pass) return PASS_COLOR;
  if (g.lsi >= g.warn) return WARN_COLOR;
  return FAIL_COLOR;
}

/**
 * Return-to-play score panel — exit-criteria / LSI gauges against the
 * clinician's editable cutoffs (Report Builder), respecting the active date
 * range. Same visual shell as AthleteRingPanel (the performance-mode panel)
 * so the two modes read as one consistent product, not two different ones:
 * translucent slate-950 background, slate-700 border, ambient lime glow,
 * identical Ring component for pixel-matched rings.
 */
export default function RtpScorePanel({ gauges, readiness }: Props) {
  const pct = readiness.total > 0 ? Math.round((readiness.pass / readiness.total) * 100) : null;
  const overallColor =
    pct == null ? "#475569" : pct >= 100 ? PASS_COLOR : pct >= 60 ? WARN_COLOR : FAIL_COLOR;

  if (gauges.length === 0 && readiness.total === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 shadow-2xl"
      style={{
        backgroundColor: "#0f172a",
        border: "1px solid #334155",
        boxShadow: `0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.10), 0 0 50px -12px rgba(163,230,53,0.18), 0 0 40px -16px ${overallColor}1a`,
      }}
    >
      {/* Radial glow behind overall ring */}
      <div
        className="pointer-events-none absolute -left-8 -top-8 h-64 w-64 rounded-full opacity-10 blur-2xl"
        style={{ background: overallColor }}
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
        {/* Overall readiness */}
        <div className="flex shrink-0 items-center gap-5">
          <div className="relative h-36 w-36 shrink-0">
            <Ring score={pct} size={144} stroke={11} animate color={overallColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums text-slate-50 leading-none">
                {readiness.total > 0 ? `${readiness.pass}/${readiness.total}` : "—"}
              </span>
              <span className="mt-1 text-[0.6rem] uppercase tracking-widest text-slate-500">criteria</span>
            </div>
          </div>
          <div>
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Readiness</p>
            <p className="mt-1 text-2xl font-bold tracking-tight" style={{ color: overallColor }}>
              {readiness.total === 0 ? "No criteria" : pct === 100 ? "Cleared" : "In progress"}
            </p>
            <p className="mt-1.5 max-w-[200px] text-xs leading-relaxed text-slate-400">
              {readiness.total === 0 ? readiness.line : "Against your exit-criteria cutoffs, for the selected date range"}
            </p>
          </div>
        </div>

        {/* Divider */}
        {gauges.length > 0 ? <div className="hidden h-28 w-px bg-slate-800 lg:block" /> : null}

        {/* Per-test LSI gauges */}
        {gauges.length > 0 ? (
          <div className="grid flex-1 grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-5">
            {gauges.map((g) => {
              const color = gaugeRingColor(g);
              return (
                <div
                  key={g.key}
                  className={`flex flex-col items-center rounded-xl px-2 py-3 text-center transition-colors ${g.isCriterion ? "" : "opacity-40"}`}
                  style={{
                    backgroundColor: "rgba(2,6,23,0.5)",
                    border: "1px solid rgba(30,41,59,0.9)",
                    boxShadow: `inset 0 0 20px -8px ${color}33, 0 0 12px -4px ${color}22`,
                  }}
                >
                  <div className="relative h-16 w-16">
                    <Ring score={g.lsi} size={64} stroke={6} color={color} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-base font-bold tabular-nums" style={{ color }}>
                        {Math.round(g.lsi)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-[0.72rem] font-semibold text-slate-200 leading-tight">
                    {g.label}
                  </p>
                  {!g.isCriterion ? (
                    <p className="mt-0.5 text-[0.62rem] text-slate-500">not scored</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No test data in this date range yet.</p>
        )}
      </div>
    </div>
  );
}
