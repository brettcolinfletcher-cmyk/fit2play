import { Defs, LinearGradient, Stop } from "@react-pdf/renderer";

/**
 * Shared styling tokens for the @react-pdf chart components.
 *
 * Mirrors the on-screen dashboard look defined in
 * `components/athletes/chartTheme.tsx` so an emailed PDF reads as the same
 * product: dark navy chart cards, gradient-filled bars, a soft dotted
 * horizontal grid, and light slate axis labels.
 *
 * Limb colour convention is UNIVERSAL and matches the rest of the app:
 *   Left  = blue   (#60a5fa)
 *   Right = lime   (#a3e635)
 */

/** Font family registered for the PDF (see AthletePdfDocument). */
export const PDF_FONT = "Plus Jakarta Sans";

export const PDF_CHART = {
  cardBg: "#0f172a",
  cardBorder: "#1e293b",
  grid: "#233047",
  axisLabel: "#94a3b8",
  title: "#f1f5f9",
  caption: "#94a3b8",
  limbLeft: "#60a5fa", // blue  — left limb (solid fallback / legend swatch)
  limbRight: "#a3e635", // lime  — right limb
  lineJump: "#a3e635", // lime  — jump height series
  lineRsi: "#60a5fa", // blue  — RSI series
} as const;

/** Gradient ids referenced via `fill="url(#…)"`. */
export const GRAD = {
  single: "pdfSingleBar", // vertical lime
  singleH: "pdfSingleBarH", // horizontal lime (bars that grow left→right)
  left: "pdfLeftBar", // vertical blue
  right: "pdfRightBar", // vertical lime
} as const;

/**
 * Gradient <Defs> for a chart. Drop this as the first child of each <Svg>.
 * Each Svg carries its own copy so the `url(#id)` references resolve locally.
 */
export function PdfChartDefs() {
  return (
    <Defs>
      {/* Single-series lime — bright cap fading to deep olive base. */}
      <LinearGradient id={GRAD.single} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#bef264" stopOpacity={0.95} />
        <Stop offset="0.55" stopColor="#a3e635" stopOpacity={0.85} />
        <Stop offset="1" stopColor="#4d7c0f" stopOpacity={0.55} />
      </LinearGradient>
      {/* Single-series lime, horizontal orientation (bar grows to the right). */}
      <LinearGradient id={GRAD.singleH} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#4d7c0f" stopOpacity={0.6} />
        <Stop offset="0.5" stopColor="#a3e635" stopOpacity={0.85} />
        <Stop offset="1" stopColor="#bef264" stopOpacity={0.97} />
      </LinearGradient>
      {/* Left limb — blue. */}
      <LinearGradient id={GRAD.left} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#93c5fd" stopOpacity={0.95} />
        <Stop offset="1" stopColor="#2563eb" stopOpacity={0.55} />
      </LinearGradient>
      {/* Right limb — lime. */}
      <LinearGradient id={GRAD.right} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#bef264" stopOpacity={0.95} />
        <Stop offset="1" stopColor="#4d7c0f" stopOpacity={0.55} />
      </LinearGradient>
    </Defs>
  );
}

/** Round a max value up to a clean axis ceiling (1 / 2 / 2.5 / 5 / 10 × 10ⁿ). */
export function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * base;
}

/** Compact tick label: trims trailing zeros (e.g. 2.50 → "2.5", 3.00 → "3"). */
export function fmtTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r).replace(/0+$/, "").replace(/\.$/, "");
}

/** Shared card + heading styles for the chart wrapper <View>. */
export const pdfCardStyles = {
  card: {
    marginTop: 2,
    marginBottom: 6,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: PDF_CHART.cardBg,
    borderRadius: 8,
    borderWidth: 0.75,
    borderColor: PDF_CHART.cardBorder,
    borderLeftWidth: 5,
    borderLeftColor: "#84cc16",
  },
  title: {
    fontSize: 9,
    fontWeight: 700 as const,
    color: PDF_CHART.title,
    marginBottom: 1,
  },
  caption: {
    fontSize: 7,
    color: PDF_CHART.caption,
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: "row" as const,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginRight: 12,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 4,
  },
  legendText: {
    fontSize: 7,
    color: PDF_CHART.axisLabel,
  },
};
