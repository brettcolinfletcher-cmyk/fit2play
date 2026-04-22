import { Svg, Line, Polyline, Text, View, Rect } from "@react-pdf/renderer";

const COL = { jh: "#84cc16", rsi: "#38bdf8", axis: "#94a3b8" };

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

const DOT = 3;

export default function PdfLineChart({
  title,
  dateCaption,
  leftAxisLabel,
  rightAxisLabel,
  points,
  widthPt = 500,
  heightPt = 180,
}: Props) {
  const withAny = points.filter(
    (p) =>
      (p.jumpCm != null && Number.isFinite(p.jumpCm)) ||
      (p.rsi != null && Number.isFinite(p.rsi))
  );
  if (withAny.length === 0) return null;

  const padL = 44;
  const padR = 44;
  const padT = 28;
  const padB = 28;
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
    if (jhSeries.length >= 2) ptsJ.push(`${x},${y}`);
    else dotsJ.push({ x, y });
  }

  const ptsR: string[] = [];
  const dotsR: { x: number; y: number }[] = [];
  for (const p of rsiSeries) {
    const x = xFor(p, withAny.indexOf(p));
    const y = padT + (1 - (p.rsi! - minR) / spanR) * plotH;
    if (rsiSeries.length >= 2) ptsR.push(`${x},${y}`);
    else dotsR.push({ x, y });
  }

  const legendParts: string[] = [];
  if (jhVals.length) {
    legendParts.push(`${leftAxisLabel}: ${minJ.toFixed(1)} – ${maxJ.toFixed(1)} (green)`);
  }
  if (rsiVals.length) {
    legendParts.push(`${rightAxisLabel}: ${minR.toFixed(3)} – ${maxR.toFixed(3)} (blue)`);
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
        {dotsJ.map((d, i) => (
          <Rect
            key={`jh-${i}`}
            x={d.x - DOT}
            y={d.y - DOT}
            width={DOT * 2}
            height={DOT * 2}
            fill={COL.jh}
          />
        ))}
        {dotsR.map((d, i) => (
          <Rect
            key={`rsi-${i}`}
            x={d.x - DOT}
            y={d.y - DOT}
            width={DOT * 2}
            height={DOT * 2}
            fill={COL.rsi}
          />
        ))}
      </Svg>
      <Text style={{ fontSize: 6, color: "#6b7280", marginTop: 2 }}>{legendParts.join(" · ")}</Text>
    </View>
  );
}
