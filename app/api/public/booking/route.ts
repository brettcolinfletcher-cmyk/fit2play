import { NextRequest, NextResponse } from "next/server";
import {
  getAdminClient,
  resolveClinic,
  listPublicTypes,
  getSlotsForDate,
  createPublicBooking,
  todayPerth,
  addDaysStr,
  MAX_ADVANCE_DAYS,
  type PublicApptType,
} from "@/lib/booking/publicBooking";
import { sendBookingConfirmation } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = todayPerth();
  const max = addDaysStr(today, MAX_ADVANCE_DAYS);
  return dateStr >= today && dateStr <= max;
}

// GET  /api/public/booking                      -> clinic + bookable types
// GET  /api/public/booking?typeId=..&date=..     -> available slots
export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient();
    const clinic = await resolveClinic(admin);
    if (!clinic) {
      return NextResponse.json({ error: "Booking is not configured yet." }, { status: 503 });
    }

    const typeId = req.nextUrl.searchParams.get("typeId");
    const date = req.nextUrl.searchParams.get("date");

    if (typeId && date) {
      if (!isValidDate(date)) {
        return NextResponse.json({ error: "Invalid date." }, { status: 400 });
      }
      const types = await listPublicTypes(admin, clinic.organisationId);
      const type = types.find((t) => t.id === typeId) as PublicApptType | undefined;
      if (!type) {
        return NextResponse.json({ error: "Unknown appointment type." }, { status: 400 });
      }
      const slots = await getSlotsForDate(admin, clinic, type, date);
      return NextResponse.json({ slots });
    }

    const types = await listPublicTypes(admin, clinic.organisationId);
    return NextResponse.json({
      clinic: { name: clinic.organisationName, clinician: clinic.clinicianName },
      types,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

// POST /api/public/booking  -> create a pending public booking
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    // Honeypot: real users never fill this hidden field.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({ ok: true, bookingId: "ignored", label: "" });
    }

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const notes = typeof body.notes === "string" ? body.notes : "";
    const typeId = String(body.typeId ?? "");
    const dateStr = String(body.date ?? "");
    const startIso = String(body.startIso ?? "");

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "Please enter your first and last name." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "Please enter a contact phone number." }, { status: 400 });
    }
    if (!typeId || !isValidDate(dateStr) || !startIso) {
      return NextResponse.json({ error: "Please choose a valid appointment time." }, { status: 400 });
    }

    const admin = getAdminClient();
    const clinic = await resolveClinic(admin);
    if (!clinic) {
      return NextResponse.json({ error: "Booking is not configured yet." }, { status: 503 });
    }

    const result = await createPublicBooking(admin, clinic, {
      typeId,
      dateStr,
      startIso,
      firstName,
      lastName,
      email,
      phone,
      notes,
    });

    if (!result.ok) {
      const status = result.error === "slot_taken" || result.error === "slot_unavailable" ? 409 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }

    // Fire confirmation email — non-blocking, never fails the booking.
    try {
      const types = await listPublicTypes(admin, clinic.organisationId);
      const type = types.find((t) => t.id === typeId);
      await sendBookingConfirmation({
        clientName: `${firstName} ${lastName}`.trim(),
        clientEmail: email,
        serviceName: type?.name ?? "Appointment",
        startAt: startIso,
        endAt: new Date(new Date(startIso).getTime() + (type?.duration_min ?? 60) * 60000).toISOString(),
        practitionerName: clinic.clinicianName,
        cancelToken: result.cancelToken,
      });
    } catch {
      // Email failure is non-fatal — booking is already saved.
    }

    return NextResponse.json({ ok: true, bookingId: result.bookingId, label: result.label });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
