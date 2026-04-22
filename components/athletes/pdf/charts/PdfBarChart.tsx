import { Svg, Rect, Line, Text, View } from "@react-pdf/renderer";

const COLORS = {
  bar: "#84cc16",
  axis: "#94a3b8",
  label: "#374151",
};

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
  widthPt = 500,
  heightPt = 180,
}: Props) {
  if (items.length === 0) return null;

  const paddingL = 52;
  const paddingR = 36;
  const paddingT = 28;
  const paddingB = 22;
  const plotW = widthPt - paddingL - paddingR;
  const plotH = heightPt - paddingT - paddingB;
  const maxV = Math.max(...items.map((i) => i.value), 1e-6);
  const rowH = plotH / Math.max(items.length, 1);
  const barH = Math.min(rowH * 0.55, 14);

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 9, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{title}</Text>
      <Text style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>{dateCaption}</Text>
      <Svg width={widthPt} height={heightPt}>
        <Line
          x1={paddingL}
          y1={paddingT}
          x2={paddingL}
          y2={heightPt - paddingB}
          stroke={COLORS.axis}
          strokeWidth={0.5}
        />
        <Line
          x1={paddingL}
          y1={heightPt - paddingB}
          x2={widthPt - paddingR}
          y2={heightPt - paddingB}
          stroke={COLORS.axis}
          strokeWidth={0.5}
        />
        {items.map((it, idx) => {
          const yMid = paddingT + idx * rowH + rowH / 2;
          const y0 = yMid - barH / 2;
          const w = (it.value / maxV) * plotW;
          return (
            <Rect
              key={it.label}
              x={paddingL}
              y={y0}
              width={w}
              height={barH}
              fill={COLORS.bar}
            />
          );
        })}
      </Svg>
      <Text style={{ fontSize: 6, color: "#6b7280", marginTop: 2 }}>
        Axis: 0 – {maxV.toFixed(2)} {unit}
      </Text>
      <View style={{ flexDirection: "column", marginTop: 4 }}>
        {items.map((it) => (
          <Text key={it.label} style={{ fontSize: 7, color: "#374151" }}>
            {it.label}: {it.value.toFixed(2)} {unit}
          </Text>
        ))}
      </View>
    </View>
  );
}
