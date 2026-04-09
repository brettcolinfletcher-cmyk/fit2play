// components/reports/SessionReportPDF.tsx
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Polyline,
} from "@react-pdf/renderer";

type Session = {
  id: string;
  created_at: string;
  test_type: string | null;
  file_name: string | null;
};

type Athlete = {
  first_name: string | null;
  last_name: string | null;
  organisation: string | null;
  team: string | null;
  primary_sport: string | null;
} | null;

type SummaryMetrics = {
  peakSpeed: number | null;
  peakForce: number | null;
  peakPower: number | null;
  split5m: number | null;
  split10m: number | null;
  split20m: number | null;
};

type ForcePlateSummary = {
  jumpHeight: number | null;
  peakForce: number | null;
  peakForceLeft: number | null;
  peakForceRight: number | null;
  peakForceAsym: number | null;
  contactTime: number | null;
  flightTime: number | null;
  rsi: number | null;
  bodyMass: number | null;
} | null;

type RepRow = {
  rep: number;
  peakSpeed?: number | null;
  peakForce?: number | null;
  peakPower?: number | null;
  split20m?: number | null;
};

type Props = {
  session: Session;
  athlete: Athlete;
  summary: SummaryMetrics;
  rtsScore: number | null;
  forcePlateSummary: ForcePlateSummary;
  repList: RepRow[];
};

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },
  tag: {
    fontSize: 9,
    color: "#0ea5e9",
    marginBottom: 4,
  },
  section: {
    marginTop: 10,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#a3e635",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metricBox: {
    width: "33%",
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 8,
    color: "#64748b",
  },
  metricValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  table: {
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: "#334155",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
  },
  tableHeaderCell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 0.5,
    borderRightColor: "#334155",
    fontSize: 8,
    color: "#e2e8f0",
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableCell: {
    flex: 1,
    padding: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#1e293b",
    borderRightWidth: 0.5,
    borderRightColor: "#334155",
    fontSize: 8,
    color: "#e5e7eb",
  },
  chartContainer: {
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: "#334155",
    padding: 4,
  },
  chartLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  smallLabel: {
    fontSize: 8,
    color: "#9ca3af",
  },
});

function RepSpeedChart({ repList }: { repList: RepRow[] }) {
  if (!repList.length) {
    return <Text style={styles.smallLabel}>No rep data</Text>;
  }

  const speeds = repList
    .map((r) => r.peakSpeed ?? 0)
    .filter((v) => v != null) as number[];

  const maxSpeed = speeds.length ? Math.max(...speeds) : 0;
  const minSpeed = speeds.length ? Math.min(...speeds) : 0;

  const width = 260;
  const height = 80;
  const paddingX = 10;
  const paddingY = 10;

  const span = maxSpeed - minSpeed || 1;

  const points = repList.map((r, idx) => {
    const x =
      repList.length === 1
        ? paddingX + (width - 2 * paddingX) / 2
        : paddingX +
          (idx / (repList.length - 1)) * (width - 2 * paddingX);
    const v = r.peakSpeed ?? minSpeed;
    const norm = (v - minSpeed) / span;
    const y =
      height - paddingY - norm * (height - 2 * paddingY); // invert y
    return `${x},${y}`;
  });

  return (
    <Svg width={width} height={height}>
      {/* X axis */}
      <Polyline
        points={`${paddingX},${height - paddingY} ${
          width - paddingX
        },${height - paddingY}`}
        stroke="#475569"
        strokeWidth={0.5}
      />
      {/* Y axis */}
      <Polyline
        points={`${paddingX},${paddingY} ${paddingX},${
          height - paddingY
        }`}
        stroke="#475569"
        strokeWidth={0.5}
      />
      {/* Line */}
      <Polyline
        points={points.join(" ")}
        stroke="#38bdf8"
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

export function SessionReportPDF({
  session,
  athlete,
  summary,
  rtsScore,
  forcePlateSummary,
  repList,
}: Props) {
  const athleteName = athlete
    ? `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() ||
      "Unnamed athlete"
    : "Unknown athlete";

  const dateLabel = new Date(session.created_at).toLocaleString("en-AU");

  const headerTag =
    session.test_type === "1080_sprint"
      ? "1080 Sprint Session"
      : session.test_type || "Test Session";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.tag}>Fit2Play • Session Report</Text>
            <Text style={styles.title}>{athleteName}</Text>
            <Text style={styles.subtitle}>{headerTag}</Text>
            <Text style={styles.subtitle}>{dateLabel}</Text>
            {athlete && (
              <Text style={styles.subtitle}>
                {athlete.organisation ? `${athlete.organisation} • ` : ""}
                {athlete.team ? `${athlete.team} • ` : ""}
                {athlete.primary_sport ?? ""}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.subtitle}>
              Session ID: {session.id.slice(0, 8)}…
            </Text>
            {session.file_name && (
              <Text style={styles.subtitle}>
                File: {session.file_name}
              </Text>
            )}
            {typeof rtsScore === "number" && (
              <Text style={{ ...styles.subtitle, marginTop: 4 }}>
                RTS score: {rtsScore}
              </Text>
            )}
          </View>
        </View>

        {/* 1080 SUMMARY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1080 sprint summary</Text>
          <View style={styles.row}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Peak speed</Text>
              <Text style={styles.metricValue}>
                {summary.peakSpeed != null
                  ? `${summary.peakSpeed.toFixed(2)} m/s`
                  : "--"}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Peak force</Text>
              <Text style={styles.metricValue}>
                {summary.peakForce != null
                  ? `${summary.peakForce.toFixed(0)} N`
                  : "--"}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Peak power</Text>
              <Text style={styles.metricValue}>
                {summary.peakPower != null
                  ? `${summary.peakPower.toFixed(0)} W`
                  : "--"}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Split 5m</Text>
              <Text style={styles.metricValue}>
                {summary.split5m != null
                  ? `${summary.split5m.toFixed(2)} s`
                  : "--"}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Split 10m</Text>
              <Text style={styles.metricValue}>
                {summary.split10m != null
                  ? `${summary.split10m.toFixed(2)} s`
                  : "--"}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Split 20m</Text>
              <Text style={styles.metricValue}>
                {summary.split20m != null
                  ? `${summary.split20m.toFixed(2)} s`
                  : "--"}
              </Text>
            </View>
          </View>
        </View>

        {/* REP CHART */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rep performance (peak speed)</Text>
          <View style={styles.chartContainer}>
            <View style={styles.chartLabelRow}>
              <Text style={styles.smallLabel}>Rep →</Text>
              <Text style={styles.smallLabel}>Peak speed m/s</Text>
            </View>
            <RepSpeedChart repList={repList} />
          </View>
        </View>

        {/* REP TABLE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rep details</Text>
          {repList.length === 0 ? (
            <Text style={styles.smallLabel}>No reps recorded.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={styles.tableHeaderCell}>Rep</Text>
                <Text style={styles.tableHeaderCell}>Peak speed</Text>
                <Text style={styles.tableHeaderCell}>Peak force</Text>
                <Text style={styles.tableHeaderCell}>Peak power</Text>
                <Text style={styles.tableHeaderCell}>Split 20m</Text>
              </View>
              {repList.map((r) => (
                <View key={r.rep} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{r.rep}</Text>
                  <Text style={styles.tableCell}>
                    {r.peakSpeed != null
                      ? r.peakSpeed.toFixed(2)
                      : "--"}
                  </Text>
                  <Text style={styles.tableCell}>
                    {r.peakForce != null
                      ? r.peakForce.toFixed(0)
                      : "--"}
                  </Text>
                  <Text style={styles.tableCell}>
                    {r.peakPower != null
                      ? r.peakPower.toFixed(0)
                      : "--"}
                  </Text>
                  <Text style={styles.tableCell}>
                    {r.split20m != null
                      ? r.split20m.toFixed(2)
                      : "--"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* FORCE PLATE SUMMARY (if present) */}
        {forcePlateSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Force plate summary</Text>
            <View style={styles.row}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Jump height</Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.jumpHeight != null
                    ? `${forcePlateSummary.jumpHeight.toFixed(1)} cm`
                    : "--"}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Body mass</Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.bodyMass != null
                    ? `${forcePlateSummary.bodyMass.toFixed(1)} kg`
                    : "--"}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>
                  Peak force (total)
                </Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.peakForce != null
                    ? `${forcePlateSummary.peakForce.toFixed(0)} N`
                    : "--"}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>
                  Peak force – left
                </Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.peakForceLeft != null
                    ? `${forcePlateSummary.peakForceLeft.toFixed(0)} N`
                    : "--"}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>
                  Peak force – right
                </Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.peakForceRight != null
                    ? `${forcePlateSummary.peakForceRight.toFixed(0)} N`
                    : "--"}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>
                  Peak force asymmetry
                </Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.peakForceAsym != null
                    ? `${forcePlateSummary.peakForceAsym.toFixed(1)} %`
                    : "--"}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Contact time</Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.contactTime != null
                    ? `${forcePlateSummary.contactTime.toFixed(3)} s`
                    : "--"}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Flight time</Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.flightTime != null
                    ? `${forcePlateSummary.flightTime.toFixed(3)} s`
                    : "--"}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>RSI</Text>
                <Text style={styles.metricValue}>
                  {forcePlateSummary.rsi != null
                    ? forcePlateSummary.rsi.toFixed(2)
                    : "--"}
                </Text>
              </View>
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}