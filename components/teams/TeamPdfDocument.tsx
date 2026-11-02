import { Document, Font, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { PDF_FONT } from "@/components/athletes/pdf/charts/pdfChartTheme";
import { formatMetric, LSI_FLAG_BELOW, DROP_FLAG_PCT, type TeamReport, type Tone } from "@/lib/teamReport";

// Same self-hosted font as the athlete report (registering twice is harmless).
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
Font.registerHyphenationCallback((word) => [word]);

const LOGO = "https://www.fit2perform.com.au/fit2perform_logo_white.png";

const TONE_BG: Record<Tone, string> = {
  elite: "#86efac",
  good: "#d9f99d",
  fair: "#fde68a",
  poor: "#fecaca",
  neutral: "#ffffff",
};

const NAME_W = 118;
const DATE_W = 54;

const s = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 8,
    fontFamily: PDF_FONT,
    color: "#374151",
    backgroundColor: "#ffffff",
  },
  limeBar: { marginHorizontal: -40, height: 4, backgroundColor: "#84cc16" },
  headerBand: {
    marginHorizontal: -40,
    marginBottom: 16,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 40,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  headerName: { fontSize: 20, fontWeight: 700, color: "#ffffff", marginBottom: 3 },
  headerType: { fontSize: 9, color: "#cbd5e1", marginBottom: 2 },
  headerMeta: { fontSize: 8, color: "#94a3b8" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  pill: {
    flexDirection: "row",
    paddingVertical: 2,
    paddingHorizontal: 7,
    backgroundColor: "#1e293b",
    borderRadius: 9999,
    marginRight: 4,
  },
  pillLabel: { fontSize: 6.5, color: "#64748b", textTransform: "uppercase", marginRight: 5, fontWeight: 700 },
  pillValue: { fontSize: 7, color: "#e2e8f0", fontWeight: 600 },
  banner: {
    fontSize: 10,
    fontWeight: 700,
    color: "#111827",
    marginTop: 14,
    marginBottom: 6,
    paddingLeft: 9,
    borderLeftWidth: 5,
    borderLeftColor: "#84cc16",
  },
  note: { fontSize: 7, color: "#6b7280", marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  th: {
    fontSize: 6.5,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  td: { fontSize: 8, paddingVertical: 3.5, paddingHorizontal: 3 },
  num: { textAlign: "center" },
  avgRow: { flexDirection: "row", backgroundColor: "#f1f5f9", borderTopWidth: 1, borderTopColor: "#cbd5e1" },
  legendRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 5 },
  swatch: { width: 8, height: 8, marginRight: 3, borderWidth: 0.5, borderColor: "#d1d5db" },
  legendText: { fontSize: 6.5, color: "#6b7280", marginRight: 9 },
  cards: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  card: {
    width: "33.33%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  cardInner: { borderWidth: 0.5, borderColor: "#e5e7eb", backgroundColor: "#fafafa", borderRadius: 4, padding: 7 },
  cardTitle: { fontSize: 8, fontWeight: 700, color: "#111827", marginBottom: 4 },
  cardLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  cardAvg: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
    color: "#6b7280",
  },
  covBlock: { marginBottom: 6 },
  covHead: { fontSize: 8, fontWeight: 700, color: "#111827", marginBottom: 2 },
  covText: { fontSize: 8, lineHeight: 1.4 },
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

export function formatDay(ymd: string | null): string {
  if (!ymd) return "–";
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillLabel}>{label}</Text>
      <Text style={s.pillValue}>{value}</Text>
    </View>
  );
}

export default function TeamPdfDocument({
  report,
  comment,
  generatedLabel,
}: {
  report: TeamReport;
  comment: string | null;
  generatedLabel: string;
}) {
  const { metrics, rows, rankings, flags, coverage } = report;
  const colW = metrics.length ? (515 - NAME_W - DATE_W) / metrics.length : 0;
  const anyStale = rows.some((r) => metrics.some((m) => r.cells[m.metric]?.stale));

  const retestLabel = (status: string, due: string | null, days: number | null) => {
    if (status === "never") return "never tested";
    if (status === "overdue") return `overdue ${days} day${days === 1 ? "" : "s"} (due ${formatDay(due)})`;
    return `due ${formatDay(due)}`;
  };

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <View style={s.limeBar} />
        <View style={s.headerBand}>
          <View style={{ width: 96, marginRight: 20 }}>
            <Image src={LOGO} style={{ width: 96 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerName}>{report.teamName}</Text>
            <Text style={s.headerType}>Team Summary Report</Text>
            <Text style={s.headerMeta}>
              Testing round: {formatDay(report.from)} to {formatDay(report.to)}
            </Text>
            <View style={s.pillRow}>
              <Pill label="Squad" value={String(rows.length)} />
              <Pill label="Tested" value={String(coverage.tested.length)} />
              <Pill label="Flags" value={String(flags.length)} />
            </View>
          </View>
        </View>

        {comment ? (
          <View>
            <Text style={s.banner}>SUMMARY</Text>
            <Text style={{ fontSize: 8.5, lineHeight: 1.45 }}>{comment}</Text>
          </View>
        ) : null}

        {/* 1. Squad table */}
        <Text style={s.banner}>SQUAD RESULTS</Text>
        {metrics.length === 0 ? (
          <Text style={s.note}>No test results for this squad yet.</Text>
        ) : (
          <View>
            <View style={[s.tr, { borderBottomColor: "#9ca3af" }]}>
              <Text style={[s.th, { width: NAME_W }]}>Athlete</Text>
              {metrics.map((m) => (
                <Text key={m.metric} style={[s.th, s.num, { width: colW }]}>
                  {m.short}
                  {"\n"}
                  <Text style={{ fontWeight: 400, textTransform: "none" }}>{m.unit}</Text>
                </Text>
              ))}
              <Text style={[s.th, s.num, { width: DATE_W }]}>Last test</Text>
            </View>
            {rows.map((r) => (
              <View key={r.athleteId} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: NAME_W, fontWeight: 600, color: "#111827" }]}>{r.name}</Text>
                {metrics.map((m) => {
                  const c = r.cells[m.metric];
                  return (
                    <Text
                      key={m.metric}
                      style={[
                        s.td,
                        s.num,
                        {
                          width: colW,
                          backgroundColor: c?.value != null ? TONE_BG[c.tone] : "#ffffff",
                          color: c?.stale ? "#9ca3af" : "#111827",
                        },
                        c?.stale ? { fontStyle: "italic" } : {},
                      ]}
                    >
                      {formatMetric(m, c?.value ?? null)}
                      {c?.stale ? "*" : ""}
                    </Text>
                  );
                })}
                <Text style={[s.td, s.num, { width: DATE_W, fontSize: 7, color: "#6b7280" }]}>
                  {formatDay(r.lastTest).replace(/ \d{4}$/, "")}
                </Text>
              </View>
            ))}
            <View style={s.avgRow} wrap={false}>
              <Text style={[s.td, { width: NAME_W, fontWeight: 700 }]}>Squad average</Text>
              {rankings.map((rk) => (
                <Text key={rk.metric.metric} style={[s.td, s.num, { width: colW, fontWeight: 700 }]}>
                  {formatMetric(rk.metric, rk.average)}
                </Text>
              ))}
              <Text style={[s.td, { width: DATE_W }]} />
            </View>
            <View style={s.legendRow}>
              {(report.colourMode === "squad"
                ? ([
                    ["good", "Top third of squad"],
                    ["fair", "Middle third"],
                    ["poor", "Bottom third"],
                  ] as const)
                : ([
                    ["elite", "Elite"],
                    ["good", "Good"],
                    ["fair", "Fair"],
                    ["poor", "Poor"],
                  ] as const)
              ).map(([tone, label]) => (
                <View key={tone} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={[s.swatch, { backgroundColor: TONE_BG[tone] }]} />
                  <Text style={s.legendText}>{label}</Text>
                </View>
              ))}
              {report.colourMode === "bands" ? (
                <Text style={s.legendText}>White = no band set for that test.</Text>
              ) : null}
            </View>
            {anyStale ? (
              <Text style={s.note}>* Result from before this testing round (latest available shown).</Text>
            ) : null}
          </View>
        )}

        {/* 2. Rankings */}
        {rankings.length > 0 ? (
          <View>
            <Text style={s.banner} minPresenceAhead={80}>TOP 3 AND SQUAD AVERAGE</Text>
            <View style={s.cards}>
              {rankings.map((rk) => (
                <View key={rk.metric.metric} style={s.card} wrap={false}>
                  <View style={s.cardInner}>
                    <Text style={s.cardTitle}>
                      {rk.metric.label} ({rk.metric.unit})
                    </Text>
                    {rk.top.length === 0 ? (
                      <Text style={s.note}>No results</Text>
                    ) : (
                      rk.top.map((t) => (
                        <View key={t.name} style={s.cardLine}>
                          <Text>
                            {t.rank}. {t.name}
                          </Text>
                          <Text style={{ fontWeight: 600 }}>{formatMetric(rk.metric, t.value)}</Text>
                        </View>
                      ))
                    )}
                    <View style={s.cardAvg}>
                      <Text>Squad average (n={rk.count})</Text>
                      <Text>{formatMetric(rk.metric, rk.average)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 3. Flags (kept on one page unless the list is long) */}
        <View wrap={flags.length > 12}>
          <Text style={s.banner} minPresenceAhead={60}>FLAGS</Text>
          <Text style={[s.note, { marginTop: 0, marginBottom: 4 }]}>
            Limb symmetry (LSI) below {LSI_FLAG_BELOW}%, or a result more than {DROP_FLAG_PCT}% worse than the
            previous test. This testing round only.
          </Text>
          {flags.length === 0 ? (
            <Text style={s.td}>No flags this round.</Text>
          ) : (
            <View>
              <View style={[s.tr, { borderBottomColor: "#9ca3af" }]}>
                <Text style={[s.th, { width: NAME_W }]}>Athlete</Text>
                <Text style={[s.th, { width: 130 }]}>Test</Text>
                <Text style={[s.th, { flex: 1 }]}>Detail</Text>
                <Text style={[s.th, { width: DATE_W }]}>Date</Text>
              </View>
              {flags.map((f, i) => (
                <View key={i} style={s.tr} wrap={false}>
                  <Text style={[s.td, { width: NAME_W, fontWeight: 600, color: "#111827" }]}>{f.name}</Text>
                  <Text style={[s.td, { width: 130 }]}>{f.test}</Text>
                  <Text style={[s.td, { flex: 1, color: "#b91c1c" }]}>{f.detail}</Text>
                  <Text style={[s.td, { width: DATE_W, fontSize: 7 }]}>{formatDay(f.date)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 4. Coverage */}
        <View>
          <Text style={s.banner} minPresenceAhead={60}>TESTING COVERAGE</Text>
          <View style={s.covBlock}>
            <Text style={s.covHead}>Tested this round ({coverage.tested.length})</Text>
            <Text style={s.covText}>{coverage.tested.join(", ") || "Nobody"}</Text>
          </View>
          <View style={s.covBlock}>
            <Text style={s.covHead}>Missed this round ({coverage.missed.length})</Text>
            <Text style={s.covText}>{coverage.missed.join(", ") || "Nobody"}</Text>
          </View>
          {coverage.incomplete.length > 0 ? (
            <View style={s.covBlock}>
              <Text style={s.covHead}>Tested but missing a test ({coverage.incomplete.length})</Text>
              {coverage.incomplete.map((x) => (
                <Text key={x.name} style={s.covText}>
                  {x.name}: {x.missing.join(", ")}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={s.covBlock}>
            <Text style={s.covHead}>Due for retest ({coverage.retest.length})</Text>
            {coverage.retest.length === 0 ? (
              <Text style={s.covText}>Nobody due in the next 7 days.</Text>
            ) : (
              coverage.retest.map((r) => (
                <Text key={r.athleteId} style={s.covText}>
                  {r.name}: {retestLabel(r.status, r.dueDate, r.daysOverdue)}
                </Text>
              ))
            )}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>Fit2Perform Performance Testing {"·"} fit2perform.com.au</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Generated ${generatedLabel} · Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
