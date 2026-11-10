"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fmtDate, perthToday } from "@/lib/practice/billing";
import { deleteAssignment, deleteUnit, reassignUnit, recountHires, returnUnit, UNIT_COLS, type UnitRow } from "@/lib/practice/gpsUnits";

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

export default function UnitRegister({ orgId, profileId, hires, athletes, refreshKey, onChanged }: {
  orgId: string | null;
  profileId: string | null;
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
          profileId={profileId}
          hires={hires}
          athletes={athletes}
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

function UnitDetail({ unit, orgId, profileId, hires, athletes, hireName, athName, holder, onClose, onChanged }: {
  unit: UnitRow; orgId: string | null; profileId: string | null; hires: HireLite[]; athletes: AthleteLite[];
  hireName: (id: string | null) => string | null; athName: (id: string | null) => string | null;
  holder: string; onClose: () => void; onChanged: () => void;
}) {
  const [history, setHistory] = useState<Assignment[]>([]);
  const [size, setSize] = useState(unit.size ?? "");
  const [notes, setNotes] = useState(unit.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // allocation editor
  const [hireSel, setHireSel] = useState(unit.current_hire_id ?? "");
  const [athleteId, setAthleteId] = useState<string | null>(unit.current_athlete_id);
  const [holderName, setHolderName] = useState(unit.current_athlete_id ? "" : unit.current_holder_name ?? "");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(perthToday());
  // confirmations
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLine, setConfirmLine] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("gps_unit_assignments")
      .select("id, gps_hire_id, athlete_id, holder_name, started_on, ended_on, note")
      .eq("unit_id", unit.id)
      .order("started_on", { ascending: false })
      .order("created_at", { ascending: false });
    setHistory((data ?? []) as Assignment[]);
  }, [unit.id]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return athletes.filter((a) => `${a.first_name ?? ""} ${a.last_name ?? ""}`.toLowerCase().includes(q)).slice(0, 6);
  }, [search, athletes]);

  const allocChanged =
    (hireSel || null) !== (unit.current_hire_id ?? null) ||
    (athleteId ?? null) !== (unit.current_athlete_id ?? null) ||
    (!athleteId && holderName.trim() !== (unit.current_holder_name ?? ""));

  async function saveAllocation() {
    if (!orgId) return;
    setBusy(true); setErr(null); setMsg(null);
    const r = await reassignUnit(orgId, profileId, unit, { hireId: hireSel || null, athleteId, holderName: athleteId ? null : holderName, startedOn: fromDate || null });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setMsg("Allocation updated.");
    await loadHistory();
    onChanged();
  }
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
    await loadHistory();
    onChanged();
  }
  async function saveDetails() {
    setBusy(true); setErr(null);
    const code = unit.unit_code;
    const { error } = await supabase.from("gps_units").update({ size: size.trim() || null, notes: notes.trim() || null, updated_at: new Date().toISOString() }).eq("id", unit.id);
    if (unit.current_hire_id) await recountHires([unit.current_hire_id]);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg(`${code} saved.`);
    onChanged();
  }
  async function removeUnit() {
    setBusy(true); setErr(null);
    const r = await deleteUnit(unit);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onChanged();
    onClose();
  }
  async function removeLine(a: Assignment) {
    setBusy(true); setErr(null);
    const r = await deleteAssignment(unit, a);
    setBusy(false);
    setConfirmLine(null);
    if (r.error) { setErr(r.error); return; }
    await loadHistory();
    onChanged();
  }

  const inp = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200";
  const openHires = hires.filter((h) => h.status !== "ended" || h.id === unit.current_hire_id);
  const linkedName = athName(athleteId);

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

        {/* Allocation */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <div className="text-xs font-semibold text-slate-300">Allocation</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400">Hire</label>
              <select value={hireSel} onChange={(e) => setHireSel(e.target.value)} className={inp}>
                <option value="">Stock (no hire)</option>
                {openHires.map((h) => <option key={h.id} value={h.id}>{h.client_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400">Player</label>
              {athleteId ? (
                <div className="mt-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 text-xs text-lime-200">
                    {linkedName ?? "Athlete"}
                    <button type="button" onClick={() => { setAthleteId(null); setSearch(""); }} className="text-lime-400 hover:text-rose-300">×</button>
                  </span>
                </div>
              ) : (
                <>
                  <input value={search || holderName} onChange={(e) => { setSearch(e.target.value); setHolderName(e.target.value); }} placeholder="Search athlete or type a name" className={inp} />
                  {matches.length ? (
                    <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/90 p-1">
                      {matches.map((a) => (
                        <button key={a.id} type="button" onClick={() => { setAthleteId(a.id); setSearch(""); setHolderName(""); }} className="flex w-full rounded px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-800">
                          {`${a.first_name ?? ""} ${a.last_name ?? ""}`.trim()}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Leave Player blank for a spare unit. Saving adds a line to the history below.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              From
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200" />
            </label>
            <button type="button" onClick={() => void saveAllocation()} disabled={busy || !allocChanged} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-3 py-1.5 text-xs text-lime-200 hover:bg-lime-500/25 disabled:opacity-40">Save allocation</button>
            {unit.current_hire_id ? (
              <button type="button" onClick={() => void returnToStock()} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Returned to stock</button>
            ) : null}
          </div>
        </div>

        {/* Details + status */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-slate-400">Size</label><input value={size} onChange={(e) => setSize(e.target.value)} className={inp} /></div>
          <div className="col-span-2"><label className="block text-xs text-slate-400">Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. strap replaced" className={inp} /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveDetails()} disabled={busy} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-3 py-1.5 text-xs text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">Save details</button>
          {unit.status !== "maintenance" ? <button type="button" onClick={() => void setStatus("maintenance")} disabled={busy} className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">Maintenance</button> : null}
          {unit.status !== "lost" ? <button type="button" onClick={() => void setStatus("lost")} disabled={busy} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10">Lost</button> : null}
          {unit.status !== "retired" ? <button type="button" onClick={() => void setStatus("retired")} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Retire</button> : null}
          {["maintenance", "lost", "retired"].includes(unit.status) ? <button type="button" onClick={() => void setStatus("available")} disabled={busy} className="rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/10">Back in service</button> : null}
        </div>

        {/* History */}
        <div className="mt-5">
          <div className="mb-1 text-xs font-semibold text-slate-300">History</div>
          {history.length === 0 ? <p className="text-xs text-slate-500">No allocations yet.</p> : (
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 rounded border border-slate-800 px-2 py-1 text-xs text-slate-300">
                  <span className="min-w-0">
                    <span className="text-slate-500">{fmtDate(h.started_on)} – {h.ended_on ? fmtDate(h.ended_on) : "now"}</span>
                    {" · "}{athName(h.athlete_id) ?? h.holder_name ?? "spare"}
                    {h.gps_hire_id ? <span className="text-slate-500"> · {hireName(h.gps_hire_id)}</span> : null}
                  </span>
                  {confirmLine === h.id ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[10px] text-rose-300">{h.ended_on ? "Delete line?" : "Delete and return to stock?"}</span>
                      <button type="button" onClick={() => void removeLine(h)} disabled={busy} className="rounded border border-rose-500/50 px-1.5 text-[10px] text-rose-200 hover:bg-rose-500/10">Yes</button>
                      <button type="button" onClick={() => setConfirmLine(null)} className="text-[10px] text-slate-400 hover:text-slate-200">No</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmLine(h.id)} title="Delete this line" className="shrink-0 text-slate-500 hover:text-rose-300">×</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {msg ? <p className="mt-3 text-xs text-slate-300">{msg}</p> : null}
        {err ? <p className="mt-3 text-xs text-rose-300">{err}</p> : null}

        <div className="mt-6 flex items-center justify-between gap-2">
          {confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-rose-300">Delete {unit.unit_code}{history.length ? ` and its ${history.length} history line${history.length === 1 ? "" : "s"}` : ""}?</span>
              <button type="button" onClick={() => void removeUnit()} disabled={busy} className="rounded-lg border border-rose-500/50 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/25">Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-slate-400 hover:text-slate-200">Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10">Delete unit</button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}
