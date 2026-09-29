"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TEST_CATALOGUE, type TestKey } from "@/lib/testCatalogue";

type Protocol = { id: string; name: string };
type ProtocolTest = { protocol_id: string; test_key: TestKey };

/**
 * Per-athlete protocol editor. The athlete either inherits their team's
 * protocol or has one set directly, then individual tests can be ticked on or
 * off. Differences from the protocol are stored as add/remove overrides, so a
 * later change to the protocol itself still flows through.
 */
export default function AthleteProtocolEditor({ athleteId }: { athleteId: string }) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [protocolTests, setProtocolTests] = useState<ProtocolTest[]>([]);
  const [team, setTeam] = useState<{ name: string; protocol_id: string | null } | null>(null);
  const [ownProtocolId, setOwnProtocolId] = useState<string>("");
  const [checked, setChecked] = useState<Set<TestKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const effectiveProtocolId = ownProtocolId || team?.protocol_id || "";

  const baseTests = useMemo(
    () =>
      new Set(
        protocolTests.filter((t) => t.protocol_id === effectiveProtocolId).map((t) => t.test_key)
      ),
    [protocolTests, effectiveProtocolId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [pRes, ptRes, aRes, tRes, oRes] = await Promise.all([
        supabase.from("test_protocols").select("id, name").order("sort_order"),
        supabase.from("protocol_tests").select("protocol_id, test_key"),
        supabase.from("athletes").select("protocol_id").eq("id", athleteId).maybeSingle(),
        supabase
          .from("athlete_teams")
          .select("joined_at, teams(name, protocol_id)")
          .eq("athlete_id", athleteId)
          .order("joined_at", { ascending: true }),
        supabase
          .from("athlete_protocol_overrides")
          .select("test_key, action")
          .eq("athlete_id", athleteId),
      ]);
      if (cancelled) return;

      const firstErr = pRes.error || ptRes.error || aRes.error || tRes.error || oRes.error;
      if (firstErr) {
        setMessage({ tone: "error", text: firstErr.message });
        setLoading(false);
        return;
      }

      const pts = (ptRes.data ?? []) as ProtocolTest[];
      type TeamJoin = { teams: { name: string; protocol_id: string | null } | null };
      const teams = ((tRes.data ?? []) as unknown as TeamJoin[])
        .map((r) => r.teams)
        .filter((t): t is { name: string; protocol_id: string | null } => !!t);
      const teamPick = teams.find((t) => t.protocol_id) ?? teams[0] ?? null;
      const own = (aRes.data?.protocol_id as string | null) ?? "";
      const effective = own || teamPick?.protocol_id || "";

      const base = new Set(pts.filter((t) => t.protocol_id === effective).map((t) => t.test_key));
      for (const o of (oRes.data ?? []) as { test_key: TestKey; action: "add" | "remove" }[]) {
        if (o.action === "add") base.add(o.test_key);
        else base.delete(o.test_key);
      }

      setProtocols((pRes.data ?? []) as Protocol[]);
      setProtocolTests(pts);
      setTeam(teamPick);
      setOwnProtocolId(own);
      setChecked(base);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  function changeProtocol(next: string) {
    setOwnProtocolId(next);
    const eff = next || team?.protocol_id || "";
    // Switching protocol resets the ticks to that protocol's tests.
    setChecked(
      new Set(protocolTests.filter((t) => t.protocol_id === eff).map((t) => t.test_key))
    );
    setMessage(null);
  }

  function toggle(key: TestKey) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const { error: aErr } = await supabase
        .from("athletes")
        .update({ protocol_id: ownProtocolId || null })
        .eq("id", athleteId);
      if (aErr) throw new Error(aErr.message);

      const { error: dErr } = await supabase
        .from("athlete_protocol_overrides")
        .delete()
        .eq("athlete_id", athleteId);
      if (dErr) throw new Error(dErr.message);

      const rows = TEST_CATALOGUE.flatMap((t) => {
        const inBase = baseTests.has(t.key);
        const on = checked.has(t.key);
        if (on && !inBase) return [{ athlete_id: athleteId, test_key: t.key, action: "add" }];
        if (!on && inBase) return [{ athlete_id: athleteId, test_key: t.key, action: "remove" }];
        return [];
      });
      if (rows.length > 0) {
        const { error: iErr } = await supabase.from("athlete_protocol_overrides").insert(rows);
        if (iErr) throw new Error(iErr.message);
      }
      setMessage({ tone: "ok", text: "Protocol saved" });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="mt-8 text-xs text-slate-500">Loading protocol…</p>;

  const teamProtocolName = protocols.find((p) => p.id === team?.protocol_id)?.name ?? null;
  const modified = TEST_CATALOGUE.some((t) => baseTests.has(t.key) !== checked.has(t.key));

  return (
    <div className="mt-8 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm shadow-xl shadow-lime-400/10">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Testing protocol</h2>
        <p className="mt-1 text-xs text-slate-400">
          Controls which tests, dials and dashboard sections this athlete sees.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400">Protocol</label>
        <select
          value={ownProtocolId}
          onChange={(e) => changeProtocol(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">
            {team
              ? `Inherit from ${team.name}${teamProtocolName ? ` (${teamProtocolName})` : " (none set)"}`
              : "None (show all tests)"}
          </option>
          {protocols.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-400">
          Tests {modified ? <span className="text-amber-400">(modified from protocol)</span> : null}
        </p>
        <div className="mt-2 space-y-1.5">
          {TEST_CATALOGUE.map((t) => {
            const on = checked.has(t.key);
            const inBase = baseTests.has(t.key);
            return (
              <label key={t.key} className="flex cursor-pointer items-center gap-2 text-slate-200">
                <input type="checkbox" checked={on} onChange={() => toggle(t.key)} />
                <span>{t.label}</span>
                {on && !inBase ? <span className="text-[11px] text-amber-400">added</span> : null}
                {!on && inBase ? <span className="text-[11px] text-amber-400">removed</span> : null}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save protocol"}
        </button>
        {modified ? (
          <button
            type="button"
            onClick={() => setChecked(new Set(baseTests))}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Reset to protocol
          </button>
        ) : null}
        {message ? (
          <span className={message.tone === "ok" ? "text-xs text-lime-300" : "text-xs text-rose-400"}>
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
