import { Document, Font, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import PdfGroupedBarChart from "@/components/athletes/pdf/charts/PdfGroupedBarChart";
import PdfLineChart from "@/components/athletes/pdf/charts/PdfLineChart";
import PdfRankDials, { type PdfRankDial } from "@/components/athletes/pdf/charts/PdfRankDials";
import type { DateComparisonData } from "@/lib/athleteReportData";
import type { PdfReportCharts } from "@/lib/pdfReportChartData";
import type { AthleteSnapshot } from "@/lib/athleteSnapshot";
import type { SummaryCategory } from "@/lib/performanceSummary";
import type { ReportVisibility } from "@/lib/reportSections";
import { PDF_CATEGORY_TITLE, PDF_METRIC_COPY, plainTarget, plainValue } from "@/lib/pdfSummaryCopy";
import { PDF_FONT } from "@/components/athletes/pdf/charts/pdfChartTheme";

// ─── Fonts ───
// Plus Jakarta Sans, self-hosted from /public/fonts so the emailed PDF matches
// the dashboard typography. These static weights must exist at
// /public/fonts/*.ttf. PDF generation is client-side, so these same-origin
// relative URLs resolve in the browser without CORS.
//
// PlusJakartaSans-Italic.ttf is a Latin-subset instance (covers standard
// English punctuation plus Western-European accented characters — é, ü, ñ,
// ç, ø, à, ö, etc.) sourced from @fontsource/plus-jakarta-sans, since the
// original 4 static weights only shipped as upright/Regular styles. Without
// an italic file registered, react-pdf throws "Could not resolve font for
// Plus Jakarta Sans, fontWeight 400, fontStyle italic" and generation fails
// outright — this was breaking every PDF export that reached the comment
// section (styles.commentText / styles.perfSummaryNote both use
// fontStyle: "italic").
Font.register({
  family: PDF_FONT,
  fonts: [
    { src: "/fonts/PlusJakartaSans-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/PlusJakartaSans-Italic.ttf", fontWeight: 400, fontStyle: "italic" },
    { src: "/fonts/PlusJakartaSans-Medium.ttf", fontWeight: 500 },
    { src: "/fonts/PlusJakartaSans-SemiBold.ttf", fontWeight: 600 },
    { src: "/fonts/PlusJakartaSans-Bold.ttf", fontWeight: 700 },
  ],
});
// Clinical report text shouldn't hyphenate mid-word.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 8,
    fontFamily: PDF_FONT,
    color: "#374151",
    backgroundColor: "#ffffff",
  },
  limeTopBarWrap: {
    marginHorizontal: -40,
    marginBottom: 0,
  },
  limeTopBar: {
    height: 4,
    width: "100%",
    backgroundColor: "#84cc16",
  },
  // ─── Branded dark header band ───
  // Full-bleed slate band sitting flush under the lime accent. Hosts the logo
  // (whose wordmark is white-on-transparent and only renders correctly on dark)
  // and the athlete's identifying info, mirroring the visual stamp clinicians
  // expect on a formal report.
  headerBand: {
    marginHorizontal: -40,
    marginBottom: 18,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 40,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  headerLogoCol: {
    width: 96,
    marginRight: 20,
  },
  headerTextCol: {
    flex: 1,
  },
  headerName: {
    fontSize: 22,
    fontWeight: 700,
    color: "#ffffff",
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  headerReportType: {
    fontSize: 9,
    color: "#cbd5e1",
    marginBottom: 2,
  },
  headerMeta: {
    fontSize: 8,
    color: "#94a3b8",
    marginBottom: 4,
  },
  // ─── Athlete meta pill row (dark band variant) ───
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  metaPill: {
    flexDirection: "row",
    paddingVertical: 2,
    paddingHorizontal: 7,
    backgroundColor: "#1e293b",
    borderRadius: 9999,
    marginRight: 4,
    marginBottom: 3,
  },
  metaPillLabel: {
    fontSize: 6.5,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginRight: 5,
    fontWeight: 700,
  },
  metaPillValue: {
    fontSize: 8,
    color: "#e2e8f0",
    fontWeight: 500,
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    marginVertical: 10,
  },
  sectionBanner: {
    fontSize: 10,
    fontWeight: 700,
    color: "#111827",
    marginTop: 6,
    marginBottom: 3,
    paddingLeft: 9,
    borderLeftWidth: 5,
    borderLeftColor: "#84cc16",
  },
  modalitySection: {
    marginTop: 26,
  },
  h2: {
    fontSize: 9,
    fontWeight: 700,
    color: "#111827",
    marginTop: 12,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  // ─── Light table card ───
  // Mirrors the dark chart card's shape (rounded, lime left-rail) so a section
  // reads as a matched pair: dark chart card + light table card sharing a spine.
  tableCard: {
    marginTop: 2,
    marginBottom: 6,
    paddingTop: 8,
    paddingBottom: 2,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 0.75,
    borderColor: "#e5e7eb",
    borderLeftWidth: 5,
    borderLeftColor: "#84cc16",
  },
  tableCardTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 5,
  },
  body: {
    fontSize: 8.5,
    lineHeight: 1.4,
    color: "#374151",
  },
  readinessLine: {
    fontSize: 9,
    marginBottom: 8,
  },
  readinessStrong: {
    fontWeight: 700,
    color: "#111827",
  },
  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  gaugeLabel: {
    width: "32%",
    fontSize: 8,
    color: "#374151",
  },
  gaugeTrack: {
    flex: 1,
    height: 7,
    backgroundColor: "#f1f5f9",
    borderRadius: 9999,
    marginHorizontal: 6,
  },
  gaugeFill: {
    height: 7,
    borderRadius: 9999,
  },
  gaugeValue: {
    width: 96,
    fontSize: 7.5,
    textAlign: "right",
    color: "#111827",
    fontWeight: 700,
  },
  gaugeMuted: {
    color: "#9ca3af",
    fontWeight: 400,
  },
  // ─── Inline section comment block ───
  commentBlock: {
    marginTop: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "#d1d5db",
    paddingVertical: 2,
  },
  commentLabel: {
    fontSize: 6.5,
    fontWeight: 700,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  commentText: {
    fontSize: 8.5,
    color: "#374151",
    lineHeight: 1.4,
    fontStyle: "italic",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: "#f0fdf4",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  rowAlt: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
    backgroundColor: "#fafafa",
  },
  colMetric: { width: "38%" },
  colBest: { width: "28%" },
  colDate: { width: "34%" },
  colA: { width: "28%" },
  colB: { width: "28%" },
  colD: { width: "16%" },
  // tests-included columns
  colTiModality: { width: "60%" },
  colTiSessions: { width: "20%", textAlign: "right" },
  colTiLatest: { width: "20%", textAlign: "right" },
  th: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#374151",
  },
  td: { fontSize: 8, color: "#374151" },
  tdMono: { fontSize: 8.5, color: "#111827" },
  // ─── Key finding tile ───
  findingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
    marginHorizontal: -4,
  },
  findingTile: {
    width: "50%",
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  findingTileInner: {
    borderWidth: 0.75,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    padding: 8,
    backgroundColor: "#fafafa",
  },
  findingLabel: {
    fontSize: 7,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontWeight: 700,
    marginBottom: 2,
  },
  findingValue: {
    fontSize: 16,
    color: "#111827",
    fontWeight: 700,
    marginBottom: 2,
  },
  findingDate: {
    fontSize: 7,
    color: "#9ca3af",
  },
  findingMeta: {
    flexDirection: "row",
    marginTop: 5,
    alignItems: "center",
  },
  // ─── Band pill ───
  pill: {
    flexDirection: "row",
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 9999,
    borderWidth: 0.75,
    marginRight: 4,
  },
  pillLabel: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  // ─── Delta indicator ───
  delta: {
    flexDirection: "row",
    alignItems: "center",
  },
  deltaSymbol: {
    fontSize: 7,
    fontWeight: 700,
    marginRight: 2,
  },
  deltaPct: {
    fontSize: 7,
    fontWeight: 700,
    marginRight: 3,
  },
  deltaPrev: {
    fontSize: 6.5,
    color: "#9ca3af",
  },
  // ─── Performance summary (CMJ/Power/Speed/Accel/Decel/COD) ───
  perfSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  perfSummaryCard: {
    width: "50%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  perfSummaryCardInner: {
    borderWidth: 0.75,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    padding: 8,
    backgroundColor: "#fafafa",
  },
  perfSummaryCardTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  perfSummaryCardTitle: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  perfSummaryCardSource: {
    fontSize: 6.5,
    color: "#9ca3af",
  },
  perfSummaryRow: {
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eef2f7",
  },
  perfSummaryRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  perfSummaryLabel: {
    fontSize: 7.5,
    color: "#374151",
    fontWeight: 700,
  },
  perfSummaryDate: {
    fontSize: 6.5,
    color: "#9ca3af",
    marginTop: 1,
  },
  perfSummaryRowBottom: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 2,
  },
  perfSummaryValue: {
    fontSize: 9.5,
    fontWeight: 700,
    color: "#111827",
  },
  perfSummaryTarget: {
    fontSize: 7,
    color: "#9ca3af",
  },
  perfBadge: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 9999,
    borderWidth: 0.75,
  },
  perfBadgeText: {
    fontSize: 6,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  perfSummaryNote: {
    fontSize: 6.5,
    color: "#9ca3af",
    marginBottom: 4,
    fontStyle: "italic",
  },
  rankCaption: {
    fontSize: 7,
    color: "#6b7280",
    marginBottom: 5,
  },
  // ─── Performance summary (client-friendly: two balanced columns) ───
  sumIntro: {
    fontSize: 7,
    color: "#6b7280",
    marginBottom: 6,
  },
  sumCols: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  sumColLeft: {
    width: "50%",
    paddingRight: 5,
  },
  sumColRight: {
    width: "50%",
    paddingLeft: 5,
  },
  sumCard: {
    borderWidth: 0.75,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 9,
    backgroundColor: "#fafafa",
    marginBottom: 8,
  },
  sumCardHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  sumCardTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: "#111827",
  },
  sumCardDate: {
    fontSize: 6.5,
    color: "#9ca3af",
  },
  sumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 5,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
  },
  sumRowLeft: {
    flex: 1,
    paddingRight: 8,
  },
  sumRowRight: {
    maxWidth: 112,
    alignItems: "flex-end",
  },
  sumLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: "#111827",
  },
  sumHint: {
    fontSize: 6.8,
    color: "#6b7280",
    marginTop: 1.5,
    lineHeight: 1.3,
  },
  sumValue: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#111827",
    textAlign: "right",
  },
  sumTarget: {
    fontSize: 6.5,
    color: "#9ca3af",
    marginTop: 1.5,
    textAlign: "right",
  },
  // ─── Footer ───
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#84cc16",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#9ca3af",
  },
});

function formatPdfDay(ymd: string | null): string {
  if (!ymd) return "—";
  try {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Australia/Sydney",
    });
  } catch {
    return ymd;
  }
}

function generatedStamp(): string {
  try {
    return new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Australia/Sydney",
    });
  } catch {
    return "";
  }
}

/** Height as e.g. "151 cm". PostgREST returns numeric columns as strings, so coerce. */
function formatHeight(v: number | string | null | undefined): string | null {
  const n = typeof v === "string" ? Number(v) : v;
  return n != null && Number.isFinite(n) && n > 0 ? `${Math.round(n)} cm` : null;
}

/** Weight as e.g. "45.1 kg" (whole numbers shown without a decimal). */
function formatWeight(v: number | string | null | undefined): string | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} kg`;
}

// The PDF shows absolute values only: no Needs Work / Good / Poor verdict
// pills on the Performance Summary. Where the athlete
// sits against the group is carried by the ranking dials instead.
// Wording comes from lib/pdfSummaryCopy.ts (plain language for clients).
function PerformanceSummarySection({ categories }: { categories: SummaryCategory[] }) {
  // Only what was actually measured: no empty "No data" rows or cards.
  const shown = categories
    .map((c) => ({ ...c, metrics: c.metrics.filter((m) => m.value != null) }))
    .filter((c) => c.metrics.length > 0);
  if (shown.length === 0) return null;

  // Two balanced columns instead of paired rows, so a short card never leaves
  // a big gap next to a tall one.
  const cols: [SummaryCategory[], SummaryCategory[]] = [[], []];
  const weight: [number, number] = [0, 0];
  for (const cat of shown) {
    const i: 0 | 1 = weight[0] <= weight[1] ? 0 : 1;
    cols[i].push(cat);
    weight[i] += 1.3 + cat.metrics.length;
  }

  return (
    <View wrap={false}>
      <Text style={styles.sectionBanner}>PERFORMANCE SUMMARY</Text>
      <Text style={styles.sumIntro}>
        The most recent result for each test. Targets are a guide to work towards.
      </Text>
      <View style={styles.sumCols}>
        {cols.map((col, ci) => (
          <View key={ci} style={ci === 0 ? styles.sumColLeft : styles.sumColRight}>
            {col.map((cat) => {
              const dates = [
                ...new Set(cat.metrics.map((m) => m.sourceDate).filter((d): d is string => !!d)),
              ];
              const commonDate = dates.length === 1 ? dates[0]! : null;
              return (
                <View key={cat.id} style={styles.sumCard} wrap={false}>
                  <View style={styles.sumCardHead}>
                    <Text style={styles.sumCardTitle}>{PDF_CATEGORY_TITLE[cat.id] ?? cat.label}</Text>
                    {commonDate ? <Text style={styles.sumCardDate}>{commonDate}</Text> : null}
                  </View>
                  {cat.metrics.map((m) => {
                    const copy = PDF_METRIC_COPY[m.id];
                    const hint = [copy?.hint, !commonDate ? m.sourceDate : null]
                      .filter(Boolean)
                      .join(" \u00b7 ");
                    return (
                      <View key={m.id} style={styles.sumRow}>
                        <View style={styles.sumRowLeft}>
                          <Text style={styles.sumLabel}>{copy?.label ?? m.label}</Text>
                          {hint ? <Text style={styles.sumHint}>{hint}</Text> : null}
                        </View>
                        <View style={styles.sumRowRight}>
                          <Text style={styles.sumValue}>{plainValue(m.displayValue)}</Text>
                          <Text style={styles.sumTarget}>{plainTarget(m.targetLabel)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillLabel}>{label}</Text>
      <Text style={styles.metaPillValue}>{value}</Text>
    </View>
  );
}

function SectionCommentBlock({
  comment,
}: {
  comment: string | null | undefined;
}) {
  const trimmed = (comment ?? "").trim();
  if (!trimmed) return null;
  return (
    <View style={styles.commentBlock} wrap={false}>
      <Text style={styles.commentLabel}>Clinical note</Text>
      <Text style={styles.commentText}>{trimmed}</Text>
    </View>
  );
}

export type PdfProps = {
  athleteName: string;
  /** Optional extended athlete fields shown on the new snapshot page. */
  athleteSport?: string | null;
  athleteTeam?: string | null;
  /** Shown in the header pills, matching the dashboard identity card. */
  athleteHeightCm?: number | string | null;
  athleteWeightKg?: number | string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  mode: "best" | "date_comparison";
  compareDateALabel?: string;
  compareDateBLabel?: string;
  includeNotes: boolean;
  summaryComment: string | null;
  sectionComments: Record<string, string | null>;
  dateComparisonData?: DateComparisonData;
  /** Native SVG charts for "best" mode only */
  pdfCharts?: PdfReportCharts | null;
  /** Computed athlete snapshot (readiness + symmetry gauges); "best" mode only. */
  snapshot?: AthleteSnapshot | null;
  /** Team-ranking speed dials (same as the dashboard); "best" mode only. */
  rankDials?: PdfRankDial[] | null;
  rankCaption?: string | null;
  /** CMJ/Power/Speed/Accel/Decel/COD "at a glance" summary; "best" mode only. */
  performanceSummary?: SummaryCategory[] | null;
  /** Report visibility resolver — gates which modality sections render. */
  visibility?: ReportVisibility | null;
};

function CompareTable({
  title,
  rows,
  labelA,
  labelB,
}: {
  title: string;
  rows: { label: string; va: string; vb: string; delta: string }[];
  labelA: string;
  labelB: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.tableCard}>
      <Text style={styles.tableCardTitle}>{title}</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.colMetric, styles.th]}>Metric</Text>
        <Text style={[styles.colA, styles.th]}>{labelA}</Text>
        <Text style={[styles.colB, styles.th]}>{labelB}</Text>
        <Text style={[styles.colD, styles.th]}>Chg</Text>
      </View>
      {rows.map((r, i) => (
        <View key={`${r.label}-${i}`} style={i % 2 === 0 ? styles.row : styles.rowAlt}>
          <Text style={[styles.colMetric, styles.td]}>{r.label}</Text>
          <Text style={[styles.colA, styles.tdMono]}>{r.va}</Text>
          <Text style={[styles.colB, styles.tdMono]}>{r.vb}</Text>
          <Text style={[styles.colD, styles.tdMono]}>{r.delta}</Text>
        </View>
      ))}
    </View>
  );
}

export default function AthletePdfDocument({
  athleteName,
  athleteSport,
  athleteTeam,
  athleteHeightCm,
  athleteWeightKg,
  rangeStart,
  rangeEnd,
  mode,
  compareDateALabel = "Date A",
  compareDateBLabel = "Date B",
  includeNotes,
  summaryComment,
  sectionComments,
  dateComparisonData,
  pdfCharts = null,
  snapshot = null,
  rankDials = null,
  rankCaption = null,
  performanceSummary = null,
  visibility = null,
}: PdfProps) {
  const rangeLine =
    rangeStart || rangeEnd
      ? `${formatPdfDay(rangeStart)} – ${formatPdfDay(rangeEnd)}`
      : "Full history";
  const gen = generatedStamp();

  const dc = dateComparisonData;
  const isBest = mode === "best";
  const showSection = (key: string): boolean =>
    visibility ? visibility.isSectionVisible(key) : true;

  // Athlete meta strip (same fields as the dashboard identity card): only
  // renders when at least one value exists.
  const heightLabel = formatHeight(athleteHeightCm);
  const weightLabel = formatWeight(athleteWeightKg);
  const hasMeta = Boolean(athleteSport || athleteTeam || heightLabel || weightLabel);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Brand bar + dark header letterhead */}
        <View style={styles.limeTopBarWrap}>
          <View style={styles.limeTopBar} />
        </View>
        <View style={styles.headerBand}>
          <View style={styles.headerLogoCol}>
            <Image
              src="https://www.fit2perform.com.au/fit2play_logo_transparent.png"
              style={{ width: 96 }}
            />
          </View>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerName}>{athleteName}</Text>
            <Text style={styles.headerReportType}>
              Athlete Performance Report
            </Text>
            <Text style={styles.headerMeta}>Date range: {rangeLine}</Text>
            {hasMeta ? (
              <View style={styles.metaRow}>
                {athleteSport ? (
                  <MetaPill label="Sport" value={athleteSport} />
                ) : null}
                {athleteTeam ? (
                  <MetaPill label="Team" value={athleteTeam} />
                ) : null}
                {heightLabel ? <MetaPill label="Height" value={heightLabel} /> : null}
                {weightLabel ? <MetaPill label="Weight" value={weightLabel} /> : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Manual clinical summary, when provided in the export modal. */}
        {summaryComment?.trim() ? (
          <View>
            <Text style={styles.sectionBanner}>SUMMARY</Text>
            <Text style={styles.body}>{summaryComment.trim()}</Text>
          </View>
        ) : null}

        {/* READINESS + SYMMETRY — mirrors the on-screen snapshot. */}
        {isBest && snapshot ? (
          <View>
            <Text style={styles.sectionBanner}>READINESS</Text>
            <Text style={[styles.readinessLine, styles.readinessStrong]}>
              {snapshot.readiness.line}
            </Text>
            {snapshot.gauges.length > 0 ? (
              <View>
                {snapshot.gauges.map((g) => {
                  const hex =
                    g.lsi >= g.pass
                      ? "#16a34a"
                      : g.lsi >= g.warn
                      ? "#d97706"
                      : "#dc2626";
                  const w = Math.max(0, Math.min(100, g.lsi));
                  return (
                    <View key={g.key} style={styles.gaugeRow} wrap={false}>
                      <Text
                        style={[
                          styles.gaugeLabel,
                          g.isCriterion ? {} : styles.gaugeMuted,
                        ]}
                      >
                        {g.label}
                        {g.isCriterion ? "" : " (not scored)"}
                      </Text>
                      <View style={styles.gaugeTrack}>
                        <View
                          style={[
                            styles.gaugeFill,
                            {
                              width: `${w}%`,
                              backgroundColor: g.isCriterion ? hex : "#cbd5e1",
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.gaugeValue,
                          g.isCriterion ? {} : styles.gaugeMuted,
                        ]}
                      >
                        {`${Math.round(g.lsi)}% \u00b7 pass ${g.pass}%`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* RANKING — the dashboard's speed dials (where the athlete sits in the comparison group). */}
        {isBest && rankDials && rankDials.length > 0 ? (
          <View>
            <Text style={styles.sectionBanner}>RANKING</Text>
            {rankCaption ? <Text style={styles.rankCaption}>{rankCaption}</Text> : null}
            <PdfRankDials dials={rankDials} />
          </View>
        ) : null}

        {/* PERFORMANCE SUMMARY — CMJ/Power/Speed/Accel/Decel/COD at a glance. */}
        {isBest && performanceSummary ? (
          <PerformanceSummarySection categories={performanceSummary} />
        ) : null}

        {/* The sprint section's clinician note (the sprint chart itself is replaced by
            the split times in the Performance Summary). */}
        {isBest && includeNotes && showSection("linear") ? (
          <SectionCommentBlock comment={sectionComments.linear} />
        ) : null}

        {/* DATE COMPARISON mode keeps its existing table-only layout. */}
        {mode === "date_comparison" && dc ? (
          <>
            <Text style={styles.sectionBanner}>
              {`Session Comparison \u2014 ${compareDateALabel} vs ${compareDateBLabel}`}
            </Text>
            <CompareTable
              title="LINEAR SPRINT"
              labelA={compareDateALabel}
              labelB={compareDateBLabel}
              rows={dc.linear}
            />
            <CompareTable
              title={"FORCE PLATE \u2014 CMJ"}
              labelA={compareDateALabel}
              labelB={compareDateBLabel}
              rows={dc.cmj}
            />
            <CompareTable
              title={"FORCE PLATE \u2014 DROP JUMP"}
              labelA={compareDateALabel}
              labelB={compareDateBLabel}
              rows={dc.dj}
            />
            {dc.hop.map((block) => (
              <CompareTable
                key={block.testType}
                title={`HOP \u2014 ${block.title.toUpperCase()}`}
                labelA={compareDateALabel}
                labelB={compareDateBLabel}
                rows={block.rows}
              />
            ))}
          </>
        ) : null}

        {/* MODALITY DETAIL — only in "best" mode.
            Each banner below uses minPresenceAhead to avoid an orphaned
            heading (banner alone at the bottom of a page, its chart pushed
            to the next). The chart card that follows each banner is
            wrap={false} (PdfBarChart/PdfGroupedBarChart/PdfLineChart, via
            pdfCardStyles.card) — card padding + title + caption + a 190-196pt
            svg is already ~245-265pt, and the grouped/line charts add a
            legend row on top of that. 260 was observed to be too small for
            the real chart heights (LINEAR SPRINT still orphaned in
            production); 340 gives real headroom above the tallest case. */}
        {isBest ? (
          <>
            {showSection("cod") && pdfCharts?.cod != null ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={340}>
                  CHANGE OF DIRECTION ({pdfCharts.cod.title.split(" — ")[0]})
                </Text>
                <PdfGroupedBarChart
                  title={pdfCharts.cod.title}
                  dateCaption={pdfCharts.cod.dateCaption}
                  unit={pdfCharts.cod.unit}
                  groups={[
                    {
                      label: "Entry time",
                      left: pdfCharts.cod.left,
                      right: pdfCharts.cod.right,
                      annotation:
                        pdfCharts.cod.lsiPct != null
                          ? `LSI ${pdfCharts.cod.lsiPct.toFixed(1)}%`
                          : null,
                    },
                  ]}
                />
                {includeNotes ? (
                  <SectionCommentBlock comment={sectionComments.cod} />
                ) : null}
              </View>
            ) : null}

            {(showSection("cmj") || showSection("drop_jump")) &&
            pdfCharts?.jump?.variant === "line" ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={340}>FORCE PLATE</Text>
                {pdfCharts?.jump?.variant === "line" ? (
                  <PdfLineChart
                    title={pdfCharts.jump.title}
                    dateCaption={pdfCharts.jump.dateCaption}
                    leftAxisLabel="Jump height (cm)"
                    rightAxisLabel="RSI"
                    points={pdfCharts.jump.points.map((p) => ({
                      t: p.t,
                      xLabel: p.xLabel,
                      jumpCm: p.jumpCm,
                      rsi: p.rsi,
                    }))}
                  />
                ) : null}
                {includeNotes && showSection("cmj") ? (
                  <SectionCommentBlock comment={sectionComments.cmj} />
                ) : null}
                {includeNotes && showSection("drop_jump") ? (
                  <SectionCommentBlock comment={sectionComments.drop_jump} />
                ) : null}
              </View>
            ) : null}

            {showSection("dynamometry") && pdfCharts?.strength != null ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={340}>STRENGTH (DYNAMOMETRY)</Text>
                <PdfGroupedBarChart
                  title={pdfCharts.strength.title}
                  dateCaption={pdfCharts.strength.dateCaption}
                  unit={pdfCharts.strength.unit}
                  groups={pdfCharts.strength.pairs.map((p) => ({
                    label: p.label,
                    left: p.left,
                    right: p.right,
                    annotation:
                      p.lsiPct != null ? `LSI ${p.lsiPct.toFixed(1)}%` : null,
                  }))}
                />
                {includeNotes ? (
                  <SectionCommentBlock
                    comment={sectionComments.dynamometry}
                  />
                ) : null}
              </View>
            ) : null}

            {showSection("hop_tests") && pdfCharts?.hop != null ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={340}>HOP TESTS</Text>
                <PdfGroupedBarChart
                  title={pdfCharts.hop.title}
                  dateCaption={pdfCharts.hop.dateCaption}
                  unit={pdfCharts.hop.unit}
                  groups={pdfCharts.hop.pairs.map((p) => ({
                    label: p.label,
                    left: p.left,
                    right: p.right,
                    annotation:
                      p.lsiPct != null
                        ? `LSI ${p.lsiPct.toFixed(1)}%`
                        : null,
                  }))}
                />
                {includeNotes ? (
                  <SectionCommentBlock comment={sectionComments.hop_tests} />
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {/* Footer — fixed at the bottom of every page with page numbers. */}
        <View style={styles.footer} fixed>
          <Text>{"Fit2Play Performance Testing \u00b7 fit2perform.com.au"}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Generated ${gen} \u00b7 Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
