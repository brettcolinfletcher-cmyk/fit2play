import { Fragment } from "react";
import {
  Svg,
  Line,
  Polyline,
  Circle,
  Text,
  View,
} from "@react-pdf/renderer";
import { PDF_CHART, PdfChartDefs, pdfCardStyles } from "./pdfChartTheme";

const COL = {
  jh: PDF_CHART.lineJump, // lime
  rsi: PDF_CHART.lineRsi, // blue
};

type Point = { t?: number; xLabel: string; jumpCm: number | null; rsi: number | null };

type Props = {
  title: string;
  dateCaption: string;
  leftAxisLabel: string;
  rightAxisLabel: string;
  points: Point[];
  widthPt?: number;
  heightPt?: number;
};

const DOT = 2.6;

export default function PdfLineChart({
  title,
  dateCaption,
  leftAxisLabel,
  rightAxisLabel,
  points,
  widthPt = 480,
  heightPt = 190,
}: Props) {
  const withAny = points.filter(
    (p) =>
      (p.jumpCm != null && Number.isFinite(p.jumpCm)) ||
      (p.rsi != null && Number.isFinite(p.rsi))
  );
  if (withAny.length === 0) return null;

  const padL = 40;
  const padR = 40;
  const padT = 14;
  const padB = 24;
  const plotW = widthPt - padL - padR;
  const plotH = heightPt - padT - padB;

  const finiteT = (p: Point) => p.t != null && Number.isFinite(p.t);
  const useTime = withAny.every(finiteT);

  let tLo: number;
  let tHi: number;
  if (useTime) {
    const ts = withAny.map((p) => p.t as number);
    tLo = Math.min(...ts);
    tHi = Math.max(...ts);
  } else {
    tLo = 0;
    tHi = Math.max(1, withAny.length - 1);
  }

  function xFor(p: Point, orderIndex: number): number {
    if (withAny.length === 1 || tHi === tLo) return padL + plotW / 2;
    const v = useTime && finiteT(p) ? (p.t as number) : orderIndex;
    return padL + ((v - tLo) / (tHi - tLo)) * plotW;
  }

  const jhSeries = withAny
    .filter((p) => p.jumpCm != null && Number.isFinite(p.jumpCm))
    .sort((a, b) => {
      const ka = useTime && finiteT(a) ? a.t! : withAny.indexOf(a);
      const kb = useTime && finiteT(b) ? b.t! : withAny.indexOf(b);
      return ka - kb;
    });

  const rsiSeries = withAny
    .filter((p) => p.rsi != null && Number.isFinite(p.rsi))
    .sort((a, b) => {
      const ka = useTime && finiteT(a) ? a.t! : withAny.indexOf(a);
      const kb = useTime && finiteT(b) ? b.t! : withAny.indexOf(b);
      return ka - kb;
    });

  const jhVals = jhSeries.map((p) => p.jumpCm!);
  const rsiVals = rsiSeries.map((p) => p.rsi!);
  const minJ = jhVals.length ? Math.min(...jhVals) : 0;
  const maxJ = jhVals.length ? Math.max(...jhVals) : 1;
  const minR = rsiVals.length ? Math.min(...rsiVals) : 0;
  const maxR = rsiVals.length ? Math.max(...rsiVals) : 1;
  const spanJ = maxJ - minJ || 1e-6;
  const spanR = maxR - minR || 1e-6;

  const ptsJ: string[] = [];
  const dotsJ: { x: number; y: number }[] = [];
  for (const p of jhSeries) {
    const x = xFor(p, withAny.indexOf(p));
    const y = padT + (1 - (p.jumpCm! - minJ) / spanJ) * plotH;
    dotsJ.push({ x, y });
    if (jhSeries.length >= 2) ptsJ.push(`${x},${y}`);
  }

  const ptsR: string[] = [];
  const dotsR: { x: number; y: number }[] = [];
  for (const p of rsiSeries) {
    const x = xFor(p, withAny.indexOf(p));
    const y = padT + (1 - (p.rsi! - minR) / spanR) * plotH;
    dotsR.push({ x, y });
    if (rsiSeries.length >= 2) ptsR.push(`${x},${y}`);
  }

  const gridLines = 4;

  return (
    <View style={pdfCardStyles.card} wrap={false}>
      <Text style={pdfCardStyles.title}>{title}</Text>
      <Text style={pdfCardStyles.caption}>{dateCaption}</Text>
      <Svg width={widthPt} height={heightPt}>
        <PdfChartDefs />

        {/* Horizontal dotted gridlines */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padT + (plotH / gridLines) * i;
          return (
            <Line
              key={`grid-${i}`}
              x1={padL}
              y1={y}
              x2={padL + plotW}
              y2={y}
              stroke={PDF_CHART.grid}
              strokeWidth={0.6}
              strokeDasharray="2 5"
            />
          );
        })}

        {/* Series lines */}
        {ptsJ.length >= 2 ? (
          <Polyline points={ptsJ.join(" ")} stroke={COL.jh} strokeWidth={1.4} fill="none" />
        ) : null}
        {ptsR.length >= 2 ? (
          <Polyline points={ptsR.join(" ")} stroke={COL.rsi} strokeWidth={1.4} fill="none" />
        ) : null}

        {/* Vertex / single-point markers */}
        {dotsJ.map((d, i) => (
          <Circle key={`jh-${i}`} cx={d.x} cy={d.y} r={DOT} fill={COL.jh} />
        ))}
        {dotsR.map((d, i) => (
          <Circle key={`rsi-${i}`} cx={d.x} cy={d.y} r={DOT} fill={COL.rsi} />
        ))}
      </Svg>

      {/* Legend with ranges */}
      <View style={pdfCardStyles.legendRow}>
        {jhVals.length ? (
          <View style={pdfCardStyles.legendItem}>
            <View
              style={[pdfCardStyles.legendSwatch, { backgroundColor: COL.jh }]}
            />
            <Text style={pdfCardStyles.legendText}>
              {`${leftAxisLabel}: ${minJ.toFixed(1)}–${maxJ.toFixed(1)}`}
            </Text>
          </View>
        ) : null}
        {rsiVals.length ? (
          <View style={pdfCardStyles.legendItem}>
            <View
              style={[pdfCardStyles.legendSwatch, { backgroundColor: COL.rsi }]}
            />
            <Text style={pdfCardStyles.legendText}>
              {`${rightAxisLabel}: ${minR.toFixed(3)}–${maxR.toFixed(3)}`}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
