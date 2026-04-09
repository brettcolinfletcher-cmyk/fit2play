"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type Props = {
  data: { date: string; jumpHeight: number | null }[];
};

export default function JumpHeightGraph({ data }: Props) {
  const cleaned = data.filter((d) => d.jumpHeight != null);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 className="text-sm font-semibold text-lime-300 mb-3">
        Jump height trend
      </h3>

      {cleaned.length === 0 ? (
        <p className="text-xs text-slate-500">No jump-height data available.</p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cleaned}>
              <CartesianGrid stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  fontSize: "11px",
                }}
              />
              <Line
                type="monotone"
                dataKey="jumpHeight"
                stroke="#a3e635"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}