"use client";

import { supabase } from "@/lib/supabaseClient";
import { addDaysISO, deriveInvoiceStatus, lineAmount, perthToday, type InvoiceStatus } from "@/lib/practice/billing";

/**
 * Client-side invoice actions shared by Diary, Invoices and GPS hire.
 * All writes go through the staff RLS policies on invoices / invoice_items.
 */

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  appointment_type_id?: string | null;
};

export type InvoiceHeaderInput = {
  organisation_id: string;
  created_by: string | null;
  client_name: string;
  client_email?: string | null;
  athlete_id?: string | null;
  team_id?: string | null;
  practitioner_id?: string | null;
  booking_id?: string | null;
  gps_hire_id?: string | null;
  issued_date?: string;
  due_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  notes?: string | null;
};

export function linesTotal(lines: InvoiceLineInput[]): number {
  return lines.reduce((s, l) => s + lineAmount(l.quantity, l.unit_price_cents), 0);
}

export async function createInvoice(header: InvoiceHeaderInput, lines: InvoiceLineInput[]): Promise<{ id: string } | { error: string }> {
  const valid = lines.filter((l) => l.description.trim() && l.quantity !== 0);
  if (valid.length === 0) return { error: "Add at least one line item." };
  const total = linesTotal(valid);
  const issued = header.issued_date ?? perthToday();
  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      ...header,
      issued_date: issued,
      due_date: header.due_date === undefined ? addDaysISO(issued, 14) : header.due_date,
      status: total <= 0 ? "paid" : "draft",
      total_cents: total,
    })
    .select("id")
    .single();
  if (error || !inv) return { error: error?.message ?? "Could not create invoice." };
  const { error: ie } = await supabase.from("invoice_items").insert(
    valid.map((l) => ({
      invoice_id: inv.id,
      organisation_id: header.organisation_id,
      description: l.description.trim(),
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
      amount_cents: lineAmount(l.quantity, l.unit_price_cents),
      appointment_type_id: l.appointment_type_id ?? null,
    }))
  );
  if (ie) {
    await supabase.from("invoices").delete().eq("id", inv.id);
    return { error: ie.message };
  }
  return { id: inv.id as string };
}

/** Replace all line items on an invoice, update the total and re-derive status from payments. */
export async function replaceInvoiceItems(invoiceId: string, organisationId: string, lines: InvoiceLineInput[]): Promise<{ error?: string }> {
  const valid = lines.filter((l) => l.description.trim() && l.quantity !== 0);
  if (valid.length === 0) return { error: "Add at least one line item." };
  const { error: de } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (de) return { error: de.message };
  const { error: ie } = await supabase.from("invoice_items").insert(
    valid.map((l) => ({
      invoice_id: invoiceId,
      organisation_id: organisationId,
      description: l.description.trim(),
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
      amount_cents: lineAmount(l.quantity, l.unit_price_cents),
      appointment_type_id: l.appointment_type_id ?? null,
    }))
  );
  if (ie) return { error: ie.message };
  await supabase.from("invoices").update({ total_cents: linesTotal(valid) }).eq("id", invoiceId);
  await syncInvoiceStatus(invoiceId);
  return {};
}

/** Recompute status from the invoice total and its payments. */
export async function syncInvoiceStatus(invoiceId: string): Promise<InvoiceStatus | null> {
  const [{ data: inv }, { data: pays }] = await Promise.all([
    supabase.from("invoices").select("status, total_cents").eq("id", invoiceId).single(),
    supabase.from("payments").select("amount_cents").eq("invoice_id", invoiceId),
  ]);
  if (!inv) return null;
  const paid = (pays ?? []).reduce((s, p) => s + Number(p.amount_cents), 0);
  const cur = inv.status as InvoiceStatus;
  const next = deriveInvoiceStatus(cur, Number(inv.total_cents), paid, cur === "sent" || cur === "part_paid" || cur === "paid");
  const final = Number(inv.total_cents) <= 0 && cur !== "void" ? "paid" : next;
  if (final !== cur) await supabase.from("invoices").update({ status: final }).eq("id", invoiceId);
  return final;
}

// ---- From diary bookings -----------------------------------------------------

type BookingForInvoice = {
  id: string;
  organisation_id: string;
  practitioner_id: string | null;
  athlete_id: string | null;
  client_name: string | null;
  client_email: string | null;
  start_at: string;
  price_cents: number | null;
  title: string | null;
  appointment_type_id: string | null;
  appointment_types: { name: string; price_cents: number | null } | { name: string; price_cents: number | null }[] | null;
  athletes: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
};
type AttendeeForInvoice = {
  id: string;
  athlete_id: string | null;
  team_id: string | null;
  client_name: string | null;
  client_email: string | null;
  price_cents: number | null;
  attendance: string;
  invoice_id: string | null;
  athletes: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  teams: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return !v ? null : Array.isArray(v) ? v[0] ?? null : v;
}
function nm(a: { first_name: string | null; last_name: string | null } | null): string {
  return a ? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() : "";
}

/**
 * Invoice a diary booking. Single bookings get one invoice. Group bookings get one invoice
 * per attendee not yet invoiced (teams billed as the team). Returns created invoice ids.
 */
export async function invoiceBooking(bookingId: string, createdBy: string | null): Promise<{ ids: string[]; skipped: number; error?: string }> {
  const { data: b, error } = await supabase
    .from("bookings")
    .select("id, organisation_id, practitioner_id, athlete_id, client_name, client_email, start_at, price_cents, title, appointment_type_id, appointment_types(name, price_cents), athletes(first_name, last_name)")
    .eq("id", bookingId)
    .single();
  if (error || !b) return { ids: [], skipped: 0, error: error?.message ?? "Booking not found." };
  const bk = b as unknown as BookingForInvoice;
  const type = one(bk.appointment_types);
  const baseFee = bk.price_cents ?? type?.price_cents ?? 0;
  const dateStr = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Perth", day: "numeric", month: "short", year: "numeric" }).format(new Date(bk.start_at));
  const label = `${type?.name ?? bk.title ?? "Appointment"} — ${dateStr}`;

  const { data: att } = await supabase
    .from("booking_attendees")
    .select("id, athlete_id, team_id, client_name, client_email, price_cents, attendance, invoice_id, athletes(first_name, last_name), teams(name)")
    .eq("booking_id", bookingId);
  const attendees = (att ?? []) as unknown as AttendeeForInvoice[];

  const common = {
    organisation_id: bk.organisation_id,
    created_by: createdBy,
    practitioner_id: bk.practitioner_id,
    booking_id: bk.id,
  };

  if (attendees.length === 0) {
    const { data: existing } = await supabase.from("invoices").select("id").eq("booking_id", bk.id).neq("status", "void").limit(1);
    if (existing && existing.length) return { ids: [], skipped: 1, error: "This booking already has an invoice." };
    const res = await createInvoice(
      { ...common, athlete_id: bk.athlete_id, client_name: nm(one(bk.athletes)) || bk.client_name || "Client", client_email: bk.client_email },
      [{ description: label, quantity: 1, unit_price_cents: baseFee, appointment_type_id: bk.appointment_type_id }]
    );
    return "error" in res ? { ids: [], skipped: 0, error: res.error } : { ids: [res.id], skipped: 0 };
  }

  const ids: string[] = [];
  let skipped = 0;
  for (const a of attendees) {
    if (a.invoice_id || a.attendance === "cancelled") { skipped++; continue; }
    const team = one(a.teams);
    const name = team?.name ?? (nm(one(a.athletes)) || a.client_name || "Client");
    const res = await createInvoice(
      { ...common, athlete_id: a.athlete_id, team_id: a.team_id, client_name: name, client_email: a.client_email },
      [{ description: bk.title ? `${bk.title} — ${dateStr}` : label, quantity: 1, unit_price_cents: a.price_cents ?? baseFee, appointment_type_id: bk.appointment_type_id }]
    );
    if ("error" in res) return { ids, skipped, error: res.error };
    ids.push(res.id);
    await supabase.from("booking_attendees").update({ invoice_id: res.id }).eq("id", a.id);
  }
  return { ids, skipped };
}
