import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side booking engine for the PUBLIC (patient-facing) flow.
 * Practitioner-centric: slots and bookings key off practitioner_id. Never leaks
 * the calendar to the browser — only free slot times go out. Perth (UTC+8) fixed.
 */

const PERTH_OFFSET = "+08:00";
const PERTH_TZ = "Australia/Perth";

export const SLOT_INTERVAL_MIN = 15;
export const MIN_NOTICE_MIN = 120;
export const MAX_ADVANCE_DAYS = 60;

export type PublicClinic = {
  organisationId: string;
  organisationName: string;
  practitionerId: string;
  clinicianProfileId: string | null;
  clinicianName: string;
};

export type PublicApptType = {
  id: string;
  name: string;
  duration_min: number;
  colour: string;
  buffer_before_min: number;
  buffer_after_min: number;
  price_cents: number | null;
};

export type Slot = { startIso: string; label: string };

export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin env vars are not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---- Perth time helpers ------------------------------------------------------

function calDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}
function weekdayOf(dateStr: string): number {
  return calDate(dateStr).getUTCDay();
}
export function addDaysStr(dateStr: string, n: number): string {
  const d = calDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function todayPerth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PERTH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function instantOf(dateStr: string, minutesOfDay: number): number {
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, "0");
  const mm = String(minutesOfDay % 60).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00${PERTH_OFFSET}`).getTime();
}
function isoOf(dateStr: string, minutesOfDay: number): string {
  return new Date(instantOf(dateStr, minutesOfDay)).toISOString();
}
function labelOf(minutesOfDay: number): string {
  const h24 = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  const ampm = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function timeToMin(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

// ---- window maths ------------------------------------------------------------

type Window = { s: number; e: number };

function subtract(windows: Window[], block: Window): Window[] {
  const out: Window[] = [];
  for (const w of windows) {
    if (block.e <= w.s || block.s >= w.e) {
      out.push(w);
      continue;
    }
    if (block.s > w.s) out.push({ s: w.s, e: block.s });
    if (block.e < w.e) out.push({ s: block.e, e: w.e });
  }
  return out;
}

function windowsForDate(
  weekday: number,
  availability: { weekday: number; start_time: string; end_time: string }[],
  exceptions: { start_time: string | null; end_time: string | null; is_available: boolean }[]
): Window[] {
  let windows: Window[] = availability
    .filter((a) => a.weekday === weekday)
    .map((a) => ({ s: timeToMin(a.start_time), e: timeToMin(a.end_time) }));

  if (exceptions.some((x) => !x.is_available && !x.start_time && !x.end_time)) return [];
  for (const x of exceptions) {
    if (x.is_available && x.start_time && x.end_time) {
      windows.push({ s: timeToMin(x.start_time), e: timeToMin(x.end_time) });
    }
  }
  for (const x of exceptions) {
    if (!x.is_available && x.start_time && x.end_time) {
      windows = subtract(windows, { s: timeToMin(x.start_time), e: timeToMin(x.end_time) });
    }
  }
  return windows.filter((w) => w.e > w.s).sort((a, b) => a.s - b.s);
}

// ---- clinic + types ----------------------------------------------------------

export async function resolveClinic(admin: SupabaseClient): Promise<PublicClinic | null> {
  const { data: org } = await admin
    .from("organisations")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!org) return null;

  const { data: prac } = await admin
    .from("practitioners")
    .select("id, full_name, profile_id")
    .eq("organisation_id", org.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!prac) return null;

  return {
    organisationId: org.id as string,
    organisationName: (org.name as string) ?? "Clinic",
    practitionerId: prac.id as string,
    clinicianProfileId: (prac.profile_id as string) ?? null,
    clinicianName: (prac.full_name as string) ?? "Clinician",
  };
}

export async function listPublicTypes(
  admin: SupabaseClient,
  organisationId: string
): Promise<PublicApptType[]> {
  const { data } = await admin
    .from("appointment_types")
    .select("id, name, duration_min, colour, buffer_before_min, buffer_after_min, price_cents")
    .eq("organisation_id", organisationId)
    .eq("is_active", true)
    .eq("is_public_bookable", true)
    .order("name");
  return (data ?? []) as PublicApptType[];
}

async function getTypeById(
  admin: SupabaseClient,
  organisationId: string,
  typeId: string
): Promise<PublicApptType | null> {
  const { data } = await admin
    .from("appointment_types")
    .select("id, name, duration_min, colour, buffer_before_min, buffer_after_min, price_cents")
    .eq("organisation_id", organisationId)
    .eq("id", typeId)
    .eq("is_active", true)
    .eq("is_public_bookable", true)
    .maybeSingle();
  return (data as PublicApptType) ?? null;
}

// ---- slots -------------------------------------------------------------------

export async function getSlotsForDate(
  admin: SupabaseClient,
  clinic: PublicClinic,
  type: PublicApptType,
  dateStr: string
): Promise<Slot[]> {
  const weekday = weekdayOf(dateStr);
  const dayStart = isoOf(dateStr, 0);
  const dayEnd = isoOf(addDaysStr(dateStr, 1), 0);

  const [{ data: availability }, { data: exceptions }, { data: busyRows }, { data: blockRows }] =
    await Promise.all([
      admin
        .from("availability")
        .select("weekday, start_time, end_time")
        .eq("practitioner_id", clinic.practitionerId)
        .eq("weekday", weekday),
      admin
        .from("availability_exceptions")
        .select("start_time, end_time, is_available")
        .eq("practitioner_id", clinic.practitionerId)
        .eq("exception_date", dateStr),
      admin
        .from("bookings")
        .select("start_at, end_at")
        .eq("practitioner_id", clinic.practitionerId)
        .neq("status", "cancelled")
        .gte("start_at", dayStart)
        .lt("start_at", dayEnd),
      admin
        .from("diary_events")
        .select("start_at, end_at")
        .eq("practitioner_id", clinic.practitionerId)
        .eq("kind", "block")
        .lt("start_at", dayEnd)
        .gt("end_at", dayStart),
    ]);

  const windows = windowsForDate(weekday, availability ?? [], exceptions ?? []);
  if (windows.length === 0) return [];

  const busy = [...(busyRows ?? []), ...(blockRows ?? [])].map((b) => ({
    start: new Date(b.start_at as string).getTime(),
    end: new Date(b.end_at as string).getTime(),
  }));

  const nowFloor = Date.now() + MIN_NOTICE_MIN * 60000;
  const dur = type.duration_min;
  const bb = type.buffer_before_min ?? 0;
  const ba = type.buffer_after_min ?? 0;

  const slots: Slot[] = [];
  for (const w of windows) {
    for (let start = w.s; start + dur <= w.e; start += SLOT_INTERVAL_MIN) {
      const startMs = instantOf(dateStr, start);
      const endMs = startMs + dur * 60000;
      if (startMs < nowFloor) continue;
      const blockedStart = startMs - bb * 60000;
      const blockedEnd = endMs + ba * 60000;
      if (busy.some((b) => blockedStart < b.end && blockedEnd > b.start)) continue;
      slots.push({ startIso: new Date(startMs).toISOString(), label: labelOf(start) });
    }
  }
  return slots;
}

// ---- create ------------------------------------------------------------------

export type CreateInput = {
  typeId: string;
  dateStr: string;
  startIso: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes?: string;
};

export type CreateResult =
  | { ok: true; bookingId: string; cancelToken: string | null; label: string }
  | { ok: false; error: "invalid" | "slot_unavailable" | "slot_taken" | "server"; message: string };

export async function createPublicBooking(
  admin: SupabaseClient,
  clinic: PublicClinic,
  input: CreateInput
): Promise<CreateResult> {
  const type = await getTypeById(admin, clinic.organisationId, input.typeId);
  if (!type) return { ok: false, error: "invalid", message: "That appointment type isn't available." };

  const slots = await getSlotsForDate(admin, clinic, type, input.dateStr);
  if (!slots.find((s) => s.startIso === input.startIso)) {
    return { ok: false, error: "slot_unavailable", message: "That time is no longer available." };
  }

  const endIso = new Date(new Date(input.startIso).getTime() + type.duration_min * 60000).toISOString();

  try {
    const { data, error } = await admin
      .from("bookings")
      .insert({
        organisation_id: clinic.organisationId,
        practitioner_id: clinic.practitionerId,
        clinician_id: clinic.clinicianProfileId,
        appointment_type_id: type.id,
        athlete_id: null,
        start_at: input.startIso,
        end_at: endIso,
        status: "pending",
        client_name: `${input.firstName} ${input.lastName}`.trim(),
        client_email: input.email,
        client_phone: input.phone,
        notes: input.notes?.trim() || null,
        source: "public",
      })
      .select("id, cancel_token")
      .single();

    if (error) {
      if (error.code === "23P01" || /bookings_no_overlap/.test(error.message)) {
        return { ok: false, error: "slot_taken", message: "Sorry — that time was just booked. Please pick another." };
      }
      return { ok: false, error: "server", message: "Could not save the booking. Please try again." };
    }
    const label = slots.find((s) => s.startIso === input.startIso)?.label ?? "";
    return { ok: true, bookingId: data.id as string, cancelToken: (data.cancel_token as string) ?? null, label };
  } catch {
    return { ok: false, error: "server", message: "Could not save the booking. Please try again." };
  }
}
