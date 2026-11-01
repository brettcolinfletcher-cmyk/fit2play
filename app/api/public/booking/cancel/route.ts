import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/booking/publicBooking";
import { sendBookingCancellation } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

/**
 * Public cancel-by-token, used by the "Need to cancel?" link in booking
 * confirmation and reminder emails (/book/cancel?token=...).
 *
 * GET  ?token=  -> booking summary (service, time, whether it can be cancelled)
 * POST {token}  -> cancels it, emails the client and the clinic
 *
 * The token is the booking's random cancel_token UUID. Nothing else about the
 * booking (notes, other bookings, the diary) is ever returned.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANCELLABLE = new Set(["pending", "confirmed"]);

type BookingRow = {
  id: string;
  status: string;
  start_at: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  appointment_types: { name: string | null } | null;
  practitioners: { full_name: string | null } | null;
};

async function findBooking(token: string): Promise<BookingRow | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, status, start_at, client_name, client_email, client_phone, appointment_types(name), practitioners(full_name)"
    )
    .eq("cancel_token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as BookingRow;
}

function summary(b: BookingRow) {
  const inFuture = new Date(b.start_at).getTime() > Date.now();
  return {
    serviceName: b.appointment_types?.name ?? "Appointment",
    practitionerName: b.practitioners?.full_name ?? null,
    startAt: b.start_at,
    status: b.status,
    canCancel: CANCELLABLE.has(b.status) && inFuture,
    reason: !inFuture ? "past" : b.status === "cancelled" ? "already_cancelled" : null,
  };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "This cancellation link is not valid." }, { status: 400 });
  }
  try {
    const b = await findBooking(token);
    if (!b) {
      return NextResponse.json({ error: "We couldn't find that booking." }, { status: 404 });
    }
    return NextResponse.json(summary(b));
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "This cancellation link is not valid." }, { status: 400 });
  }
  try {
    const b = await findBooking(token);
    if (!b) {
      return NextResponse.json({ error: "We couldn't find that booking." }, { status: 404 });
    }
    const s = summary(b);
    if (!s.canCancel) {
      return NextResponse.json({ ...s, error: "This booking can no longer be cancelled online." }, { status: 409 });
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", b.id)
      .in("status", Array.from(CANCELLABLE));
    if (error) {
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }

    try {
      await sendBookingCancellation({
        clientName: b.client_name ?? "there",
        clientEmail: b.client_email,
        clientPhone: b.client_phone,
        serviceName: s.serviceName,
        startAt: b.start_at,
        practitionerName: s.practitionerName ?? "your practitioner",
      });
    } catch {
      // Email failure is non-fatal: the booking is already cancelled.
    }

    return NextResponse.json({ ...s, status: "cancelled", canCancel: false, cancelled: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
