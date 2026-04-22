import { Svg, Line, Polyline, Text, View } from "@react-pdf/renderer";

const COL = { jh: "#84cc16", rsi: "#38bdf8", axis: "#94a3b8" };

type Point = { xLabel: string; jumpCm: number | null; rsi: number | null };

type Props = {
  title: string;
  dateCaption: string;
  leftAxisLabel: string;
  rightAxisLabel: string;
  points: Point[];
  widthPt?: number;
  heightPt?: number;
};

export default function PdfLineChart({
  title,
  dateCaption,
  leftAxisLabel,
  rightAxisLabel,
  points,
  widthPt = 500,
  heightPt = 180,
}: Props) {
  const usable = points.filter((p) => p.jumpCm != null || p.rsi != null);
  if (usable.length < 2) return null;

  const padL = 44;
  const padR = 44;
  const padT = 28;
  const padB = 28;
  const plotW = widthPt - padL - padR;
  const plotH = heightPt - padT - padB;

  const jhVals = usable.map((p) => p.jumpCm).filter((v): v is number => v != null && Number.isFinite(v));
  const rsiVals = usable.map((p) => p.rsi).filter((v): v is number => v != null && Number.isFinite(v));
  const minJ = jhVals.length ? Math.min(...jhVals) : 0;
  const maxJ = jhVals.length ? Math.max(...jhVals) : 1;
  const minR = rsiVals.length ? Math.min(...rsiVals) : 0;
  const maxR = rsiVals.length ? Math.max(...rsiVals) : 1;
  const spanJ = maxJ - minJ || 1e-6;
  const spanR = maxR - minR || 1e-6;

  const n = usable.length;
  const step = n > 1 ? plotW / (n - 1) : plotW;

  const ptsJ: string[] = [];
  const ptsR: string[] = [];
  for (let i = 0; i < usable.length; i++) {
    const p = usable[i]!;
    const x = padL + i * step;
    if (p.jumpCm != null && Number.isFinite(p.jumpCm)) {
      const y = padT + (1 - (p.jumpCm - minJ) / spanJ) * plotH;
      ptsJ.push(`${x},${y}`);
    }
    if (p.rsi != null && Number.isFinite(p.rsi)) {
      const y = padT + (1 - (p.rsi - minR) / spanR) * plotH;
      ptsR.push(`${x},${y}`);
    }
  }

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
          x1={widthPt - padR}
          y1={padT}
          x2={widthPt - padR}
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
        {ptsJ.length >= 2 ? (
          <Polyline points={ptsJ.join(" ")} stroke={COL.jh} strokeWidth={1.2} fill="none" />
        ) : null}
        {ptsR.length >= 2 ? (
          <Polyline points={ptsR.join(" ")} stroke={COL.rsi} strokeWidth={1.2} fill="none" />
        ) : null}
      </Svg>
      <Text style={{ fontSize: 6, color: "#6b7280", marginTop: 2 }}>
        {leftAxisLabel}: {minJ.toFixed(1)} – {maxJ.toFixed(1)} (green) · {rightAxisLabel}: {minR.toFixed(3)} –{" "}
        {maxR.toFixed(3)} (blue)
      </Text>
    </View>
  );
}
