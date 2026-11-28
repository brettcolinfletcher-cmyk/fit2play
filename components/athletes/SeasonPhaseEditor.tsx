"use client";

import { useState } from "react";
import { formatDisplayDate } from "@/lib/dateDisplay";
import { supabase } from "@/lib/supabaseClient";
import { PHASE_TYPES, phaseStyle, type AthleteTeam, type PhaseType, type SeasonPhase } from "@/lib/seasonPhases";

type Props = {
  athleteId: string;
  phases: SeasonPhase[];
  teams: AthleteTeam[];
  onChanged: () => void;
  onClose: () => void;
};

/** Add and remove season phases (blocks) for this athlete, their team, or everyone. */
export default function SeasonPhaseEditor({ athleteId, phases, teams, onChanged, onClose }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PhaseType>("preseason");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [scope, setScope] = useState<string>(teams[0] ? `team:${teams[0].id}` : `athlete:${athleteId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const scopeLabel = (p: SeasonPhase) =>
    p.athlete_id ? "This athlete" : p.team_id ? teamName.get(p.team_id) ?? "Team" : "All athletes";

  async function add() {
    setBusy(true);
    setError(null);
    const [kind, id] = scope.split(":");
    const { error: e } = await supabase.from("season_phases").insert({
      name: name.trim(),
      phase_type: type,
      start_date: start,
      end_date: end,
      team_id: kind === "team" ? id : null,
      athlete_id: kind === "athlete" ? id : null,
    });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setName("");
    setStart(end ? end : "");
    setEnd("");
    onChanged();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error: e } = await supabase.from("season_phases").delete().eq("id", id);
    setBusy(false);
    if (e) setError(e.message);
    else onChanged();
  }

  const valid = name.trim() && start && end && end >= start;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Season phases</p>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
          Done
        </button>
      </div>

      {phases.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-200 text-xs">
          {phases.map((p) => {
            const st = phaseStyle(p.phase_type);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-1.5">
                <span className="rounded px-1.5 py-0.5 font-medium" style={{ background: st.fill, color: st.text }}>
                  {st.label}
                </span>
                <span className="font-medium text-slate-800">{p.name}</span>
                <span className="tabular-nums text-slate-500">
                  {formatDisplayDate(p.start_date)} to {formatDisplayDate(p.end_date)}
                </span>
                <span className="text-slate-400">{scopeLabel(p)}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(p.id)}
                  className="ml-auto text-slate-400 hover:text-rose-600"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No phases yet.</p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Preseason Block 2"
            className="w-44 rounded-lg border border-slate-200 bg-white px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PhaseType)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1"
          >
            {PHASE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Start</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">End</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Applies to</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
            {teams.map((t) => (
              <option key={t.id} value={`team:${t.id}`}>
                Team: {t.name}
              </option>
            ))}
            <option value={`athlete:${athleteId}`}>This athlete only</option>
            <option value="all:">All athletes</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => void add()}
          className="rounded-full bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
        >
          Add phase
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
