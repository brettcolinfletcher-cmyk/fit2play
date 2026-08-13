import { Document, Font, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import PdfBarChart from "@/components/athletes/pdf/charts/PdfBarChart";
import PdfGroupedBarChart from "@/components/athletes/pdf/charts/PdfGroupedBarChart";
import PdfLineChart from "@/components/athletes/pdf/charts/PdfLineChart";
import type {
  BestInRangeData,
  DateComparisonData,
} from "@/lib/athleteReportData";
import type {
  PdfBandTag,
  PdfBandTone,
  PdfDelta,
  PdfKeyFinding,
  PdfReportCharts,
  PdfReportContext,
  PdfTestIncluded,
} from "@/lib/pdfReportChartData";
import type { AthleteSnapshot } from "@/lib/athleteSnapshot";
import type { ReportVisibility } from "@/lib/reportSections";
import { PDF_FONT } from "@/components/athletes/pdf/charts/pdfChartTheme";

// ─── Fonts ───
// Plus Jakarta Sans, self-hosted from /public/fonts so the emailed PDF matches
// the dashboard typography. The four static weights must exist at
// /public/fonts/*.ttf. PDF generation is client-side, so these same-origin
// relative URLs resolve in the browser without CORS.
Font.register({
  family: PDF_FONT,
  fonts: [
    { src: "/fonts/PlusJakartaSans-Regular.ttf", fontWeight: 400 },
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

/** Format a YYYY-MM-DD birthdate as e.g. "3 May 1996". Returns null on invalid input. */
function formatBirthdate(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  try {
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Australia/Sydney",
    });
  } catch {
    return null;
  }
}

/** Compute age in completed years from a YYYY-MM-DD birthdate. */
function computeAge(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  try {
    const dob = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(dob.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age >= 0 && age < 120 ? age : null;
  } catch {
    return null;
  }
}

// ─── Band pill colours ───
// Mirrors `bandLabelToClasses` in lib/performanceBands.ts but as hex colours
// for the PDF (Tailwind classes don't compile into @react-pdf).
const BAND_COLORS: Record<
  PdfBandTone,
  { bg: string; text: string; border: string }
> = {
  elite: { bg: "#d1fae5", text: "#047857", border: "#a7f3d0" },
  good: { bg: "#fef9c3", text: "#a16207", border: "#fef08a" },
  fair: { bg: "#ffedd5", text: "#9a3412", border: "#fed7aa" },
  poor: { bg: "#fee2e2", text: "#b91c1c", border: "#fecaca" },
  neutral: { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" },
};

function BandPill({ band }: { band: PdfBandTag }) {
  const c = BAND_COLORS[band.tone] ?? BAND_COLORS.neutral;
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: c.bg, borderColor: c.border },
      ]}
    >
      <Text style={[styles.pillLabel, { color: c.text }]}>{band.label}</Text>
    </View>
  );
}

function DeltaArrow({ delta }: { delta: PdfDelta }) {
  const isFlat = delta.absoluteChange === 0;
  const isImprovement = delta.lowerIsBetter
    ? delta.absoluteChange < 0
    : delta.absoluteChange > 0;
  const color = isFlat ? "#9ca3af" : isImprovement ? "#059669" : "#dc2626";
  const pct = delta.pctChange;
  // Signed magnitude (no ▲/▼ — built-in Helvetica lacks those glyphs).
  // Number shows the actual change; colour shows whether it's good or bad.
  const label = isFlat
    ? "0.0%"
    : `${pct > 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}%`;
  return (
    <View style={styles.delta}>
      <Text style={[styles.deltaPct, { color }]}>{label}</Text>
      <Text style={styles.deltaPrev}>vs {delta.previousDateLabel}</Text>
    </View>
  );
}

function FindingTile({ finding }: { finding: PdfKeyFinding }) {
  return (
    <View style={styles.findingTile} wrap={false}>
      <View style={styles.findingTileInner}>
        <Text style={styles.findingLabel}>{finding.label}</Text>
        <Text style={styles.findingValue}>{finding.value}</Text>
        <Text style={styles.findingDate}>{finding.dateLabel}</Text>
        {(finding.band || finding.delta) && (
          <View style={styles.findingMeta}>
            {finding.band ? <BandPill band={finding.band} /> : null}
            {finding.delta ? <DeltaArrow delta={finding.delta} /> : null}
          </View>
        )}
      </View>
    </View>
  );
}

function TestsIncludedTable({ tests }: { tests: PdfTestIncluded[] }) {
  if (tests.length === 0) return null;
  return (
    <View style={styles.tableCard}>
      <View style={styles.tableHeader}>
        <Text style={[styles.colTiModality, styles.th]}>Modality</Text>
        <Text style={[styles.colTiSessions, styles.th]}>Sessions</Text>
        <Text style={[styles.colTiLatest, styles.th]}>Latest</Text>
      </View>
      {tests.map((t, i) => (
        <View key={t.id} style={i % 2 === 0 ? styles.row : styles.rowAlt}>
          <Text style={[styles.colTiModality, styles.td]}>{t.modality}</Text>
          <Text style={[styles.colTiSessions, styles.tdMono]}>
            {t.sessions}
          </Text>
          <Text style={[styles.colTiLatest, styles.td]}>
            {t.latestDateLabel}
          </Text>
        </View>
      ))}
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
  athleteDob?: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  mode: "best" | "date_comparison";
  compareDateALabel?: string;
  compareDateBLabel?: string;
  includeNotes: boolean;
  summaryComment: string | null;
  sectionComments: Record<string, string | null>;
  bestInRange: BestInRangeData;
  dateComparisonData?: DateComparisonData;
  /** Native SVG charts for "best" mode only */
  pdfCharts?: PdfReportCharts | null;
  /** Snapshot context (tests-included + key findings); "best" mode only. */
  pdfContext?: PdfReportContext | null;
  /** Computed athlete snapshot (readiness + symmetry gauges); "best" mode only. */
  snapshot?: AthleteSnapshot | null;
  /** Report visibility resolver — gates which modality sections render. */
  visibility?: ReportVisibility | null;
};

function BestTable({
  title,
  rows,
  col1Header = "Metric",
  col2Header = "Best",
  col3Header = "Date",
}: {
  title?: string;
  rows: { c1: string; c2: string; c3: string }[];
  col1Header?: string;
  col2Header?: string;
  col3Header?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.tableCard}>
      {title ? <Text style={styles.tableCardTitle}>{title}</Text> : null}
      <View style={styles.tableHeader}>
        <Text style={[styles.colMetric, styles.th]}>{col1Header}</Text>
        <Text style={[styles.colBest, styles.th]}>{col2Header}</Text>
        <Text style={[styles.colDate, styles.th]}>{col3Header}</Text>
      </View>
      {rows.map((r, i) => (
        <View key={`${r.c1}-${i}`} style={i % 2 === 0 ? styles.row : styles.rowAlt}>
          <Text style={[styles.colMetric, styles.td]}>{r.c1}</Text>
          <Text style={[styles.colBest, styles.tdMono]}>{r.c2}</Text>
          <Text style={[styles.colDate, styles.td]}>{r.c3}</Text>
        </View>
      ))}
    </View>
  );
}

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
  athleteDob,
  rangeStart,
  rangeEnd,
  mode,
  compareDateALabel = "Date A",
  compareDateBLabel = "Date B",
  includeNotes,
  summaryComment,
  sectionComments,
  bestInRange,
  dateComparisonData,
  pdfCharts = null,
  pdfContext = null,
  snapshot = null,
  visibility = null,
}: PdfProps) {
  const rangeLine =
    rangeStart || rangeEnd
      ? `${formatPdfDay(rangeStart)} – ${formatPdfDay(rangeEnd)}`
      : "Full history";
  const gen = generatedStamp();

  const linearBestRows = bestInRange.linear.map((r) => ({
    c1: r.metric,
    c2: r.best,
    c3: r.date,
  }));
  const cmjBestRows = bestInRange.cmj.map((r) => ({
    c1: r.metric,
    c2: r.best,
    c3: r.date,
  }));
  const djBestRows = bestInRange.dj.map((r) => ({
    c1: r.metric,
    c2: r.best,
    c3: r.date,
  }));
  const hopBestRows = bestInRange.hop.map((r) => ({
    c1: r.test,
    c2: r.best,
    c3: r.date,
  }));

  const dc = dateComparisonData;
  const ctx = pdfContext ?? null;
  const isBest = mode === "best";
  const showSection = (key: string): boolean =>
    visibility ? visibility.isSectionVisible(key) : true;

  // Athlete meta strip: only render when at least one value exists.
  const dobLine = (() => {
    const formatted = formatBirthdate(athleteDob);
    if (!formatted) return null;
    const age = computeAge(athleteDob);
    return age != null ? `${formatted} (${age})` : formatted;
  })();
  const hasMeta = Boolean(athleteSport || athleteTeam || dobLine);

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
                {dobLine ? <MetaPill label="DOB" value={dobLine} /> : null}
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

        {/* SNAPSHOT — only in "best" mode and only when context is provided. */}
        {isBest && ctx ? (
          <>
            {ctx.tests.length > 0 ? (
              <View>
                <Text style={styles.sectionBanner} minPresenceAhead={110}>TESTS INCLUDED</Text>
                <TestsIncludedTable tests={ctx.tests} />
              </View>
            ) : null}

            {ctx.findings.length > 0 ? (
              <View>
                <Text style={styles.sectionBanner}>KEY FINDINGS</Text>
                <View style={styles.findingsGrid}>
                  {ctx.findings.map((f) => (
                    <FindingTile key={f.id} finding={f} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
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

        {/* MODALITY DETAIL — only in "best" mode. */}
        {isBest ? (
          <>
            {showSection("linear") &&
            (pdfCharts?.sprint != null || linearBestRows.length > 0) ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={260}>LINEAR SPRINT</Text>
                {pdfCharts?.sprint ? (
                  <PdfBarChart
                    title={pdfCharts.sprint.title}
                    dateCaption={pdfCharts.sprint.dateCaption}
                    unit={pdfCharts.sprint.unit}
                    items={pdfCharts.sprint.items}
                  />
                ) : null}
                {linearBestRows.length > 0 ? (
                  <BestTable title="" rows={linearBestRows} />
                ) : null}
                {includeNotes ? (
                  <SectionCommentBlock comment={sectionComments.linear} />
                ) : null}
              </View>
            ) : null}

            {showSection("cod") && pdfCharts?.cod != null ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={260}>
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
            (pdfCharts?.jump != null ||
              cmjBestRows.length > 0 ||
              djBestRows.length > 0) ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={260}>FORCE PLATE</Text>
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
                {/* With the new ≥3 rule, single-session jump data goes into the
                    KEY FINDINGS tiles on the snapshot page rather than being
                    a lonely standalone bar here. */}
                {showSection("cmj") && cmjBestRows.length > 0 ? (
                  <>
                    <BestTable
                      title={"CMJ \u2014 best values"}
                      rows={cmjBestRows}
                    />
                    {includeNotes ? (
                      <SectionCommentBlock comment={sectionComments.cmj} />
                    ) : null}
                  </>
                ) : null}
                {showSection("drop_jump") && djBestRows.length > 0 ? (
                  <>
                    <BestTable
                      title={"Drop jump \u2014 best values"}
                      rows={djBestRows}
                    />
                    {includeNotes ? (
                      <SectionCommentBlock
                        comment={sectionComments.drop_jump}
                      />
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}

            {showSection("dynamometry") && pdfCharts?.strength != null ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={260}>STRENGTH (DYNAMOMETRY)</Text>
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

            {showSection("hop_tests") &&
            (pdfCharts?.hop != null || hopBestRows.length > 0) ? (
              <View style={styles.modalitySection}>
                <Text style={styles.sectionBanner} minPresenceAhead={260}>HOP TESTS</Text>
                {pdfCharts?.hop ? (
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
                ) : null}
                {hopBestRows.length > 0 ? (
                  <BestTable
                    title=""
                    rows={hopBestRows}
                    col1Header="Test"
                    col2Header="Best LSI%"
                  />
                ) : null}
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
