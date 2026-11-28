"use client";

import Link from "next/link";
import { useState } from "react";
import type { AthleteStatus } from "@/lib/gpsTeam";
import { MV_HIGH, MV_STALE_DAYS, SPIKE_FLAG } from "@/lib/gpsTeam";
import { acwrChip, Card, n0, pct, shortDate } from "./ui";

type Row = AthleteStatus & { name: string };
type SortKey = "name" | "last" | "sessions" | "distance" | "hsr" | "sprint" | "acute" | "chronic" | "acwr" | "spike" | "pctMv" | "days90";

const COLS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "name", label: "Player" },
  { key: "last", label: "Last session" },
  { key: "sessions", label: "Sessions", right: true },
  { key: "distance", label: "Distance", right: true },
  { key: "hsr", label: "HSR", right: true },
  { key: "sprint", label: "Sprint", right: true },
  { key: "acute", label: "Acute", right: true },
  { key: "chronic", label: "Chronic", right: true },
  { key: "acwr", label: "ACWR", right: true },
  { key: "spike", label: "Load spike", right: true },
  { key: "pctMv", label: "Last % MV", right: true },
  { key: "days90", label: `Days since ${MV_HIGH}% MV`, right: true },
];

function sortVal(r: Row, k: SortKey): number | string | null {
  switch (k) {
    case "name": return r.name;
    case "last": return r.lastSession?.date ?? null;
    case "sessions": return r.sessionsInRange;
    case "distance": return r.distanceInRange;
    case "hsr": return r.hsrInRange;
    case "sprint": return r.sprintInRange;
    case "acute": return r.last?.acute ?? null;
    case "chronic": return r.last?.chronic ?? null;
    case "acwr": return r.last?.acwr ?? null;
    case "spike": return r.last?.diffPct ?? null;
    case "pctMv": return r.lastPctMv;
    case "days90": return r.daysSince90;
  }
}

export default function SquadTable({ rows, loadLabel, asOf }: { rows: Row[]; loadLabel: string; asOf: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "acwr", dir: -1 });
  const sorted = [...rows].sort((a, b) => {
    const va = sortVal(a, sort.key);
    const vb = sortVal(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
  });

  return (
    <Card
      id="squad"
      title="Squad status"
      subtitle={`Totals for the date range. Acute, chronic, ACWR and load spike as of ${shortDate(asOf)}, on ${loadLabel}. Click a column to sort.`}
    >
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[0.68rem] uppercase tracking-wide text-slate-400">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : c.key === "name" ? 1 : -1 }))}
                  className={`cursor-pointer select-none py-2 font-medium hover:text-slate-600 ${c.right ? "text-right" : "text-left"}`}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const spike = r.last?.diffPct ?? null;
              return (
                <tr key={r.athleteId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 font-medium text-slate-800">
                    <Link href={`/dashboard/athletes/${r.athleteId}#gps`} className="hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 text-slate-500">
                    {r.lastSession ? (
                      <span title={r.lastSession.name}>
                        {shortDate(r.lastSession.date)} · <span className="inline-block max-w-[140px] truncate align-bottom">{r.lastSession.name}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.sessionsInRange}</td>
                  <td className="py-2 text-right tabular-nums">{n0(r.distanceInRange)}</td>
                  <td className="py-2 text-right tabular-nums">{n0(r.hsrInRange)}</td>
                  <td className="py-2 text-right tabular-nums">{n0(r.sprintInRange)}</td>
                  <td className="py-2 text-right tabular-nums">{n0(r.last?.acute)}</td>
                  <td className="py-2 text-right tabular-nums">{n0(r.last?.chronic)}</td>
                  <td className="py-2 text-right">
                    <span className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${acwrChip(r.last?.acwr)}`}>
                      {r.last?.acwr != null ? r.last.acwr.toFixed(2) : r.last?.building ? "building" : "—"}
                    </span>
                  </td>
                  <td
                    className={`py-2 text-right font-semibold tabular-nums ${
                      spike != null && spike >= SPIKE_FLAG ? "text-rose-600" : spike != null && spike <= -SPIKE_FLAG ? "text-sky-600" : "text-slate-700"
                    }`}
                  >
                    {pct(spike)}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${r.lastPctMv != null && r.lastPctMv >= MV_HIGH ? "font-semibold text-lime-700" : ""}`}>
                    {r.lastPctMv != null ? `${Math.round(r.lastPctMv)}%` : "—"}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      r.daysSince90 != null && r.daysSince90 > MV_STALE_DAYS ? "font-semibold text-rose-600" : r.daysSince90 != null && r.daysSince90 > 7 ? "text-amber-600" : ""
                    }`}
                  >
                    {r.daysSince90 ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
