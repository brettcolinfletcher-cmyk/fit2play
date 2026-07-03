import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { sendInvoiceEmail } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Auth check — must be staff.
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role, organisation_id").eq("id", user.id).single();
    if (!profile || profile.role !== "staff") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const { invoiceId } = await req.json();
    if (!invoiceId) return NextResponse.json({ error: "invoiceId required." }, { status: 400 });

    // Fetch invoice + items + payments with service-role (RLS already checked above).
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const [{ data: inv }, { data: items }, { data: payments }, ] = await Promise.all([
      admin.from("invoices")
        .select("id, invoice_number, client_name, client_email, status, issued_date, due_date, total_cents, practitioner_id")
        .eq("id", invoiceId)
        .eq("organisation_id", profile.organisation_id)
        .single(),
      admin.from("invoice_items")
        .select("description, quantity, unit_price_cents, amount_cents")
        .eq("invoice_id", invoiceId),
      admin.from("payments")
        .select("amount_cents")
        .eq("invoice_id", invoiceId),
    ]);

    if (!inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (!inv.client_email) return NextResponse.json({ error: "No email address on this invoice." }, { status: 400 });

    // Fetch practitioner name if linked.
    let practitionerName: string | undefined;
    if (inv.practitioner_id) {
      const { data: prac } = await admin.from("practitioners").select("full_name").eq("id", inv.practitioner_id).single();
      practitionerName = prac?.full_name ?? undefined;
    }

    const paidCents = (payments ?? []).reduce((s: number, p: { amount_cents: number }) => s + p.amount_cents, 0);

    await sendInvoiceEmail({
      clientName: inv.client_name ?? "there",
      clientEmail: inv.client_email,
      invoiceNumber: inv.invoice_number,
      status: inv.status,
      issuedDate: inv.issued_date,
      dueDate: inv.due_date ?? null,
      totalCents: inv.total_cents,
      paidCents,
      items: (items ?? []) as { description: string; quantity: number; unit_price_cents: number; amount_cents: number }[],
      practitionerName,
    });

    // Mark as 'sent' if it was still draft.
    if (inv.status === "draft") {
      await admin.from("invoices").update({ status: "sent" }).eq("id", invoiceId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
