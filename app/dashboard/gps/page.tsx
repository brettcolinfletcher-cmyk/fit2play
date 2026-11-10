"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import PracticeSidebar from "@/components/PracticeSidebar";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";
import {
  addDaysISO, addMonthsISO, centsToInput, fmtDate, hireBillingKind, hireFollowUps, hirePeriodCents, intervalLabel,
  money, parseMoney, perthToday, renewalPastAgreement, renewalPeriod, type FollowUp, type GpsHire,
} from "@/lib/practice/billing";
import { createInvoice, type InvoiceLineInput } from "@/lib/practice/invoicing";
import { downloadRoster } from "@/lib/practice/gpsUnits";
import RosterImport from "@/components/gps/RosterImport";
import UnitRegister from "@/components/gps/UnitRegister";

/**
 * GPS unit hire register.
 * - Hirers can be teams, athletes or anyone else.
 * - Billing: one-off fee, recurring subscription (flat or per unit), or both.
 * - Renewals raise an invoice for the next period and roll the renewal date forward.
 * - Follow-up list: renewals due/overdue, money owing, units not returned. Contact log per hire.
 */

const HIRE_COLS =
  "id, client_name, team_id, athlete_id, contact_name, contact_email, contact_phone, units_count, unit_refs, start_date, end_date, units_returned_date, status, one_off_fee_cents, subscription_cents, price_per_unit, interval_months, next_renewal_date, agreed_until, notes";

type AthleteLite = { id: string; first_name: string | null; last_name: string | null; date_of_birth: string | null };
type TeamLite = { id: string; name: string };
type HireInvoice = { id: string; invoice_number: string; gps_hire_id: string; status: string; total_cents: number; due_date: string | null; issued_date: string; period_start: string | null; period_end: string | null };
type FollowLog = { id: string; gps_hire_id: string; note: string; created_at: string };
type HirerKind = "team" | "athlete" | "other";
type Tab = "active" | "paused" | "ended" | "all";

function athleteName(a: AthleteLite): string { return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Athlete"; }
function hirerKind(h: Pick<GpsHire, "team_id" | "athlete_id">): HirerKind { return h.team_id ? "team" : h.athlete_id ? "athlete" : "other"; }
function planLabel(h: GpsHire): string {
  const parts: string[] = [];
  if ((h.one_off_fee_cents ?? 0) > 0) parts.push(`${money(h.one_off_fee_cents!)} one-off`);
  if ((h.subscription_cents ?? 0) > 0) parts.push(`${money(h.subscription_cents!)}${h.price_per_unit ? "/unit" : ""} per ${intervalLabel(h.interval_months)}`);
  return (parts.join(" + ") || "No charge") + (h.agreed_until ? ` · until ${fmtDate(h.agreed_until)}` : "");
}
function sevClass(s: number): string {
  return s === 3 ? "bg-rose-500/20 text-rose-200" : s === 2 ? "bg-amber-500/20 text-amber-200" : "bg-sky-500/20 text-sky-200";
}

export default function GpsHirePage() {
  const staffOk = useRequireDashboardStaff();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [hires, setHires] = useState<GpsHire[]>([]);
  const [invoices, setInvoices] = useState<HireInvoice[]>([]);
  const [paidById, setPaidById] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<FollowLog[]>([]);
  const [athletes, setAthletes] = useState<AthleteLite[]>([]);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [form, setForm] = useState<null | { editId?: string }>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [unitsKey, setUnitsKey] = useState(0);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const today = perthToday();

  async function exportAll() {
    if (!orgId) return;
    setExportErr(null);
    try { await downloadRoster(orgId, null, "all_hires"); } catch (e) { setExportErr((e as { message?: string })?.message ?? "Export failed."); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("id, organisation_id").eq("id", user.id).single();
    const org = (profile?.organisation_id as string) ?? null;
    setProfileId((profile?.id as string) ?? null);
    setOrgId(org);
    if (!org) { setLoading(false); return; }
    const [{ data: h, error: he }, { data: inv }, { data: lg }, { data: ath }, { data: tm }] = await Promise.all([
      supabase.from("gps_hires").select(HIRE_COLS).eq("organisation_id", org).order("client_name"),
      supabase.from("invoices").select("id, invoice_number, gps_hire_id, status, total_cents, due_date, issued_date, period_start, period_end").eq("organisation_id", org).not("gps_hire_id", "is", null).order("issued_date", { ascending: false }),
      supabase.from("gps_hire_followups").select("id, gps_hire_id, note, created_at").eq("organisation_id", org).order("created_at", { ascending: false }),
      supabase.from("athletes").select("id, first_name, last_name, date_of_birth").order("last_name"),
      supabase.from("teams").select("id, name").order("name"),
    ]);
    setLoadErr(he ? he.message : null);
    const invs = (inv ?? []) as HireInvoice[];
    setHires((h ?? []) as GpsHire[]);
    setInvoices(invs);
    setLogs((lg ?? []) as FollowLog[]);
    setAthletes((ath ?? []) as AthleteLite[]);
    setTeams((tm ?? []) as TeamLite[]);
    if (invs.length) {
      const { data: pay } = await supabase.from("payments").select("invoice_id, amount_cents").in("invoice_id", invs.map((i) => i.id));
      const paid: Record<string, number> = {};
      for (const p of pay ?? []) paid[p.invoice_id as string] = (paid[p.invoice_id as string] ?? 0) + Number(p.amount_cents);
      setPaidById(paid);
    } else setPaidById({});
    setLoading(false);
  }, []);

  useEffect(() => { if (staffOk) void load(); }, [staffOk, load]);

  const owingByHire = useMemo(() => {
    const m = new Map<string, { owingCents: number; oldestOverdueDue: string | null }>();
    for (const i of invoices) {
      if (i.status === "void") continue;
      const o = Math.max(0, i.total_cents - (paidById[i.id] ?? 0));
      if (o <= 0) continue;
      const cur = m.get(i.gps_hire_id) ?? { owingCents: 0, oldestOverdueDue: null };
      cur.owingCents += o;
      if (i.due_date && i.due_date < today && (!cur.oldestOverdueDue || i.due_date < cur.oldestOverdueDue)) cur.oldestOverdueDue = i.due_date;
      m.set(i.gps_hire_id, cur);
    }
    return m;
  }, [invoices, paidById, today]);

  const followUps = useMemo(() => {
    const m = new Map<string, FollowUp[]>();
    for (const h of hires) m.set(h.id, hireFollowUps(h, owingByHire.get(h.id) ?? { owingCents: 0, oldestOverdueDue: null }, today));
    return m;
  }, [hires, owingByHire, today]);

  const lastContact = useMemo(() => {
    const m = new Map<string, FollowLog>();
    for (const l of logs) if (!m.has(l.gps_hire_id)) m.set(l.gps_hire_id, l);
    return m;
  }, [logs]);

  const stats = useMemo(() => {
    const active = hires.filter((h) => h.status === "active");
    const units = hires.filter((h) => h.status !== "ended" || !h.units_returned_date).reduce((s, h) => s + (h.status === "ended" && h.units_returned_date ? 0 : h.units_count), 0);
    const monthly = active.reduce((s, h) => s + hirePeriodCents(h) / (h.interval_months || 1), 0);
    let owing = 0;
    for (const v of owingByHire.values()) owing += v.owingCents;
    return { active: active.length, units, monthly: Math.round(monthly), owing };
  }, [hires, owingByHire]);

  const chase = useMemo(
    () => hires
      .filter((h) => (followUps.get(h.id) ?? []).length > 0)
      .sort((a, b) => (followUps.get(b.id)![0].severity - followUps.get(a.id)![0].severity) || a.client_name.localeCompare(b.client_name)),
    [hires, followUps]
  );

  const shown = hires.filter((h) => tab === "all" || h.status === tab);

  if (!staffOk) return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <p className="text-xs text-slate-400">Checking access…</p>
    </main>
  );

  const detail = hires.find((h) => h.id === detailId) ?? null;

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-6xl px-4 pt-8 pb-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
          <aside className="w-full shrink-0 lg:w-48"><PracticeSidebar /></aside>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-50">GPS HIRE</h1>
                <p className="mt-1 text-sm text-slate-400">Units hired to teams and individuals, billing and renewals</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void exportAll()} className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800">Export roster</button>
                <button type="button" onClick={() => setForm({})} className="rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110">+ New hire</button>
              </div>
            </div>
            {exportErr ? <p className="mt-2 text-xs text-rose-300">{exportErr}</p> : null}

            {loadErr ? <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">Couldn&apos;t load GPS hire ({loadErr}). The database update for this page may not be applied yet.</p> : null}

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Active hires" value={String(stats.active)} />
              <Stat label="Units out" value={String(stats.units)} />
              <Stat label="Recurring / month" value={money(stats.monthly)} />
              <Stat label="Owing" value={money(stats.owing)} tone={stats.owing > 0 ? "warn" : undefined} />
            </div>

            <RosterImport
              orgId={orgId}
              profileId={profileId}
              hires={hires.map((h) => ({ id: h.id, client_name: h.client_name, team_id: h.team_id, status: h.status, start_date: h.start_date }))}
              teams={teams}
              athletes={athletes}
              onDone={() => { setUnitsKey((k) => k + 1); void load(); }}
            />

            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-slate-100">Needs follow-up</h2>
                <span className="text-xs text-slate-500">Renewals due or overdue, agreements ending within 14 days, money owing, units not returned</span>
              </div>
              {loading ? <p className="px-4 py-3 text-xs text-slate-500">Loading…</p> : chase.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-500">Nothing to chase right now.</p>
              ) : (
                <ul>
                  {chase.map((h) => {
                    const lc = lastContact.get(h.id);
                    return (
                      <li key={h.id} className="flex flex-wrap items-center gap-2 border-b border-slate-800/60 px-4 py-2 last:border-0">
                        <button type="button" onClick={() => setDetailId(h.id)} className="min-w-0 flex-1 text-left">
                          <div className="text-sm font-medium text-slate-100">{h.client_name}<KindTag kind={hirerKind(h)} /></div>
                          <div className="text-[11px] text-slate-500">
                            {h.contact_name ? `${h.contact_name} · ` : ""}{h.contact_phone ?? h.contact_email ?? "no contact details"}
                            {lc ? ` · last contact ${fmtDate(lc.created_at.slice(0, 10))}: ${lc.note}` : " · not contacted yet"}
                          </div>
                        </button>
                        <div className="flex flex-wrap gap-1">
                          {followUps.get(h.id)!.map((f) => (
                            <span key={f.reason} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${sevClass(f.severity)}`}>{f.label}</span>
                          ))}
                        </div>
                        <button type="button" onClick={() => setDetailId(h.id)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800">Open</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-6 flex overflow-hidden rounded-lg border border-slate-700 sm:w-fit">
              {(["active", "paused", "ended", "all"] as Tab[]).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 px-3 py-1 text-xs capitalize ${tab === t ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>{t}</button>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Hirer</th>
                    <th className="px-3 py-2 text-right">Units</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Next renewal</th>
                    <th className="px-3 py-2 text-right">Owing</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-xs text-slate-500">Loading…</td></tr>
                  ) : shown.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-xs text-slate-500">{hires.length ? "None in this view." : "No GPS hires yet."}</td></tr>
                  ) : shown.map((h) => {
                    const o = owingByHire.get(h.id)?.owingCents ?? 0;
                    const sub = (h.subscription_cents ?? 0) > 0;
                    const late = sub && h.status === "active" && h.next_renewal_date && h.next_renewal_date < today;
                    return (
                      <tr key={h.id} onClick={() => setDetailId(h.id)} className="cursor-pointer border-b border-slate-800/60 text-slate-200 hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-medium">{h.client_name}<KindTag kind={hirerKind(h)} /></td>
                        <td className="px-3 py-2 text-right">{h.units_count}</td>
                        <td className="px-3 py-2 text-xs text-slate-300">{planLabel(h)}</td>
                        <td className={`px-3 py-2 text-xs ${late ? "text-rose-300" : "text-slate-400"}`}>{sub && h.status === "active" ? fmtDate(h.next_renewal_date) : "—"}</td>
                        <td className="px-3 py-2 text-right">{o > 0 ? money(o) : "—"}</td>
                        <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${h.status === "active" ? "bg-lime-500/20 text-lime-200" : h.status === "paused" ? "bg-amber-500/20 text-amber-200" : "bg-slate-600/40 text-slate-300"}`}>{h.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <UnitRegister
              orgId={orgId}
              profileId={profileId}
              hires={hires.map((h) => ({ id: h.id, client_name: h.client_name, status: h.status }))}
              athletes={athletes}
              refreshKey={unitsKey}
              onChanged={() => void load()}
            />
          </div>
        </div>
      </section>

      {form ? (
        <HireForm
          editId={form.editId}
          hire={form.editId ? hires.find((h) => h.id === form.editId) ?? null : null}
          orgId={orgId}
          profileId={profileId}
          athletes={athletes}
          teams={teams}
          onClose={() => setForm(null)}
          onSaved={(id) => { setForm(null); setDetailId(id); void load(); }}
        />
      ) : null}
      {detail && !form ? (
        <HireDetail
          hire={detail}
          orgId={orgId}
          profileId={profileId}
          athletes={athletes}
          unitsKey={unitsKey}
          invoices={invoices.filter((i) => i.gps_hire_id === detail.id)}
          paidById={paidById}
          logs={logs.filter((l) => l.gps_hire_id === detail.id)}
          followUps={followUps.get(detail.id) ?? []}
          onEdit={() => setForm({ editId: detail.id })}
          onClose={() => setDetailId(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone === "warn" ? "text-amber-300" : "text-slate-100"}`}>{value}</div>
    </div>
  );
}
function KindTag({ kind }: { kind: HirerKind }) {
  return <span className="ml-1.5 rounded bg-slate-700/60 px-1 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-slate-300">{kind === "other" ? "client" : kind}</span>;
}

// ---- invoice builders --------------------------------------------------------

function oneOffLine(h: Pick<GpsHire, "units_count" | "one_off_fee_cents">, amount?: number, desc?: string): InvoiceLineInput {
  return { description: desc || `GPS hire, one-off fee (${h.units_count} unit${h.units_count === 1 ? "" : "s"})`, quantity: 1, unit_price_cents: amount ?? h.one_off_fee_cents ?? 0 };
}
function periodLine(h: GpsHire, start: string, end: string): InvoiceLineInput {
  const span = `${fmtDate(start)} – ${fmtDate(end)}`;
  return h.price_per_unit
    ? { description: `GPS hire subscription, per unit (${span})`, quantity: h.units_count, unit_price_cents: h.subscription_cents ?? 0 }
    : { description: `GPS hire subscription, ${h.units_count} unit${h.units_count === 1 ? "" : "s"} (${span})`, quantity: 1, unit_price_cents: h.subscription_cents ?? 0 };
}
function invoiceHeader(h: GpsHire, orgId: string, profileId: string | null) {
  return {
    organisation_id: orgId,
    created_by: profileId,
    client_name: h.client_name,
    client_email: h.contact_email,
    team_id: h.team_id,
    athlete_id: h.athlete_id,
    gps_hire_id: h.id,
  };
}

/** Raise the next subscription invoice and roll next_renewal_date forward. */
async function renewHire(h: GpsHire, orgId: string, profileId: string | null, includeOneOff = false): Promise<{ id?: string; error?: string }> {
  const today = perthToday();
  const p = renewalPeriod(h);
  const lines: InvoiceLineInput[] = [];
  if (includeOneOff && (h.one_off_fee_cents ?? 0) > 0) lines.push(oneOffLine(h));
  lines.push(periodLine(h, p.start, p.end));
  const r = await createInvoice(
    { ...invoiceHeader(h, orgId, profileId), period_start: p.start, period_end: p.end, due_date: p.start > today ? p.start : addDaysISO(today, 7) },
    lines
  );
  if ("error" in r) return { error: r.error };
  await supabase.from("gps_hires").update({ next_renewal_date: p.next, updated_at: new Date().toISOString() }).eq("id", h.id);
  const { data: inv } = await supabase.from("invoices").select("invoice_number").eq("id", r.id).single();
  await supabase.from("gps_hire_followups").insert({
    organisation_id: orgId, gps_hire_id: h.id, created_by: profileId,
    note: `Renewal invoice ${inv?.invoice_number ?? ""} raised for ${fmtDate(p.start)} – ${fmtDate(p.end)}`.replace("  ", " "),
  });
  return { id: r.id };
}

// ---- Create / edit -----------------------------------------------------------

function HireForm({ editId, hire, orgId, profileId, athletes, teams, onClose, onSaved }: {
  editId?: string; hire: GpsHire | null; orgId: string | null; profileId: string | null;
  athletes: AthleteLite[]; teams: TeamLite[]; onClose: () => void; onSaved: (id: string) => void;
}) {
  const isEdit = !!editId && !!hire;
  const today = perthToday();
  const [kind, setKind] = useState<HirerKind>(hire ? hirerKind(hire) : "team");
  const [teamId, setTeamId] = useState(hire?.team_id ?? "");
  const [athleteId, setAthleteId] = useState<string | null>(hire?.athlete_id ?? null);
  const [search, setSearch] = useState(() => {
    const a = hire?.athlete_id ? athletes.find((x) => x.id === hire.athlete_id) : null;
    return a ? athleteName(a) : "";
  });
  const [clientName, setClientName] = useState(hire && hirerKind(hire) === "other" ? hire.client_name : "");
  const [contactName, setContactName] = useState(hire?.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(hire?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(hire?.contact_phone ?? "");
  const [units, setUnits] = useState(String(hire?.units_count ?? 1));
  const [unitRefs, setUnitRefs] = useState(hire?.unit_refs ?? "");
  const [start, setStart] = useState(hire?.start_date ?? today);
  const [status, setStatus] = useState<GpsHire["status"]>(hire?.status ?? "active");
  const [endDate, setEndDate] = useState(hire?.end_date ?? "");
  const [returned, setReturned] = useState(hire?.units_returned_date ?? "");
  const [oneOff, setOneOff] = useState(centsToInput(hire?.one_off_fee_cents));
  const [sub, setSub] = useState(centsToInput(hire?.subscription_cents));
  const [perUnit, setPerUnit] = useState(hire?.price_per_unit ?? false);
  const [interval, setIntervalM] = useState(hire?.interval_months ?? 1);
  const [nextRenewal, setNextRenewal] = useState(hire?.next_renewal_date ?? "");
  const [agreedUntil, setAgreedUntil] = useState(hire?.agreed_until ?? "");
  const [notes, setNotes] = useState(hire?.notes ?? "");
  const [raiseNow, setRaiseNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inp = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200";

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q && !athleteId ? athletes.filter((a) => athleteName(a).toLowerCase().includes(q)).slice(0, 6) : [];
  }, [search, athletes, athleteId]);

  const oneOffC = parseMoney(oneOff);
  const subC = parseMoney(sub);
  const unitsN = Math.max(0, parseInt(units, 10) || 0);
  const periodC = subC ? (perUnit ? subC * unitsN : subC) : 0;
  const hasSub = (subC ?? 0) > 0;
  const firstInvoice = (raiseNow && !isEdit ? (oneOffC ?? 0) + periodC : 0);

  async function save() {
    if (!orgId) return;
    let name = "";
    if (kind === "team") { const t = teams.find((x) => x.id === teamId); if (!t) { setErr("Choose a team."); return; } name = t.name; }
    else if (kind === "athlete") { const a = athleteId ? athletes.find((x) => x.id === athleteId) : null; if (!a) { setErr("Choose an athlete."); return; } name = athleteName(a); }
    else { name = clientName.trim(); if (!name) { setErr("Enter the hirer's name."); return; } }
    if ((oneOffC ?? 0) < 0 || (subC ?? 0) < 0) { setErr("Fees can't be negative."); return; }
    setSaving(true); setErr(null);

    // First renewal: if we bill the first period now, the next renewal is one interval after start.
    const renewal = hasSub
      ? nextRenewal || (!isEdit && raiseNow ? addMonthsISO(start, interval) : start)
      : null;

    const row = {
      organisation_id: orgId,
      team_id: kind === "team" ? teamId : null,
      athlete_id: kind === "athlete" ? athleteId : null,
      client_name: name,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      units_count: unitsN,
      unit_refs: unitRefs.trim() || null,
      start_date: start,
      status,
      end_date: status === "ended" ? endDate || today : endDate || null,
      units_returned_date: returned || null,
      one_off_fee_cents: oneOffC && oneOffC > 0 ? oneOffC : null,
      subscription_cents: subC && subC > 0 ? subC : null,
      price_per_unit: perUnit,
      interval_months: interval,
      next_renewal_date: renewal,
      agreed_until: agreedUntil || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let id = editId ?? "";
    if (isEdit) {
      const { error } = await supabase.from("gps_hires").update(row).eq("id", editId!);
      if (error) { setSaving(false); setErr(error.message); return; }
    } else {
      const { data, error } = await supabase.from("gps_hires").insert({ ...row, created_by: profileId }).select(HIRE_COLS).single();
      if (error || !data) { setSaving(false); setErr(error?.message ?? "Could not save."); return; }
      id = data.id as string;
      if (raiseNow && firstInvoice > 0) {
        const h = data as GpsHire;
        const lines: InvoiceLineInput[] = [];
        if ((h.one_off_fee_cents ?? 0) > 0) lines.push(oneOffLine(h));
        let period: { start: string; end: string } | null = null;
        if (hasSub) {
          const end = addDaysISO(addMonthsISO(start, interval), -1);
          period = { start, end };
          lines.push(periodLine(h, start, end));
        }
        const r = await createInvoice(
          { ...invoiceHeader(h, orgId, profileId), period_start: period?.start ?? null, period_end: period?.end ?? null, due_date: addDaysISO(today, 7) },
          lines
        );
        if ("error" in r) { setSaving(false); setErr(`Hire saved, but the invoice failed: ${r.error}`); return; }
        const { data: inv } = await supabase.from("invoices").select("invoice_number").eq("id", r.id).single();
        await supabase.from("gps_hire_followups").insert({ organisation_id: orgId, gps_hire_id: id, created_by: profileId, note: `Hire started; first invoice ${inv?.invoice_number ?? ""} raised` });
      }
    }
    setSaving(false);
    onSaved(id);
  }

  return (
    <Modal title={isEdit ? "Edit GPS hire" : "New GPS hire"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400">Hired to</label>
          <div className="mt-1 flex overflow-hidden rounded-lg border border-slate-700">
            {(["team", "athlete", "other"] as HirerKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 px-3 py-1.5 text-xs capitalize ${kind === k ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>{k === "other" ? "Other client" : k}</button>
            ))}
          </div>
          {kind === "team" ? (
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inp}>
              <option value="">Choose team…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : kind === "athlete" ? (
            athleteId ? (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 text-xs text-lime-200">
                  {search}<button type="button" onClick={() => { setAthleteId(null); setSearch(""); }} className="text-lime-400 hover:text-rose-300">×</button>
                </span>
              </div>
            ) : (
              <>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search athletes…" className={inp} />
                {matches.length ? (
                  <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
                    {matches.map((a) => (
                      <button key={a.id} type="button" onClick={() => { setAthleteId(a.id); setSearch(athleteName(a)); }} className="flex w-full rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800">{athleteName(a)}</button>
                    ))}
                  </div>
                ) : null}
              </>
            )
          ) : (
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Club, school or person" className={inp} />
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs font-medium text-slate-400">Contact</label><input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" className={inp} /></div>
          <div><label className="block text-xs font-medium text-slate-400">Email</label><input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inp} /></div>
          <div><label className="block text-xs font-medium text-slate-400">Phone</label><input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inp} /></div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs font-medium text-slate-400">Units</label><input type="number" min={0} value={units} onChange={(e) => setUnits(e.target.value)} className={inp} /></div>
          <div className="col-span-2"><label className="block text-xs font-medium text-slate-400">Unit IDs / serials <span className="text-slate-600">(optional)</span></label><input value={unitRefs} onChange={(e) => setUnitRefs(e.target.value)} placeholder="e.g. GPS-01 to GPS-10" className={inp} /></div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <div className="text-xs font-semibold text-slate-300">Billing <span className="font-normal text-slate-500">· fill one or both</span></div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-slate-400">One-off fee ($)</label><input value={oneOff} onChange={(e) => setOneOff(e.target.value)} placeholder="0.00" className={inp} /></div>
            <div><label className="block text-xs text-slate-400">Subscription ($)</label><input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="0.00" className={inp} /></div>
          </div>
          {hasSub ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400">Billed every</label>
                <select value={interval} onChange={(e) => setIntervalM(Number(e.target.value))} className={inp}>
                  {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m === 1 ? "month" : `${m} months`}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400">Next renewal</label>
                <input type="date" value={nextRenewal} onChange={(e) => setNextRenewal(e.target.value)} className={inp} />
                {!nextRenewal ? <p className="mt-1 text-[10px] text-slate-500">Blank: {!isEdit && raiseNow ? fmtDate(addMonthsISO(start, interval)) : fmtDate(start)}</p> : null}
              </div>
              <label className="col-span-2 flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={perUnit} onChange={(e) => setPerUnit(e.target.checked)} className="accent-lime-400" />
                Price is per unit ({money(periodC)} per {intervalLabel(interval)} for {unitsN} unit{unitsN === 1 ? "" : "s"})
              </label>
            </div>
          ) : null}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400">Agreed until <span className="text-slate-600">(length of hire)</span></label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input type="date" value={agreedUntil} onChange={(e) => setAgreedUntil(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200" />
            {[1, 3, 6, 12].map((m) => (
              <button key={m} type="button" onClick={() => setAgreedUntil(addDaysISO(addMonthsISO(start, m), -1))} className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800">{m === 12 ? "12 months" : `${m} month${m === 1 ? "" : "s"}`}</button>
            ))}
            {agreedUntil ? <button type="button" onClick={() => setAgreedUntil("")} className="text-[11px] text-slate-500 hover:text-slate-300">clear (ongoing)</button> : <span className="text-[11px] text-slate-500">blank = ongoing</span>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs font-medium text-slate-400">Start</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inp} /></div>
          {isEdit ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as GpsHire["status"])} className={inp}>
                  <option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-400">End date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inp} /></div>
            </>
          ) : null}
        </div>
        {isEdit && status === "ended" ? (
          <div className="w-1/3"><label className="block text-xs font-medium text-slate-400">Units returned</label><input type="date" value={returned} onChange={(e) => setReturned(e.target.value)} className={inp} /></div>
        ) : null}

        <div><label className="block text-xs font-medium text-slate-400">Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inp} /></div>

        {!isEdit && ((oneOffC ?? 0) > 0 || hasSub) ? (
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={raiseNow} onChange={(e) => setRaiseNow(e.target.checked)} className="accent-lime-400" />
            Raise first invoice now ({money((oneOffC ?? 0) + periodC)}{hasSub ? `, covers ${fmtDate(start)} – ${fmtDate(addDaysISO(addMonthsISO(start, interval), -1))}` : ""})
          </label>
        ) : null}
        {err ? <p className="text-xs text-rose-400">{err}</p> : null}
      </div>
      <ModalActions>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">{saving ? "Saving…" : isEdit ? "Save changes" : "Create hire"}</button>
      </ModalActions>
    </Modal>
  );
}

// ---- Detail ------------------------------------------------------------------

function HireDetail({ hire: h, orgId, profileId, athletes, unitsKey, invoices, paidById, logs, followUps, onEdit, onClose, onChanged }: {
  hire: GpsHire; orgId: string | null; profileId: string | null; athletes: AthleteLite[]; unitsKey: number; invoices: HireInvoice[]; paidById: Record<string, number>;
  logs: FollowLog[]; followUps: FollowUp[]; onEdit: () => void; onClose: () => void; onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [extra, setExtra] = useState<{ open: boolean; desc: string; amount: string }>({ open: false, desc: "", amount: centsToInput(h.one_off_fee_cents) });
  const today = perthToday();
  const kindL = hireBillingKind(h);
  const hasSub = (h.subscription_cents ?? 0) > 0;
  const next = renewalPeriod(h);
  const inp = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";
  const [units, setUnits] = useState<{ unit_code: string; size: string | null; current_athlete_id: string | null; current_holder_name: string | null }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("gps_units").select("unit_code, size, current_athlete_id, current_holder_name").eq("current_hire_id", h.id).order("unit_code");
      setUnits((data ?? []) as typeof units);
    })();
  }, [h.id, unitsKey]);

  async function exportHire() {
    if (!orgId) return;
    try { await downloadRoster(orgId, h.id, h.client_name); } catch (e) { setMsg((e as { message?: string })?.message ?? "Export failed."); }
  }

  async function addNote(text: string) {
    if (!orgId || !text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("gps_hire_followups").insert({ organisation_id: orgId, gps_hire_id: h.id, note: text.trim(), created_by: profileId });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setNote(""); onChanged();
  }
  const [confirmPast, setConfirmPast] = useState(false);
  const pastAgreement = renewalPastAgreement(h);
  async function renew() {
    if (!orgId) return;
    if (pastAgreement && !confirmPast) { setConfirmPast(true); return; }
    setConfirmPast(false);
    setBusy(true); setMsg(null);
    const r = await renewHire(h, orgId, profileId);
    setBusy(false);
    if (r.error) { setMsg(r.error); return; }
    setMsg("Renewal invoice raised.");
    onChanged();
  }
  async function raiseExtra() {
    if (!orgId) return;
    const c = parseMoney(extra.amount) ?? 0;
    if (c <= 0) { setMsg("Enter an amount."); return; }
    setBusy(true); setMsg(null);
    const r = await createInvoice({ ...invoiceHeader(h, orgId, profileId), due_date: addDaysISO(today, 7) }, [oneOffLine(h, c, extra.desc.trim())]);
    setBusy(false);
    if ("error" in r) { setMsg(r.error); return; }
    setExtra({ open: false, desc: "", amount: "" });
    setMsg("Invoice raised.");
    onChanged();
  }
  async function endHire(returnedNow: boolean) {
    setBusy(true);
    await supabase.from("gps_hires").update({ status: "ended", end_date: h.end_date ?? today, units_returned_date: returnedNow ? today : h.units_returned_date, updated_at: new Date().toISOString() }).eq("id", h.id);
    if (orgId) await supabase.from("gps_hire_followups").insert({ organisation_id: orgId, gps_hire_id: h.id, created_by: profileId, note: returnedNow ? "Hire ended, units returned" : "Hire ended" });
    setBusy(false);
    onChanged();
  }
  async function markReturned() {
    setBusy(true);
    await supabase.from("gps_hires").update({ units_returned_date: today, updated_at: new Date().toISOString() }).eq("id", h.id);
    if (orgId) await supabase.from("gps_hire_followups").insert({ organisation_id: orgId, gps_hire_id: h.id, created_by: profileId, note: "Units returned" });
    setBusy(false);
    onChanged();
  }

  return (
    <Modal title={h.client_name} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-xs text-slate-400">
            <div><KindTag kind={hirerKind(h)} /> {h.contact_name ?? "No contact name"}</div>
            {h.contact_email ? <div><a href={`mailto:${h.contact_email}`} className="text-sky-300 hover:underline">{h.contact_email}</a></div> : null}
            {h.contact_phone ? <div><a href={`tel:${h.contact_phone}`} className="text-sky-300 hover:underline">{h.contact_phone}</a></div> : null}
          </div>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${h.status === "active" ? "bg-lime-500/20 text-lime-200" : h.status === "paused" ? "bg-amber-500/20 text-amber-200" : "bg-slate-600/40 text-slate-300"}`}>{h.status}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 p-3 text-xs text-slate-300 sm:grid-cols-4">
          <div><div className="text-slate-500">Units</div><div className="font-semibold text-slate-100">{h.units_count}</div></div>
          <div><div className="text-slate-500">Since</div><div className="font-semibold text-slate-100">{fmtDate(h.start_date)}</div></div>
          <div><div className="text-slate-500">Agreed until</div><div className="font-semibold text-slate-100">{h.agreed_until ? fmtDate(h.agreed_until) : "Ongoing"}</div></div>
          <div className="col-span-2"><div className="text-slate-500">Plan</div><div className="font-semibold text-slate-100">{planLabel(h)}</div></div>
          {hasSub ? <div className="col-span-2"><div className="text-slate-500">Next renewal</div><div className="font-semibold text-slate-100">{fmtDate(h.next_renewal_date)} · {money(hirePeriodCents(h))}</div></div> : null}
          {h.unit_refs ? <div className="col-span-2"><div className="text-slate-500">Unit IDs</div><div className="text-slate-200">{h.unit_refs}</div></div> : null}
          {h.status === "ended" ? <div className="col-span-2"><div className="text-slate-500">Ended / returned</div><div className="text-slate-200">{fmtDate(h.end_date)} / {h.units_returned_date ? fmtDate(h.units_returned_date) : "not yet"}</div></div> : null}
        </div>
        {h.notes ? <p className="whitespace-pre-wrap text-xs text-slate-400">{h.notes}</p> : null}

        {followUps.length ? (
          <div className="flex flex-wrap gap-1">
            {followUps.map((f) => <span key={f.reason} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${sevClass(f.severity)}`}>{f.label}</span>)}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {hasSub && h.status === "active" ? (
            <button type="button" onClick={() => void renew()} disabled={busy} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-3 py-1.5 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">
              {confirmPast ? `Agreement ended ${fmtDate(h.agreed_until)}. Renew anyway?` : `Renew: invoice ${fmtDate(next.start)} – ${fmtDate(next.end)} (${money(hirePeriodCents(h))})`}
            </button>
          ) : null}
          <button type="button" onClick={() => setExtra((x) => ({ ...x, open: !x.open }))} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
            {kindL === "one_off" || kindL === "both" ? "Raise one-off invoice" : "Raise other invoice"}
          </button>
          {h.status === "ended" && !h.units_returned_date ? (
            <button type="button" onClick={() => void markReturned()} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Mark units returned</button>
          ) : null}
          {h.status !== "ended" ? (
            <>
              <button type="button" onClick={() => void endHire(true)} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">End hire, units back</button>
              <button type="button" onClick={() => void endHire(false)} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">End hire</button>
            </>
          ) : null}
        </div>
        {extra.open ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
            <input value={extra.desc} onChange={(e) => setExtra((x) => ({ ...x, desc: e.target.value }))} placeholder="Description (e.g. replacement strap)" className={`min-w-0 flex-1 ${inp}`} />
            <input value={extra.amount} onChange={(e) => setExtra((x) => ({ ...x, amount: e.target.value }))} placeholder="$" className={`w-24 ${inp}`} />
            <button type="button" onClick={() => void raiseExtra()} disabled={busy} className="rounded-lg border border-lime-500/50 px-3 py-1 text-xs text-lime-200 hover:bg-lime-500/10 disabled:opacity-50">Raise</button>
          </div>
        ) : null}
        {msg ? <p className="text-xs text-slate-300">{msg}</p> : null}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Units on this hire ({units.length})</span>
            {units.length ? <button type="button" onClick={() => void exportHire()} className="text-xs text-lime-300 hover:underline">Export PlayerData roster</button> : null}
          </div>
          {units.length === 0 ? <p className="text-xs text-slate-500">No units allocated yet. Drop a roster on the main page.</p> : (
            <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
              {units.map((u) => {
                const a = u.current_athlete_id ? athletes.find((x) => x.id === u.current_athlete_id) : null;
                const who = a ? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() : u.current_holder_name;
                return (
                  <div key={u.unit_code} className="truncate rounded border border-slate-800 px-2 py-1 text-[11px] text-slate-300">
                    <span className="font-mono text-slate-200">{u.unit_code}</span> · {who || <span className="text-slate-500">{u.size ? `spare ${u.size}` : "spare"}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-300">Invoices</div>
          {invoices.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : (
            <ul className="space-y-1">
              {invoices.map((i) => {
                const o = i.status === "void" ? 0 : Math.max(0, i.total_cents - (paidById[i.id] ?? 0));
                const late = o > 0 && i.due_date && i.due_date < today;
                return (
                  <li key={i.id}>
                    <a href={`/dashboard/invoices?open=${i.id}`} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800/50">
                      <span>{i.invoice_number}{i.period_start ? ` · ${fmtDate(i.period_start)} – ${fmtDate(i.period_end)}` : ` · ${fmtDate(i.issued_date)}`}</span>
                      <span className="flex items-center gap-2">
                        {money(i.total_cents)}
                        <span className={`rounded px-1 text-[10px] font-semibold uppercase ${i.status === "void" ? "bg-slate-600/40 text-slate-300" : o === 0 ? "bg-lime-500/20 text-lime-200" : late ? "bg-rose-500/20 text-rose-200" : "bg-amber-500/20 text-amber-200"}`}>
                          {i.status === "void" ? "void" : o === 0 ? "paid" : late ? `${money(o)} overdue` : `${money(o)} owing`}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-300">Follow-up log</div>
          <div className="flex flex-wrap gap-1.5">
            {["Called, no answer", "Called, will pay", "Emailed reminder", "Renewal confirmed", "Not renewing"].map((q) => (
              <button key={q} type="button" onClick={() => void addNote(q)} disabled={busy} className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50">{q}</button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addNote(note); }} placeholder="Add a note…" className={`flex-1 ${inp}`} />
            <button type="button" onClick={() => void addNote(note)} disabled={busy || !note.trim()} className="rounded-lg border border-slate-700 px-3 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">Log</button>
          </div>
          {logs.length ? (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {logs.map((l) => (
                <li key={l.id} className="text-xs text-slate-400"><span className="text-slate-500">{fmtDate(l.created_at.slice(0, 10))}</span> · {l.note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <ModalActions>
        <button type="button" onClick={onEdit} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">Edit</button>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
      </ModalActions>
    </Modal>
  );
}

// ---- shared modal shell ------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-slate-100">{title}</h2>
        {children}
      </div>
    </div>
  );
}
function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
