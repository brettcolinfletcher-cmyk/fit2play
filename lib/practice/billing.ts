/**
 * Pure billing helpers shared by the diary, invoices and GPS hire pages.
 * No Supabase access here so it can be unit tested.
 */

export const PERTH_TZ = "Australia/Perth";

export const METHODS: { v: string; label: string }[] = [
  { v: "health_fund", label: "Health fund" },
  { v: "medicare", label: "Medicare" },
  { v: "hicaps", label: "HICAPS" },
  { v: "eftpos", label: "EFTPOS" },
  { v: "credit_card", label: "Credit card" },
  { v: "cash", label: "Cash" },
  { v: "bank_transfer", label: "Bank transfer" },
  { v: "direct_debit", label: "Direct debit" },
  { v: "other", label: "Other" },
];

export function money(cents: number): string {
  const neg = cents < 0;
  return `${neg ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** "$12.50", "12.5", "-10" → cents. Blank or junk → null. */
export function parseMoney(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function centsToInput(c: number | null | undefined): string {
  return c == null ? "" : (c / 100).toFixed(2);
}

export function perthToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PERTH_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Add calendar days to a YYYY-MM-DD date. */
export function addDaysISO(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Add months to a YYYY-MM-DD date, clamping to month end (31 Jan + 1 → 28/29 Feb). */
export function addMonthsISO(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function fmtDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function lineAmount(qty: number, unitCents: number): number {
  return Math.round(qty * unitCents);
}

export type InvoiceStatus = "draft" | "sent" | "part_paid" | "paid" | "void";

/** Status after payments or edits. Void stays void; a zero or credit invoice with nothing owing counts as paid. */
export function deriveInvoiceStatus(current: InvoiceStatus, totalCents: number, paidCents: number, wasSent: boolean): InvoiceStatus {
  if (current === "void") return "void";
  if (paidCents > 0 && paidCents >= totalCents) return "paid";
  if (paidCents > 0) return "part_paid";
  if (totalCents <= 0 && current === "paid") return "paid";
  return wasSent || current === "sent" ? "sent" : "draft";
}

// ---- GPS hire ----------------------------------------------------------------

export type GpsHire = {
  id: string;
  client_name: string;
  team_id: string | null;
  athlete_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  units_count: number;
  unit_refs: string | null;
  start_date: string;
  end_date: string | null;
  units_returned_date: string | null;
  status: "active" | "paused" | "ended";
  one_off_fee_cents: number | null;
  subscription_cents: number | null;
  price_per_unit: boolean;
  interval_months: number;
  next_renewal_date: string | null;
  agreed_until: string | null;
  notes: string | null;
};

export type BillingKind = "one_off" | "subscription" | "both" | "none";

export function hireBillingKind(h: Pick<GpsHire, "one_off_fee_cents" | "subscription_cents">): BillingKind {
  const one = (h.one_off_fee_cents ?? 0) > 0;
  const sub = (h.subscription_cents ?? 0) > 0;
  return one && sub ? "both" : one ? "one_off" : sub ? "subscription" : "none";
}

/** Subscription charge for one period (per-unit pricing multiplies by units). */
export function hirePeriodCents(h: Pick<GpsHire, "subscription_cents" | "price_per_unit" | "units_count">): number {
  const base = h.subscription_cents ?? 0;
  return h.price_per_unit ? base * Math.max(0, h.units_count) : base;
}

/** The period a renewal invoice covers, starting from next_renewal_date (or the hire start). */
export function renewalPeriod(h: Pick<GpsHire, "next_renewal_date" | "start_date" | "interval_months">): { start: string; end: string; next: string } {
  const start = h.next_renewal_date ?? h.start_date;
  const next = addMonthsISO(start, h.interval_months || 1);
  return { start, end: addDaysISO(next, -1), next };
}

/** True when the next renewal period would start after the agreed end date. */
export function renewalPastAgreement(h: Pick<GpsHire, "next_renewal_date" | "start_date" | "interval_months" | "agreed_until">): boolean {
  if (!h.agreed_until) return false;
  return renewalPeriod(h).start > h.agreed_until;
}

export function intervalLabel(months: number): string {
  if (months === 1) return "month";
  if (months === 3) return "quarter";
  if (months === 12) return "year";
  return `${months} months`;
}

export type FollowUpReason = "renewal_overdue" | "renewal_due" | "agreement_ended" | "agreement_ending" | "invoice_overdue" | "unpaid" | "units_out";

export type FollowUp = { reason: FollowUpReason; label: string; severity: 1 | 2 | 3; days?: number };

/**
 * Why a hire needs chasing, most urgent first.
 * - renewal overdue: active subscription whose renewal date has passed
 * - renewal due: within `dueSoonDays`
 * - invoice overdue / unpaid: money owing on this hire's invoices
 * - units out: hire ended but units not marked returned
 */
export function hireFollowUps(
  h: Pick<GpsHire, "status" | "subscription_cents" | "next_renewal_date" | "units_count"> & { units_returned_date?: string | null; agreed_until?: string | null },
  owing: { owingCents: number; oldestOverdueDue: string | null },
  today: string,
  dueSoonDays = 7,
  agreementSoonDays = 14
): FollowUp[] {
  const out: FollowUp[] = [];
  const hasSub = (h.subscription_cents ?? 0) > 0;
  const live = h.status === "active" || h.status === "paused";
  if (live && h.agreed_until) {
    const d = daysBetween(today, h.agreed_until);
    if (d < 0) out.push({ reason: "agreement_ended", label: `Agreement ended ${-d}d ago`, severity: 3, days: d });
    else if (d <= agreementSoonDays) out.push({ reason: "agreement_ending", label: d === 0 ? "Agreement ends today" : `Agreement ends in ${d}d`, severity: 2, days: d });
  }
  // no renewal nag once the next period would start after the agreed end
  const pastAgreement = !!(h.agreed_until && h.next_renewal_date && h.next_renewal_date > h.agreed_until);
  if (h.status === "active" && hasSub && h.next_renewal_date && !pastAgreement) {
    const d = daysBetween(today, h.next_renewal_date);
    if (d < 0) out.push({ reason: "renewal_overdue", label: `Renewal ${-d}d overdue`, severity: 3, days: d });
    else if (d <= dueSoonDays) out.push({ reason: "renewal_due", label: d === 0 ? "Renews today" : `Renews in ${d}d`, severity: 2, days: d });
  }
  if (owing.owingCents > 0) {
    if (owing.oldestOverdueDue) {
      const d = daysBetween(owing.oldestOverdueDue, today);
      out.push({ reason: "invoice_overdue", label: `${money(owing.owingCents)} owing, ${d}d overdue`, severity: 3, days: d });
    } else {
      out.push({ reason: "unpaid", label: `${money(owing.owingCents)} owing`, severity: 1 });
    }
  }
  if (h.status === "ended" && h.units_count > 0 && !h.units_returned_date) out.push({ reason: "units_out", label: `${h.units_count} unit${h.units_count === 1 ? "" : "s"} not returned`, severity: 2 });
  return out.sort((a, b) => b.severity - a.severity);
}
