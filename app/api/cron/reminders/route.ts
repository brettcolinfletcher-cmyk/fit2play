import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBookingReminder } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

/**
 * 24-hour appointment reminder cron.
 * Vercel calls this daily at 08:00 Perth time (00:00 UTC).
 * Finds all confirmed/pending bookings starting between 23-25 hours from now
 * and sends a reminder email to those with a client_email.
 */

export async function GET(req: NextRequest) {
  // Secure the cron endpoint — Vercel signs cron requests with this header,
  // or we fall back to the sync secret for manual triggers.
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET ?? process.env.SYNC_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

  const { data: bookings, error } = await admin
    .from("bookings")
    .select(`
      id, start_at, end_at, client_name, client_email, cancel_token, status,
      appointment_types ( name ),
      practitioners ( full_name )
    `)
    .in("status", ["confirmed", "pending"])
    .gte("start_at", windowStart)
    .lte("start_at", windowEnd)
    .not("client_email", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { id: string; sent: boolean; error?: string }[] = [];

  for (const b of bookings ?? []) {
    try {
      const type = Array.isArray(b.appointment_types) ? b.appointment_types[0] : b.appointment_types;
      const prac = Array.isArray(b.practitioners) ? b.practitioners[0] : b.practitioners;
      await sendBookingReminder({
        clientName: (b.client_name as string) ?? "there",
        clientEmail: b.client_email as string,
        serviceName: (type as { name: string } | null)?.name ?? "Appointment",
        startAt: b.start_at as string,
        practitionerName: (prac as { full_name: string } | null)?.full_name ?? "your practitioner",
        cancelToken: (b.cancel_token as string) ?? null,
      });
      results.push({ id: b.id as string, sent: true });
    } catch (err) {
      results.push({ id: b.id as string, sent: false, error: String(err) });
    }
  }

  return NextResponse.json({ sent: results.filter((r) => r.sent).length, results });
}
