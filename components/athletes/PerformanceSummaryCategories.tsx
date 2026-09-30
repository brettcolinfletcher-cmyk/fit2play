"use client";

import type { SummaryCategory, SummaryTier } from "@/lib/performanceSummary";

type Props = {
  categories: SummaryCategory[];
  /** Optional header content rendered to the right of the title (e.g. a profile selector for staff). */
  headerRight?: React.ReactNode;
  /**
   * "dark" = the navy anchor panel; "light" = white frosted panel. Follows the athlete's
   * card_theme setting so this panel matches the latest-results cards.
   */
  tone?: "light" | "dark";
};

const TIER_COLOR: Record<SummaryTier, string> = {
  needs_work: "#f87171",
  developing: "#fb923c",
  building: "#fbbf24",
  good: "#a3e635",
  excellent: "#4ade80",
  no_data: "#475569",
};

// Darker, more saturated equivalents for white cards; the dark-panel colours above
// are too pale to read there.
const TIER_COLOR_LIGHT: Record<SummaryTier, string> = {
  needs_work: "#dc2626",
  developing: "#ea580c",
  building: "#d97706",
  good: "#65a30d",
  excellent: "#16a34a",
  no_data: "#94a3b8",
};

type Tone = "light" | "dark";

function tierColor(tier: SummaryTier, tone: Tone): string {
  return (tone === "light" ? TIER_COLOR_LIGHT : TIER_COLOR)[tier];
}

function TierBadge({ tier, label, tone }: { tier: SummaryTier; label: string; tone: Tone }) {
  const color = tierColor(tier, tone);
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

function ProgressBar({
  ratio,
  tier,
  tone,
}: {
  ratio: number | null;
  tier: SummaryTier;
  tone: Tone;
}) {
  const color = tierColor(tier, tone);
  const pct = ratio == null ? 0 : Math.max(0.03, Math.min(1, ratio));
  return (
    <div
      className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: tone === "light" ? "#e2e8f0" : "rgba(30,41,59,0.8)" }}
    >
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
export default function PerformanceSummaryCategories({
  categories,
  headerRight,
  tone = "dark",
}: Props) {
  const hasAnyData = categories.some((c) => c.metrics.some((m) => m.value != null));
  if (!hasAnyData) return null;

  return (
    <section
      className={
        tone === "dark"
          ? "rounded-2xl border bg-slate-950/70 p-5 f2p-dark-panel"
          : "rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
      }
    >
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
            className={
              tone === "dark"
                ? "rounded-xl p-4"
                : "rounded-xl border border-slate-800 bg-slate-950/40 p-4"
            }
            style={
              tone === "dark"
                ? {
                    backgroundColor: "rgba(2,6,23,0.5)",
                    border: "1px solid rgba(30,41,59,0.9)",
                  }
                : undefined
            }
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
                    <TierBadge tier={m.tier} label={m.tierLabel} tone={tone} />
                  </div>
                  <div className="mt-1.5 flex items-end justify-between gap-3">
                    <p className="text-xl font-bold tabular-nums leading-none text-slate-50">
                      {m.displayValue}
                    </p>
                    <p className="shrink-0 text-right text-[0.68rem] tabular-nums text-slate-500">
                      Target {m.targetLabel}
                    </p>
                  </div>
                  <ProgressBar ratio={m.ratio} tier={m.tier} tone={tone} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
