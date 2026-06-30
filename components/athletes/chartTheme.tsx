import type { CSSProperties, ReactElement } from "react";

/**
 * Shared chart styling tokens for the athlete reporting charts.
 * Light-theme: white chart containers, light grid lines, dark axis labels.
 */

export const CHART_AXIS_TICK = {
  fill: "#64748b",
  fontSize: 10.5,
  letterSpacing: 0.2,
};

export const CHART_GRID = {
  vertical: false,
  strokeDasharray: "2 6",
  stroke: "#e2e8f0",
} as const;

export const CHART_AXIS_LINE = { stroke: "#e2e8f0" };

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "rgba(15, 23, 42, 0.95)",
  border: "1px solid #334155",
  borderRadius: 10,
  fontSize: 11,
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
};

export const CHART_LIME = "#a3e635";
export const CHART_BLUE = "#60a5fa";

export const CHART_REFERENCE_STROKE = "#94a3b8";

/**
 * Reusable SVG gradient defs. Rendered inline into each Recharts SVG.
 */
export const ChartDefs: ReactElement = (
  <defs>
    <linearGradient id="f2pBar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#bef264" stopOpacity={0.95} />
      <stop offset="55%" stopColor="#a3e635" stopOpacity={0.82} />
      <stop offset="100%" stopColor="#4d7c0f" stopOpacity={0.5} />
    </linearGradient>
    <linearGradient id="f2pBarLeft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.95} />
      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.5} />
    </linearGradient>
    <linearGradient id="f2pBarRight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#bef264" stopOpacity={0.95} />
      <stop offset="100%" stopColor="#4d7c0f" stopOpacity={0.5} />
    </linearGradient>
  </defs>
);
