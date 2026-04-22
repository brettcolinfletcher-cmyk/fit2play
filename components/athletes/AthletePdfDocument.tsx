import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import PdfBarChart from "@/components/athletes/pdf/charts/PdfBarChart";
import PdfGroupedBarChart from "@/components/athletes/pdf/charts/PdfGroupedBarChart";
import PdfLineChart from "@/components/athletes/pdf/charts/PdfLineChart";
import type {
  BestInRangeData,
  DateComparisonData,
} from "@/lib/athleteReportData";
import type { PdfReportCharts } from "@/lib/pdfReportChartData";

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#374151",
    backgroundColor: "#ffffff",
  },
  limeTopBarWrap: {
    marginHorizontal: -40,
    marginBottom: 16,
  },
  limeTopBar: {
    height: 4,
    width: "100%",
    backgroundColor: "#84cc16",
  },
  headerName: {
    fontSize: 20,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 4,
  },
  headerReportType: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 2,
  },
  headerMeta: {
    fontSize: 8,
    color: "#9ca3af",
    marginBottom: 12,
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
    marginTop: 4,
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#84cc16",
  },
  h2: {
    fontSize: 9,
    fontWeight: 700,
    color: "#111827",
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  body: {
    fontSize: 8,
    lineHeight: 1.35,
    color: "#374151",
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
  th: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#374151",
  },
  td: { fontSize: 8, color: "#374151" },
  tdMono: { fontSize: 8.5, color: "#111827" },
  footer: {
    marginTop: 14,
    paddingTop: 10,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "center",
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

export type PdfProps = {
  athleteName: string;
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
};

const SECTION_NOTE_LABELS: Record<string, string> = {
  summary: "Summary",
  linear: "Linear sprint",
  cod: "COD",
  cmj: "Force plate — CMJ",
  drop_jump: "Force plate — Drop jump",
  hop_tests: "Hop tests",
  dynamometry: "Dynamometry",
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
    <View style={{ marginBottom: 8 }}>
      {title ? <Text style={styles.h2}>{title}</Text> : null}
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
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.h2}>{title}</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.colMetric, styles.th]}>Metric</Text>
        <Text style={[styles.colA, styles.th]}>{labelA}</Text>
        <Text style={[styles.colB, styles.th]}>{labelB}</Text>
        <Text style={[styles.colD, styles.th]}>Δ</Text>
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

  const noteEntries = Object.entries(sectionComments).filter(
    ([, v]) => v != null && String(v).trim() !== ""
  );

  const footerText = `Fit2Play Performance Testing · fit2play.vercel.app · Generated ${gen}`;

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.limeTopBarWrap}>
          <View style={styles.limeTopBar} />
        </View>
        <Image
          src="https://fit2play.vercel.app/fit2play-logo.png"
          style={{ width: 48, marginBottom: 4 }}
        />
        <Text style={styles.headerName}>{athleteName}</Text>
        <Text style={styles.headerReportType}>Athlete Performance Report</Text>
        <Text style={styles.headerMeta}>Date range: {rangeLine}</Text>

        <View style={styles.rule} />

        {summaryComment?.trim() ? (
          <>
            <Text style={styles.sectionBanner}>SUMMARY</Text>
            <Text style={styles.body}>{summaryComment.trim()}</Text>
          </>
        ) : null}

        {mode === "best" ? (
          <Text style={styles.sectionBanner}>Best Performance</Text>
        ) : (
          <Text style={styles.sectionBanner}>
            {`Session Comparison — ${compareDateALabel} vs ${compareDateBLabel}`}
          </Text>
        )}

        {mode === "best" ? (
          <>
            {(pdfCharts?.sprint != null || linearBestRows.length > 0) && (
              <View style={{ marginBottom: 6 }}>
                <Text style={styles.sectionBanner}>LINEAR SPRINT</Text>
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
              </View>
            )}

            {pdfCharts?.cod != null && (
              <View style={{ marginBottom: 6 }}>
                <Text style={styles.sectionBanner}>CHANGE OF DIRECTION (5-10-5)</Text>
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
              </View>
            )}

            {(pdfCharts?.jump != null || cmjBestRows.length > 0 || djBestRows.length > 0) && (
              <View style={{ marginBottom: 6 }}>
                <Text style={styles.sectionBanner}>FORCE PLATE — JUMP</Text>
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
                {pdfCharts?.jump?.variant === "bar" ? (
                  <View>
                    {pdfCharts.jump.jumpCm != null ? (
                      <PdfBarChart
                        title="Jump height — latest session"
                        dateCaption={pdfCharts.jump.dateCaption}
                        unit="cm"
                        items={[{ label: "Jump height", value: pdfCharts.jump.jumpCm }]}
                      />
                    ) : null}
                    {pdfCharts.jump.rsi != null ? (
                      <PdfBarChart
                        title="RSI — latest session"
                        dateCaption={pdfCharts.jump.dateCaption}
                        unit="RSI"
                        items={[{ label: "RSI", value: pdfCharts.jump.rsi }]}
                      />
                    ) : null}
                  </View>
                ) : null}
                {cmjBestRows.length > 0 ? (
                  <BestTable title="FORCE PLATE — CMJ" rows={cmjBestRows} />
                ) : null}
                {djBestRows.length > 0 ? (
                  <BestTable title="FORCE PLATE — DROP JUMP" rows={djBestRows} />
                ) : null}
              </View>
            )}

            {pdfCharts?.strength != null && (
              <View style={{ marginBottom: 6 }}>
                <Text style={styles.sectionBanner}>STRENGTH (DYNAMOMETRY)</Text>
                <PdfGroupedBarChart
                  title={pdfCharts.strength.title}
                  dateCaption={pdfCharts.strength.dateCaption}
                  unit={pdfCharts.strength.unit}
                  groups={pdfCharts.strength.pairs.map((p) => ({
                    label: p.label,
                    left: p.left,
                    right: p.right,
                    annotation: p.lsiPct != null ? `LSI ${p.lsiPct.toFixed(1)}%` : null,
                  }))}
                />
              </View>
            )}

            {(pdfCharts?.hop != null || hopBestRows.length > 0) && (
              <View style={{ marginBottom: 6 }}>
                <Text style={styles.sectionBanner}>HOP TESTS</Text>
                {pdfCharts?.hop ? (
                  <PdfGroupedBarChart
                    title={pdfCharts.hop.title}
                    dateCaption={pdfCharts.hop.dateCaption}
                    unit={pdfCharts.hop.unit}
                    groups={pdfCharts.hop.pairs.map((p) => ({
                      label: p.label,
                      left: p.left,
                      right: p.right,
                      annotation: p.lsiPct != null ? `LSI ${p.lsiPct.toFixed(1)}%` : null,
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
              </View>
            )}
          </>
        ) : (
          dc && (
            <>
              <CompareTable
                title="LINEAR SPRINT"
                labelA={compareDateALabel}
                labelB={compareDateBLabel}
                rows={dc.linear}
              />
              <CompareTable
                title="FORCE PLATE — CMJ"
                labelA={compareDateALabel}
                labelB={compareDateBLabel}
                rows={dc.cmj}
              />
              <CompareTable
                title="FORCE PLATE — DROP JUMP"
                labelA={compareDateALabel}
                labelB={compareDateBLabel}
                rows={dc.dj}
              />
              {dc.hop.map((block) => (
                <CompareTable
                  key={block.testType}
                  title={`HOP — ${block.title.toUpperCase()}`}
                  labelA={compareDateALabel}
                  labelB={compareDateBLabel}
                  rows={block.rows}
                />
              ))}
            </>
          )
        )}

        {includeNotes && noteEntries.length > 0 ? (
          <>
            <View style={styles.rule} />
            <Text style={styles.sectionBanner}>SECTION NOTES</Text>
            {noteEntries.map(([key, val]) => (
              <Text key={key} style={[styles.body, { marginBottom: 4 }]}>
                {SECTION_NOTE_LABELS[key] ?? key}: {String(val).trim()}
              </Text>
            ))}
          </>
        ) : null}

        <View style={styles.rule} />
        <Text style={styles.footer}>{footerText}</Text>
      </Page>
    </Document>
  );
}
