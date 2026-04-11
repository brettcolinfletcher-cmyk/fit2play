"use client";

import { bandLabelToClasses, type NormalizedPerformanceBand } from "@/lib/performanceBands";

type BandLike = NormalizedPerformanceBand | { label: string };

export default function PerformanceBandPill({ band }: { band: BandLike | null }) {
  if (!band) return null;
  const label = band.label;
  const { text, bg, ring } = bandLabelToClasses(label);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ring-1 ${text} ${bg} ${ring}`}
    >
      {label}
    </span>
  );
}
