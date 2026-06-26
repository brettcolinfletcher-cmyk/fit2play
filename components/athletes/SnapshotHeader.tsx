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
  type AthleteSnapshot,
} from "@/lib/athleteSnapshot";
import type {
  ReportHopTestRow,
  ReportMetricRow,
  ReportSessionRow,
} from "@/lib/athleteReportData";
import type { CriteriaResolver, ReportVisibility } from "@/lib/reportSections";
import AthleteAvatar from "@/components/AthleteAvatar";

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

function initials(athlete: AthleteIdentity | null): string {
  if (!athlete) return "?";
  const first = (athlete.first_name ?? "").trim().charAt(0);
  const last = (athlete.last_name ?? "").trim().charAt(0);
  const combined = `${first}${last}`.toUpperCase();
  return combined || "?";
}

function displayName(athlete: AthleteIdentity | null): string {
  if (!athlete) return "Athlete";
  const name = `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim();
  return name || "Athlete";
}

function statusPillClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "monitoring") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  if (s === "archived") {
    return "border-slate-600 bg-slate-800 text-slate-400";
  }
  return "border-lime-500/40 bg-lime-500/10 text-lime-300";
}

function GaugeRing({ gauge }: { gauge: AthleteSnapshot["gauges"][number] }) {
  const radius = 26;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const arc = (Math.min(Math.max(gauge.lsi, 0), 100) / 100) * circumference;
  const ringColor =
    gauge.lsi >= gauge.pass
      ? "#a3e635"
      : gauge.lsi >= gauge.warn
        ? "#fbbf24"
        : "#f87171";

  return (
    <div
      className={`flex flex-col items-center gap-2 ${gauge.isCriterion ? "" : "opacity-50"}`}
    >
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text
          x="36"
          y="40"
          textAnchor="middle"
          className="fill-slate-100 text-sm font-semibold"
          fontSize="14"
        >
          {Math.round(gauge.lsi)}
        </text>
      </svg>
      <span className={`text-center text-[11px] leading-tight ${gauge.colorClass}`}>
        {gauge.label}
      </span>
      {!gauge.isCriterion ? (
        <span className="text-[9px] text-slate-500">not scored</span>
      ) : null}
    </div>
  );
}

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

  const metaParts = [
    athlete?.primary_sport,
    athlete?.team,
    athlete?.status,
    athlete?.height_cm != null ? `${athlete.height_cm} cm` : null,
    athlete?.weight_kg != null ? `${athlete.weight_kg} kg` : null,
    athlete?.dominant_leg || athlete?.dominant_hand
      ? `dom ${athlete.dominant_leg ?? "—"}/${athlete.dominant_hand ?? "—"}`
      : null,
    snapshot.lastTested ? `last tested ${snapshot.lastTested}` : null,
  ].filter(Boolean);

  return (
    <section id="snapshot" className="scroll-mt-28 mt-6 space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <AthleteAvatar
            url={athlete?.profile_image_url}
            firstName={athlete?.first_name}
            lastName={athlete?.last_name}
            size={56}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-50">{displayName(athlete)}</h2>
              {athlete?.status ? (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusPillClass(athlete.status)}`}
                >
                  {athlete.status}
                </span>
              ) : null}
            </div>
            {metaParts.length > 0 ? (
              <p className="mt-1 text-sm text-slate-500">{metaParts.join(" · ")}</p>
            ) : null}
            {athlete?.notes?.trim() ? (
              <p className="mt-2 text-sm text-slate-300">{athlete.notes.trim()}</p>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-400">
          {snapshot.readiness.total === 0 ? (
            snapshot.readiness.line
          ) : (
            <>
              Cleared on{" "}
              <span className="font-semibold text-lime-300">{snapshot.readiness.pass}</span> of{" "}
              <span className="font-semibold text-slate-200">{snapshot.readiness.total}</span>{" "}
              exit criteria.
            </>
          )}
        </p>
      </div>

      {snapshot.gauges.length > 0 ? (
        <div
          className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
        >
          {snapshot.gauges.map((gauge) => (
            <GaugeRing key={gauge.key} gauge={gauge} />
          ))}
        </div>
      ) : null}

      {snapshot.hero ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="text-sm font-semibold text-slate-200">
            {snapshot.hero.title}
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({snapshot.hero.unit})
            </span>
          </h3>
          <div className="mt-3 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshot.hero.points}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} width={42} />
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
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">{tile.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-100">{tile.value}</p>
              <p className={`mt-1 text-xs ${tile.deltaColorClass}`}>{tile.delta}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
