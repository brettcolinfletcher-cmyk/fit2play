"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { staffAuthHeaders } from "@/lib/staffAuthHeaders";
import { normaliseName } from "@/lib/sync/playerdataMatch";

type Unmatched = {
  external_id: string;
  name: string;
  date_of_birth: string | null;
  club_name: string | null;
  reason: string | null;
  ignored: boolean;
};

type AthleteOpt = { id: string; first_name: string | null; last_name: string | null; date_of_birth: string | null };

/**
 * PlayerData athletes the sync couldn't match by name. Link to an existing
 * athlete, create a new one, or ignore. Their GPS sessions are skipped until
 * linked, so pull history after linking.
 */
export default function PlayerdataUnmatched({
  refreshKey,
  backfillBusy,
  onBackfill,
}: {
  refreshKey: number;
  backfillBusy: boolean;
  onBackfill: () => void;
}) {
  const [rows, setRows] = useState<Unmatched[]>([]);
  const [athletes, setAthletes] = useState<AthleteOpt[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkedThisVisit, setLinkedThisVisit] = useState(0);
  const [showIgnored, setShowIgnored] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/sync/playerdata/unmatched", { headers: await staffAuthHeaders() });
    const json = (await res.json()) as { unmatched?: Unmatched[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load unmatched athletes");
      return;
    }
    setRows(json.unmatched ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    void supabase
      .from("athletes")
      .select("id, first_name, last_name, date_of_birth")
      .neq("status", "archived")
      .order("last_name")
      .then(({ data }) => setAthletes((data ?? []) as AthleteOpt[]));
  }, []);

  /** Same first name floats to the top of the list. */
  const optionsFor = useMemo(
    () => (name: string) => {
      const first = normaliseName(name).split(" ")[0] ?? "";
      const label = (a: AthleteOpt) =>
        `${a.last_name ?? ""}, ${a.first_name ?? ""}${a.date_of_birth ? ` (${a.date_of_birth})` : ""}`;
      const likely = athletes.filter((a) => normaliseName(a.first_name ?? "") === first);
      const rest = athletes.filter((a) => normaliseName(a.first_name ?? "") !== first);
      return { likely, rest, label };
    },
    [athletes]
  );

  async function act(externalId: string, action: "link" | "create" | "ignore" | "unignore") {
    setBusyId(externalId);
    setError(null);
    try {
      const res = await fetch("/api/sync/playerdata/unmatched", {
        method: "POST",
        headers: await staffAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ externalId, action, athleteId: choice[externalId] }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      if (action === "link" || action === "create") setLinkedThisVisit((n) => n + 1);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const visible = rows.filter((r) => showIgnored || !r.ignored);
  const ignoredCount = rows.filter((r) => r.ignored).length;
  if (rows.length === 0 && linkedThisVisit === 0 && !error) return null;

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-lime-700">
            PlayerData athletes to link
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            These names didn&apos;t match a Fit2Play athlete, so their GPS sessions are not imported yet.
          </p>
        </div>
        {linkedThisVisit > 0 ? (
          <button
            type="button"
            disabled={backfillBusy}
            onClick={onBackfill}
            className="rounded-full bg-lime-600 px-4 py-2 text-xs font-semibold text-white hover:bg-lime-700 disabled:opacity-50"
          >
            {backfillBusy ? "Pulling…" : "Pull last 12 months for linked athletes"}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}

      {visible.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">All PlayerData athletes are linked.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {visible.map((r) => {
            const { likely, rest, label } = optionsFor(r.name);
            const busy = busyId === r.external_id;
            return (
              <li key={r.external_id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-[12rem] flex-1">
                  <p className={`font-medium ${r.ignored ? "text-slate-400" : "text-slate-800"}`}>{r.name}</p>
                  <p className="text-xs text-slate-400">
                    {[r.date_of_birth ? `DOB ${r.date_of_birth}` : null, r.club_name, r.reason].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {r.ignored ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(r.external_id, "unignore")}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-slate-300"
                  >
                    Stop ignoring
                  </button>
                ) : (
                  <>
                    <select
                      value={choice[r.external_id] ?? ""}
                      onChange={(e) => setChoice((c) => ({ ...c, [r.external_id]: e.target.value }))}
                      className="max-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      <option value="">Choose athlete…</option>
                      {likely.length ? (
                        <optgroup label="Same first name">
                          {likely.map((a) => (
                            <option key={a.id} value={a.id}>{label(a)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      <optgroup label="All athletes">
                        {rest.map((a) => (
                          <option key={a.id} value={a.id}>{label(a)}</option>
                        ))}
                      </optgroup>
                    </select>
                    <button
                      type="button"
                      disabled={busy || !choice[r.external_id]}
                      onClick={() => void act(r.external_id, "link")}
                      className="rounded-full border border-lime-500 px-3 py-1 text-xs font-semibold text-lime-700 hover:bg-lime-50 disabled:opacity-40"
                    >
                      Link
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(r.external_id, "create")}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-300"
                    >
                      Create athlete
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(r.external_id, "ignore")}
                      className="rounded-full px-3 py-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      Ignore
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {ignoredCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowIgnored((v) => !v)}
          className="mt-3 text-xs text-slate-400 hover:text-slate-600"
        >
          {showIgnored ? "Hide ignored" : `Show ${ignoredCount} ignored`}
        </button>
      ) : null}
    </div>
  );
}
