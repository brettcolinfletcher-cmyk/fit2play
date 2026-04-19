"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SectionComment from "./SectionComment";

export type HopTestTableRow = {
  sessionDate: string;
  dateLabel: string;
  leftCm: number | null;
  rightCm: number | null;
  lsi: number | null;
};

export type HopTestTypeBlock = {
  testType: string;
  displayName: string;
  rows: HopTestTableRow[];
  trendPoints: { label: string; t: number; lsi: number }[];
};

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(30 41 59)",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

function lsiTextClass(lsi: number | null): string {
  if (lsi == null) return "text-slate-500";
  if (lsi >= 90) return "text-lime-400";
  if (lsi >= 80) return "text-amber-400";
  return "text-rose-400";
}

type Props = {
  athleteId: string;
  blocks: HopTestTypeBlock[];
  sectionComment: string | null;
};

export default function HopTestsSection({
  athleteId,
  blocks,
  sectionComment,
}: Props) {
  if (blocks.length === 0) return null;

  return (
    <section id="hop_tests" className="scroll-mt-28 mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
        Hop tests
      </h2>
      <div className="mt-6 space-y-10">
        {blocks.map((block) => (
          <div key={block.testType}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {block.displayName}
            </h3>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[320px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Left (cm)</th>
                    <th className="px-3 py-2 font-medium">Right (cm)</th>
                    <th className="px-3 py-2 font-medium">LSI%</th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((r) => (
                    <tr
                      key={r.sessionDate}
                      className="border-b border-slate-800/80 last:border-0"
                    >
                      <td className="px-3 py-2 text-slate-300">{r.dateLabel}</td>
                      <td className="px-3 py-2 font-mono text-slate-200">
                        {r.leftCm != null ? r.leftCm.toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-200">
                        {r.rightCm != null ? r.rightCm.toFixed(1) : "—"}
                      </td>
                      <td className={`px-3 py-2 font-mono font-medium ${lsiTextClass(r.lsi)}`}>
                        {r.lsi != null ? `${r.lsi.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h4 className="mb-3 text-xs font-medium text-slate-400">LSI% over time</h4>
              {block.trendPoints.length < 1 ? (
                <p className="py-8 text-center text-xs text-slate-500">Not enough data</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={block.trendPoints}>
                      <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={AXIS_TICK}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[0, 100]}
                        stroke="#64748b"
                        tick={AXIS_TICK}
                        tickFormatter={(v) => `${v}%`}
                        label={{
                          value: "LSI%",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#94a3b8",
                          fontSize: 11,
                        }}
                      />
                      <ReferenceLine
                        y={90}
                        stroke="#64748b"
                        strokeDasharray="4 4"
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(label) => String(label)}
                        formatter={(v: number | string) => [
                          typeof v === "number" ? `${v.toFixed(1)}%` : String(v),
                          "LSI",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="lsi"
                        stroke="#84cc16"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <SectionComment
        athleteId={athleteId}
        section="hop_tests"
        initialComment={sectionComment}
      />
    </section>
  );
}
