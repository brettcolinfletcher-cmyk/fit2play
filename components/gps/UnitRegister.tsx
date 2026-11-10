"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fmtDate } from "@/lib/practice/billing";
import { recountHires, returnUnit, UNIT_COLS, type UnitRow } from "@/lib/practice/gpsUnits";

/** Unit register: every GPS unit, who has it, and its assignment history. */

type AthleteLite = { id: string; first_name: string | null; last_name: string | null };
type HireLite = { id: string; client_name: string; status: string };
type Assignment = { id: string; gps_hire_id: string | null; athlete_id: string | null; holder_name: string | null; started_on: string; ended_on: string | null; note: string | null };
type Filter = "all" | "hired" | "stock" | "out_of_service";

const STATUS_STYLE: Record<string, string> = {
  hired: "bg-lime-500/20 text-lime-200",
  available: "bg-sky-500/20 text-sky-200",
  maintenance: "bg-amber-500/20 text-amber-200",
  lost: "bg-rose-500/20 text-rose-200",
  retired: "bg-slate-600/40 text-slate-300",
};

export default function UnitRegister({ orgId, hires, athletes, refreshKey, onChanged }: {
  orgId: string | null;
  hires: HireLite[];
  athletes: AthleteLite[];
  refreshKey: number;
  onChanged: () => void;
}) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newSize, setNewSize] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase.from("gps_units").select(UNIT_COLS).eq("organisation_id", orgId).order("unit_code");
    setUnits((data ?? []) as UnitRow[]);
    setLoading(false);
  }, [orgId]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const hireName = (id: string | null) => (id ? hires.find((h) => h.id === id)?.client_name ?? "Hire" : null);
  const athName = (id: string | null) => {
    const a = id ? athletes.find((x) => x.id === id) : null;
    return a ? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() : null;
  };
  const holder = (u: { current_athlete_id: string | null; current_holder_name: string | null }) => athName(u.current_athlete_id) ?? u.current_holder_name ?? "";

  const search = q.trim().toLowerCase();
  const shown = units.filter((u) => {
      const s = search;
      if (filter === "hired" && !u.current_hire_id) return false;
      if (filter === "stock" && (u.current_hire_id || u.status !== "available")) return false;
      if (filter === "out_of_service" && !["maintenance", "lost", "retired"].includes(u.status)) return false;
      if (s && !`${u.unit_code} ${holder(u)} ${hireName(u.current_hire_id) ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });

  const counts = useMemo(() => ({
    total: units.length,
    hired: units.filter((u) => u.current_hire_id).length,
    stock: units.filter((u) => !u.current_hire_id && u.status === "available").length,
  }), [units]);

  async function addUnit() {
    if (!orgId || !newCode.trim()) return;
    setErr(null);
    const { error } = await supabase.from("gps_units").insert({ organisation_id: orgId, unit_code: newCode.trim().toUpperCase(), size: newSize.trim() || null });
    if (error) { setErr(/duplicate|unique/i.test(error.message) ? "That unit ID already exists." : error.message); return; }
    setNewCode(""); setNewSize(""); setAdding(false);
    void load();
  }

  const inp = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";
  const open = units.find((u) => u.id === openId) ?? null;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Units</h2>
          <p className="text-xs text-slate-500">{counts.total} units · {counts.hired} on hire · {counts.stock} in stock</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {([["all", "All"], ["hired", "On hire"], ["stock", "In stock"], ["out_of_service", "Out of service"]] as [Filter, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`px-2.5 py-1 text-xs ${filter === k ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>{l}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search unit, player, hire…" className={`w-48 ${inp}`} />
          <button type="button" onClick={() => setAdding((a) => !a)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800">+ Unit</button>
        </div>
      </div>
      {adding ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Unit ID" className={`w-36 font-mono ${inp}`} />
          <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Size (optional)" className={`w-32 ${inp}`} />
          <button type="button" onClick={() => void addUnit()} className="rounded-lg border border-lime-500/50 px-3 py-1 text-xs text-lime-200 hover:bg-lime-500/10">Add</button>
          {err ? <span className="text-xs text-rose-300">{err}</span> : null}
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Hire</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-4 text-xs text-slate-500">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-xs text-slate-500">{units.length ? "None in this view." : "No units yet. Drop a roster above or add one."}</td></tr>
            ) : shown.map((u) => (
              <tr key={u.id} onClick={() => setOpenId(u.id)} className="cursor-pointer border-b border-slate-800/60 text-slate-200 hover:bg-slate-800/40">
                <td className="px-3 py-2 font-mono">{u.unit_code}</td>
                <td className="px-3 py-2 text-slate-400">{u.size ?? ""}</td>
                <td className="px-3 py-2">{holder(u) || <span className="text-slate-500">spare</span>}</td>
                <td className="px-3 py-2 text-slate-300">{hireName(u.current_hire_id) ?? <span className="text-slate-500">stock</span>}</td>
                <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[u.status] ?? ""}`}>{u.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <UnitDetail
          unit={open}
          orgId={orgId}
          hireName={hireName}
          athName={athName}
          holder={holder(open)}
          onClose={() => setOpenId(null)}
          onChanged={() => { void load(); onChanged(); }}
        />
      ) : null}
    </div>
  );
}

function UnitDetail({ unit, orgId, hireName, athName, holder, onClose, onChanged }: {
  unit: UnitRow; orgId: string | null; hireName: (id: string | null) => string | null; athName: (id: string | null) => string | null;
  holder: string; onClose: () => void; onChanged: () => void;
}) {
  const [history, setHistory] = useState<Assignment[]>([]);
  const [size, setSize] = useState(unit.size ?? "");
  const [notes, setNotes] = useState(unit.notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("gps_unit_assignments")
        .select("id, gps_hire_id, athlete_id, holder_name, started_on, ended_on, note")
        .eq("unit_id", unit.id)
        .order("started_on", { ascending: false })
        .order("created_at", { ascending: false });
      setHistory((data ?? []) as Assignment[]);
    })();
  }, [unit.id]);

  async function setStatus(status: string) {
    if (!orgId) return;
    setBusy(true);
    if (status !== "hired" && unit.current_hire_id) {
      await returnUnit(orgId, unit.id, unit.current_hire_id);
    }
    await supabase.from("gps_units").update({ status, updated_at: new Date().toISOString() }).eq("id", unit.id);
    setBusy(false);
    onChanged();
  }
  async function returnToStock() {
    if (!orgId) return;
    setBusy(true);
    await returnUnit(orgId, unit.id, unit.current_hire_id);
    setBusy(false);
    onChanged();
  }
  async function saveDetails() {
    setBusy(true);
    await supabase.from("gps_units").update({ size: size.trim() || null, notes: notes.trim() || null, updated_at: new Date().toISOString() }).eq("id", unit.id);
    if (unit.current_hire_id) await recountHires([unit.current_hire_id]);
    setBusy(false);
    onChanged();
  }

  const inp = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-base font-semibold text-slate-100">{unit.unit_code}</h2>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[unit.status] ?? ""}`}>{unit.status}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {unit.current_hire_id ? <>On hire to <span className="text-slate-200">{hireName(unit.current_hire_id)}</span>{holder ? <> · with <span className="text-slate-200">{holder}</span></> : " · spare"}</> : "In stock"}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-slate-400">Size</label><input value={size} onChange={(e) => setSize(e.target.value)} className={inp} /></div>
          <div className="col-span-2"><label className="block text-xs text-slate-400">Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. strap replaced" className={inp} /></div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveDetails()} disabled={busy} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-3 py-1.5 text-xs text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">Save</button>
          {unit.current_hire_id ? (
            <button type="button" onClick={() => void returnToStock()} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Returned to stock</button>
          ) : null}
          {unit.status !== "maintenance" ? <button type="button" onClick={() => void setStatus("maintenance")} disabled={busy} className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">Maintenance</button> : null}
          {unit.status !== "lost" ? <button type="button" onClick={() => void setStatus("lost")} disabled={busy} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10">Lost</button> : null}
          {unit.status !== "retired" ? <button type="button" onClick={() => void setStatus("retired")} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Retire</button> : null}
          {["maintenance", "lost", "retired"].includes(unit.status) ? <button type="button" onClick={() => void setStatus("available")} disabled={busy} className="rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/10">Back in service</button> : null}
        </div>

        <div className="mt-5">
          <div className="mb-1 text-xs font-semibold text-slate-300">History</div>
          {history.length === 0 ? <p className="text-xs text-slate-500">No allocations yet.</p> : (
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.id} className="rounded border border-slate-800 px-2 py-1 text-xs text-slate-300">
                  <span className="text-slate-500">{fmtDate(h.started_on)} – {h.ended_on ? fmtDate(h.ended_on) : "now"}</span>
                  {" · "}{athName(h.athlete_id) ?? h.holder_name ?? "spare"}
                  {h.gps_hire_id ? <span className="text-slate-500"> · {hireName(h.gps_hire_id)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}
