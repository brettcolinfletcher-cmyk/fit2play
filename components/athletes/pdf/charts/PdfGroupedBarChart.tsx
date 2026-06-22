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

type Group = {
  label: string;
  left: number;
  right: number;
  /** e.g. "LSI 92%" */
  annotation?: string | null;
};

type Props = {
  title: string;
  dateCaption: string;
  unit: string;
  groups: Group[];
  widthPt?: number;
  heightPt?: number;
};

export default function PdfGroupedBarChart({
  title,
  dateCaption,
  unit,
  groups,
  widthPt = 480,
  heightPt = 196,
}: Props) {
  if (groups.length === 0) return null;

  const padL = 38;
  const padR = 14;
  const padT = 16; // headroom for value labels / annotations
  const padB = 40; // group labels
  const plotW = widthPt - padL - padR;
  const plotH = heightPt - padT - padB;
  const n = groups.length;
  const clusterW = plotW / n;
  const barW = Math.min(clusterW * 0.3, 18);
  const maxV = Math.max(
    1e-6,
    ...groups.flatMap((g) => [Math.abs(g.left), Math.abs(g.right)])
  );
  const ceil = niceCeil(maxV);
  const base = padT + plotH;
  const ticks = 4;

  return (
    <View style={pdfCardStyles.card} wrap={false}>
      <Text style={pdfCardStyles.title}>{title}</Text>
      <Text style={pdfCardStyles.caption}>{dateCaption}</Text>
      <Svg width={widthPt} height={heightPt}>
        <PdfChartDefs />

        {/* Horizontal dotted gridlines + left axis tick labels */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (ceil / ticks) * i;
          const y = base - (v / ceil) * plotH;
          return (
            <Fragment key={`grid-${i}`}>
              <Line
                x1={padL}
                y1={y}
                x2={padL + plotW}
                y2={y}
                stroke={PDF_CHART.grid}
                strokeWidth={0.6}
                strokeDasharray="2 5"
              />
              <SvgText
                x={padL - 5}
                y={y + 2.5}
                fill={PDF_CHART.axisLabel}
                textAnchor="end"
                style={{ fontSize: 6.5, fontFamily: PDF_FONT }}
              >
                {fmtTick(v)}
              </SvgText>
            </Fragment>
          );
        })}

        {groups.map((g, i) => {
          const cx = padL + i * clusterW + clusterW / 2;
          const hL = (Math.abs(g.left) / ceil) * plotH;
          const hR = (Math.abs(g.right) / ceil) * plotH;
          const xL = cx - barW - 2;
          const xR = cx + 2;
          return (
            <Fragment key={g.label}>
              {/* Left = blue */}
              <Rect
                x={xL}
                y={base - hL}
                width={barW}
                height={hL}
                rx={1.5}
                fill={`url(#${GRAD.left})`}
              />
              {/* Right = lime */}
              <Rect
                x={xR}
                y={base - hR}
                width={barW}
                height={hR}
                rx={1.5}
                fill={`url(#${GRAD.right})`}
              />
              {/* Value labels above each bar */}
              <SvgText
                x={xL + barW / 2}
                y={base - hL - 3}
                fill={PDF_CHART.limbLeft}
                textAnchor="middle"
                style={{ fontSize: 6.5, fontFamily: PDF_FONT }}
              >
                {fmtTick(g.left)}
              </SvgText>
              <SvgText
                x={xR + barW / 2}
                y={base - hR - 3}
                fill={PDF_CHART.limbRight}
                textAnchor="middle"
                style={{ fontSize: 6.5, fontFamily: PDF_FONT }}
              >
                {fmtTick(g.right)}
              </SvgText>
              {/* Group label below baseline */}
              <SvgText
                x={cx}
                y={base + 12}
                fill={PDF_CHART.title}
                textAnchor="middle"
                style={{ fontSize: 7, fontFamily: PDF_FONT }}
              >
                {g.label}
              </SvgText>
              {/* LSI / annotation under the group label */}
              {g.annotation ? (
                <SvgText
                  x={cx}
                  y={base + 22}
                  fill={PDF_CHART.axisLabel}
                  textAnchor="middle"
                  style={{ fontSize: 6.5, fontFamily: PDF_FONT }}
                >
                  {g.annotation}
                </SvgText>
              ) : null}
            </Fragment>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={pdfCardStyles.legendRow}>
        <View style={pdfCardStyles.legendItem}>
          <View
            style={[pdfCardStyles.legendSwatch, { backgroundColor: PDF_CHART.limbLeft }]}
          />
          <Text style={pdfCardStyles.legendText}>Left</Text>
        </View>
        <View style={pdfCardStyles.legendItem}>
          <View
            style={[pdfCardStyles.legendSwatch, { backgroundColor: PDF_CHART.limbRight }]}
          />
          <Text style={pdfCardStyles.legendText}>Right</Text>
        </View>
        <Text style={[pdfCardStyles.legendText, { marginLeft: "auto" }]}>
          {unit}
        </Text>
      </View>
    </View>
  );
}
