"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import PracticeSidebar from "@/components/PracticeSidebar";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

/**
 * Invoices + payment recording. Create an invoice (athlete or manual client)
 * with line items priced from services, then record split payments by method.
 * Status auto-derives from payments vs total. (Email is added separately.)
 */

const METHODS: { v: string; label: string }[] = [
  { v: "health_fund", label: "Health fund" },
  { v: "medicare", label: "Medicare" },
  { v: "hicaps", label: "HICAPS" },
  { v: "eftpos", label: "EFTPOS" },
  { v: "credit_card", label: "Credit card" },
  { v: "cash", label: "Cash" },
  { v: "bank_transfer", label: "Bank transfer" },
  { v: "other", label: "Other" },
];

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
  practitioner_id: string | null;
};
type AthleteLite = { id: string; first_name: string | null; last_name: string | null };
type ApptType = { id: string; name: string; price_cents: number | null };
type Practitioner = { id: string; full_name: string };
type Line = { description: string; qty: number; unit: string };
type Payment = { id: string; method: string; amount_cents: number; paid_at: string; reference: string | null };
type Item = { id: string; description: string; quantity: number; unit_price_cents: number; amount_cents: number };

function money(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}
function parseMoney(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100);
}
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function athleteName(a: AthleteLite): string {
  return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Athlete";
}
function statusBadge(s: string): string {
  return s === "paid"
    ? "bg-lime-500/20 text-lime-200"
    : s === "part_paid"
    ? "bg-amber-500/20 text-amber-200"
    : s === "void"
    ? "bg-slate-600/40 text-slate-300"
    : s === "sent"
    ? "bg-sky-500/20 text-sky-200"
    : "bg-slate-700/50 text-slate-300";
}

export default function InvoicesPage() {
  const staffOk = useRequireDashboardStaff();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paidById, setPaidById] = useState<Record<string, number>>({});
  const [athletes, setAthletes] = useState<AthleteLite[]>([]);
  const [types, setTypes] = useState<ApptType[]>([]);
  const [pracs, setPracs] = useState<Practitioner[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("id, organisation_id").eq("id", user.id).single();
    const org = (profile?.organisation_id as string) ?? null;
    setProfileId(profile?.id as string);
    setOrgId(org);
    if (!org) {
      setLoading(false);
      return;
    }
    const [{ data: inv }, { data: pay }, { data: ath }, { data: t }, { data: pr }] = await Promise.all([
      supabase.from("invoices").select("id, invoice_number, client_name, client_email, status, issued_date, due_date, total_cents, athlete_id, practitioner_id").eq("organisation_id", org).order("issued_date", { ascending: false }),
      supabase.from("payments").select("invoice_id, amount_cents").eq("organisation_id", org),
      supabase.from("athletes").select("id, first_name, last_name").order("last_name"),
      supabase.from("appointment_types").select("id, name, price_cents").eq("organisation_id", org).eq("is_active", true).order("name"),
      supabase.from("practitioners").select("id, full_name").eq("organisation_id", org).eq("is_active", true).order("full_name"),
    ]);
    setInvoices((inv ?? []) as Invoice[]);
    const paid: Record<string, number> = {};
    for (const p of pay ?? []) paid[p.invoice_id as string] = (paid[p.invoice_id as string] ?? 0) + (p.amount_cents as number);
    setPaidById(paid);
    setAthletes((ath ?? []) as AthleteLite[]);
    setTypes((t ?? []) as ApptType[]);
    setPracs((pr ?? []) as Practitioner[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (staffOk) void load();
  }, [staffOk, load]);

  const totals = useMemo(() => {
    let outstanding = 0;
    for (const i of invoices) {
      if (i.status === "void") continue;
      outstanding += Math.max(0, i.total_cents - (paidById[i.id] ?? 0));
    }
    return { outstanding };
  }, [invoices, paidById]);

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
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
          <aside className="w-full shrink-0 lg:w-48"><PracticeSidebar /></aside>
          <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">INVOICES</h1>
            <p className="mt-1 text-sm text-slate-400">Outstanding: <span className="font-semibold text-slate-200">{money(totals.outstanding)}</span></p>
          </div>
          <button type="button" onClick={() => setShowCreate(true)} className="rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110">
            + New invoice
          </button>
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Owing</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-4 text-xs text-slate-500">Loading…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-xs text-slate-500">No invoices yet.</td></tr>
              ) : (
                invoices.map((i) => {
                  const paid = paidById[i.id] ?? 0;
                  const owing = Math.max(0, i.total_cents - paid);
                  return (
                    <tr key={i.id} onClick={() => setDetailId(i.id)} className="cursor-pointer border-b border-slate-800/60 text-slate-200 hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-medium">{i.invoice_number}</td>
                      <td className="px-3 py-2">{i.client_name ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-400">{i.issued_date}</td>
                      <td className="px-3 py-2 text-right">{money(i.total_cents)}</td>
                      <td className="px-3 py-2 text-right">{owing > 0 ? money(owing) : "—"}</td>
                      <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(i.status)}`}>{i.status.replace("_", " ")}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
          </div>
        </div>
      </section>

      {showCreate ? (
        <CreateInvoice orgId={orgId} profileId={profileId} athletes={athletes} types={types} pracs={pracs} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); void load(); }} />
      ) : null}
      {detailId ? (
        <InvoiceDetail invoiceId={detailId} orgId={orgId} profileId={profileId} onClose={() => setDetailId(null)} onChanged={() => void load()} />
      ) : null}
    </main>
  );
}

// ---- Create ------------------------------------------------------------------

function CreateInvoice({
  orgId,
  profileId,
  athletes,
  types,
  pracs,
  onClose,
  onSaved,
}: {
  orgId: string | null;
  profileId: string | null;
  athletes: AthleteLite[];
  types: ApptType[];
  pracs: Practitioner[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [pracId, setPracId] = useState("");
  const [issued, setIssued] = useState(today());
  const [due, setDue] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: 1, unit: "" }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return athletes.filter((a) => athleteName(a).toLowerCase().includes(q)).slice(0, 6);
  }, [search, athletes]);

  const total = lines.reduce((s, l) => s + Math.round(l.qty * parseMoney(l.unit)), 0);
  const inp = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";

  function addLine() {
    setLines((p) => [...p, { description: "", qty: 1, unit: "" }]);
  }
  function addFromType(id: string) {
    const t = types.find((x) => x.id === id);
    if (t) setLines((p) => [...p, { description: t.name, qty: 1, unit: t.price_cents != null ? (t.price_cents / 100).toFixed(2) : "" }]);
  }
  function editLine(i: number, ch: Partial<Line>) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...ch } : l)));
  }

  async function save() {
    if (!orgId) return;
    const client = athleteId ? athleteName(athletes.find((a) => a.id === athleteId)!) : clientName.trim();
    if (!client) {
      setErr("Choose an athlete or enter a client name.");
      return;
    }
    const valid = lines.filter((l) => l.description.trim() && parseMoney(l.unit) >= 0 && l.qty > 0);
    if (valid.length === 0) {
      setErr("Add at least one line item.");
      return;
    }
    setSaving(true);
    setErr(null);
    const { data: inv, error: e } = await supabase
      .from("invoices")
      .insert({
        organisation_id: orgId,
        athlete_id: athleteId,
        practitioner_id: pracId || null,
        client_name: client,
        client_email: clientEmail.trim() || null,
        status: "draft",
        issued_date: issued,
        due_date: due || null,
        total_cents: total,
        created_by: profileId,
      })
      .select("id")
      .single();
    if (e || !inv) {
      setSaving(false);
      setErr(e?.message ?? "Could not create invoice.");
      return;
    }
    const items = valid.map((l) => ({
      invoice_id: inv.id,
      organisation_id: orgId,
      description: l.description.trim(),
      quantity: l.qty,
      unit_price_cents: parseMoney(l.unit),
      amount_cents: Math.round(l.qty * parseMoney(l.unit)),
    }));
    const { error: ie } = await supabase.from("invoice_items").insert(items);
    setSaving(false);
    if (ie) {
      setErr(ie.message);
      return;
    }
    onSaved();
  }

  return (
    <Modal title="New invoice" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400">Athlete <span className="text-slate-600">(or manual client below)</span></label>
          {athleteId ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 text-xs text-lime-200">
              {search}
              <button type="button" onClick={() => { setAthleteId(null); setSearch(""); }} className="text-lime-400 hover:text-rose-300">×</button>
            </span>
          ) : (
            <>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search athletes…" className={`mt-1 w-full ${inp}`} />
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

        {!athleteId ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400">Client name</label>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={`mt-1 w-full ${inp}`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Email</label>
              <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={`mt-1 w-full ${inp}`} />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-slate-400">Email <span className="text-slate-600">(for sending)</span></label>
            <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={`mt-1 w-full ${inp}`} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400">Practitioner</label>
            <select value={pracId} onChange={(e) => setPracId(e.target.value)} className={`mt-1 w-full ${inp}`}>
              <option value="">—</option>
              {pracs.map((p) => (<option key={p.id} value={p.id}>{p.full_name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Issued</label>
            <input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className={`mt-1 w-full ${inp}`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Due</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`mt-1 w-full ${inp}`} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-400">Line items</label>
            <select value="" onChange={(e) => { if (e.target.value) addFromType(e.target.value); }} className={inp}>
              <option value="">+ from service…</option>
              {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
          <div className="mt-2 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={l.description} onChange={(e) => editLine(i, { description: e.target.value })} placeholder="Description" className={`flex-1 ${inp}`} />
                <input type="number" min={1} value={l.qty} onChange={(e) => editLine(i, { qty: Number(e.target.value) || 1 })} className={`w-14 ${inp}`} />
                <span className="text-slate-500">×</span>
                <input value={l.unit} onChange={(e) => editLine(i, { unit: e.target.value })} placeholder="$" className={`w-20 ${inp}`} />
                <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-rose-300">×</button>
              </div>
            ))}
            <button type="button" onClick={addLine} className="text-xs text-lime-300 hover:text-lime-200">+ Add line</button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
          <span className="text-slate-400">Total</span>
          <span className="font-semibold text-slate-100">{money(total)}</span>
        </div>

        {err ? <p className="text-xs text-rose-400">{err}</p> : null}
      </div>

      <ModalActions>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">{saving ? "Saving…" : "Create invoice"}</button>
      </ModalActions>
    </Modal>
  );
}

// ---- Detail + payments -------------------------------------------------------

function InvoiceDetail({
  invoiceId,
  orgId,
  profileId,
  onClose,
  onChanged,
}: {
  invoiceId: string;
  orgId: string | null;
  profileId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [method, setMethod] = useState("hicaps");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [{ data: i }, { data: it }, { data: p }] = await Promise.all([
      supabase.from("invoices").select("id, invoice_number, client_name, client_email, status, issued_date, due_date, total_cents, athlete_id, practitioner_id").eq("id", invoiceId).single(),
      supabase.from("invoice_items").select("id, description, quantity, unit_price_cents, amount_cents").eq("invoice_id", invoiceId),
      supabase.from("payments").select("id, method, amount_cents, paid_at, reference").eq("invoice_id", invoiceId).order("paid_at"),
    ]);
    setInv((i as Invoice) ?? null);
    setItems((it ?? []) as Item[]);
    setPayments((p ?? []) as Payment[]);
  }, [invoiceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const paid = payments.reduce((s, p) => s + p.amount_cents, 0);
  const owing = inv ? Math.max(0, inv.total_cents - paid) : 0;

  useEffect(() => {
    if (owing > 0 && amount === "") setAmount((owing / 100).toFixed(2));
  }, [owing]); // eslint-disable-line react-hooks/exhaustive-deps

  async function deriveStatus(newPaid: number) {
    if (!inv) return;
    let status = inv.status;
    if (status !== "void") {
      if (inv.total_cents > 0 && newPaid >= inv.total_cents) status = "paid";
      else if (newPaid > 0) status = "part_paid";
      else status = inv.status === "sent" ? "sent" : "draft";
    }
    if (status !== inv.status) {
      await supabase.from("invoices").update({ status }).eq("id", inv.id);
    }
  }

  async function addPayment() {
    if (!orgId || !inv) return;
    const cents = parseMoney(amount);
    if (cents <= 0) {
      setErr("Enter an amount.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error: e } = await supabase.from("payments").insert({
      organisation_id: orgId,
      invoice_id: inv.id,
      method,
      amount_cents: cents,
      paid_at: new Date(`${paidAt}T12:00:00+08:00`).toISOString(),
      reference: reference.trim() || null,
      created_by: profileId,
    });
    if (e) {
      setBusy(false);
      setErr(e.message);
      return;
    }
    await deriveStatus(paid + cents);
    setAmount("");
    setReference("");
    setBusy(false);
    await reload();
    onChanged();
  }

  async function removePayment(id: string, amt: number) {
    await supabase.from("payments").delete().eq("id", id);
    await deriveStatus(paid - amt);
    await reload();
    onChanged();
  }

  async function setStatus(status: string) {
    if (!inv) return;
    await supabase.from("invoices").update({ status }).eq("id", inv.id);
    await reload();
    onChanged();
  }

  const inp = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200";

  return (
    <Modal title={inv ? inv.invoice_number : "Invoice"} onClose={onClose}>
      {!inv ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium text-slate-100">{inv.client_name}</div>
              {inv.client_email ? <div className="text-xs text-slate-400">{inv.client_email}</div> : null}
              <div className="text-xs text-slate-500">Issued {inv.issued_date}{inv.due_date ? ` · due ${inv.due_date}` : ""}</div>
            </div>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(inv.status)}`}>{inv.status.replace("_", " ")}</span>
          </div>

          <div className="rounded-lg border border-slate-800">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between border-b border-slate-800/60 px-3 py-1.5 text-sm text-slate-300 last:border-0">
                <span>{it.description}{it.quantity > 1 ? ` ×${it.quantity}` : ""}</span>
                <span>{money(it.amount_cents)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-1.5 text-sm font-semibold text-slate-100">
              <span>Total</span><span>{money(inv.total_cents)}</span>
            </div>
          </div>

          {/* payments */}
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-200">Payments</span>
              <span className="text-xs text-slate-400">Paid {money(paid)} · Owing <span className="font-semibold text-slate-200">{money(owing)}</span></span>
            </div>
            {payments.length ? (
              <ul className="mt-2 space-y-1">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1 text-xs text-slate-300">
                    <span>{METHODS.find((m) => m.v === p.method)?.label ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                    <span className="flex items-center gap-2">{money(p.amount_cents)}<button type="button" onClick={() => void removePayment(p.id, p.amount_cents)} className="text-slate-500 hover:text-rose-300">×</button></span>
                  </li>
                ))}
              </ul>
            ) : null}

            {inv.status !== "void" ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={inp}>
                  {METHODS.map((m) => (<option key={m.v} value={m.v}>{m.label}</option>))}
                </select>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" className={`w-20 ${inp}`} />
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
        {inv && inv.status === "draft" ? <button type="button" onClick={() => void setStatus("sent")} className="rounded-lg border border-sky-500/40 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/10">Mark sent</button> : null}
        {inv && inv.status !== "void" ? <button type="button" onClick={() => void setStatus("void")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Void</button> : null}
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
      </ModalActions>
    </Modal>
  );
}

// ---- shared modal shell ------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-slate-100">{title}</h2>
        {children}
      </div>
    </div>
  );
}
function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
