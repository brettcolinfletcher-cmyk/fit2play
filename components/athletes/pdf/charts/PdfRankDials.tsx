import { Svg, Path, Line, Circle, Rect, Text as SvgText, Text, View } from "@react-pdf/renderer";
import { PDF_FONT } from "./pdfChartTheme";

/** One speed dial: the athlete's value plus where it ranks in the comparison group. */
export type PdfRankDial = {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  value: number | null;
  rank: number | null;
  cohortSize: number | null;
};

// Red (developing) -> dark green (elite). Same segments and geometry as the
// dashboard's SpeedDial in components/athletes/TeamRankDials.tsx.
const SEGMENTS = ["#dc2626", "#f97316", "#facc15", "#84cc16", "#15803d"];
const CX = 60;
const CY = 62;

function point(f: number, r: number): [number, number] {
  const a = Math.PI * (1 - f);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function Dial({ d }: { d: PdfRankDial }) {
  const hasRank = d.value != null && d.rank != null && d.cohortSize != null;
  // 1st = hard right, last = hard left. A cohort of one sits in the middle.
  const f = hasRank
    ? d.cohortSize! > 1
      ? (d.cohortSize! - d.rank!) / (d.cohortSize! - 1)
      : 0.5
    : null;
  const [nx, ny] = f != null ? point(f, 36) : [CX, CY];
  const seg = 1 / SEGMENTS.length;
  const valueText = d.value != null ? d.value.toFixed(d.decimals) : "\u2013";
  const pillText = d.unit && d.value != null ? `${valueText} ${d.unit}` : valueText;
  const pillW = Math.max(44, pillText.length * 6.2 + 16);
  const status = f == null ? (d.value != null ? "Not ranked" : "Not tested") : null;

  return (
    <View style={{ width: "20%", paddingHorizontal: 3, marginBottom: 6 }} wrap={false}>
      <View
        style={{
          borderWidth: 0.75,
          borderColor: "#e5e7eb",
          borderRadius: 6,
          paddingVertical: 5,
          paddingHorizontal: 3,
          backgroundColor: "#ffffff",
          alignItems: "center",
        }}
      >
        <Svg viewBox="0 0 120 104" width={88} height={76}>
          {SEGMENTS.map((c, i) => {
            const [x1, y1] = point(i * seg, 46);
            const [x2, y2] = point((i + 1) * seg, 46);
            return (
              <Path
                key={c}
                d={`M${x1} ${y1} A46 46 0 0 1 ${x2} ${y2}`}
                stroke={c}
                strokeWidth={10}
                fill="none"
                strokeOpacity={hasRank ? 1 : 0.25}
              />
            );
          })}
          {f != null ? (
            <Line
              x1={CX}
              y1={CY}
              x2={nx}
              y2={ny}
              stroke="#1e293b"
              strokeWidth={3}
              strokeLinecap="round"
            />
          ) : null}
          <Circle cx={CX} cy={CY} r={5} fill="#1e293b" fillOpacity={hasRank ? 1 : 0.25} />
          <Rect x={CX - pillW / 2} y={CY + 7} width={pillW} height={22} rx={11} fill="#1e293b" />
          <SvgText
            x={CX}
            y={CY + 22}
            fill="#ffffff"
            textAnchor="middle"
            style={{ fontSize: 11, fontFamily: PDF_FONT, fontWeight: 700 }}
          >
            {pillText}
          </SvgText>
          <SvgText
            x={6}
            y={CY + 39}
            fill={SEGMENTS[0]}
            style={{ fontSize: 7, fontFamily: PDF_FONT, fontWeight: 600 }}
          >
            Developing
          </SvgText>
          <SvgText
            x={114}
            y={CY + 39}
            fill={SEGMENTS[SEGMENTS.length - 1]}
            textAnchor="end"
            style={{ fontSize: 7, fontFamily: PDF_FONT, fontWeight: 600 }}
          >
            Elite
          </SvgText>
        </Svg>
        <Text style={{ fontSize: 7.5, fontWeight: 600, color: "#374151", marginTop: 2 }}>
          {d.label}
        </Text>
        <Text style={{ fontSize: 6.5, color: "#9ca3af", marginTop: 1 }}>{status ?? " "}</Text>
      </View>
    </View>
  );
}

/** Row of speed dials, five across; wraps to a second row if there are more. */
export default function PdfRankDials({ dials }: { dials: PdfRankDial[] }) {
  if (dials.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 }}>
      {dials.map((d) => (
        <Dial key={d.key} d={d} />
      ))}
    </View>
  );
}
