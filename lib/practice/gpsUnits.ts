"use client";

import { supabase } from "@/lib/supabaseClient";
import { perthToday } from "@/lib/practice/billing";
import { rosterExportRows, type ExportUnit, type RosterRow } from "@/lib/practice/gpsRoster";
import { writeXlsx } from "@/lib/practice/xlsx";

/** Client-side GPS unit register actions (staff RLS). */

export type UnitRow = {
  id: string;
  unit_code: string;
  size: string | null;
  status: string;
  current_hire_id: string | null;
  current_athlete_id: string | null;
  current_holder_name: string | null;
  notes: string | null;
};
export const UNIT_COLS = "id, unit_code, size, status, current_hire_id, current_athlete_id, current_holder_name, notes";

export type ImportItem = {
  row: RosterRow;
  unitId: string | null;
  athleteId: string | null; // resolved (matched or chosen)
  createAthlete: boolean; // create a new athlete from the row
  hireId: string | null;
};

export type ImportResult = { created: number; moved: number; unchanged: number; athletesCreated: number; errors: string[] };

/**
 * Apply a reviewed roster import. Per unit: create if new, update size, and when the
 * holder or hire changes, close the open assignment and open a new one.
 */
export async function applyRosterImport(orgId: string, profileId: string | null, items: ImportItem[]): Promise<ImportResult> {
  const today = perthToday();
  const res: ImportResult = { created: 0, moved: 0, unchanged: 0, athletesCreated: 0, errors: [] };
  const touchedHires = new Set<string>();

  for (const it of items) {
    const r = it.row;
    try {
      // athlete
      let athleteId = it.athleteId;
      if (!athleteId && it.createAthlete && (r.firstName || r.lastName)) {
        const { data, error } = await supabase
          .from("athletes")
          .insert({
            organisation_id: orgId,
            first_name: r.firstName || null,
            last_name: r.lastName || null,
            date_of_birth: r.dob,
            primary_sport: r.sport || null,
            sex: r.gender,
            level: r.level,
          })
          .select("id")
          .single();
        if (error) throw error;
        athleteId = data.id as string;
        res.athletesCreated++;
      }
      const holderName = athleteId ? null : `${r.firstName} ${r.lastName}`.trim() || null;

      // unit
      let unit: UnitRow | null = null;
      let isNew = false;
      if (it.unitId) {
        const { data } = await supabase.from("gps_units").select(UNIT_COLS).eq("id", it.unitId).single();
        unit = (data as UnitRow) ?? null;
      }
      if (!unit) {
        const { data, error } = await supabase
          .from("gps_units")
          .insert({ organisation_id: orgId, unit_code: r.unitCode, size: r.size || null, status: "available" })
          .select(UNIT_COLS)
          .single();
        if (error) throw error;
        unit = data as UnitRow;
        isNew = true;
        res.created++;
      } else if (r.size && r.size !== unit.size) {
        await supabase.from("gps_units").update({ size: r.size, updated_at: new Date().toISOString() }).eq("id", unit.id);
      }

      const same =
        (unit.current_hire_id ?? null) === (it.hireId ?? null) &&
        (unit.current_athlete_id ?? null) === (athleteId ?? null) &&
        (unit.current_holder_name ?? "").toLowerCase() === (holderName ?? "").toLowerCase();
      if (same && (unit.status !== "available" || (!it.hireId && !athleteId && !holderName))) {
        if (!isNew) res.unchanged++;
        continue;
      }

      if (unit.current_hire_id) touchedHires.add(unit.current_hire_id);
      if (it.hireId) touchedHires.add(it.hireId);

      await supabase.from("gps_unit_assignments").update({ ended_on: today }).eq("unit_id", unit.id).is("ended_on", null);
      if (it.hireId || athleteId || holderName) {
        const { error: ae } = await supabase.from("gps_unit_assignments").insert({
          organisation_id: orgId,
          unit_id: unit.id,
          gps_hire_id: it.hireId,
          athlete_id: athleteId,
          holder_name: holderName,
          started_on: today,
          note: "Roster import",
          created_by: profileId,
        });
        if (ae) throw ae;
      }
      const { error: ue } = await supabase
        .from("gps_units")
        .update({
          current_hire_id: it.hireId,
          current_athlete_id: athleteId,
          current_holder_name: holderName,
          status: it.hireId || athleteId || holderName ? "hired" : unit.status === "hired" ? "available" : unit.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", unit.id);
      if (ue) throw ue;
      if (!isNew) res.moved++;
    } catch (e) {
      res.errors.push(`Row ${r.line} (${r.unitCode || "no unit"}): ${(e as { message?: string })?.message ?? "failed"}`);
    }
  }

  await recountHires([...touchedHires]);
  for (const h of touchedHires) {
    await supabase.from("gps_hire_followups").insert({ organisation_id: orgId, gps_hire_id: h, created_by: profileId, note: "Unit allocation updated from roster upload" });
  }
  return res;
}

/** Set gps_hires.units_count to the number of register units currently on each hire. */
export async function recountHires(hireIds: string[]): Promise<void> {
  for (const id of hireIds) {
    const { count } = await supabase.from("gps_units").select("id", { count: "exact", head: true }).eq("current_hire_id", id);
    if (count != null) await supabase.from("gps_hires").update({ units_count: count, updated_at: new Date().toISOString() }).eq("id", id);
  }
}

/** Return a unit to stock (closes its assignment). */
export async function returnUnit(orgId: string, unitId: string, hireId: string | null): Promise<void> {
  await supabase.from("gps_unit_assignments").update({ ended_on: perthToday() }).eq("unit_id", unitId).is("ended_on", null);
  await supabase
    .from("gps_units")
    .update({ current_hire_id: null, current_athlete_id: null, current_holder_name: null, status: "available", updated_at: new Date().toISOString() })
    .eq("id", unitId)
    .eq("organisation_id", orgId);
  if (hireId) await recountHires([hireId]);
}

/** Download the PlayerData roster for one hire (or every allocated unit when hireId is null). */
export async function downloadRoster(orgId: string, hireId: string | null, fileLabel: string): Promise<void> {
  let q = supabase
    .from("gps_units")
    .select("unit_code, size, current_holder_name, gps_hires:current_hire_id(client_name), athletes:current_athlete_id(first_name, last_name, date_of_birth, primary_sport, sex, level)")
    .eq("organisation_id", orgId);
  q = hireId ? q.eq("current_hire_id", hireId) : q.not("current_hire_id", "is", null);
  const { data, error } = await q;
  if (error) throw error;
  type Raw = {
    unit_code: string;
    size: string | null;
    current_holder_name: string | null;
    gps_hires: { client_name: string } | { client_name: string }[] | null;
    athletes: ExportUnit["athlete"] | ExportUnit["athlete"][] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (!v ? null : Array.isArray(v) ? v[0] ?? null : v);
  const units: ExportUnit[] = ((data ?? []) as unknown as Raw[]).map((u) => ({
    unit_code: u.unit_code,
    size: u.size,
    hire_name: one(u.gps_hires)?.client_name ?? null,
    athlete: one(u.athletes),
    holder_name: u.current_holder_name,
  }));
  const blob = await writeXlsx(rosterExportRows(units), { headerRow: 2, titleRow: 0, sheetName: "Sheet1", colWidths: [3, 13, 16, 14, 12, 14, 10, 14, 22] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PlayerData_roster_${fileLabel.replace(/[^a-z0-9]+/gi, "_")}_${perthToday()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
