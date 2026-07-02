"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

/**
 * Clinician diary (D-book 1). Week calendar with manual booking entry.
 * - Direct browser-client CRUD, gated by the "staff manage bookings" RLS policy
 *   (staff role + matching organisation_id). Every insert stamps clinician_id +
 *   organisation_id from the signed-in profile so the WITH CHECK passes.
 * - No-overlap is enforced in Postgres (bookings_no_overlap EXCLUDE constraint);
 *   we surface violation 23P01 as a friendly message rather than validating in JS.
 * - Timezone is fixed to Perth (UTC+8, no DST). Wall-clock <-> instant conversions
 *   go through PERTH_OFFSET / Intl parts so behaviour is independent of the browser TZ.
 */

const PERTH_TZ = "Australia/Perth";
const PERTH_OFFSET = "+08:00";
const DAY_START = 6; // grid starts 06:00
const DAY_END = 21; // grid ends 21:00
const PX_PER_MIN = 1; // 1px per minute -> 60px/hour
const GRID_MIN = (DAY_END - DAY_START) * 60;

const STATUSES = ["confirmed", "pending", "completed", "no_show"] as const;
type Status = (typeof STATUSES)[number] | "cancelled";

type ApptType = {
  id: string;
  name: string;
  duration_min: number;
  colour: string;
};

type AthleteLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type BookingRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: Status;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
  athlete_id: string | null;
  appointment_type_id: string | null;
  appointment_types: ApptType | ApptType[] | null;
  athletes: AthleteLite | AthleteLite[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function athleteName(a: AthleteLite): string {
  return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Athlete";
}

// ---- Perth-safe date helpers -------------------------------------------------

function perthParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PERTH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = fmt.formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute: Number(get("minute")),
  };
}

// Treat a YYYY-MM-DD as a pure calendar date, anchored at noon UTC to dodge
// any offset/DST edge effects during arithmetic.
function calDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}
function addDays(dateStr: string, n: number): string {
  const d = calDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateStr: string): string {
  const d = calDate(dateStr);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}
function todayPerth(): string {
  return perthParts(new Date()).dateStr;
}
function toInstant(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00${PERTH_OFFSET}`).toISOString();
}
function addMinutesIso(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60000).toISOString();
}
function fmtTimeFromIso(iso: string): string {
  const p = perthParts(new Date(iso));
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
function minsFromDayStart(iso: string): number {
  const p = perthParts(new Date(iso));
  return (p.hour - DAY_START) * 60 + p.minute;
}
function durationMin(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dayLabel(dateStr: string): string {
  const d = calDate(dateStr);
  return `${d.getUTCDate()}`;
}

// ---- Component ---------------------------------------------------------------

export default function DiaryPage() {
  const staffOk = useRequireDashboardStaff();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [types, setTypes] = useState<ApptType[]>([]);
  const [athletes, setAthletes] = useState<AthleteLite[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(todayPerth()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fTypeId, setFTypeId] = useState<string>("");
  const [fDate, setFDate] = useState<string>("");
  const [fTime, setFTime] = useState<string>("09:00");
  const [fDuration, setFDuration] = useState<number>(60);
  const [fAthleteId, setFAthleteId] = useState<string | null>(null);
  const [fAthleteSearch, setFAthleteSearch] = useState<string>("");
  const [fName, setFName] = useState<string>("");
  const [fEmail, setFEmail] = useState<string>("");
  const [fPhone, setFPhone] = useState<string>("");
  const [fNotes, setFNotes] = useState<string>("");
  const [fStatus, setFStatus] = useState<Status>("confirmed");

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const today = todayPerth();

  const loadStatic = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, organisation_id")
      .eq("id", user.id)
      .single();
    if (profile) {
      setProfileId(profile.id as string);
      setOrgId((profile.organisation_id as string) ?? null);
    }
    const [tRes, aRes] = await Promise.all([
      supabase
        .from("appointment_types")
        .select("id, name, duration_min, colour")
        .eq("is_active", true)
        .order("name"),
      supabase.from("athletes").select("id, first_name, last_name").order("last_name"),
    ]);
    setTypes((tRes.data ?? []) as ApptType[]);
    setAthletes((aRes.data ?? []) as AthleteLite[]);
  }, []);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    setError(null);
    const fromIso = toInstant(weekStart, "00:00");
    const toIso = toInstant(addDays(weekStart, 7), "00:00");
    const { data, error: e } = await supabase
      .from("bookings")
      .select(
        "id, start_at, end_at, status, client_name, client_email, client_phone, notes, athlete_id, appointment_type_id, appointment_types(name, colour, duration_min), athletes(first_name, last_name)"
      )
      .gte("start_at", fromIso)
      .lt("start_at", toIso)
      .neq("status", "cancelled")
      .order("start_at");
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    setBookings((data ?? []) as unknown as BookingRow[]);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    if (!staffOk) return;
    void loadStatic();
  }, [staffOk, loadStatic]);

  useEffect(() => {
    if (!staffOk) return;
    void loadWeek();
  }, [staffOk, loadWeek]);

  const bookingsByDay = useMemo(() => {
    const m = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      const key = perthParts(new Date(b.start_at)).dateStr;
      const list = m.get(key) ?? [];
      list.push(b);
      m.set(key, list);
    }
    return m;
  }, [bookings]);

  // ---- modal open helpers ----
  function resetForm() {
    setFAthleteId(null);
    setFAthleteSearch("");
    setFName("");
    setFEmail("");
    setFPhone("");
    setFNotes("");
    setFStatus("confirmed");
    setSaveError(null);
  }

  function openCreate(dateStr: string, minutes?: number) {
    resetForm();
    setEditingId(null);
    const t = types[0];
    setFTypeId(t?.id ?? "");
    setFDuration(t?.duration_min ?? 60);
    setFDate(dateStr);
    if (minutes != null) {
      const snapped = Math.max(0, Math.min(GRID_MIN - 15, Math.round(minutes / 15) * 15));
      const h = DAY_START + Math.floor(snapped / 60);
      const mm = snapped % 60;
      setFTime(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
    } else {
      setFTime("09:00");
    }
    setModalOpen(true);
  }

  function openEdit(b: BookingRow) {
    resetForm();
    setEditingId(b.id);
    setFTypeId(b.appointment_type_id ?? "");
    setFDuration(durationMin(b.start_at, b.end_at));
    const p = perthParts(new Date(b.start_at));
    setFDate(p.dateStr);
    setFTime(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`);
    setFAthleteId(b.athlete_id);
    const a = one(b.athletes);
    setFAthleteSearch(a ? athleteName(a) : "");
    setFName(b.client_name ?? "");
    setFEmail(b.client_email ?? "");
    setFPhone(b.client_phone ?? "");
    setFNotes(b.notes ?? "");
    setFStatus(b.status);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setSaveError(null);
  }

  function onPickType(id: string) {
    setFTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t) setFDuration(t.duration_min);
  }

  const athleteMatches = useMemo(() => {
    const q = fAthleteSearch.trim().toLowerCase();
    if (!q) return [];
    return athletes
      .filter((a) => athleteName(a).toLowerCase().includes(q))
      .slice(0, 6);
  }, [athletes, fAthleteSearch]);

  async function save() {
    if (!profileId || !orgId) {
      setSaveError("Your profile isn't linked to an organisation.");
      return;
    }
    if (!fDate || !fTime) {
      setSaveError("Date and time are required.");
      return;
    }
    const linkedAthlete = fAthleteId
      ? athletes.find((a) => a.id === fAthleteId) ?? null
      : null;
    const displayName = linkedAthlete ? athleteName(linkedAthlete) : fName.trim();
    if (!displayName) {
      setSaveError("Add a client name or link an athlete.");
      return;
    }
    const startIso = toInstant(fDate, fTime);
    const endIso = addMinutesIso(startIso, fDuration);

    setSaving(true);
    setSaveError(null);

    const payload = {
      organisation_id: orgId,
      clinician_id: profileId,
      appointment_type_id: fTypeId || null,
      athlete_id: fAthleteId,
      start_at: startIso,
      end_at: endIso,
      status: fStatus,
      client_name: linkedAthlete ? null : fName.trim() || null,
      client_email: fEmail.trim() || null,
      client_phone: fPhone.trim() || null,
      notes: fNotes.trim() || null,
      source: "staff",
    };

    try {
      if (editingId) {
        const { error: e } = await supabase
          .from("bookings")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("bookings").insert(payload);
        if (e) throw e;
      }
      closeModal();
      await loadWeek();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const msg = (err as { message?: string })?.message ?? "Save failed";
      if (code === "23P01" || /bookings_no_overlap/.test(msg)) {
        setSaveError("That time overlaps an existing booking. Pick another slot.");
      } else {
        setSaveError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking() {
    if (!editingId) return;
    setSaving(true);
    setSaveError(null);
    const { error: e } = await supabase
      .from("bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", editingId);
    setSaving(false);
    if (e) {
      setSaveError(e.message);
      return;
    }
    closeModal();
    await loadWeek();
  }

  if (!staffOk) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-900 athlete-frosted"
        data-theme="light"
      >
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  const weekEnd = addDays(weekStart, 6);
  const rangeLabel = `${dayLabel(weekStart)}–${dayLabel(weekEnd)} ${calDate(weekEnd).toLocaleDateString(
    "en-AU",
    { month: "short", year: "numeric", timeZone: "UTC" }
  )}`;

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-6xl px-4 pt-8 pb-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">DIARY</h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                aria-label="Previous week"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(mondayOf(todayPerth()))}
                className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                aria-label="Next week"
              >
                ›
              </button>
            </div>
            <span className="text-sm text-slate-400">{rangeLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => openCreate(today)}
            className="rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110"
          >
            + New booking
          </button>
        </div>

        {types.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {types.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: t.colour }}
                />
                {t.name} · {t.duration_min}m
              </span>
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

        {/* Calendar grid */}
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="min-w-[820px]">
            {/* header row */}
            <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              <div className="border-b border-slate-800" />
              {weekDays.map((d, i) => {
                const isToday = d === today;
                return (
                  <div
                    key={d}
                    className={`border-b border-l border-slate-800 px-2 py-2 text-center ${
                      isToday ? "bg-lime-400/10" : ""
                    }`}
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {WEEKDAY_LABELS[i]}
                    </div>
                    <div
                      className={`text-sm font-semibold ${
                        isToday ? "text-lime-300" : "text-slate-200"
                      }`}
                    >
                      {dayLabel(d)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* body */}
            <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              {/* hour gutter */}
              <div className="relative" style={{ height: GRID_MIN * PX_PER_MIN }}>
                {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-500"
                    style={{ top: i * 60 * PX_PER_MIN }}
                  >
                    {String(DAY_START + i).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {weekDays.map((d) => (
                <DayColumn
                  key={d}
                  dateStr={d}
                  isToday={d === today}
                  bookings={bookingsByDay.get(d) ?? []}
                  onEmptyClick={(mins) => openCreate(d, mins)}
                  onBookingClick={openEdit}
                />
              ))}
            </div>
          </div>
        </div>

        {loading ? <p className="mt-4 text-xs text-slate-500">Loading week…</p> : null}
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">
                {editingId ? "Edit booking" : "New booking"}
              </h2>
              {editingId ? (
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                  {fStatus}
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400">Appointment type</label>
                <select
                  value={fTypeId}
                  onChange={(e) => onPickType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">— None —</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.duration_min}m)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-slate-400">Date</label>
                  <input
                    type="date"
                    value={fDate}
                    onChange={(e) => setFDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-slate-400">Start</label>
                  <input
                    type="time"
                    step={300}
                    value={fTime}
                    onChange={(e) => setFTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-slate-400">Mins</label>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={fDuration}
                    onChange={(e) => setFDuration(Math.max(5, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400">
                  Link athlete <span className="text-slate-600">(optional)</span>
                </label>
                {fAthleteId ? (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 text-xs text-lime-200">
                      {fAthleteSearch}
                      <button
                        type="button"
                        aria-label="Unlink athlete"
                        onClick={() => {
                          setFAthleteId(null);
                          setFAthleteSearch("");
                        }}
                        className="text-lime-400 hover:text-rose-300"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                ) : (
                  <>
                    <input
                      placeholder="Search athletes…"
                      value={fAthleteSearch}
                      onChange={(e) => setFAthleteSearch(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    />
                    {athleteMatches.length > 0 ? (
                      <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
                        {athleteMatches.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setFAthleteId(a.id);
                              setFAthleteSearch(athleteName(a));
                            }}
                            className="flex w-full rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
                          >
                            {athleteName(a)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {!fAthleteId ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-400">Client name</label>
                    <input
                      value={fName}
                      onChange={(e) => setFName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400">Email</label>
                    <input
                      value={fEmail}
                      onChange={(e) => setFEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400">Phone</label>
                    <input
                      value={fPhone}
                      onChange={(e) => setFPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-medium text-slate-400">Notes</label>
                <textarea
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
              </div>

              {editingId ? (
                <div>
                  <label className="block text-xs font-medium text-slate-400">Status</label>
                  <select
                    value={fStatus === "cancelled" ? "confirmed" : fStatus}
                    onChange={(e) => setFStatus(e.target.value as Status)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {saveError ? <p className="text-xs text-rose-400">{saveError}</p> : null}
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <div>
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => void cancelBooking()}
                    disabled={saving}
                    className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    Cancel booking
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50"
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create booking"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

// ---- Day column --------------------------------------------------------------

function DayColumn({
  dateStr,
  isToday,
  bookings,
  onEmptyClick,
  onBookingClick,
}: {
  dateStr: string;
  isToday: boolean;
  bookings: BookingRow[];
  onEmptyClick: (mins: number) => void;
  onBookingClick: (b: BookingRow) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleBackgroundClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    onEmptyClick(y / PX_PER_MIN);
  }

  return (
    <div
      ref={ref}
      onClick={handleBackgroundClick}
      className={`relative border-l border-slate-800 ${isToday ? "bg-lime-400/[0.04]" : ""}`}
      style={{ height: GRID_MIN * PX_PER_MIN }}
    >
      {/* hour lines */}
      {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
        <div
          key={i}
          className="absolute inset-x-0 border-t border-slate-800/60"
          style={{ top: i * 60 * PX_PER_MIN }}
        />
      ))}

      {bookings.map((b) => {
        const top = Math.max(0, minsFromDayStart(b.start_at)) * PX_PER_MIN;
        const dur = durationMin(b.start_at, b.end_at);
        const height = Math.max(18, dur * PX_PER_MIN - 2);
        const type = one(b.appointment_types);
        const athlete = one(b.athletes);
        const colour = type?.colour ?? "#94a3b8";
        const name = athlete ? athleteName(athlete) : b.client_name || "(no name)";
        return (
          <button
            key={b.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBookingClick(b);
            }}
            className="absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-black/5 hover:brightness-105"
            style={{
              top,
              height,
              backgroundColor: `${colour}22`,
              borderLeft: `3px solid ${colour}`,
            }}
            title={`${fmtTimeFromIso(b.start_at)}–${fmtTimeFromIso(b.end_at)} · ${name}`}
          >
            <div className="font-semibold text-slate-800">{fmtTimeFromIso(b.start_at)}</div>
            <div className="truncate text-slate-700">{name}</div>
            {type ? <div className="truncate text-slate-500">{type.name}</div> : null}
          </button>
        );
      })}
    </div>
  );
}
