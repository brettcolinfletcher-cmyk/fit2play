"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DIALS, TEST_BY_KEY, type DialDef, type DialMetric } from "@/lib/testCatalogue";
import { protocolIncludes, resolveAthleteProtocol, type ResolvedProtocol } from "@/lib/protocols";

type RankRow = {
  metric: DialMetric | "adductor";
  val: number | string | null;
  rnk: number | null;
  cohort_size: number | null;
  team_id: string | null;
  team_name: string | null;
};

// Red (developing) -> dark green (elite), matching the report mock-up.
const SEGMENTS = ["#dc2626", "#f97316", "#facc15", "#84cc16", "#15803d"];

const CX = 60;
const CY = 62;

function point(f: number, r: number): [number, number] {
  const a = Math.PI * (1 - f);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function SpeedDial({ def, row }: { def: DialDef; row: RankRow | undefined }) {
  const value = row?.val != null ? Number(row.val) : null;
  const rank = row?.rnk ?? null;
  const n = row?.cohort_size ?? null;
  const hasRank = value != null && rank != null && n != null;

  // 1st = hard right, last = hard left. A cohort of one sits in the middle.
  const f = hasRank ? (n! > 1 ? (n! - rank!) / (n! - 1) : 0.5) : null;
  const [nx, ny] = f != null ? point(f, 36) : [CX, CY];

  const seg = 1 / SEGMENTS.length;
  const valueText = value != null ? value.toFixed(def.decimals) : "–";
  // Pill width scales with the text so short and long values both sit centred.
  const pillW = Math.max(30, (valueText.length + def.unit.length) * 5.2 + 14);

  return (
    <div className="rounded-xl bg-white p-3 text-center shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <svg viewBox="0 0 120 96" className="w-full" role="img" aria-label={`${def.label} dial`}>
        {SEGMENTS.map((c, i) => {
          const [x1, y1] = point(i * seg, 46);
          const [x2, y2] = point((i + 1) * seg, 46);
          return (
            <path
              key={c}
              d={`M${x1} ${y1} A46 46 0 0 1 ${x2} ${y2}`}
              stroke={c}
              strokeWidth={10}
              fill="none"
              opacity={hasRank ? 1 : 0.25}
            />
          );
        })}
        {f != null ? (
          <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#1e293b" strokeWidth={3} strokeLinecap="round" />
        ) : null}
        <circle cx={CX} cy={CY} r={5} fill="#1e293b" opacity={hasRank ? 1 : 0.25} />
        <rect x={CX - pillW / 2} y={CY + 7} width={pillW} height={15} rx={7.5} fill="#1e293b" />
        <text x={CX} y={CY + 18} textAnchor="middle" fill="#ffffff">
          <tspan fontSize={9.5} fontWeight={700}>
            {valueText}
          </tspan>
          <tspan fontSize={6.5} dx={1.5}>
            {def.unit}
          </tspan>
        </text>
        <text x={6} y={CY + 30} fontSize={7} fontWeight={600} fill={SEGMENTS[0]}>
          Developing
        </text>
        <text x={114} y={CY + 30} fontSize={7} fontWeight={600} textAnchor="end" fill={SEGMENTS[SEGMENTS.length - 1]}>
          Elite
        </text>
      </svg>
      <div className="mt-1 text-sm font-medium text-slate-700">{def.label}</div>
      <div className="text-xs text-slate-400">
        {hasRank ? `${ordinal(rank!)} of ${n}` : value != null ? "Not ranked" : "Not tested"}
      </div>
    </div>
  );
}

export default function TeamRankDials({ athleteId }: { athleteId: string }) {
  const [protocol, setProtocol] = useState<ResolvedProtocol | null>(null);
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [p, r] = await Promise.all([
          resolveAthleteProtocol(supabase, athleteId),
          supabase.rpc("athlete_cohort_ranks", { p_athlete_id: athleteId }),
        ]);
        if (cancelled) return;
        if (r.error) throw new Error(r.error.message);
        setProtocol(p);
        setRows((r.data ?? []) as RankRow[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  if (loading) return <p className="text-xs text-slate-400">Loading rankings…</p>;
  if (error) return <p className="text-xs text-rose-500">Rankings unavailable: {error}</p>;
  if (!protocol) return null;

  const teamName = rows[0]?.team_name ?? protocol.teamName;
  const dials = DIALS.filter((d) => protocolIncludes(protocol, d.testKey));
  const showAdductor = protocolIncludes(protocol, "adductor_squeeze");
  const adductor = rows.find((r) => r.metric === "adductor");
  const byMetric = new Map<RankRow["metric"], RankRow>(rows.map((r) => [r.metric, r] as const));

  return (
    <section className="rounded-2xl bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Team ranking</h2>
        {protocol.protocolName ? (
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
            {protocol.protocolName}
            {protocol.modified ? " (modified)" : ""}
          </span>
        ) : null}
        {protocol.modified ? (
          <span className="text-xs text-amber-700">
            {[
              ...protocol.added.map((k) => `+ ${TEST_BY_KEY[k]?.label ?? k}`),
              ...protocol.removed.map((k) => `− ${TEST_BY_KEY[k]?.label ?? k}`),
            ].join(", ")}
          </span>
        ) : null}
      </div>

      {!teamName ? (
        <p className="mb-3 text-xs text-slate-500">
          Not in a team yet, so results aren&apos;t ranked. Add this athlete to a team to see where they sit.
        </p>
      ) : (
        <p className="mb-3 text-xs text-slate-500">Ranked against {teamName}.</p>
      )}
      {dials.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {dials.map((d) => (
            <SpeedDial key={d.metric} def={d} row={byMetric.get(d.metric)} />
          ))}
        </div>
      ) : null}

      {showAdductor ? (
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <span className="text-sm text-slate-600">Adductor squeeze (60° hip flexion)</span>
          <span className="text-lg font-semibold text-slate-900">
            {adductor?.val != null ? Math.round(Number(adductor.val)) : "–"}{" "}
            <span className="text-xs font-normal text-slate-500">N</span>
          </span>
        </div>
      ) : null}
    </section>
  );
}
