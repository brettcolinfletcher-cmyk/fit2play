"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  computeAthleteSnapshot,
} from "@/lib/athleteSnapshot";
import type {
  ReportHopTestRow,
  ReportMetricRow,
  ReportSessionRow,
} from "@/lib/athleteReportData";
import type { CriteriaResolver, ReportVisibility } from "@/lib/reportSections";
import RtpScorePanel from "@/components/athletes/RtpScorePanel";
import AthleteIdentityCard from "@/components/athletes/AthleteIdentityCard";

type AthleteIdentity = {
  first_name: string | null;
  last_name: string | null;
  primary_sport?: string | null;
  team?: string | null;
  status?: string | null;
  notes?: string | null;
  dominant_leg?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  dominant_hand?: string | null;
  profile_image_url?: string | null;
};

type Props = {
  athlete: AthleteIdentity | null;
  sessions: ReportSessionRow[];
  metricsBySession: Map<string, ReportMetricRow[]>;
  hopTests: ReportHopTestRow[];
  visibility: ReportVisibility;
  criteria: CriteriaResolver;
};

const AXIS_TICK = { fill: "#64748b", fontSize: 10 };
const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "0.375rem",
  fontSize: "11px",
};

export default function SnapshotHeader({
  athlete,
  sessions,
  metricsBySession,
  hopTests,
  visibility,
  criteria,
}: Props) {
  const snapshot = useMemo(
    () =>
      computeAthleteSnapshot(
        sessions,
        metricsBySession,
        hopTests,
        visibility,
        criteria
      ),
    [sessions, metricsBySession, hopTests, visibility, criteria]
  );

  if (sessions.length === 0) return null;

  return (
    <section id="snapshot" className="scroll-mt-28 mt-6 space-y-4">
      <AthleteIdentityCard
        athlete={athlete}
        lastTested={snapshot.lastTested}
        footer={
          snapshot.readiness.total === 0 ? (
            snapshot.readiness.line
          ) : (
            <>
              Cleared on{" "}
              <span className="font-semibold text-lime-600">{snapshot.readiness.pass}</span> of{" "}
              <span className="font-semibold text-slate-700">{snapshot.readiness.total}</span>{" "}
              exit criteria.
            </>
          )
        }
      />

      {snapshot.gauges.length > 0 || snapshot.readiness.total > 0 ? (
        <RtpScorePanel gauges={snapshot.gauges} readiness={snapshot.readiness} />
      ) : null}

      {snapshot.hero ? (
        <div className="rounded-2xl border bg-slate-950/70 p-5 f2p-dark-panel">
          <h3 className="text-sm font-semibold text-slate-200">
            {snapshot.hero.title}
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({snapshot.hero.unit})
            </span>
          </h3>
          <div className="mt-3 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshot.hero.points}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="2 6" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={42} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#a3e635" }}
                />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="#a3e635"
                  strokeWidth={2}
                  dot={{ fill: "#a3e635", r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {snapshot.tiles.length > 0 ? (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
        >
          {snapshot.tiles.map((tile) => (
            <div
              key={tile.key}
              className="rounded-2xl border bg-slate-950/70 p-4 f2p-dark-tile"
            >
              <p className="text-xs uppercase tracking-wide text-slate-400">{tile.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-100">{tile.value}</p>
              <p className={`mt-1 text-xs ${tile.deltaColorClass}`}>{tile.delta}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
