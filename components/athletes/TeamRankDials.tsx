"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DIALS, TEST_BY_KEY, type DialDef, type DialMetric } from "@/lib/testCatalogue";
import { protocolIncludes, resolveAthleteProtocol, type ResolvedProtocol } from "@/lib/protocols";
import { LEVELS } from "@/lib/athleteLevels";

/**
 * Who an athlete is compared to. Stored on athletes.comparison (per athlete)
 * or teams.comparison (team default). All filters stack.
 *  base:  "team" = their own team, "teams" = the picked team_ids, "all" = everyone active
 *  sex:   "any" | "same" (as this athlete) | "female" | "male"
 *  sport: "any" | "same" (as this athlete) | "pick" (the listed sports)
 *  age:   "any" | "near" (within age_range yrs of this athlete) | "range" (aged age_min to age_max)
 *  level: "any" | "same" (as this athlete) | "pick" (the listed levels)
 */
export type ComparisonSpec = {
  base: "team" | "teams" | "all";
  team_ids: string[];
  sex: "any" | "same" | "female" | "male";
  sport: "any" | "same" | "pick";
  sports: string[];
  age: "any" | "near" | "range";
  age_range: number | null;
  age_min: number | null;
  age_max: number | null;
  level: "any" | "same" | "pick";
  levels: string[];
};

type RankRow = {
  metric: DialMetric | "adductor" | "_meta";
  val: number | string | null;
  rnk: number | null;
  cohort_size: number | null;
  cohort_label: string | null;
  own_team_id: string | null;
  own_team_name: string | null;
  spec: Partial<ComparisonSpec> | null;
  spec_source: "preview" | "athlete" | "team" | "default" | null;
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

function normSpec(s: Partial<ComparisonSpec> | null | undefined): ComparisonSpec {
  return {
    base: s?.base === "all" || s?.base === "teams" ? s.base : "team",
    team_ids: Array.isArray(s?.team_ids) ? (s?.team_ids as string[]) : [],
    sex: s?.sex === "same" || s?.sex === "female" || s?.sex === "male" ? s.sex : "any",
    sport: s?.sport === "same" || s?.sport === "pick" ? s.sport : "any",
    sports: Array.isArray(s?.sports) ? (s?.sports as string[]) : [],
    age: s?.age === "near" || s?.age === "range" ? s.age : "any",
    age_range: s?.age_range != null ? Number(s.age_range) : null,
    age_min: s?.age_min != null ? Number(s.age_min) : null,
    age_max: s?.age_max != null ? Number(s.age_max) : null,
    level: s?.level === "same" || s?.level === "pick" ? s.level : "any",
    levels: Array.isArray(s?.levels) ? (s?.levels as string[]) : [],
  };
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

/** Small tick-list dropdown for picking several teams or sports. */
function MultiPick({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const summary =
    selected.length === 0
      ? `Pick ${label}…`
      : selected.length <= 2
        ? options
            .filter((o) => selected.includes(o.value))
            .map((o) => o.label)
            .join(", ")
        : `${selected.length} ${label}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="max-w-[220px] truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
      >
        {summary} ▾
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg bg-white p-2 shadow-lg ring-1 ring-slate-200">
          {options.length === 0 ? (
            <p className="px-1 py-1 text-xs text-slate-400">Nothing to pick yet</p>
          ) : (
            options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value)
                    )
                  }
                />
                {o.label}
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const SOURCE_TEXT: Record<string, string> = {
  athlete: "saved for this athlete",
  team: "team default",
  default: "default",
  preview: "not saved",
};

export default function TeamRankDials({ athleteId }: { athleteId: string }) {
  const [protocol, setProtocol] = useState<ResolvedProtocol | null>(null);
  const [rows, setRows] = useState<RankRow[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [sportOptions, setSportOptions] = useState<string[]>([]);
  const [preview, setPreview] = useState<ComparisonSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, t, a] = await Promise.all([
        resolveAthleteProtocol(supabase, athleteId).catch(() => null),
        supabase.from("teams").select("id, name, sport").order("name"),
        supabase.from("athletes").select("primary_sport").not("primary_sport", "is", null),
      ]);
      if (cancelled) return;
      setProtocol(p);
      const teamRows = (t.data ?? []) as { id: string; name: string; sport: string | null }[];
      setTeams(teamRows.map(({ id, name }) => ({ id, name })));
      // Distinct sports across athletes and teams, case-insensitive.
      const seen = new Map<string, string>();
      for (const s of [
        ...((a.data ?? []) as { primary_sport: string | null }[]).map((r) => r.primary_sport),
        ...teamRows.map((r) => r.sport),
      ]) {
        const v = (s ?? "").trim();
        if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
      }
      setSportOptions([...seen.values()].sort((x, y) => x.localeCompare(y)));
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const reqId = useRef(0);
  const loadRanks = useCallback(
    async (spec: ComparisonSpec | null) => {
      setError(null);
      const mine = ++reqId.current;
      const r = await supabase.rpc("athlete_cohort_ranks", {
        p_athlete_id: athleteId,
        p_comparison: spec,
      });
      // Typing in the age boxes fires several requests; only the newest counts.
      if (mine !== reqId.current) return;
      if (r.error) setError(r.error.message);
      else setRows((r.data ?? []) as RankRow[]);
      setLoading(false);
    },
    [athleteId]
  );

  useEffect(() => {
    void loadRanks(preview);
  }, [loadRanks, preview]);

  const meta = rows.find((r) => r.metric === "_meta");
  const current = normSpec(preview ?? meta?.spec ?? null);
  const ownTeamId = meta?.own_team_id ?? null;
  const ownTeamName = meta?.own_team_name ?? null;

  function update(patch: Partial<ComparisonSpec>) {
    setPreview({ ...current, ...patch });
  }

  async function save(target: "athlete" | "team") {
    if (!preview) return;
    setSaving(true);
    setError(null);
    const { error: e } =
      target === "athlete"
        ? await supabase.from("athletes").update({ comparison: preview }).eq("id", athleteId)
        : await supabase.from("teams").update({ comparison: preview }).eq("id", ownTeamId);
    if (!e && target === "team" && meta?.spec_source === "athlete") {
      // Team save only shows here if the athlete has no own setting.
      await supabase.from("athletes").update({ comparison: null }).eq("id", athleteId);
    }
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setPreview(null);
  }

  async function resetToTeam() {
    setSaving(true);
    const { error: e } = await supabase.from("athletes").update({ comparison: null }).eq("id", athleteId);
    setSaving(false);
    if (e) setError(e.message);
    else {
      setPreview(null);
      void loadRanks(null);
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Loading rankings…</p>;
  if (!protocol) return null;

  const dials = DIALS.filter((d) => protocolIncludes(protocol, d.testKey));
  const showAdductor = protocolIncludes(protocol, "adductor_squeeze");
  const adductor = rows.find((r) => r.metric === "adductor");
  const byMetric = new Map<RankRow["metric"], RankRow>(rows.map((r) => [r.metric, r] as const));

  const groupValue = current.base === "team" && !ownTeamId ? "all" : current.base;

  return (
    <section className="rounded-2xl bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Ranking</h2>
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

      {/* Compare-to controls. Every filter stacks on the group. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-slate-700">Compare to</span>
          <select
            value={groupValue}
            onChange={(e) => update({ base: e.target.value as ComparisonSpec["base"] })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
          >
            {ownTeamId ? <option value="team">Their team ({ownTeamName})</option> : null}
            <option value="all">All athletes</option>
            <option value="teams">Chosen teams…</option>
          </select>
          {groupValue === "teams" ? (
            <MultiPick
              label="teams"
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
              selected={current.team_ids}
              onChange={(ids) => update({ team_ids: ids })}
            />
          ) : null}
        </span>

        <span className="flex items-center gap-1.5">
          Sex
          <select
            value={current.sex}
            onChange={(e) => update({ sex: e.target.value as ComparisonSpec["sex"] })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
          >
            <option value="any">Any</option>
            <option value="same">Same as athlete</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </span>

        <span className="flex items-center gap-1.5">
          Sport
          <select
            value={current.sport}
            onChange={(e) => update({ sport: e.target.value as ComparisonSpec["sport"] })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
          >
            <option value="any">Any</option>
            <option value="same">Same as athlete</option>
            <option value="pick">Chosen sports…</option>
          </select>
          {current.sport === "pick" ? (
            <MultiPick
              label="sports"
              options={sportOptions.map((s) => ({ value: s, label: s }))}
              selected={current.sports}
              onChange={(sports) => update({ sports })}
            />
          ) : null}
        </span>

        <span className="flex items-center gap-1.5">
          Age
          <select
            value={
              current.age === "near" ? `near:${current.age_range ?? 2}` : current.age === "range" ? "range" : ""
            }
            onChange={(e) => {
              const v = e.target.value;
              if (!v) update({ age: "any" });
              else if (v === "range") update({ age: "range" });
              else update({ age: "near", age_range: Number(v.split(":")[1]) });
            }}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
          >
            <option value="">Any</option>
            <option value="near:1">Within 1 yr of athlete</option>
            <option value="near:2">Within 2 yrs of athlete</option>
            <option value="near:3">Within 3 yrs of athlete</option>
            <option value="range">Set age range…</option>
          </select>
          {current.age === "range" ? (
            <>
              <input
                type="number"
                min={5}
                max={80}
                placeholder="From"
                value={current.age_min ?? ""}
                onChange={(e) => update({ age_min: e.target.value ? Number(e.target.value) : null })}
                className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
              />
              <span>to</span>
              <input
                type="number"
                min={5}
                max={80}
                placeholder="To"
                value={current.age_max ?? ""}
                onChange={(e) => update({ age_max: e.target.value ? Number(e.target.value) : null })}
                className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
              />
            </>
          ) : null}
        </span>

        <span className="flex items-center gap-1.5">
          Level
          <select
            value={current.level}
            onChange={(e) => update({ level: e.target.value as ComparisonSpec["level"] })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
          >
            <option value="any">Any</option>
            <option value="same">Same as athlete</option>
            <option value="pick">Chosen levels…</option>
          </select>
          {current.level === "pick" ? (
            <MultiPick
              label="levels"
              options={LEVELS}
              selected={current.levels}
              onChange={(levels) => update({ levels })}
            />
          ) : null}
        </span>

        {preview ? (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save("athlete")}
              className="rounded-full bg-slate-900 px-3 py-1 font-medium text-white disabled:opacity-50"
            >
              Save for this athlete
            </button>
            {ownTeamId ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save("team")}
                className="rounded-full px-3 py-1 font-medium text-slate-700 ring-1 ring-slate-300 disabled:opacity-50"
              >
                Save for {ownTeamName}
              </button>
            ) : null}
            <button type="button" onClick={() => setPreview(null)} className="text-slate-500 hover:text-slate-800">
              Cancel
            </button>
          </span>
        ) : meta?.spec_source === "athlete" && ownTeamId ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void resetToTeam()}
            className="ml-auto text-slate-500 hover:text-slate-800"
          >
            Use team default
          </button>
        ) : null}
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Compared to {meta?.cohort_label ?? "—"}
        {meta?.cohort_size != null ? ` (${meta.cohort_size} athletes)` : ""}
        {meta?.spec_source ? ` · ${SOURCE_TEXT[meta.spec_source]}` : ""}
      </p>
      {error ? <p className="mb-3 text-xs text-rose-500">{error}</p> : null}

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
