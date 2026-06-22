import { Fragment } from "react";
import { Svg, Rect, Line, Text as SvgText, Text, View } from "@react-pdf/renderer";
import {
  PDF_CHART,
  PDF_FONT,
  GRAD,
  PdfChartDefs,
  niceCeil,
  fmtTick,
  pdfCardStyles,
} from "./pdfChartTheme";

type Props = {
  title: string;
  dateCaption: string;
  unit: string;
  /** Horizontal bars: one row per item, value plotted along X */
  items: { label: string; value: number }[];
  widthPt?: number;
  heightPt?: number;
};

export default function PdfBarChart({
  title,
  dateCaption,
  unit,
  items,
  widthPt = 480,
  heightPt = 190,
}: Props) {
  if (items.length === 0) return null;

  const padL = 96; // category labels
  const padR = 46; // value labels at bar end
  const padT = 10;
  const padB = 24; // axis tick labels
  const plotW = widthPt - padL - padR;
  const plotH = heightPt - padT - padB;
  const maxV = Math.max(...items.map((i) => i.value), 1e-6);
  const ceil = niceCeil(maxV);
  const rowH = plotH / Math.max(items.length, 1);
  const barH = Math.min(rowH * 0.5, 16);
  const ticks = 4;

  return (
    <View style={pdfCardStyles.card} wrap={false}>
      <Text style={pdfCardStyles.title}>{title}</Text>
      <Text style={pdfCardStyles.caption}>{dateCaption}</Text>
      <Svg width={widthPt} height={heightPt}>
        <PdfChartDefs />

        {/* Vertical dotted gridlines + bottom tick labels */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (ceil / ticks) * i;
          const x = padL + (v / ceil) * plotW;
          return (
            <Fragment key={`grid-${i}`}>
              <Line
                x1={x}
                y1={padT}
                x2={x}
                y2={padT + plotH}
                stroke={PDF_CHART.grid}
                strokeWidth={0.6}
                strokeDasharray="2 5"
              />
              <SvgText
                x={x}
                y={padT + plotH + 12}
                fill={PDF_CHART.axisLabel}
                textAnchor="middle"
                style={{ fontSize: 6.5, fontFamily: PDF_FONT }}
              >
                {fmtTick(v)}
              </SvgText>
            </Fragment>
          );
        })}

        {/* Baseline */}
        <Line
          x1={padL}
          y1={padT + plotH}
          x2={padL + plotW}
          y2={padT + plotH}
          stroke={PDF_CHART.grid}
          strokeWidth={0.75}
        />

        {/* Bars + labels */}
        {items.map((it, idx) => {
          const yMid = padT + idx * rowH + rowH / 2;
          const y0 = yMid - barH / 2;
          const w = Math.max((it.value / ceil) * plotW, 0.5);
          return (
            <Fragment key={it.label}>
              <Rect
                x={padL}
                y={y0}
                width={w}
                height={barH}
                rx={2}
                fill={`url(#${GRAD.singleH})`}
              />
              <SvgText
                x={padL - 6}
                y={yMid + 2.5}
                fill={PDF_CHART.title}
                textAnchor="end"
                style={{ fontSize: 7.5, fontFamily: PDF_FONT }}
              >
                {it.label}
              </SvgText>
              <SvgText
                x={padL + w + 5}
                y={yMid + 2.5}
                fill={PDF_CHART.axisLabel}
                style={{ fontSize: 7.5, fontFamily: PDF_FONT }}
              >
                {it.value.toFixed(2)}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>
      <Text style={{ fontSize: 6.5, color: PDF_CHART.caption, marginTop: 4 }}>
        Values in {unit} · axis 0–{fmtTick(ceil)}
      </Text>
    </View>
  );
}
