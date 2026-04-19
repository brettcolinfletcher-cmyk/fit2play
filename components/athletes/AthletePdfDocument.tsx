import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type {
  BestInRangeData,
  DateComparisonData,
} from "@/lib/athleteReportData";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#374151",
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 2,
  },
  meta: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 12,
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginVertical: 10,
  },
  sectionBanner: {
    fontSize: 9,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 6,
    paddingLeft: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#84cc16",
  },
  h2: {
    fontSize: 10,
    fontWeight: 700,
    color: "#111827",
    marginTop: 8,
    marginBottom: 4,
  },
  body: {
    fontSize: 8,
    lineHeight: 1.35,
    color: "#374151",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingVertical: 4,
    backgroundColor: "#f3f4f6",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  rowAlt: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  colMetric: { width: "38%" },
  colBest: { width: "28%" },
  colDate: { width: "34%" },
  colA: { width: "28%" },
  colB: { width: "28%" },
  colD: { width: "16%" },
  th: { fontSize: 7, fontWeight: 700, color: "#111827" },
  td: { fontSize: 8, color: "#374151" },
  tdMono: { fontSize: 8, color: "#111827" },
  footer: {
    marginTop: 14,
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
  title: string;
  rows: { c1: string; c2: string; c3: string }[];
  col1Header?: string;
  col2Header?: string;
  col3Header?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.h2}>{title}</Text>
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

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>FIT2PLAY — Athlete Report</Text>
        <Text style={styles.subtitle}>{athleteName}</Text>
        <Text style={styles.meta}>
          Date range: {rangeLine} · Generated: {gen}
        </Text>
        <View style={styles.rule} />

        <Text style={styles.sectionBanner}>SUMMARY</Text>
        <Text style={styles.body}>
          {summaryComment?.trim() ? summaryComment.trim() : "—"}
        </Text>
        <View style={styles.rule} />

        {mode === "best" ? (
          <>
            <Text style={styles.sectionBanner}>[MODE: BEST IN RANGE]</Text>
            <BestTable title="LINEAR SPRINT" rows={linearBestRows} />
            <BestTable title="FORCE PLATE — CMJ" rows={cmjBestRows} />
            <BestTable title="FORCE PLATE — DROP JUMP" rows={djBestRows} />
            <BestTable
              title="HOP TESTS"
              rows={hopBestRows}
              col1Header="Test"
              col2Header="Best LSI%"
            />
          </>
        ) : (
          dc && (
            <>
              <Text style={styles.sectionBanner}>[MODE: DATE COMPARISON]</Text>
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
        <Text style={styles.footer}>Generated by Fit2Play · fit2play.vercel.app</Text>
      </Page>
    </Document>
  );
}
