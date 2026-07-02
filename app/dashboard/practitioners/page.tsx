"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

/**
 * Practitioners admin. A practitioner is a calendar resource that MAY link to a
 * login profile. Adding one here makes it available as its own diary and (later)
 * a bookable practitioner. Deactivating hides it without deleting history.
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
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);

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
    const { data: profile } = await supabase
      .from("profiles")
      .select("organisation_id")
      .eq("id", user.id)
      .single();
    const org = (profile?.organisation_id as string) ?? null;
    setOrgId(org);
    if (!org) {
      setLoading(false);
      return;
    }
    const [{ data: prac }, { data: staffRows }] = await Promise.all([
      supabase
        .from("practitioners")
        .select("id, full_name, colour, is_active, profile_id")
        .eq("organisation_id", org)
        .order("full_name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("organisation_id", org)
        .eq("role", "staff"),
    ]);
    setPractitioners((prac ?? []) as Practitioner[]);
    setStaff((staffRows ?? []) as StaffProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!staffOk) return;
    void load();
  }, [staffOk, load]);

  const availableToLink = useMemo(
    () => staff.filter((s) => !practitioners.some((p) => p.profile_id === s.id)),
    [staff, practitioners]
  );

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

  async function patch(id: string, changes: Partial<Practitioner>) {
    setPractitioners((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
    await supabase.from("practitioners").update(changes).eq("id", id);
  }

  if (!staffOk) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-900 athlete-frosted"
        data-theme="light"
      >
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-3xl px-4 pt-8 pb-20">
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">PRACTITIONERS</h1>
        <p className="mt-1 text-sm text-slate-400">
          Each practitioner gets their own diary and availability. Linking to a login lets that
          person sign in; leave it unlinked for a calendar-only resource.
        </p>

        {/* Add */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-base font-semibold text-slate-100">Add a practitioner</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div>
              <label className="block text-xs font-medium text-slate-400">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Emidio Pacecca"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Colour</label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="color"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border border-slate-700 bg-slate-950"
                />
                <div className="flex gap-1">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Colour ${c}`}
                      onClick={() => setColour(c)}
                      className="h-5 w-5 rounded-full border border-white/20"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">
                Link to login <span className="text-slate-600">(optional)</span>
              </label>
              <select
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value="">Calendar only</option>
                {availableToLink.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? "Unnamed staff"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
          <button
            type="button"
            onClick={() => void addPractitioner()}
            disabled={saving}
            className="mt-4 rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add practitioner"}
          </button>
        </div>

        {/* List */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-base font-semibold text-slate-100">Your practitioners</h2>
          {loading ? (
            <p className="mt-3 text-xs text-slate-500">Loading…</p>
          ) : practitioners.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">None yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {practitioners.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 px-3 py-2"
                >
                  <input
                    type="color"
                    value={p.colour}
                    onChange={(e) => void patch(p.id, { colour: e.target.value })}
                    className="h-6 w-6 cursor-pointer rounded border border-slate-700 bg-transparent"
                    aria-label="Change colour"
                  />
                  <span className="font-medium text-slate-100">{p.full_name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      p.profile_id ? "bg-sky-500/20 text-sky-200" : "bg-slate-700/60 text-slate-300"
                    }`}
                  >
                    {p.profile_id ? "Login" : "Calendar only"}
                  </span>
                  {!p.is_active ? (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-200">
                      Inactive
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void patch(p.id, { is_active: !p.is_active })}
                    className="ml-auto rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    {p.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
