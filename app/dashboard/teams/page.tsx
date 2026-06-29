"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

type Team = {
  id: string;
  name: string;
  sport: string | null;
  created_at: string;
};

type AthleteLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type AthleteTeamRow = {
  team_id: string;
  athlete_id: string;
  athletes: AthleteLite | AthleteLite[] | null;
};

function athleteName(a: AthleteLite): string {
  const n = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  return n || "Athlete";
}

function normalizeAthleteJoin(
  athletes: AthleteTeamRow["athletes"]
): AthleteLite | null {
  if (!athletes) return null;
  return Array.isArray(athletes) ? athletes[0] ?? null : athletes;
}

export default function TeamsPage() {
  const staffOk = useRequireDashboardStaff();
  const [teams, setTeams] = useState<Team[]>([]);
  const [athleteTeams, setAthleteTeams] = useState<AthleteTeamRow[]>([]);
  const [allAthletes, setAllAthletes] = useState<AthleteLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamSport, setTeamSport] = useState("");
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [tRes, atRes, aRes] = await Promise.all([
      supabase.from("teams").select("id, name, sport, created_at").order("name"),
      supabase
        .from("athlete_teams")
        .select("team_id, athlete_id, athletes(id, first_name, last_name)"),
      supabase.from("athletes").select("id, first_name, last_name").order("last_name"),
    ]);
    if (tRes.error) {
      setError(tRes.error.message);
      setLoading(false);
      return;
    }
    if (atRes.error) {
      setError(atRes.error.message);
      setLoading(false);
      return;
    }
    if (aRes.error) {
      setError(aRes.error.message);
      setLoading(false);
      return;
    }
    setTeams((tRes.data ?? []) as Team[]);
    setAthleteTeams((atRes.data ?? []) as AthleteTeamRow[]);
    setAllAthletes((aRes.data ?? []) as AthleteLite[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!staffOk) return;
    void load();
  }, [staffOk, load]);

  const membersByTeamId = useMemo(() => {
    const m = new Map<string, AthleteLite[]>();
    for (const row of athleteTeams) {
      const a = normalizeAthleteJoin(row.athletes);
      if (!a) continue;
      const list = m.get(row.team_id) ?? [];
      list.push(a);
      m.set(row.team_id, list);
    }
    return m;
  }, [athleteTeams]);

  const athleteTeamAssignment = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of athleteTeams) {
      map.set(row.athlete_id, row.team_id);
    }
    return map;
  }, [athleteTeams]);

  function openNew() {
    setEditingTeam(null);
    setTeamName("");
    setTeamSport("");
    setSelectedAthleteIds([]);
    setSearch("");
    setSaveError(null);
    setModalOpen(true);
  }

  function openEdit(team: Team) {
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamSport(team.sport ?? "");
    const members = membersByTeamId.get(team.id) ?? [];
    setSelectedAthleteIds(members.map((x) => x.id));
    setSearch("");
    setSaveError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingTeam(null);
    setSaveError(null);
  }

  const pickableAthletes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const currentTeamId = editingTeam?.id ?? null;
    return allAthletes.filter((a) => {
      if (selectedAthleteIds.includes(a.id)) return false;
      const onTeam = athleteTeamAssignment.get(a.id);
      if (onTeam && onTeam !== currentTeamId) return false;
      if (!q) return true;
      return athleteName(a).toLowerCase().includes(q);
    });
  }, [allAthletes, athleteTeamAssignment, editingTeam?.id, search, selectedAthleteIds]);

  async function saveTeam() {
    const name = teamName.trim();
    if (!name) {
      setSaveError("Team name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      let teamId = editingTeam?.id;
      if (teamId) {
        const { error: uErr } = await supabase
          .from("teams")
          .update({ name, sport: teamSport.trim() || null })
          .eq("id", teamId);
        if (uErr) throw new Error(uErr.message);
      } else {
        const { data: inserted, error: iErr } = await supabase
          .from("teams")
          .insert({ name, sport: teamSport.trim() || null })
          .select("id")
          .single();
        if (iErr || !inserted) throw new Error(iErr?.message ?? "Insert failed");
        teamId = (inserted as { id: string }).id;
      }

      const { error: dErr } = await supabase.from("athlete_teams").delete().eq("team_id", teamId);
      if (dErr) throw new Error(dErr.message);

      if (selectedAthleteIds.length > 0) {
        const { error: insErr } = await supabase.from("athlete_teams").insert(
          selectedAthleteIds.map((athlete_id) => ({ team_id: teamId, athlete_id }))
        );
        if (insErr) throw new Error(insErr.message);
      }

      closeModal();
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(id: string) {
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setDeleteConfirmId(null);
    await load();
  }

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-4xl px-4 pt-8 pb-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">TEAMS</h1>
          <button
            type="button"
            onClick={openNew}
            className="rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110"
          >
            + New team
          </button>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-rose-400">{error}</p>
        ) : null}

        <div className="mt-8 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : teams.length === 0 ? (
            <p className="text-sm text-slate-500">No teams yet. Create one to assign athletes.</p>
          ) : (
            teams.map((team) => {
              const members = membersByTeamId.get(team.id) ?? [];
              const preview = members.slice(0, 2).map(athleteName).join(" · ");
              const more = members.length > 2 ? ` · +${members.length - 2} more` : "";
              return (
                <div
                  key={team.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-lime-400/40 hover:bg-slate-900/70 hover:shadow-lg hover:shadow-lime-400/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openEdit(team)}
                        className="text-left text-lg font-semibold text-slate-100 hover:text-lime-300"
                      >
                        {team.name}
                      </button>
                      <p className="mt-2 text-xs text-slate-400">
                        <span className="font-medium text-slate-300">Athletes:</span>{" "}
                        {members.length === 0 ? (
                          "None assigned"
                        ) : (
                          <>
                            {preview}
                            {more}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {team.sport?.trim() || "Sport —"}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEdit(team)}
                        className="text-xs text-lime-300 hover:underline"
                      >
                        Edit
                      </button>
                      {deleteConfirmId === team.id ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-rose-300">Delete?</span>
                          <button
                            type="button"
                            onClick={() => void deleteTeam(team.id)}
                            className="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-200"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(team.id)}
                          className="text-xs text-slate-500 hover:text-rose-400"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
          >
            <h2 className="text-base font-semibold text-slate-100">
              {editingTeam ? "Edit team" : "New team"}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400">Team name</label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Sport</label>
                <input
                  value={teamSport}
                  onChange={(e) => setTeamSport(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Athletes</p>
                <input
                  placeholder="Search athletes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80 p-2">
                  {pickableAthletes.length === 0 ? (
                    <p className="text-xs text-slate-500">No matching athletes to add.</p>
                  ) : (
                    pickableAthletes.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelectedAthleteIds((prev) => [...prev, a.id])}
                        className="mb-1 flex w-full rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
                      >
                        {athleteName(a)}
                      </button>
                    ))
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-500">Currently assigned:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedAthleteIds.length === 0 ? (
                    <span className="text-xs text-slate-600">None</span>
                  ) : (
                    selectedAthleteIds.map((id) => {
                      const a = allAthletes.find((x) => x.id === id);
                      if (!a) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full border border-lime-500/40 bg-lime-500/10 px-2 py-1 text-xs text-lime-200"
                        >
                          {athleteName(a)}
                          <button
                            type="button"
                            aria-label={`Remove ${athleteName(a)}`}
                            onClick={() =>
                              setSelectedAthleteIds((prev) => prev.filter((x) => x !== id))
                            }
                            className="text-lime-400 hover:text-rose-300"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
              {saveError ? <p className="text-xs text-rose-400">{saveError}</p> : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveTeam()}
                disabled={saving}
                className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
