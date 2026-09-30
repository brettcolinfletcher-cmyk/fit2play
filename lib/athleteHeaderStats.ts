// "Last tested / Sprint / Force plate / Strength / Sessions" strip shown in the
// athlete header. Shared so the athlete's dashboard and the practitioner's page
// always show the same dates.

import { formatDisplayDate } from "@/lib/dateDisplay";
import { isForcePlateType, isSprintLikeType } from "@/lib/athleteDashboardData";

export type HeaderStatSession = { testType: string | null; date: string | null };

export type HeaderStat = { label: string; value: string };

function latestDate(rows: HeaderStatSession[]): Date | null {
  let max = -Infinity;
  for (const r of rows) {
    if (!r.date) continue;
    const t = new Date(r.date).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return Number.isFinite(max) ? new Date(max) : null;
}

export function athleteHeaderStats(sessions: HeaderStatSession[]): HeaderStat[] {
  const fmt = (d: Date | null) => (d ? formatDisplayDate(d) : "—");
  return [
    { label: "Last tested", value: fmt(latestDate(sessions)) },
    { label: "Sprint", value: fmt(latestDate(sessions.filter((s) => isSprintLikeType(s.testType)))) },
    { label: "Force plate", value: fmt(latestDate(sessions.filter((s) => isForcePlateType(s.testType)))) },
    {
      label: "Strength",
      value: fmt(latestDate(sessions.filter((s) => s.testType === "force_plate_isometric"))),
    },
    { label: "Sessions", value: String(sessions.length) },
  ];
}
