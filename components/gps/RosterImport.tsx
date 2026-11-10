"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabaseClient";
import { readXlsx } from "@/lib/practice/xlsx";
import {
  changeFor, holderLabel, parseRoster, planRoster,
  type AthleteLite, type Change, type HireLite, type Membership, type PlanRow, type RosterRow, type TeamLite, type UnitLite,
} from "@/lib/practice/gpsRoster";
import { applyRosterImport, UNIT_COLS, type ImportResult } from "@/lib/practice/gpsUnits";

/**
 * Drag-and-drop PlayerData roster upload for the GPS hire page.
 * Parses the file in the browser, shows a preview with per-row player and hire
 * choices, and only writes when the user confirms.
 */

const CHANGE_STYLE: Record<Change, string> = {
  new: "bg-lime-500/20 text-lime-200",
  assign: "bg-sky-500/20 text-sky-200",
  reassign: "bg-amber-500/20 text-amber-200",
  unassign: "bg-rose-500/20 text-rose-200",
  none: "bg-slate-700/50 text-slate-400",
};
const CHANGE_LABEL: Record<Change, string> = { new: "new unit", assign: "assign", reassign: "change", unassign: "unassign", none: "no change" };

type Ctx = { units: UnitLite[]; memberships: Membership[] };
type Override = { athleteId?: string | null; hireId?: string | null };

export default function RosterImport({ orgId, profileId, hires, teams, athletes, onDone }: {
  orgId: string | null;
  profileId: string | null;
  hires: HireLite[];
  teams: TeamLite[];
  athletes: AthleteLite[];
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; rows: RosterRow[]; warnings: string[] } | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [defaultHire, setDefaultHire] = useState("");
  const [createMissing, setCreateMissing] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  async function readFile(f: File) {
    setErr(null); setResult(null); setBusy(true);
    try {
      let grid: string[][];
      if (/\.csv$/i.test(f.name)) {
        const text = await f.text();
        grid = (Papa.parse<string[]>(text, { skipEmptyLines: false }).data ?? []).map((r) => r.map((c) => String(c ?? "").trim()));
      } else if (/\.xlsx$/i.test(f.name)) {
        grid = await readXlsx(await f.arrayBuffer());
      } else {
        throw new Error("Use an .xlsx or .csv file. Older .xls files need saving as .xlsx first.");
      }
      const parsed = parseRoster(grid);
      if (!parsed.rows.length) throw new Error(parsed.warnings[0] ?? "No rows found.");
      if (!orgId) throw new Error("No organisation.");
      const [{ data: u, error: ue }, { data: m }] = await Promise.all([
        supabase.from("gps_units").select(UNIT_COLS).eq("organisation_id", orgId),
        supabase.from("athlete_teams").select("athlete_id, team_id"),
      ]);
      if (ue) throw ue;
      setCtx({ units: (u ?? []) as UnitLite[], memberships: (m ?? []) as Membership[] });
      setOverrides({});
      setFile({ name: f.name, rows: parsed.rows, warnings: parsed.warnings });
    } catch (e) {
      setErr((e as { message?: string })?.message ?? "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  const plan: PlanRow[] = useMemo(() => {
    if (!file || !ctx) return [];
    return planRoster(file.rows, { units: ctx.units, hires, teams, athletes, memberships: ctx.memberships, defaultHireId: defaultHire || null });
  }, [file, ctx, hires, teams, athletes, defaultHire]);

  const resolved = plan.map((p) => {
    const o = overrides[p.row.line] ?? {};
    const athleteId = o.athleteId !== undefined ? o.athleteId : p.athlete.kind === "matched" ? p.athlete.id : null;
    const hireId = o.hireId !== undefined ? o.hireId : p.hireId;
    const name = holderLabel(p.row);
    const willCreate = !athleteId && createMissing && p.athlete.kind === "none" && !!name;
    const sizeChanged = !!p.unit && !!p.row.size && p.unit.size !== p.row.size;
    const change = p.skip ? null : changeFor(p.unit, { hireId, athleteId, holderName: athleteId ? null : name || null }, sizeChanged);
    return { p, athleteId, hireId, willCreate, change };
  });
  const actionable = resolved.filter((r) => r.change && r.change !== "none");
  const skipped = resolved.filter((r) => r.p.skip);
  const ambiguousLeft = resolved.filter((r) => !r.p.skip && r.p.athlete.kind === "ambiguous" && !r.athleteId && overrides[r.p.row.line]?.athleteId === undefined);
  const openHires = hires.filter((h) => h.status !== "ended");
  const athleteLabel = (id: string) => {
    const a = athletes.find((x) => x.id === id);
    return a ? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() + (a.date_of_birth ? ` (${a.date_of_birth})` : "") : id;
  };

  async function apply() {
    if (!orgId || !ctx) return;
    setBusy(true); setErr(null);
    const items = resolved
      .filter((r) => r.change && r.change !== "none")
      .map((r) => ({ row: r.p.row, unitId: r.p.unit?.id ?? null, athleteId: r.athleteId, createAthlete: r.willCreate, hireId: r.hireId }));
    const res = await applyRosterImport(orgId, profileId, items);
    setBusy(false);
    setResult(res);
    setFile(null);
    onDone();
  }

  const sel = "rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-200";

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void readFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={`mt-5 cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${over ? "border-lime-400 bg-lime-400/10" : "border-slate-700 hover:border-slate-500"}`}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
        <div className="text-sm font-medium text-slate-200">{busy ? "Reading…" : "Drop a PlayerData roster here"}</div>
        <div className="mt-0.5 text-xs text-slate-500">.xlsx or .csv · Unit ID, Last Name, Name, DOB, Sport, Gender, Level · optional Hired to, Size · you&apos;ll see a preview before anything changes</div>
      </div>
      {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
      {result ? (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
          Roster applied: {result.created} new unit{result.created === 1 ? "" : "s"}, {result.moved} changed, {result.unchanged} unchanged
          {result.athletesCreated ? `, ${result.athletesCreated} athlete${result.athletesCreated === 1 ? "" : "s"} created` : ""}.
          {result.errors.length ? <div className="mt-1 text-rose-300">{result.errors.join(" · ")}</div> : null}
          <button type="button" onClick={() => setResult(null)} className="ml-2 text-slate-500 hover:text-slate-300">dismiss</button>
        </div>
      ) : null}

      {file ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setFile(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-100">Review roster upload</h2>
              <span className="text-xs text-slate-400">{file.name} · {file.rows.length} rows</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <label className="flex items-center gap-2">
                Rows with no hire found go to
                <select value={defaultHire} onChange={(e) => setDefaultHire(e.target.value)} className={sel}>
                  <option value="">Stock (no hire)</option>
                  {openHires.map((h) => <option key={h.id} value={h.id}>{h.client_name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} className="accent-lime-400" />
                Create athletes for players not in the system
              </label>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Hire is taken from the Hired to column, then the player&apos;s team, then where the unit already is. Units not in the file are left as they are.
            </p>

            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-slate-800 text-left uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1.5">Row</th>
                    <th className="px-2 py-1.5">Unit</th>
                    <th className="px-2 py-1.5">Size</th>
                    <th className="px-2 py-1.5">Player</th>
                    <th className="px-2 py-1.5">Hire</th>
                    <th className="px-2 py-1.5">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map(({ p, athleteId, hireId, willCreate, change }) => {
                    const name = holderLabel(p.row);
                    const unitHire = p.unit?.current_hire_id ? hires.find((h) => h.id === p.unit!.current_hire_id)?.client_name : null;
                    return (
                      <tr key={p.row.line} className={`border-b border-slate-800/60 ${p.skip ? "opacity-50" : ""}`}>
                        <td className="px-2 py-1.5 text-slate-500">{p.row.line}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-200">{p.row.unitCode || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-300">{p.row.size || p.unit?.size || ""}</td>
                        <td className="px-2 py-1.5 text-slate-200">
                          {p.athlete.kind === "empty" ? <span className="text-slate-500">spare</span>
                            : p.athlete.kind === "ambiguous" ? (
                              <select value={athleteId ?? ""} onChange={(e) => setOverrides((o) => ({ ...o, [p.row.line]: { ...o[p.row.line], athleteId: e.target.value || null } }))} className={`${sel} border-amber-500/60`}>
                                <option value="">{name}: pick athlete…</option>
                                {p.athlete.ids.map((id) => <option key={id} value={id}>{athleteLabel(id)}</option>)}
                              </select>
                            ) : p.athlete.kind === "matched" ? <span>{name} <span className="text-lime-300">✓</span></span>
                            : <span>{name} <span className="text-slate-500">{willCreate ? "(new athlete)" : "(name only)"}</span></span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {p.skip ? null : (
                            <select value={hireId ?? ""} onChange={(e) => setOverrides((o) => ({ ...o, [p.row.line]: { ...o[p.row.line], hireId: e.target.value || null } }))} className={sel}>
                              <option value="">Stock (no hire)</option>
                              {openHires.map((h) => <option key={h.id} value={h.id}>{h.client_name}</option>)}
                            </select>
                          )}
                          {unitHire && unitHire !== hires.find((h) => h.id === hireId)?.client_name ? <div className="text-[10px] text-slate-500">now: {unitHire}</div> : null}
                        </td>
                        <td className="px-2 py-1.5">
                          {p.skip ? <span className="text-rose-300">{p.issues.join("; ")}</span> : (
                            <>
                              {change ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CHANGE_STYLE[change]}`}>{CHANGE_LABEL[change]}</span> : null}
                              {p.issues.length ? <div className="text-[10px] text-amber-300">{p.issues.join("; ")}</div> : null}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {file.warnings.length ? <p className="mt-2 text-xs text-amber-300">{file.warnings.join(" · ")}</p> : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {actionable.length} change{actionable.length === 1 ? "" : "s"}
                {skipped.length ? ` · ${skipped.length} row${skipped.length === 1 ? "" : "s"} skipped` : ""}
                {ambiguousLeft.length ? ` · ${ambiguousLeft.length} player${ambiguousLeft.length === 1 ? "" : "s"} to pick (saved as name only if left)` : ""}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setFile(null)} disabled={busy} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button type="button" onClick={() => void apply()} disabled={busy || actionable.length === 0} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">
                  {busy ? "Applying…" : `Apply ${actionable.length} change${actionable.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
