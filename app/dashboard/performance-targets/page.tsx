"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { METRIC_REGISTRY, type Direction } from "@/lib/performanceSummary";
import {
  createTargetProfile,
  deleteTargetProfile,
  fetchTargetProfiles,
  fetchTargetsForProfile,
  profileDescriptor,
  upsertTarget,
  type TargetProfile,
} from "@/lib/performanceTargets";
import { supabase } from "@/lib/supabaseClient";

type TargetRow = { target: number; direction: Direction; unit: string };

const CATEGORY_ORDER = ["cmj", "power", "speed", "accel", "decel", "cod", "strength"];

function groupByCategory() {
  const map = new Map<string, typeof METRIC_REGISTRY>();
  for (const m of METRIC_REGISTRY) {
    const list = map.get(m.categoryId) ?? [];
    list.push(m);
    map.set(m.categoryId, list);
  }
  return CATEGORY_ORDER.map((id) => ({
    id,
    label: map.get(id)?.[0]?.categoryLabel ?? id,
    metrics: map.get(id) ?? [],
  })).filter((c) => c.metrics.length > 0);
}

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-lime-500 focus:outline-none";

// macOS Safari/Chrome ignore bg-* on native <select> elements without
// appearance-none + an explicit color-scheme, rendering a white/invisible
// control regardless of Tailwind classes — force it with inline styles too.
const selectClass = `${inputClass} appearance-none [color-scheme:dark]`;
const selectStyle = { backgroundColor: "#020617", color: "#e2e8f0" };

export default function PerformanceTargetsPage() {
  const staffOk = useRequireDashboardStaff();
  const [profiles, setProfiles] = useState<TargetProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, TargetRow>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", sport: "", age_group: "", gender: "", level: "" });
  const [creating, setCreating] = useState(false);

  const categories = useMemo(() => groupByCategory(), []);

  const loadProfiles = useCallback(async () => {
    const list = await fetchTargetProfiles(supabase);
    setProfiles(list);
    setSelectedId((cur) => cur ?? list.find((p) => p.is_default)?.id ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (!staffOk) return;
    let cancelled = false;
    void (async () => {
      await loadProfiles();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk, loadProfiles]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      const map = await fetchTargetsForProfile(supabase, selectedId);
      if (cancelled) return;
      const next: Record<string, TargetRow> = {};
      for (const m of METRIC_REGISTRY) {
        const row = map[m.id];
        next[m.id] = row
          ? { target: row.target, direction: row.direction, unit: m.unit }
          : { target: m.defaultTarget, direction: m.direction, unit: m.unit };
      }
      setTargets(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleCreate() {
    if (!newForm.name.trim()) return;
    setCreating(true);
    setError(null);
    const { profile, error: err } = await createTargetProfile(supabase, {
      name: newForm.name.trim(),
      sport: newForm.sport.trim() || null,
      age_group: newForm.age_group.trim() || null,
      gender: newForm.gender.trim() || null,
      level: newForm.level.trim() || null,
    });
    setCreating(false);
    if (err) {
      setError(err);
      return;
    }
    setNewForm({ name: "", sport: "", age_group: "", gender: "", level: "" });
    setNewOpen(false);
    await loadProfiles();
    if (profile) setSelectedId(profile.id);
  }

  async function handleDelete(profile: TargetProfile) {
    if (profile.is_default) return;
    if (!confirm(`Delete target profile "${profile.name}"? Athletes using it will fall back to Default.`)) return;
    const { error: err } = await deleteTargetProfile(supabase, profile.id);
    if (err) {
      setError(err);
      return;
    }
    setSelectedId(null);
    await loadProfiles();
  }

  async function handleFieldChange(metricId: string, field: "target" | "direction", value: string) {
    setTargets((prev) => {
      const cur = prev[metricId];
      if (!cur) return prev;
      const next =
        field === "target"
          ? { ...cur, target: Number(value) }
          : { ...cur, direction: value as Direction };
      return { ...prev, [metricId]: next };
    });
  }

  async function handleSave(metricId: string) {
    if (!selectedId) return;
    const row = targets[metricId];
    if (!row || !Number.isFinite(row.target)) return;
    setSavingKey(metricId);
    const { error: err } = await upsertTarget(
      supabase,
      selectedId,
      metricId,
      row.target,
      row.direction,
      row.unit
    );
    setSavingKey(null);
    if (err) setError(err);
  }

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <DashboardNav />
      <section className="mx-auto max-w-5xl px-4 pb-20 pt-8">
        <h1 className="text-lg font-semibold text-slate-50">Performance Targets</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage the target profiles used by the Performance Summary dashboard — one shared set per
          sport/age/gender/level, assignable per athlete from their report page.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
            {/* Profile list */}
            <div className="space-y-2">
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      selectedId === p.id
                        ? "border-lime-400/50 bg-lime-400/10 text-lime-200"
                        : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <p className="font-medium">
                      {p.name}
                      {p.is_default ? " (default)" : ""}
                    </p>
                    {profileDescriptor(p) ? (
                      <p className="mt-0.5 text-[0.65rem] text-slate-500">{profileDescriptor(p)}</p>
                    ) : null}
                  </button>
                  {!p.is_default ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(p)}
                      aria-label={`Delete ${p.name}`}
                      className="rounded p-1.5 text-slate-600 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}

              {newOpen ? (
                <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <input
                    className={inputClass}
                    placeholder="Profile name *"
                    value={newForm.name}
                    onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <input
                    className={inputClass}
                    placeholder="Sport"
                    value={newForm.sport}
                    onChange={(e) => setNewForm((f) => ({ ...f, sport: e.target.value }))}
                  />
                  <input
                    className={inputClass}
                    placeholder="Age group"
                    value={newForm.age_group}
                    onChange={(e) => setNewForm((f) => ({ ...f, age_group: e.target.value }))}
                  />
                  <input
                    className={inputClass}
                    placeholder="Gender"
                    value={newForm.gender}
                    onChange={(e) => setNewForm((f) => ({ ...f, gender: e.target.value }))}
                  />
                  <input
                    className={inputClass}
                    placeholder="Level"
                    value={newForm.level}
                    onChange={(e) => setNewForm((f) => ({ ...f, level: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCreate()}
                      disabled={creating || !newForm.name.trim()}
                      className="rounded-full bg-lime-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
                    >
                      {creating ? "Creating…" : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewOpen(false)}
                      className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewOpen(true)}
                  className="w-full rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-lime-400/50 hover:text-lime-300"
                >
                  + New profile
                </button>
              )}
            </div>

            {/* Metric targets for selected profile */}
            <div className="space-y-4">
              {selectedProfile ? (
                categories.map((cat) => (
                  <div key={cat.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-lime-300">
                      {cat.label}
                    </p>
                    <div className="mt-3 space-y-2">
                      {cat.metrics.map((m) => {
                        const row = targets[m.id];
                        if (!row) return null;
                        return (
                          <div
                            key={m.id}
                            className="grid grid-cols-[1fr_90px_110px_70px] items-center gap-2"
                          >
                            <p className="text-xs text-slate-300">{m.label}</p>
                            <input
                              type="number"
                              step="any"
                              value={row.target}
                              onChange={(e) => void handleFieldChange(m.id, "target", e.target.value)}
                              className={inputClass}
                            />
                            <select
                              value={row.direction}
                              onChange={(e) => void handleFieldChange(m.id, "direction", e.target.value)}
                              className={selectClass}
                              style={selectStyle}
                            >
                              <option value="higher" style={selectStyle}>≥ higher is better</option>
                              <option value="lower" style={selectStyle}>≤ lower is better</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleSave(m.id)}
                              disabled={savingKey === m.id}
                              className="rounded-full border border-lime-500/40 bg-lime-500/10 px-2 py-1 text-[0.65rem] font-medium text-lime-300 hover:bg-lime-500/20 disabled:opacity-50"
                            >
                              {savingKey === m.id ? "…" : "Save"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Select or create a profile to edit its targets.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
