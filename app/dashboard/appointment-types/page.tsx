"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

/**
 * Appointment-types (services) manager. Edit name, colour, duration, buffers,
 * price, public-bookable and active state. These drive the diary colours and
 * the public /book page.
 */

type ApptType = {
  id: string;
  name: string;
  colour: string;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  price_cents: number | null;
  is_public_bookable: boolean;
  is_active: boolean;
};

const SWATCHES = ["#a3e635", "#60a5fa", "#f59e0b", "#34d399", "#a78bfa", "#f43f5e", "#14b8a6", "#0f172a"];

function dollars(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
function toCents(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100);
}

export default function AppointmentTypesPage() {
  const staffOk = useRequireDashboardStaff();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rows, setRows] = useState<ApptType[]>([]);
  const [priceStr, setPriceStr] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nName, setNName] = useState("");
  const [nColour, setNColour] = useState("#60a5fa");
  const [nDuration, setNDuration] = useState(60);
  const [nPrice, setNPrice] = useState("");
  const [nPublic, setNPublic] = useState(true);
  const [adding, setAdding] = useState(false);
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
    const { data } = await supabase
      .from("appointment_types")
      .select("id, name, colour, duration_min, buffer_before_min, buffer_after_min, price_cents, is_public_bookable, is_active")
      .eq("organisation_id", org)
      .order("name");
    const list = (data ?? []) as ApptType[];
    setRows(list);
    setPriceStr(Object.fromEntries(list.map((r) => [r.id, dollars(r.price_cents)])));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (staffOk) void load();
  }, [staffOk, load]);

  function edit(id: string, changes: Partial<ApptType>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }

  async function saveRow(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    setSavingId(id);
    setError(null);
    const { error: e } = await supabase
      .from("appointment_types")
      .update({
        name: r.name.trim(),
        colour: r.colour,
        duration_min: r.duration_min,
        buffer_before_min: r.buffer_before_min,
        buffer_after_min: r.buffer_after_min,
        price_cents: toCents(priceStr[id] ?? ""),
        is_public_bookable: r.is_public_bookable,
        is_active: r.is_active,
      })
      .eq("id", id);
    setSavingId(null);
    if (e) setError(e.message);
    else void load();
  }

  async function addType() {
    if (!orgId) return;
    if (!nName.trim()) {
      setError("Enter a name.");
      return;
    }
    setAdding(true);
    setError(null);
    const { error: e } = await supabase.from("appointment_types").insert({
      organisation_id: orgId,
      name: nName.trim(),
      colour: nColour,
      duration_min: nDuration,
      buffer_before_min: 0,
      buffer_after_min: 0,
      price_cents: toCents(nPrice),
      is_public_bookable: nPublic,
      is_active: true,
    });
    setAdding(false);
    if (e) {
      setError(e.message);
      return;
    }
    setNName("");
    setNColour("#60a5fa");
    setNDuration(60);
    setNPrice("");
    setNPublic(true);
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
      <section className="mx-auto max-w-4xl px-4 pt-8 pb-20">
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">APPOINTMENT TYPES</h1>
        <p className="mt-1 text-sm text-slate-400">Your services — colours here drive the diary; "Public" controls what shows on the online booking page.</p>

        {/* Add */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-base font-semibold text-slate-100">Add a service</h2>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="block text-xs font-medium text-slate-400">Name</label>
              <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="e.g. Initial Assessment" className={`mt-1 w-full ${inp}`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Colour</label>
              <div className="mt-1 flex items-center gap-1.5">
                <input type="color" value={nColour} onChange={(e) => setNColour(e.target.value)} className="h-9 w-9 cursor-pointer rounded border border-slate-700 bg-slate-950" />
                {SWATCHES.slice(0, 5).map((c) => (
                  <button key={c} type="button" onClick={() => setNColour(c)} className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: c }} aria-label={c} />
                ))}
              </div>
            </div>
            <div className="w-20">
              <label className="block text-xs font-medium text-slate-400">Mins</label>
              <input type="number" min={5} step={5} value={nDuration} onChange={(e) => setNDuration(Math.max(5, Number(e.target.value) || 0))} className={`mt-1 w-full ${inp}`} />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-400">Price $</label>
              <input value={nPrice} onChange={(e) => setNPrice(e.target.value)} placeholder="—" className={`mt-1 w-full ${inp}`} />
            </div>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-300">
              <input type="checkbox" checked={nPublic} onChange={(e) => setNPublic(e.target.checked)} className="h-4 w-4" />
              Public
            </label>
            <button type="button" onClick={() => void addType()} disabled={adding} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        </div>

        {/* List */}
        <div className="mt-6 space-y-2">
          {loading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className={`rounded-xl border border-slate-800 bg-slate-900/50 p-4 ${r.is_active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-end gap-3">
                  <input type="color" value={r.colour} onChange={(e) => edit(r.id, { colour: e.target.value })} className="h-9 w-9 cursor-pointer rounded border border-slate-700 bg-transparent" aria-label="Colour" />
                  <div className="min-w-[160px] flex-1">
                    <label className="block text-[11px] text-slate-500">Name</label>
                    <input value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} className={`mt-0.5 w-full ${inp}`} />
                  </div>
                  <div className="w-16">
                    <label className="block text-[11px] text-slate-500">Mins</label>
                    <input type="number" min={5} step={5} value={r.duration_min} onChange={(e) => edit(r.id, { duration_min: Number(e.target.value) || 0 })} className={`mt-0.5 w-full ${inp}`} />
                  </div>
                  <div className="w-16">
                    <label className="block text-[11px] text-slate-500">Buf. before</label>
                    <input type="number" min={0} step={5} value={r.buffer_before_min} onChange={(e) => edit(r.id, { buffer_before_min: Number(e.target.value) || 0 })} className={`mt-0.5 w-full ${inp}`} />
                  </div>
                  <div className="w-16">
                    <label className="block text-[11px] text-slate-500">Buf. after</label>
                    <input type="number" min={0} step={5} value={r.buffer_after_min} onChange={(e) => edit(r.id, { buffer_after_min: Number(e.target.value) || 0 })} className={`mt-0.5 w-full ${inp}`} />
                  </div>
                  <div className="w-20">
                    <label className="block text-[11px] text-slate-500">Price $</label>
                    <input value={priceStr[r.id] ?? ""} onChange={(e) => setPriceStr((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="—" className={`mt-0.5 w-full ${inp}`} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input type="checkbox" checked={r.is_public_bookable} onChange={(e) => edit(r.id, { is_public_bookable: e.target.checked })} className="h-4 w-4" />
                    Public (bookable online)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input type="checkbox" checked={r.is_active} onChange={(e) => edit(r.id, { is_active: e.target.checked })} className="h-4 w-4" />
                    Active
                  </label>
                  <button type="button" onClick={() => void saveRow(r.id)} disabled={savingId === r.id} className="ml-auto rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-1.5 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">
                    {savingId === r.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
