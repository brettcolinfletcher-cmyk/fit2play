import { Fragment } from "react";
import { Svg, Rect, Line, Text, View } from "@react-pdf/renderer";

const COL = { left: "#84cc16", right: "#38bdf8", axis: "#94a3b8" };

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
  widthPt = 500,
  heightPt = 180,
}: Props) {
  if (groups.length === 0) return null;

  const padL = 40;
  const padR = 16;
  const padT = 28;
  const padB = 36;
  const plotW = widthPt - padL - padR;
  const plotH = heightPt - padT - padB;
  const n = groups.length;
  const clusterW = plotW / n;
  const barW = clusterW * 0.28;
  const maxV = Math.max(
    1e-6,
    ...groups.flatMap((g) => [Math.abs(g.left), Math.abs(g.right)])
  );

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 9, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{title}</Text>
      <Text style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>{dateCaption}</Text>
      <Svg width={widthPt} height={heightPt}>
        <Line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={heightPt - padB}
          stroke={COL.axis}
          strokeWidth={0.5}
        />
        <Line
          x1={padL}
          y1={heightPt - padB}
          x2={widthPt - padR}
          y2={heightPt - padB}
          stroke={COL.axis}
          strokeWidth={0.5}
        />
        {groups.map((g, i) => {
          const cx = padL + i * clusterW + clusterW / 2;
          const hL = (g.left / maxV) * plotH;
          const hR = (g.right / maxV) * plotH;
          const base = heightPt - padB;
          return (
            <Fragment key={g.label}>
              <Rect
                x={cx - barW - 2}
                y={base - hL}
                width={barW}
                height={hL}
                fill={COL.left}
              />
              <Rect
                x={cx + 2}
                y={base - hR}
                width={barW}
                height={hR}
                fill={COL.right}
              />
            </Fragment>
          );
        })}
      </Svg>
      <Text style={{ fontSize: 6, color: "#6b7280", marginTop: 2 }}>
        Axis: 0 – {maxV.toFixed(1)} {unit} · Green = left, Blue = right
      </Text>
      <View style={{ marginTop: 4 }}>
        {groups.map((g) => (
          <Text key={g.label} style={{ fontSize: 7, color: "#374151", marginBottom: 2 }}>
            {g.label}: L {g.left.toFixed(1)} / R {g.right.toFixed(1)} {unit}
            {g.annotation ? ` · ${g.annotation}` : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}
