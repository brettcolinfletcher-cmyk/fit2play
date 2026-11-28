"use client";

import { useState } from "react";
import { formatDisplayDate } from "@/lib/dateDisplay";
import { supabase } from "@/lib/supabaseClient";
import { EXTERNAL_NAME_MAX, sessionNote } from "@/lib/gpsMetrics";

export type GpsSessionRow = {
  id: string;
  session_date: string | null;
  test_sub_type: string | null;
  session_name?: string | null;
  external_name?: string | null;
  distance: number | null;
  topSpeed: number | null;
  pctMv: number | null;
};

/** GPS sessions in range, newest first, with an editable name (e.g. "Match v Subiaco"). */
export default function GpsSessionList({
  rows,
  onRenamed,
}: {
  rows: GpsSessionRow[];
  onRenamed: (id: string, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());

  async function save(r: GpsSessionRow) {
    const draft = drafts[r.id];
    if (draft === undefined) return;
    const name = draft.trim() || null;
    if (name === (r.session_name ?? null)) return;
    setSaving(r.id);
    setError(null);
    const { error: e } = await supabase.from("sessions").update({ session_name: name }).eq("id", r.id);
    setSaving(null);
    if (e) {
      setError(/session_name/.test(e.message) ? "Session names need a database update before they can be saved." : e.message);
      return;
    }
    onRenamed(r.id, name);
  }

  const sorted = [...rows].sort((a, b) => ((a.session_date ?? "") < (b.session_date ?? "") ? 1 : -1));

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          GPS sessions <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">{rows.length} in range · name them here</span>
        </span>
        <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-4 pb-3">
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase tracking-wide text-slate-400">
                <th className="py-1.5 font-medium">Date</th>
                <th className="py-1.5 font-medium">Type</th>
                <th className="py-1.5 font-medium">Name</th>
                <th className="py-1.5 text-right font-medium">Distance</th>
                <th className="py-1.5 text-right font-medium">Top speed</th>
                <th className="py-1.5 text-right font-medium">% MV</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-1.5 tabular-nums text-slate-600">{formatDisplayDate(r.session_date)}</td>
                  <td className="py-1.5 text-slate-500">{r.test_sub_type ?? "—"}</td>
                  <td className="py-1.5">
                    <input
                      value={drafts[r.id] ?? r.session_name ?? ""}
                      placeholder={
                        (r.external_name && r.external_name.length <= EXTERNAL_NAME_MAX ? r.external_name : null) ||
                        (r.test_sub_type === "Match" ? "Match v …" : "Training session")
                      }
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                      onBlur={() => void save(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      disabled={saving === r.id}
                      className="w-full max-w-xs rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none"
                    />
                    {sessionNote(r) ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenNotes((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          })
                        }
                        className={`mt-0.5 block max-w-md px-1.5 text-left text-[0.7rem] text-slate-400 hover:text-slate-600 ${
                          openNotes.has(r.id) ? "whitespace-normal" : "truncate"
                        }`}
                        title={openNotes.has(r.id) ? "Collapse note" : "Show full note"}
                      >
                        Note: {sessionNote(r)}
                      </button>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {r.distance != null ? `${Math.round(r.distance).toLocaleString("en-AU")} m` : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {r.topSpeed != null ? `${r.topSpeed.toFixed(1)} km/h` : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">{r.pctMv != null ? `${Math.round(r.pctMv)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
