import type { CSSProperties, ReactElement } from "react";

/**
 * Shared chart styling tokens for the athlete reporting charts.
 *
 * Goal: move away from the flat acid-lime-on-navy default toward a softer,
 * warmer read — gradient-filled bars with depth, dotted horizontal-only grid,
 * lighter axis labels, and rounded line strokes.
 */

// Softer axis labels: lighter slate, a touch larger, gentle tracking.
export const CHART_AXIS_TICK = {
  fill: "#94a3b8",
  fontSize: 10.5,
  letterSpacing: 0.2,
};

// Horizontal-only, low-contrast dotted grid reads much softer than the old
// hard cross-hatch.
export const CHART_GRID = {
  vertical: false,
  strokeDasharray: "2 6",
  stroke: "#233047",
} as const;

// Faint axis lines (or none) instead of hard rules.
export const CHART_AXIS_LINE = { stroke: "#233047" };

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "rgba(15, 23, 42, 0.95)",
  border: "1px solid #334155",
  borderRadius: 10,
  fontSize: 11,
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
};

export const CHART_LIME = "#a3e635";
export const CHART_BLUE = "#60a5fa";

// Reference / baseline lines (e.g. first-session marker on trend bars).
export const CHART_REFERENCE_STROKE = "#3b475c";

/**
 * Reusable SVG gradient defs. Rendered inline into each Recharts SVG.
 *
 * This MUST be a native <defs> element (not a wrapper component) so Recharts
 * passes it straight through to the SVG. The same element instance is reused
 * across charts; the gradient ids are identical everywhere, so `url(#id)`
 * resolves consistently even with multiple charts on the page.
 */
export const ChartDefs: ReactElement = (
  <defs>
    {/* Single-series lime bar — bright at the cap, fading to a deeper olive
        base so a column of them no longer reads as a flat wall of green. */}
    <linearGradient id="f2pBar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#bef264" stopOpacity={0.95} />
      <stop offset="55%" stopColor="#a3e635" stopOpacity={0.82} />
      <stop offset="100%" stopColor="#4d7c0f" stopOpacity={0.5} />
    </linearGradient>
    {/* Left limb (blue) */}
    <linearGradient id="f2pBarLeft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.95} />
      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.5} />
    </linearGradient>
    {/* Right limb (lime) */}
    <linearGradient id="f2pBarRight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#bef264" stopOpacity={0.95} />
      <stop offset="100%" stopColor="#4d7c0f" stopOpacity={0.5} />
    </linearGradient>
  </defs>
);
