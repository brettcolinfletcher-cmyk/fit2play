export const SIDE_COLORS = {
  left: "#60a5fa",
  right: "#a3e635",
  bilateral: "#a3e635",
} as const;

export function sideColor(side: "left" | "right" | null): string {
  if (side === "left") return SIDE_COLORS.left;
  if (side === "right") return SIDE_COLORS.right;
  return SIDE_COLORS.bilateral;
}

export function lsiColorClass(value: number): string {
  if (value >= 90) return "text-lime-400";
  if (value >= 80) return "text-amber-400";
  return "text-rose-400";
}
