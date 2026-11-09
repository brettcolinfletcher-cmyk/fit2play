"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import PracticeSidebar from "@/components/PracticeSidebar";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";
import { addDaysISO, centsToInput, fmtDate, lineAmount, METHODS, money, parseMoney, perthToday } from "@/lib/practice/billing";
import { createInvoice, replaceInvoiceItems, syncInvoiceStatus, type InvoiceLineInput } from "@/lib/practice/invoicing";


type Invoice = {
  id: string;
  invoice_number: string;
  client_name: string | null;
  client_email: string | null;
  status: string;
  issued_date: string;
  due_date: string | null;
  total_cents: number;
  athlete_id: string | null;
  team_id: string | null;
  practitioner_id: string | null;
  booking_id: string | null;
  gps_hire_id: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
};
const INV_COLS =
  "id, invoice_number, client_name, client_email, status, issued_date, due_date, total_cents, athlete_id, team_id, practitioner_id, booking_id, gps_hire_id, period_start, period_end, notes";

type AthleteLite = { id: string; first_name: string | null; last_name: string | null };
type TeamLite = { id: string; name: string };
type ApptType = { id: string; name: string; price_cents: number | null };
type Practitioner = { id: string; full_name: string };
type Line = { description: string; qty: string; unit: string; appointment_type_id?: string | null };
type Payment = { id: string; method: string; amount_cents: number; paid_at: string; reference: string | null };
type Item = { id: string; description: string; quantity: number; unit_price_cents: number; amount_cents: number; appointment_type_id: string | null };
type BillTo = "athlete" | "team" | "other";
type Filter = "all" | "outstanding" | "overdue" | "paid" | "void";

function athleteName(a: AthleteLite): string { return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Athlete"; }
function statusBadge(s: string): string {
  return s === "paid" ? "bg-lime-500/20 text-lime-200"
    : s === "part_paid" ? "bg-amber-500/20 text-amber-200"
    : s === "void" ? "bg-slate-600/40 text-slate-300"
    : s === "sent" ? "bg-sky-500/20 text-sky-200"
    : "bg-slate-700/50 text-slate-300";
}
function lineToInput(l: Line): InvoiceLineInput {
  return { description: l.description, quantity: Number(l.qty) || 0, unit_price_cents: parseMoney(l.unit) ?? 0, appointment_type_id: l.appointment_type_id ?? null };
}
function isOverdue(i: Invoice, owing: number, today: string): boolean {
  return owing > 0 && i.status !== "void" && !!i.due_date && i.due_date < today;
}

// ---- Page --------------------------------------------------------------------

export default function InvoicesPage() {
  const staffOk = useRequireDashboardStaff();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paidById, setPaidById] = useState<Record<string, number>>({});
  const [athletes, setAthletes] = useState<AthleteLite[]>([]);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [types, setTypes] = useState<ApptType[]>([]);
  const [pracs, setPracs] = useState<Practitioner[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<null | { editId?: string }>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const today = perthToday();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("id, organisation_id").eq("id", user.id).single();
    const org = (profile?.organisation_id as string) ?? null;
    setProfileId(profile?.id as string);
    setOrgId(org);
    if (!org) { setLoading(false); return; }
    const [{ data: inv }, { data: pay }, { data: ath }, { data: tm }, { data: t }, { data: pr }] = await Promise.all([
      supabase.from("invoices").select(INV_COLS).eq("organisation_id", org).order("issued_date", { ascending: false }).order("invoice_number", { ascending: false }),
      supabase.from("payments").select("invoice_id, amount_cents").eq("organisation_id", org),
      supabase.from("athletes").select("id, first_name, last_name").order("last_name"),
      supabase.from("teams").select("id, name").order("name"),
      supabase.from("appointment_types").select("id, name, price_cents").eq("organisation_id", org).eq("is_active", true).order("name"),
      supabase.from("practitioners").select("id, full_name").eq("organisation_id", org).eq("is_active", true).order("full_name"),
    ]);
    setInvoices((inv ?? []) as Invoice[]);
    const paid: Record<string, number> = {};
    for (const p of pay ?? []) paid[p.invoice_id as string] = (paid[p.invoice_id as string] ?? 0) + Number(p.amount_cents);
    setPaidById(paid);
    setAthletes((ath ?? []) as AthleteLite[]);
    setTeams((tm ?? []) as TeamLite[]);
    setTypes((t ?? []) as ApptType[]);
    setPracs((pr ?? []) as Practitioner[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (staffOk) void load(); }, [staffOk, load]);

  // Deep link: /dashboard/invoices?open=<id> (from Diary / GPS hire)
  useEffect(() => {
    if (!staffOk) return;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("open");
    if (id) setDetailId(id);
    const f = sp.get("filter") as Filter | null;
    if (f && ["all", "outstanding", "overdue", "paid", "void"].includes(f)) setFilter(f);
  }, [staffOk]);

  const owingOf = useCallback((i: Invoice) => (i.status === "void" ? 0 : Math.max(0, i.total_cents - (paidById[i.id] ?? 0))), [paidById]);

  const totals = useMemo(() => {
    let outstanding = 0, overdue = 0;
    for (const i of invoices) {
      const o = owingOf(i);
      outstanding += o;
      if (isOverdue(i, o, today)) overdue += o;
    }
    return { outstanding, overdue };
  }, [invoices, owingOf, today]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return invoices.filter((i) => {
      const o = owingOf(i);
      if (filter === "outstanding" && o <= 0) return false;
      if (filter === "overdue" && !isOverdue(i, o, today)) return false;
      if (filter === "paid" && i.status !== "paid") return false;
      if (filter === "void" && i.status !== "void") return false;
      if (s && !`${i.invoice_number} ${i.client_name ?? ""} ${i.client_email ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [invoices, filter, q, owingOf, today]);

  if (!staffOk) return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <p className="text-xs text-slate-400">Checking access…</p>
    </main>
  );

  const inp = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
          <aside className="w-full shrink-0 lg:w-48"><PracticeSidebar /></aside>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-50">INVOICES</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Outstanding <span className="font-semibold text-slate-200">{money(totals.outstanding)}</span>
                  {totals.overdue > 0 ? <> · Overdue <span className="font-semibold text-rose-300">{money(totals.overdue)}</span></> : null}
                </p>
              </div>
              <button type="button" onClick={() => setForm({})} className="rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110">+ New invoice</button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-slate-700">
                {(["all", "outstanding", "overdue", "paid", "void"] as Filter[]).map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)} className={`px-3 py-1 text-xs capitalize ${filter === f ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>{f}</button>
                ))}
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, client…" className={`w-56 ${inp}`} />
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Bill to</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Owing</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-3 py-4 text-xs text-slate-500">Loading…</td></tr>
                  ) : shown.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-4 text-xs text-slate-500">{invoices.length ? "Nothing matches." : "No invoices yet."}</td></tr>
                  ) : shown.map((i) => {
                    const owing = owingOf(i);
                    const overdue = isOverdue(i, owing, today);
                    return (
                      <tr key={i.id} onClick={() => setDetailId(i.id)} className="cursor-pointer border-b border-slate-800/60 text-slate-200 hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-medium">{i.invoice_number}</td>
                        <td className="px-3 py-2">
                          <span>{i.client_name ?? "—"}</span>
                          {i.team_id ? <Tag>Team</Tag> : null}
                          {i.gps_hire_id ? <Tag>GPS</Tag> : null}
                        </td>
                        <td className="px-3 py-2 text-slate-400">{fmtDate(i.issued_date)}</td>
                        <td className={`px-3 py-2 ${overdue ? "text-rose-300" : "text-slate-400"}`}>{i.due_date ? fmtDate(i.due_date) : "—"}</td>
                        <td className="px-3 py-2 text-right">{money(i.total_cents)}</td>
                        <td className="px-3 py-2 text-right">{owing > 0 ? money(owing) : "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${overdue ? "bg-rose-500/20 text-rose-200" : statusBadge(i.status)}`}>{overdue ? "overdue" : i.status.replace("_", " ")}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {form ? (
        <InvoiceForm
          editId={form.editId}
          orgId={orgId}
          profileId={profileId}
          athletes={athletes}
          teams={teams}
          types={types}
          pracs={pracs}
          onClose={() => setForm(null)}
          onSaved={(id) => { setForm(null); setDetailId(id); void load(); }}
        />
      ) : null}
      {detailId && !form ? (
        <InvoiceDetail
          invoiceId={detailId}
          orgId={orgId}
          profileId={profileId}
          teams={teams}
          onEdit={() => setForm({ editId: detailId })}
          onClose={() => setDetailId(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </main>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 rounded bg-slate-700/60 px-1 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-slate-300">{children}</span>;
}

// ---- Create / edit -----------------------------------------------------------

function InvoiceForm({ editId, orgId, profileId, athletes, teams, types, pracs, onClose, onSaved }: {
  editId?: string; orgId: string | null; profileId: string | null; athletes: AthleteLite[]; teams: TeamLite[];
  types: ApptType[]; pracs: Practitioner[]; onClose: () => void; onSaved: (id: string) => void;
}) {
  const isEdit = !!editId;
  const [billTo, setBillTo] = useState<BillTo>("athlete");
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [pracId, setPracId] = useState("");
  const [issued, setIssued] = useState(perthToday());
  const [due, setDue] = useState(addDaysISO(perthToday(), 14));
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: "1", unit: "" }]);
  const [discount, setDiscount] = useState<{ open: boolean; mode: "pct" | "amt"; value: string }>({ open: false, mode: "pct", value: "" });
  const [paidSoFar, setPaidSoFar] = useState(0);
  const [loaded, setLoaded] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inp = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const [{ data: i }, { data: it }, { data: p }] = await Promise.all([
        supabase.from("invoices").select(INV_COLS).eq("id", editId).single(),
        supabase.from("invoice_items").select("id, description, quantity, unit_price_cents, amount_cents, appointment_type_id").eq("invoice_id", editId),
        supabase.from("payments").select("amount_cents").eq("invoice_id", editId),
      ]);
      const inv = i as Invoice | null;
      if (inv) {
        if (inv.team_id) { setBillTo("team"); setTeamId(inv.team_id); }
        else if (inv.athlete_id) {
          setBillTo("athlete"); setAthleteId(inv.athlete_id);
          const a = athletes.find((x) => x.id === inv.athlete_id); setSearch(a ? athleteName(a) : inv.client_name ?? "");
        } else { setBillTo("other"); setClientName(inv.client_name ?? ""); }
        setClientEmail(inv.client_email ?? "");
        setPracId(inv.practitioner_id ?? "");
        setIssued(inv.issued_date);
        setDue(inv.due_date ?? "");
        setPeriodStart(inv.period_start ?? "");
        setPeriodEnd(inv.period_end ?? "");
        setNotes(inv.notes ?? "");
      }
      const items = (it ?? []) as Item[];
      setLines(items.length ? items.map((x) => ({ description: x.description, qty: String(Number(x.quantity)), unit: centsToInput(x.unit_price_cents), appointment_type_id: x.appointment_type_id })) : [{ description: "", qty: "1", unit: "" }]);
      setPaidSoFar((p ?? []).reduce((s, x) => s + Number(x.amount_cents), 0));
      setLoaded(true);
    })();
  }, [editId, athletes]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? athletes.filter((a) => athleteName(a).toLowerCase().includes(q)).slice(0, 6) : [];
  }, [search, athletes]);

  const total = lines.reduce((s, l) => s + lineAmount(Number(l.qty) || 0, parseMoney(l.unit) ?? 0), 0);
  const subtotalPositive = lines.reduce((s, l) => {
    const a = lineAmount(Number(l.qty) || 0, parseMoney(l.unit) ?? 0);
    return a > 0 ? s + a : s;
  }, 0);

  function addFromType(id: string) {
    const t = types.find((x) => x.id === id);
    if (!t) return;
    setLines((p) => {
      const blank = p.length === 1 && !p[0].description && !p[0].unit;
      const row = { description: t.name, qty: "1", unit: centsToInput(t.price_cents), appointment_type_id: t.id };
      return blank ? [row] : [...p, row];
    });
  }
  function editLine(i: number, ch: Partial<Line>) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...ch } : l)));
  }
  function applyDiscount() {
    const v = parseFloat(discount.value);
    if (!Number.isFinite(v) || v <= 0) return;
    const cents = discount.mode === "pct" ? Math.round((subtotalPositive * v) / 100) : Math.round(v * 100);
    const label = discount.mode === "pct" ? `Discount (${v}%)` : "Discount";
    setLines((p) => [...p, { description: label, qty: "1", unit: centsToInput(-cents) }]);
    setDiscount({ open: false, mode: discount.mode, value: "" });
  }

  async function save() {
    if (!orgId) return;
    let client = "";
    if (billTo === "athlete") {
      const a = athleteId ? athletes.find((x) => x.id === athleteId) : null;
      if (!a) { setErr("Choose an athlete."); return; }
      client = athleteName(a);
    } else if (billTo === "team") {
      const t = teams.find((x) => x.id === teamId);
      if (!t) { setErr("Choose a team."); return; }
      client = t.name;
    } else {
      client = clientName.trim();
      if (!client) { setErr("Enter a client name."); return; }
    }
    const items = lines.map(lineToInput).filter((l) => l.description.trim());
    if (items.length === 0) { setErr("Add at least one line item."); return; }
    if (total < 0) { setErr("Total can't be negative. Reduce the discount."); return; }
    setSaving(true); setErr(null);
    const header = {
      client_name: client,
      client_email: clientEmail.trim() || null,
      athlete_id: billTo === "athlete" ? athleteId : null,
      team_id: billTo === "team" ? teamId : null,
      practitioner_id: pracId || null,
      issued_date: issued,
      due_date: due || null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      notes: notes.trim() || null,
    };
    if (isEdit && editId) {
      const { error: ue } = await supabase.from("invoices").update(header).eq("id", editId);
      if (ue) { setSaving(false); setErr(ue.message); return; }
      const r = await replaceInvoiceItems(editId, orgId, items);
      setSaving(false);
      if (r.error) { setErr(r.error); return; }
      onSaved(editId);
    } else {
      const r = await createInvoice({ ...header, organisation_id: orgId, created_by: profileId }, items);
      setSaving(false);
      if ("error" in r) { setErr(r.error); return; }
      onSaved(r.id);
    }
  }

  return (
    <Modal title={isEdit ? "Edit invoice" : "New invoice"} onClose={onClose}>
      {!loaded ? <p className="text-xs text-slate-500">Loading…</p> : (
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400">Bill to</label>
          <div className="mt-1 flex overflow-hidden rounded-lg border border-slate-700">
            {(["athlete", "team", "other"] as BillTo[]).map((b) => (
              <button key={b} type="button" onClick={() => setBillTo(b)} className={`flex-1 px-3 py-1.5 text-xs capitalize ${billTo === b ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>
                {b === "other" ? "Other client" : b}
              </button>
            ))}
          </div>
        </div>

        {billTo === "athlete" ? (
          <div>
            {athleteId ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 text-xs text-lime-200">
                {search}
                <button type="button" onClick={() => { setAthleteId(null); setSearch(""); }} className="text-lime-400 hover:text-rose-300">×</button>
              </span>
            ) : (
              <>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search athletes…" className={`w-full ${inp}`} />
                {matches.length ? (
                  <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
                    {matches.map((a) => (
                      <button key={a.id} type="button" onClick={() => { setAthleteId(a.id); setSearch(athleteName(a)); }} className="flex w-full rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800">{athleteName(a)}</button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : billTo === "team" ? (
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={`w-full ${inp}`}>
            <option value="">Choose team…</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : (
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client or organisation name" className={`w-full ${inp}`} />
        )}

        <div><label className="block text-xs font-medium text-slate-400">Email <span className="text-slate-600">(for sending)</span></label><input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={`mt-1 w-full ${inp}`} /></div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400">Practitioner</label>
            <select value={pracId} onChange={(e) => setPracId(e.target.value)} className={`mt-1 w-full ${inp}`}>
              <option value="">—</option>
              {pracs.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-slate-400">Issued</label><input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className={`mt-1 w-full ${inp}`} /></div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Due</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`mt-1 w-full ${inp}`} />
            <div className="mt-1 flex gap-1">
              {[0, 7, 14, 30].map((d) => (
                <button key={d} type="button" onClick={() => setDue(addDaysISO(issued, d))} className="rounded border border-slate-700 px-1.5 text-[10px] text-slate-400 hover:bg-slate-800">{d === 0 ? "Now" : `${d}d`}</button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-medium text-slate-400">Line items</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDiscount((d) => ({ ...d, open: !d.open }))} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">+ Discount</button>
              <select value="" onChange={(e) => { if (e.target.value) addFromType(e.target.value); }} className={inp}>
                <option value="">+ from service…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.price_cents != null ? ` (${money(t.price_cents)})` : ""}</option>)}
              </select>
            </div>
          </div>
          {discount.open ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
              <div className="flex overflow-hidden rounded border border-slate-700">
                {(["pct", "amt"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setDiscount((d) => ({ ...d, mode: m }))} className={`px-2 py-1 text-xs ${discount.mode === m ? "bg-lime-400 text-slate-950" : "text-slate-300"}`}>{m === "pct" ? "%" : "$"}</button>
                ))}
              </div>
              <input value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} placeholder={discount.mode === "pct" ? "10" : "20.00"} className={`w-20 ${inp}`} />
              <button type="button" onClick={applyDiscount} className="rounded border border-lime-500/50 px-2 py-1 text-xs text-lime-200 hover:bg-lime-500/10">Apply</button>
              <span className="text-[11px] text-slate-500">Adds a negative line</span>
            </div>
          ) : null}
          <div className="mt-2 space-y-2">
            <div className="flex gap-2 text-[10px] uppercase tracking-wide text-slate-500">
              <span className="flex-1">Description</span><span className="w-16">Qty</span><span className="w-24">Unit $</span><span className="w-20 text-right">Amount</span><span className="w-3" />
            </div>
            {lines.map((l, i) => {
              const amt = lineAmount(Number(l.qty) || 0, parseMoney(l.unit) ?? 0);
              return (
                <div key={i} className="flex items-center gap-2">
                  <input value={l.description} onChange={(e) => editLine(i, { description: e.target.value })} placeholder="Description" className={`min-w-0 flex-1 ${inp}`} />
                  <input type="number" step="0.25" value={l.qty} onChange={(e) => editLine(i, { qty: e.target.value })} className={`w-16 ${inp}`} />
                  <input value={l.unit} onChange={(e) => editLine(i, { unit: e.target.value })} placeholder="0.00" className={`w-24 ${inp}`} />
                  <span className={`w-20 text-right text-xs ${amt < 0 ? "text-amber-300" : "text-slate-300"}`}>{money(amt)}</span>
                  <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="w-3 text-slate-500 hover:text-rose-300">×</button>
                </div>
              );
            })}
            <button type="button" onClick={() => setLines((p) => [...p, { description: "", qty: "1", unit: "" }])} className="text-xs text-lime-300 hover:text-lime-200">+ Add line</button>
          </div>
        </div>

        <details className="rounded-lg border border-slate-800 px-3 py-2" open={!!(periodStart || notes)}>
          <summary className="cursor-pointer text-xs text-slate-400">Billing period and notes</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-slate-500">Period from</label><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={`mt-1 w-full ${inp}`} /></div>
            <div><label className="block text-xs text-slate-500">Period to</label><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={`mt-1 w-full ${inp}`} /></div>
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (internal)" className={`mt-2 w-full ${inp}`} />
        </details>

        <div className="space-y-1 border-t border-slate-800 pt-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-slate-400">Total</span><span className="font-semibold text-slate-100">{money(total)}</span></div>
          {isEdit && paidSoFar > 0 ? (
            <div className="flex items-center justify-between text-xs text-slate-400"><span>Paid so far</span><span>{money(paidSoFar)} · owing {money(Math.max(0, total - paidSoFar))}</span></div>
          ) : null}
        </div>
        {err ? <p className="text-xs text-rose-400">{err}</p> : null}
      </div>
      )}
      <ModalActions>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
        <button type="button" onClick={() => void save()} disabled={saving || !loaded} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">{saving ? "Saving…" : isEdit ? "Save changes" : "Create invoice"}</button>
      </ModalActions>
    </Modal>
  );
}

// ---- Detail + payments -------------------------------------------------------

function InvoiceDetail({ invoiceId, orgId, profileId, teams, onEdit, onClose, onChanged }: {
  invoiceId: string; orgId: string | null; profileId: string | null; teams: TeamLite[];
  onEdit: () => void; onClose: () => void; onChanged: () => void;
}) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [hireName, setHireName] = useState<string | null>(null);
  const [method, setMethod] = useState("hicaps");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(perthToday());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const inp = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";

  const reload = useCallback(async () => {
    const [{ data: i }, { data: it }, { data: p }] = await Promise.all([
      supabase.from("invoices").select(INV_COLS).eq("id", invoiceId).single(),
      supabase.from("invoice_items").select("id, description, quantity, unit_price_cents, amount_cents, appointment_type_id").eq("invoice_id", invoiceId),
      supabase.from("payments").select("id, method, amount_cents, paid_at, reference").eq("invoice_id", invoiceId).order("paid_at"),
    ]);
    const row = (i as Invoice) ?? null;
    setInv(row);
    setItems((it ?? []) as Item[]);
    setPayments((p ?? []) as Payment[]);
    if (row?.gps_hire_id) {
      const { data: h } = await supabase.from("gps_hires").select("client_name, units_count").eq("id", row.gps_hire_id).single();
      setHireName(h ? `${h.client_name} · ${h.units_count} units` : null);
    } else setHireName(null);
  }, [invoiceId]);

  useEffect(() => { void reload(); }, [reload]);

  const paid = payments.reduce((s, p) => s + Number(p.amount_cents), 0);
  const owing = inv ? Math.max(0, inv.total_cents - paid) : 0;

  useEffect(() => {
    if (owing > 0) setAmount((owing / 100).toFixed(2));
  }, [owing]);

  async function sendEmail() {
    if (!inv) return;
    if (!inv.client_email) { setEmailMsg("No email address on this invoice."); return; }
    setBusy(true); setEmailMsg(null);
    try {
      const res = await fetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to send.");
      setEmailMsg("Email sent ✓");
      await reload(); onChanged();
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  }

  async function addPayment() {
    if (!orgId || !inv) return;
    const cents = parseMoney(amount) ?? 0;
    if (cents <= 0) { setErr("Enter an amount."); return; }
    setBusy(true); setErr(null);
    const { error: e } = await supabase.from("payments").insert({
      organisation_id: orgId, invoice_id: inv.id, method,
      amount_cents: cents,
      paid_at: new Date(`${paidAt}T12:00:00+08:00`).toISOString(),
      reference: reference.trim() || null, created_by: profileId,
    });
    if (e) { setBusy(false); setErr(e.message); return; }
    await syncInvoiceStatus(inv.id);
    setReference(""); setBusy(false);
    await reload(); onChanged();
  }

  async function removePayment(id: string) {
    if (!inv) return;
    await supabase.from("payments").delete().eq("id", id);
    await syncInvoiceStatus(inv.id);
    await reload(); onChanged();
  }

  async function writeOff() {
    if (!inv || !orgId || owing <= 0) return;
    setBusy(true);
    const lines = items.map((x) => ({ description: x.description, quantity: Number(x.quantity), unit_price_cents: x.unit_price_cents, appointment_type_id: x.appointment_type_id }));
    lines.push({ description: "Balance written off", quantity: 1, unit_price_cents: -owing, appointment_type_id: null });
    const r = await replaceInvoiceItems(inv.id, orgId, lines);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    await reload(); onChanged();
  }

  async function setStatus(status: string) {
    if (!inv) return;
    await supabase.from("invoices").update({ status }).eq("id", inv.id);
    if (status !== "void") await syncInvoiceStatus(inv.id);
    await reload(); onChanged();
  }

  const teamName = inv?.team_id ? teams.find((t) => t.id === inv.team_id)?.name : null;

  return (
    <Modal title={inv ? inv.invoice_number : "Invoice"} onClose={onClose}>
      {!inv ? <p className="text-xs text-slate-500">Loading…</p> : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 text-sm">
            <div>
              <div className="font-medium text-slate-100">{inv.client_name}{teamName ? <Tag>Team</Tag> : null}</div>
              {inv.client_email ? <div className="text-xs text-slate-400">{inv.client_email}</div> : null}
              <div className="text-xs text-slate-500">Issued {fmtDate(inv.issued_date)}{inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ""}</div>
              {inv.period_start ? <div className="text-xs text-slate-500">Period {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</div> : null}
              {hireName ? <a href="/dashboard/gps" className="text-xs text-lime-300 hover:underline">GPS hire: {hireName}</a> : null}
            </div>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(inv.status)}`}>{inv.status.replace("_", " ")}</span>
          </div>

          <div className="rounded-lg border border-slate-800">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between border-b border-slate-800/60 px-3 py-1.5 text-sm text-slate-300 last:border-0">
                <span>{it.description}{Number(it.quantity) !== 1 ? ` ×${Number(it.quantity)}` : ""}</span>
                <span className={it.amount_cents < 0 ? "text-amber-300" : ""}>{money(it.amount_cents)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-1.5 text-sm font-semibold text-slate-100">
              <span>Total</span><span>{money(inv.total_cents)}</span>
            </div>
          </div>
          {inv.notes ? <p className="whitespace-pre-wrap text-xs text-slate-400">{inv.notes}</p> : null}

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-200">Payments</span>
              <span className="text-xs text-slate-400">Paid {money(paid)} · Owing <span className="font-semibold text-slate-200">{money(owing)}</span></span>
            </div>
            {payments.length ? (
              <ul className="mt-2 space-y-1">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1 text-xs text-slate-300">
                    <span>{fmtDate(p.paid_at.slice(0, 10))} · {METHODS.find((m) => m.v === p.method)?.label ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                    <span className="flex items-center gap-2">{money(p.amount_cents)}<button type="button" onClick={() => void removePayment(p.id)} className="text-slate-500 hover:text-rose-300">×</button></span>
                  </li>
                ))}
              </ul>
            ) : null}
            {inv.status !== "void" && owing > 0 ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={inp}>
                  {METHODS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                </select>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" className={`w-24 ${inp}`} />
                <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inp} />
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref (optional)" className={`w-28 ${inp}`} />
                <button type="button" onClick={() => void addPayment()} disabled={busy} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-3 py-1.5 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">Record</button>
              </div>
            ) : null}
            {err ? <p className="mt-2 text-xs text-rose-400">{err}</p> : null}
          </div>
        </div>
      )}
      <ModalActions>
        {inv && inv.status !== "void" ? (
          <button type="button" onClick={onEdit} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">Edit</button>
        ) : null}
        {inv && inv.status !== "void" && owing > 0 ? (
          <button type="button" onClick={() => void writeOff()} disabled={busy} className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">Write off {money(owing)}</button>
        ) : null}
        {inv?.client_email ? (
          <button type="button" onClick={() => void sendEmail()} disabled={busy} className="rounded-lg border border-sky-500/40 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/10 disabled:opacity-50">
            {busy ? "Sending…" : inv.status === "paid" ? "Email receipt" : "Email invoice"}
          </button>
        ) : null}
        {inv?.status === "draft" ? (
          <button type="button" onClick={() => void setStatus("sent")} className="rounded-lg border border-sky-500/40 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/10">Mark sent</button>
        ) : null}
        {emailMsg ? <p className="w-full text-left text-xs text-slate-300">{emailMsg}</p> : null}
        {inv?.status !== "void" ? (
          <button type="button" onClick={() => void setStatus("void")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Void</button>
        ) : (
          <button type="button" onClick={() => void setStatus("draft")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Un-void</button>
        )}
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
