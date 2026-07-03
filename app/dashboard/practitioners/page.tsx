"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import PracticeSidebar from "@/components/PracticeSidebar";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

/**
 * Practitioners admin. A practitioner is a calendar resource that MAY link to a
 * login profile. Supports rename, colour, login link, activate/deactivate and
 * guarded delete (blocked if the practitioner has bookings).
 */

type Practitioner = {
  id: string;
  full_name: string;
  colour: string;
  is_active: boolean;
  profile_id: string | null;
};
type StaffProfile = { id: string; full_name: string | null };

const SWATCHES = ["#7fe303", "#0f172a", "#60a5fa", "#f59e0b", "#a78bfa", "#34d399", "#f43f5e", "#14b8a6"];

export default function PractitionersPage() {
  const staffOk = useRequireDashboardStaff();

  const [orgId, setOrgId] = useState<string | null>(null);
  const [pracs, setPracs] = useState<Practitioner[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [colour, setColour] = useState("#60a5fa");
  const [linkId, setLinkId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("organisation_id").eq("id", user.id).single();
    const org = (profile?.organisation_id as string) ?? null;
    setOrgId(org);
    if (!org) {
      setLoading(false);
      return;
    }
    const [{ data: prac }, { data: staffRows }] = await Promise.all([
      supabase.from("practitioners").select("id, full_name, colour, is_active, profile_id").eq("organisation_id", org).order("full_name"),
      supabase.from("profiles").select("id, full_name").eq("organisation_id", org).eq("role", "staff"),
    ]);
    setPracs((prac ?? []) as Practitioner[]);
    setStaff((staffRows ?? []) as StaffProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (staffOk) void load();
  }, [staffOk, load]);

  const availableToAdd = useMemo(
    () => staff.filter((s) => !pracs.some((p) => p.profile_id === s.id)),
    [staff, pracs]
  );
  // Options for a given row: unlinked staff + this row's own current link.
  function linkOptions(row: Practitioner): StaffProfile[] {
    return staff.filter((s) => !pracs.some((p) => p.id !== row.id && p.profile_id === s.id));
  }

  function edit(id: string, changes: Partial<Practitioner>) {
    setPracs((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  async function saveRow(id: string) {
    const r = pracs.find((p) => p.id === id);
    if (!r) return;
    setBusyId(id);
    setRowMsg((m) => ({ ...m, [id]: "" }));
    const { error: e } = await supabase
      .from("practitioners")
      .update({ full_name: r.full_name.trim(), colour: r.colour, profile_id: r.profile_id, is_active: r.is_active })
      .eq("id", id);
    setBusyId(null);
    setRowMsg((m) => ({ ...m, [id]: e ? e.message : "Saved." }));
    if (!e) void load();
  }

  async function del(id: string) {
    setBusyId(id);
    setRowMsg((m) => ({ ...m, [id]: "" }));
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("practitioner_id", id);
    if ((count ?? 0) > 0) {
      setBusyId(null);
      setRowMsg((m) => ({ ...m, [id]: `Has ${count} booking(s) — deactivate instead of deleting.` }));
      return;
    }
    const { error: e } = await supabase.from("practitioners").delete().eq("id", id);
    setBusyId(null);
    if (e) setRowMsg((m) => ({ ...m, [id]: e.message }));
    else void load();
  }

  async function addPractitioner() {
    if (!orgId) return;
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: e } = await supabase.from("practitioners").insert({
      organisation_id: orgId,
      full_name: name.trim(),
      colour,
      profile_id: linkId || null,
      is_active: true,
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setName("");
    setColour("#60a5fa");
    setLinkId("");
    void load();
  }

  const inp = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";

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
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
          <aside className="w-full shrink-0 lg:w-48"><PracticeSidebar /></aside>
          <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">PRACTITIONERS</h1>
        <p className="mt-1 text-sm text-slate-400">
          Each practitioner gets their own diary and availability. "Link to login" connects to an existing staff account;
          leave it "Calendar only" for someone without a login.
        </p>

        {/* Add */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-base font-semibold text-slate-100">Add a practitioner</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div>
              <label className="block text-xs font-medium text-slate-400">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emidio Pacecca" className={`mt-1 w-full ${inp}`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Colour</label>
              <div className="mt-1 flex items-center gap-1.5">
                <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} className="h-9 w-9 cursor-pointer rounded border border-slate-700 bg-slate-950" />
                <div className="flex gap-1">
                  {SWATCHES.map((c) => (
                    <button key={c} type="button" aria-label={c} onClick={() => setColour(c)} className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Link to login <span className="text-slate-600">(optional)</span></label>
              <select value={linkId} onChange={(e) => setLinkId(e.target.value)} className={`mt-1 w-full ${inp}`}>
                <option value="">Calendar only</option>
                {availableToAdd.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name ?? "Unnamed staff"}</option>
                ))}
              </select>
            </div>
          </div>
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
          <button type="button" onClick={() => void addPractitioner()} disabled={saving} className="mt-4 rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">
            {saving ? "Adding…" : "Add practitioner"}
          </button>
        </div>

        {/* List */}
        <div className="mt-6 space-y-2">
          <h2 className="text-base font-semibold text-slate-100">Your practitioners</h2>
          {loading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : pracs.length === 0 ? (
            <p className="text-xs text-slate-500">None yet.</p>
          ) : (
            pracs.map((p) => (
              <div key={p.id} className={`rounded-xl border border-slate-800 bg-slate-900/50 p-4 ${p.is_active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-end gap-3">
                  <input type="color" value={p.colour} onChange={(e) => edit(p.id, { colour: e.target.value })} className="h-9 w-9 cursor-pointer rounded border border-slate-700 bg-transparent" aria-label="Colour" />
                  <div className="min-w-[160px] flex-1">
                    <label className="block text-[11px] text-slate-500">Name</label>
                    <input value={p.full_name} onChange={(e) => edit(p.id, { full_name: e.target.value })} className={`mt-0.5 w-full ${inp}`} />
                  </div>
                  <div className="min-w-[150px]">
                    <label className="block text-[11px] text-slate-500">Login</label>
                    <select value={p.profile_id ?? ""} onChange={(e) => edit(p.id, { profile_id: e.target.value || null })} className={`mt-0.5 w-full ${inp}`}>
                      <option value="">Calendar only</option>
                      {linkOptions(p).map((s) => (
                        <option key={s.id} value={s.id}>{s.full_name ?? "Unnamed staff"}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input type="checkbox" checked={p.is_active} onChange={(e) => edit(p.id, { is_active: e.target.checked })} className="h-4 w-4" />
                    Active
                  </label>
                  {rowMsg[p.id] ? <span className="text-xs text-slate-400">{rowMsg[p.id]}</span> : null}
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => void del(p.id)} disabled={busyId === p.id} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
                      Delete
                    </button>
                    <button type="button" onClick={() => void saveRow(p.id)} disabled={busyId === p.id} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-1.5 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">
                      {busyId === p.id ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
          </div>
        </div>
      </section>
    </main>
  );
}
