"use client";

import type { SummaryCategory, SummaryTier } from "@/lib/performanceSummary";

type Props = {
  categories: SummaryCategory[];
  /** Optional header content rendered to the right of the title (e.g. a profile selector for staff). */
  headerRight?: React.ReactNode;
};

const TIER_COLOR: Record<SummaryTier, string> = {
  needs_work: "#f87171",
  developing: "#fb923c",
  building: "#fbbf24",
  good: "#a3e635",
  excellent: "#4ade80",
  no_data: "#475569",
};

function TierBadge({ tier, label }: { tier: SummaryTier; label: string }) {
  const color = TIER_COLOR[tier];
  if (tier === "no_data") {
    return <span className="shrink-0 text-[0.65rem] font-medium text-slate-600">{label}</span>;
  }
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold leading-tight"
      style={{
        color,
        backgroundColor: `${color}1f`,
        border: `1px solid ${color}55`,
      }}
    >
      {label}
    </span>
  );
}

function ProgressBar({ ratio, tier }: { ratio: number | null; tier: SummaryTier }) {
  const color = TIER_COLOR[tier];
  const pct = ratio == null ? 0 : Math.max(0.03, Math.min(1, ratio));
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800/80">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${pct * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}

/**
 * Pure presentational render of the "at a glance" performance summary —
 * CMJ / Power / Speed / Accel / Decel / Change of Direction / Strength,
 * each with key parameters vs a target and a 5-point qualitative read
 * (Needs Work → Excellent). Shared by the staff report page (data-fetching
 * wrapper: PerformanceSummaryGrid) and the athlete-facing profile page
 * (categories computed server-side by /api/athlete-dashboard).
 *
 * Targets come from whichever target profile applies to the athlete — see
 * lib/performanceTargets.ts — with generic starter defaults as a fallback.
 * Not validated clinical cutoffs on their own.
 */
export default function PerformanceSummaryCategories({ categories, headerRight }: Props) {
  const hasAnyData = categories.some((c) => c.metrics.some((m) => m.value != null));
  if (!hasAnyData) return null;

  return (
    <section className="rounded-2xl border bg-slate-950/70 p-5 f2p-dark-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Performance Summary
          </h3>
          <p className="text-[0.65rem] text-slate-500">
            Targets are starter defaults — tune to your population.
          </p>
        </div>
        {headerRight}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="rounded-xl p-4"
            style={{
              backgroundColor: "rgba(2,6,23,0.5)",
              border: "1px solid rgba(30,41,59,0.9)",
            }}
          >
            <div className="flex items-baseline justify-between gap-2 border-b border-slate-800/80 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                {cat.label}
              </p>
              {cat.commonSourceLabel ? (
                <p className="truncate text-[0.65rem] text-slate-500">{cat.commonSourceLabel}</p>
              ) : null}
            </div>

            <div className="mt-1 divide-y divide-slate-800/60">
              {cat.metrics.map((m) => (
                <div key={m.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.8rem] font-medium text-slate-200">{m.label}</p>
                      {!cat.commonSourceLabel && m.sourceDate ? (
                        <p className="mt-0.5 text-[0.62rem] text-slate-500">{m.sourceDate}</p>
                      ) : null}
                    </div>
                    <TierBadge tier={m.tier} label={m.tierLabel} />
                  </div>
                  <div className="mt-1.5 flex items-end justify-between gap-3">
                    <p className="text-xl font-bold tabular-nums leading-none text-slate-50">
                      {m.displayValue}
                    </p>
                    <p className="shrink-0 text-right text-[0.68rem] tabular-nums text-slate-500">
                      Target {m.targetLabel}
                    </p>
                  </div>
                  <ProgressBar ratio={m.ratio} tier={m.tier} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
