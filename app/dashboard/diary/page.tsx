"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import PracticeSidebar from "@/components/PracticeSidebar";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";
import { centsToInput, money, parseMoney } from "@/lib/practice/billing";
import { invoiceBooking } from "@/lib/practice/invoicing";

/**
 * Practitioner-aware clinic diary.
 * - Day / Week / Month views; "All practitioners" columns in Day view.
 * - Drag to select a time range, then create an Appointment, Block (rule-out) or Note.
 * - Bookings live in `bookings`; blocks + notes in `diary_events`.
 * - Perth timezone (UTC+8, no DST). No-overlap enforced in Postgres per practitioner.
 * - Times snap to 5 minutes; drag the bottom edge of an item to change its length.
 * - Group bookings: any mix of athletes, teams and manual clients in `booking_attendees`.
 */

const PERTH_TZ = "Australia/Perth";
const PERTH_OFFSET = "+08:00";
const DAY_START = 6;
const DAY_END = 21;
const PX = 1;
const GRID_MIN = (DAY_END - DAY_START) * 60;
const SNAP = 5;
const DURATIONS = [15, 30, 45, 60, 75, 90, 120];
const STATUSES = ["confirmed", "pending", "completed", "no_show"] as const;

type Status = (typeof STATUSES)[number] | "cancelled";
type View = "day" | "week" | "month";
type Kind = "appointment" | "block" | "note";

type ApptType = { id: string; name: string; duration_min: number; colour: string; price_cents: number | null };
type AthleteLite = { id: string; first_name: string | null; last_name: string | null };
type TeamLite = { id: string; name: string };
type AttendeeRow = {
  id: string;
  athlete_id: string | null;
  team_id: string | null;
  client_name: string | null;
  athletes: AthleteLite | AthleteLite[] | null;
  teams: { name: string } | { name: string }[] | null;
};
type Practitioner = { id: string; full_name: string; colour: string; profile_id: string | null };

type BookingRow = {
  id: string;
  practitioner_id: string | null;
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
  title: string | null;
  price_cents: number | null;
  booking_attendees: AttendeeRow[] | null;
};
type EventRow = {
  id: string;
  practitioner_id: string;
  kind: "block" | "note";
  start_at: string;
  end_at: string;
  title: string | null;
  notes: string | null;
};

type Item =
  | { type: "booking"; id: string; start: string; end: string; colour: string; title: string; sub: string; raw: BookingRow }
  | { type: "block"; id: string; start: string; end: string; title: string; raw: EventRow }
  | { type: "note"; id: string; start: string; end: string; title: string; raw: EventRow };

function one<T>(v: T | T[] | null): T | null {
  return !v ? null : Array.isArray(v) ? v[0] ?? null : v;
}
function athleteName(a: AthleteLite): string {
  return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Athlete";
}

// ---- Perth helpers -----------------------------------------------------------

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
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  let hour = Number(g("hour"));
  if (hour === 24) hour = 0;
  return { dateStr: `${g("year")}-${g("month")}-${g("day")}`, hour, minute: Number(g("minute")) };
}
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
  const dow = d.getUTCDay();
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}
function firstOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}
function nextMonth(dateStr: string): string {
  const d = calDate(firstOfMonth(dateStr));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
function todayPerth(): string {
  return perthParts(new Date()).dateStr;
}
function toInstant(dateStr: string, min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const mm = String(min % 60).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00${PERTH_OFFSET}`).toISOString();
}
function minToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function hhmmToMin(s: string): number {
  const [h, m] = s.split(":");
  return Number(h) * 60 + Number(m);
}
function fmtTime(iso: string): string {
  const p = perthParts(new Date(iso));
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
function minsFromDayStart(iso: string): number {
  const p = perthParts(new Date(iso));
  return (p.hour - DAY_START) * 60 + p.minute;
}
function durMin(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}
function snapGrid(min: number): number {
  return Math.max(0, Math.min(GRID_MIN, Math.round(min / SNAP) * SNAP));
}
/** Minutes since Perth midnight for an instant. */
function minsOfDay(iso: string): number {
  const p = perthParts(new Date(iso));
  return p.hour * 60 + p.minute;
}
function fmtDur(min: number): string {
  if (min <= 0) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dayNum(dateStr: string): string {
  return String(calDate(dateStr).getUTCDate());
}

type AvailRow = { practitioner_id: string; weekday: number; start_time: string; end_time: string };
type ExcRow = { practitioner_id: string; exception_date: string; start_time: string | null; end_time: string | null; is_available: boolean };

function subtractWin(ws: { s: number; e: number }[], b: { s: number; e: number }) {
  const out: { s: number; e: number }[] = [];
  for (const w of ws) {
    if (b.e <= w.s || b.s >= w.e) { out.push(w); continue; }
    if (b.s > w.s) out.push({ s: w.s, e: b.s });
    if (b.e < w.e) out.push({ s: b.e, e: w.e });
  }
  return out;
}
function openWindowsFor(avail: AvailRow[], exc: ExcRow[], pracId: string, dateStr: string) {
  const weekday = calDate(dateStr).getUTCDay();
  let ws = avail
    .filter((a) => a.practitioner_id === pracId && a.weekday === weekday)
    .map((a) => ({ s: hhmmToMin(a.start_time), e: hhmmToMin(a.end_time) }));
  const ex = exc.filter((x) => x.practitioner_id === pracId && x.exception_date === dateStr);
  if (ex.some((x) => !x.is_available && !x.start_time && !x.end_time)) return [];
  for (const x of ex) if (x.is_available && x.start_time && x.end_time) ws.push({ s: hhmmToMin(x.start_time), e: hhmmToMin(x.end_time) });
  for (const x of ex) if (!x.is_available && x.start_time && x.end_time) ws = subtractWin(ws, { s: hhmmToMin(x.start_time), e: hhmmToMin(x.end_time) });
  return ws.filter((w) => w.e > w.s);
}

// ---- component ---------------------------------------------------------------

export default function DiaryPage() {
  const staffOk = useRequireDashboardStaff();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [pracs, setPracs] = useState<Practitioner[]>([]);
  const [pracId, setPracId] = useState<string>("");
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string>(() => todayPerth());
  const [types, setTypes] = useState<ApptType[]>([]);
  const [athletes, setAthletes] = useState<AthleteLite[]>([]);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [availRows, setAvailRows] = useState<AvailRow[]>([]);
  const [excRows, setExcRows] = useState<ExcRow[]>([]);
  const [loading, setLoading] = useState(true);

  const today = todayPerth();
  const activePracs = pracs;
  const isAll = pracId === "all";
  const [notice, setNotice] = useState<string | null>(null);

  // visible date range
  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") {
      const ws = mondayOf(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    }
    const gs = mondayOf(firstOfMonth(anchor));
    return Array.from({ length: 42 }, (_, i) => addDays(gs, i));
  }, [view, anchor]);

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
    if (!profile) return;
    setProfileId(profile.id as string);
    setOrgId((profile.organisation_id as string) ?? null);

    const [{ data: pr }, { data: t }, { data: a }, { data: tm }] = await Promise.all([
      supabase
        .from("practitioners")
        .select("id, full_name, colour, profile_id")
        .eq("organisation_id", profile.organisation_id)
        .eq("is_active", true)
        .order("full_name"),
      supabase.from("appointment_types").select("id, name, duration_min, colour, price_cents").eq("is_active", true).order("name"),
      supabase.from("athletes").select("id, first_name, last_name").order("last_name"),
      supabase.from("teams").select("id, name").order("name"),
    ]);
    const list = (pr ?? []) as Practitioner[];
    setPracs(list);
    setTypes((t ?? []) as ApptType[]);
    setAthletes((a ?? []) as AthleteLite[]);
    setTeams((tm ?? []) as TeamLite[]);
    const mine = list.find((p) => p.profile_id === profile.id);
    setPracId(mine?.id ?? list[0]?.id ?? "");
  }, []);

  const loadRange = useCallback(async () => {
    if (!pracId || days.length === 0) return;
    setLoading(true);
    const rangeStart = toInstant(days[0], 0);
    const rangeEnd = toInstant(addDays(days[days.length - 1], 1), 0);
    const ids = isAll ? activePracs.map((p) => p.id) : [pracId];

    const [{ data: bk }, { data: ev }, { data: av }, { data: exc }] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, practitioner_id, start_at, end_at, status, client_name, client_email, client_phone, notes, athlete_id, appointment_type_id, title, price_cents, appointment_types(name, colour, duration_min), athletes(first_name, last_name), booking_attendees(id, athlete_id, team_id, client_name, athletes(first_name, last_name), teams(name))"
        )
        .in("practitioner_id", ids)
        .neq("status", "cancelled")
        .gte("start_at", rangeStart)
        .lt("start_at", rangeEnd),
      supabase
        .from("diary_events")
        .select("id, practitioner_id, kind, start_at, end_at, title, notes")
        .in("practitioner_id", ids)
        .lt("start_at", rangeEnd)
        .gt("end_at", rangeStart),
      supabase.from("availability").select("practitioner_id, weekday, start_time, end_time").in("practitioner_id", ids),
      supabase
        .from("availability_exceptions")
        .select("practitioner_id, exception_date, start_time, end_time, is_available")
        .in("practitioner_id", ids)
        .gte("exception_date", days[0])
        .lte("exception_date", days[days.length - 1]),
    ]);
    setBookings((bk ?? []) as unknown as BookingRow[]);
    setEvents((ev ?? []) as EventRow[]);
    setAvailRows((av ?? []) as AvailRow[]);
    setExcRows((exc ?? []) as ExcRow[]);
    setLoading(false);
  }, [pracId, isAll, activePracs, days]);

  useEffect(() => {
    if (staffOk) void loadStatic();
  }, [staffOk, loadStatic]);
  useEffect(() => {
    if (staffOk) void loadRange();
  }, [staffOk, loadRange]);

  // items bucketed by "date|prac"
  const itemsByCell = useMemo(() => {
    const m = new Map<string, Item[]>();
    const push = (date: string, prac: string, it: Item) => {
      const k = `${date}|${prac}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(it);
    };
    for (const b of bookings) {
      const date = perthParts(new Date(b.start_at)).dateStr;
      const t = one(b.appointment_types);
      const ath = one(b.athletes);
      const prac = pracs.find((p) => p.id === b.practitioner_id);
      const att = b.booking_attendees ?? [];
      const group = att.length > 0;
      push(date, b.practitioner_id ?? "", {
        type: "booking",
        id: b.id,
        start: b.start_at,
        end: b.end_at,
        colour: t?.colour ?? prac?.colour ?? "#64748b",
        title: group ? `👥 ${b.title || `Group (${att.length})`}` : ath ? athleteName(ath) : b.client_name || "(no name)",
        sub: group
          ? `${att.length} attendee${att.length === 1 ? "" : "s"}${t ? ` · ${t.name}` : ""}`
          : t?.name ?? (b.status === "pending" ? "Pending request" : ""),
        raw: b,
      });
    }
    for (const e of events) {
      const date = perthParts(new Date(e.start_at)).dateStr;
      push(date, e.practitioner_id, {
        type: e.kind,
        id: e.id,
        start: e.start_at,
        end: e.end_at,
        title: e.title ?? (e.kind === "block" ? "Blocked" : "Note"),
        raw: e,
      } as Item);
    }
    return m;
  }, [bookings, events, pracs]);

  // ---- create / edit modal state ----
  const [modal, setModal] = useState<null | {
    mode: "create" | "edit";
    kind: Kind;
    pracId: string;
    date: string;
    startMin: number;
    endMin: number;
    editId?: string;
  }>(null);

  function openCreate(p: string, date: string, startMin: number, endMin: number) {
    const s = snapGrid(startMin);
    let e = snapGrid(endMin);
    if (e <= s) e = Math.min(GRID_MIN, s + 30);
    // grid minutes are relative to DAY_START; the modal works in minutes since midnight
    setModal({ mode: "create", kind: "appointment", pracId: p, date, startMin: s + DAY_START * 60, endMin: e + DAY_START * 60 });
  }
  function openEditBooking(b: BookingRow) {
    const s = minsOfDay(b.start_at);
    setModal({
      mode: "edit",
      kind: "appointment",
      pracId: b.practitioner_id ?? pracId,
      date: perthParts(new Date(b.start_at)).dateStr,
      startMin: s,
      endMin: s + durMin(b.start_at, b.end_at),
      editId: b.id,
    });
  }
  function openEditEvent(e: EventRow) {
    const s = minsOfDay(e.start_at);
    setModal({
      mode: "edit",
      kind: e.kind,
      pracId: e.practitioner_id,
      date: perthParts(new Date(e.start_at)).dateStr,
      startMin: s,
      endMin: s + durMin(e.start_at, e.end_at),
      editId: e.id,
    });
  }

  function onItemClick(it: Item) {
    if (it.type === "booking") openEditBooking(it.raw);
    else openEditEvent(it.raw);
  }

  async function moveItem(it: Item, newStartMin: number, dateStr: string) {
    setNotice(null);
    const dur = durMin(it.start, it.end);
    const startIso = toInstant(dateStr, newStartMin);
    const endIso = toInstant(dateStr, newStartMin + dur);
    if (it.type === "booking") {
      const { error } = await supabase
        .from("bookings")
        .update({ start_at: startIso, end_at: endIso, updated_at: new Date().toISOString() })
        .eq("id", it.id);
      if (error && (error.code === "23P01" || /bookings_no_overlap/.test(error.message))) {
        setNotice("That move overlaps another booking — it wasn't changed.");
      }
    } else {
      await supabase.from("diary_events").update({ start_at: startIso, end_at: endIso }).eq("id", it.id);
    }
    void loadRange();
  }

  async function resizeItem(it: Item, newEndMin: number, dateStr: string) {
    setNotice(null);
    const startMin = minsOfDay(it.start);
    if (newEndMin <= startMin) return;
    const endIso = toInstant(dateStr, newEndMin);
    if (it.type === "booking") {
      const { error } = await supabase.from("bookings").update({ end_at: endIso, updated_at: new Date().toISOString() }).eq("id", it.id);
      if (error && (error.code === "23P01" || /bookings_no_overlap/.test(error.message))) {
        setNotice("That length overlaps another booking — it wasn't changed.");
      }
    } else {
      await supabase.from("diary_events").update({ end_at: endIso }).eq("id", it.id);
    }
    void loadRange();
  }

  function changeView(v: View) {
    if (v !== "day" && isAll && activePracs[0]) setPracId(activePracs[0].id);
    setView(v);
  }
  function shift(dir: number) {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else {
      const d = calDate(firstOfMonth(anchor));
      d.setUTCMonth(d.getUTCMonth() + dir);
      setAnchor(d.toISOString().slice(0, 10));
    }
  }

  const rangeLabel = useMemo(() => {
    if (view === "day")
      return calDate(anchor).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    if (view === "week") {
      const ws = mondayOf(anchor);
      return `${dayNum(ws)}–${dayNum(addDays(ws, 6))} ${calDate(addDays(ws, 6)).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" })}`;
    }
    return calDate(firstOfMonth(anchor)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  }, [view, anchor]);

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  // columns to render for day/week
  const columns: { date: string; prac: Practitioner }[] =
    view === "week"
      ? days.map((d) => ({ date: d, prac: pracs.find((p) => p.id === pracId)! })).filter((c) => c.prac)
      : isAll
      ? activePracs.map((p) => ({ date: anchor, prac: p }))
      : [{ date: anchor, prac: pracs.find((p) => p.id === pracId)! }].filter((c) => c.prac);

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <div className="flex gap-5">
          <aside className="hidden w-56 shrink-0 lg:block">
            <PracticeSidebar />
            <div className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Week beginning</div>
            <div className="mb-3 text-lg font-semibold text-slate-100">
              {calDate(mondayOf(anchor)).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "UTC" })}
            </div>
            <MiniMonth monthStart={firstOfMonth(anchor)} anchor={anchor} today={today} onPick={setAnchor} />
            <div className="mt-4">
              <MiniMonth monthStart={nextMonth(anchor)} anchor={anchor} today={today} onPick={setAnchor} />
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <div className="mb-4 lg:hidden"><PracticeSidebar /></div>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">DIARY</h1>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => shift(-1)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800">‹</button>
              <button type="button" onClick={() => setAnchor(todayPerth())} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">Today</button>
              <button type="button" onClick={() => shift(1)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800">›</button>
            </div>
            <span className="text-sm text-slate-400">{rangeLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pracId}
              onChange={(e) => setPracId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            >
              {view === "day" ? <option value="all">All practitioners</option> : null}
              {pracs.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            <div className="flex overflow-hidden rounded-lg border border-slate-700">
              {(["day", "week", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeView(v)}
                  className={`px-3 py-1 text-xs capitalize ${view === v ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm bg-slate-500" /> Appointment</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm bg-slate-600 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.25)_3px,rgba(255,255,255,0.25)_5px)]" /> Block</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm bg-amber-300" /> Note</span>
          <span className="ml-auto text-slate-500">Drag on the grid to create · drag an item to move · drag its bottom edge to resize · click to edit</span>
        </div>

        {/* Views */}
        {view === "month" ? (
          <MonthGrid
            days={days}
            anchorMonth={firstOfMonth(anchor)}
            today={today}
            itemsByCell={itemsByCell}
            pracId={pracId}
            onDayClick={(d) => { setAnchor(d); setView("day"); }}
          />
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
            <div style={{ minWidth: Math.max(760, columns.length * 130 + 56) }}>
              {/* header */}
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, 1fr)` }}>
                <div className="border-b border-slate-800" />
                {columns.map((c, i) => {
                  const isToday = c.date === today;
                  return (
                    <div key={i} className={`border-b border-l border-slate-800 px-2 py-2 text-center ${isToday ? "bg-lime-400/10" : ""}`}>
                      {view === "week" ? (
                        <>
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">{WD[i]}</div>
                          <div className={`text-sm font-semibold ${isToday ? "text-lime-300" : "text-slate-200"}`}>{dayNum(c.date)}</div>
                        </>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-200">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.prac.colour }} />
                          {c.prac.full_name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* body */}
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, 1fr)` }}>
                <div className="relative" style={{ height: GRID_MIN * PX }}>
                  {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
                    <div key={i} className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-500" style={{ top: i * 60 * PX }}>
                      {String(DAY_START + i).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                {columns.map((c, i) => (
                  <DragColumn
                    key={i}
                    isToday={c.date === today}
                    items={itemsByCell.get(`${c.date}|${c.prac.id}`) ?? []}
                    openWindows={openWindowsFor(availRows, excRows, c.prac.id, c.date)}
                    onCreate={(s, e) => openCreate(c.prac.id, c.date, s, e)}
                    onMove={(it, ns) => moveItem(it, ns, c.date)}
                    onResize={(it, ne) => resizeItem(it, ne, c.date)}
                    onItemClick={onItemClick}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {notice ? <p className="mt-3 text-xs text-amber-300">{notice}</p> : null}
        {loading ? <p className="mt-3 text-xs text-slate-500">Loading…</p> : null}
          </div>
        </div>
      </section>

      {modal ? (
        <EntryModal
          modal={modal}
          types={types}
          athletes={athletes}
          teams={teams}
          orgId={orgId}
          profileId={profileId}
          pracs={pracs}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void loadRange(); }}
        />
      ) : null}
    </main>
  );
}

// ---- Drag column -------------------------------------------------------------

function DragColumn({
  isToday,
  items,
  openWindows,
  onCreate,
  onMove,
  onResize,
  onItemClick,
}: {
  isToday: boolean;
  items: Item[];
  openWindows: { s: number; e: number }[];
  onCreate: (startMin: number, endMin: number) => void;
  onMove: (it: Item, newStartMin: number) => void;
  onResize: (it: Item, newEndMin: number) => void;
  onItemClick: (it: Item) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [moveTop, setMoveTop] = useState<{ id: string; top: number } | null>(null);
  const [resizeH, setResizeH] = useState<{ id: string; dur: number } | null>(null);

  function onResizeDown(e: React.MouseEvent, it: Item) {
    e.stopPropagation();
    e.preventDefault();
    const rect = ref.current!.getBoundingClientRect();
    const top = Math.max(0, minsFromDayStart(it.start));
    const calc = (y: number) => Math.max(SNAP, Math.min(GRID_MIN - top, snapGrid((y - rect.top) / PX) - top));
    const move = (ev: MouseEvent) => setResizeH({ id: it.id, dur: calc(ev.clientY) });
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setResizeH(null);
      const dur = calc(ev.clientY);
      if (dur !== durMin(it.start, it.end)) onResize(it, minsOfDay(it.start) + dur);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  const handle = (it: Item) => (
    <div
      onMouseDown={(e) => onResizeDown(e, it)}
      className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-black/20"
      title="Drag to change length"
    />
  );
  const dragging = useRef(false);

  function onItemDown(e: React.MouseEvent, it: Item) {
    e.stopPropagation();
    const rect = ref.current!.getBoundingClientRect();
    const itemTop = Math.max(0, minsFromDayStart(it.start)) * PX;
    const grab = e.clientY - rect.top - itemTop;
    const startY = e.clientY;
    const dur = durMin(it.start, it.end);
    let moved = false;
    const move = (ev: MouseEvent) => {
      if (Math.abs(ev.clientY - startY) > 4) moved = true;
      const t = snapGrid((ev.clientY - rect.top - grab) / PX);
      setMoveTop({ id: it.id, top: Math.max(0, Math.min(GRID_MIN - dur, t)) });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setMoveTop(null);
      if (!moved) {
        onItemClick(it);
        return;
      }
      const t = Math.max(0, Math.min(GRID_MIN - dur, snapGrid((ev.clientY - rect.top - grab) / PX)));
      onMove(it, t + DAY_START * 60);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function yToMin(clientY: number): number {
    const rect = ref.current!.getBoundingClientRect();
    return snapGrid((clientY - rect.top) / PX);
  }

  function onDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-item]")) return;
    dragging.current = true;
    const m = yToMin(e.clientY);
    setSel({ a: m, b: m });
    const move = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setSel((s) => (s ? { ...s, b: yToMin(ev.clientY) } : s));
    };
    const up = (ev: MouseEvent) => {
      dragging.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const end = yToMin(ev.clientY);
      const lo = Math.min(m, end);
      const hi = Math.max(m, end);
      setSel(null);
      onCreate(lo, hi === lo ? lo + 30 : hi);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <div
      ref={ref}
      onMouseDown={onDown}
      className={`relative border-l border-slate-800 ${isToday ? "bg-lime-400/[0.04]" : ""}`}
      style={{ height: GRID_MIN * PX }}
    >
      {openWindows.map((w, i) => (
        <div
          key={`ow${i}`}
          className="absolute inset-x-0"
          style={{
            top: Math.max(0, w.s - DAY_START * 60) * PX,
            height: Math.max(0, Math.min(w.e, DAY_END * 60) - Math.max(w.s, DAY_START * 60)) * PX,
            background: "rgba(255,255,255,0.06)",
            boxShadow: "inset 3px 0 0 rgba(127,227,3,0.5)",
          }}
        />
      ))}
      {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
        <div key={i} className="absolute inset-x-0 border-t border-slate-800/60" style={{ top: i * 60 * PX }} />
      ))}

      {sel ? (
        <div
          className="absolute inset-x-1 rounded bg-lime-400/25 ring-1 ring-lime-400"
          style={{ top: Math.min(sel.a, sel.b) * PX, height: Math.max(6, Math.abs(sel.b - sel.a) * PX) }}
        />
      ) : null}

      {items.map((it) => {
        const baseTop = Math.max(0, minsFromDayStart(it.start)) * PX;
        const top = moveTop && moveTop.id === it.id ? moveTop.top * PX : baseTop;
        const liveDur = resizeH && resizeH.id === it.id ? resizeH.dur : durMin(it.start, it.end);
        const height = Math.max(18, liveDur * PX - 2);
        if (it.type === "note") {
          return (
            <div
              key={it.id}
              data-item
              onMouseDown={(e) => onItemDown(e, it)}
              className="absolute inset-x-1 cursor-grab overflow-hidden rounded-md border-l-4 border-amber-400 bg-amber-100/90 px-2 py-1 text-left text-[11px] text-amber-900 hover:brightness-105 active:cursor-grabbing"
              style={{ top, height }}
              title={it.title}
            >
              <div className="truncate font-medium">📌 {it.title}</div>
            </div>
          );
        }
        if (it.type === "block") {
          return (
            <div
              key={it.id}
              data-item
              onMouseDown={(e) => onItemDown(e, it)}
              className="absolute inset-x-1 cursor-grab overflow-hidden rounded-md px-2 py-1 text-left text-[11px] text-slate-100 hover:brightness-110 active:cursor-grabbing"
              style={{
                top,
                height,
                backgroundColor: "#475569",
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.18) 4px, rgba(255,255,255,0.18) 7px)",
              }}
              title={it.title}
            >
              <div className="truncate font-medium">{fmtTime(it.start)} · {it.title}</div>
              {handle(it)}
            </div>
          );
        }
        return (
          <div
            key={it.id}
            data-item
            onMouseDown={(e) => onItemDown(e, it)}
            className="absolute inset-x-1 cursor-grab overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-black/5 hover:brightness-105 active:cursor-grabbing"
            style={{ top, height, backgroundColor: `${it.colour}22`, borderLeft: `3px solid ${it.colour}` }}
            title={`${fmtTime(it.start)}–${fmtTime(it.end)} · ${it.title}`}
          >
            <div className="font-semibold text-slate-800">{fmtTime(it.start)}</div>
            <div className="truncate text-slate-700">{it.title}</div>
            {it.sub ? <div className="truncate text-slate-500">{it.sub}</div> : null}
            {resizeH && resizeH.id === it.id ? <div className="absolute bottom-1 right-1 rounded bg-slate-900/80 px-1 text-[10px] text-white">{fmtDur(resizeH.dur)}</div> : null}
            {handle(it)}
          </div>
        );
      })}
    </div>
  );
}

// ---- Month grid --------------------------------------------------------------

function MonthGrid({
  days,
  anchorMonth,
  today,
  itemsByCell,
  pracId,
  onDayClick,
}: {
  days: string[];
  anchorMonth: string;
  today: string;
  itemsByCell: Map<string, Item[]>;
  pracId: string;
  onDayClick: (d: string) => void;
}) {
  const month = anchorMonth.slice(0, 7);
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
      <div className="grid grid-cols-7 border-b border-slate-800">
        {WD.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] uppercase tracking-wide text-slate-400">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = (itemsByCell.get(`${d}|${pracId}`) ?? []).sort((a, b) => a.start.localeCompare(b.start));
          const inMonth = d.slice(0, 7) === month;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onDayClick(d)}
              className={`min-h-[92px] border-b border-l border-slate-800 p-1.5 text-left align-top hover:bg-slate-800/40 ${inMonth ? "" : "opacity-40"}`}
            >
              <div className={`text-xs font-semibold ${isToday ? "text-lime-300" : "text-slate-300"}`}>{dayNum(d)}</div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((it) => (
                  <div
                    key={it.id}
                    className="truncate rounded px-1 py-0.5 text-[10px]"
                    style={
                      it.type === "booking"
                        ? { backgroundColor: `${it.colour}22`, color: "#0f172a" }
                        : it.type === "note"
                        ? { backgroundColor: "#fde68a", color: "#78350f" }
                        : { backgroundColor: "#475569", color: "#e2e8f0" }
                    }
                  >
                    {fmtTime(it.start)} {it.title}
                  </div>
                ))}
                {items.length > 3 ? <div className="text-[10px] text-slate-500">+{items.length - 3} more</div> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniMonth({
  monthStart,
  anchor,
  today,
  onPick,
}: {
  monthStart: string;
  anchor: string;
  today: string;
  onPick: (d: string) => void;
}) {
  const label = calDate(monthStart).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  const gridStart = mondayOf(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = monthStart.slice(0, 7);
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-500">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const isToday = d === today;
          const isSel = d === anchor;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              className={`h-6 rounded text-[11px] ${
                isSel
                  ? "bg-lime-400 font-semibold text-slate-950"
                  : isToday
                  ? "text-slate-100 ring-1 ring-lime-400"
                  : inMonth
                  ? "text-slate-300 hover:bg-slate-800"
                  : "text-slate-600 hover:bg-slate-800"
              }`}
            >
              {dayNum(d)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Entry modal (create/edit appointment, block, note) ----------------------

type Att = {
  key: string;
  rowId?: string;
  athlete_id: string | null;
  team_id: string | null;
  client_name: string | null;
  label: string;
  price: string;
  attendance: string;
  invoice_id: string | null;
};

const ATTENDANCE = ["booked", "attended", "no_show", "cancelled"] as const;

function EntryModal({
  modal,
  types,
  athletes,
  teams,
  orgId,
  profileId,
  pracs,
  onClose,
  onSaved,
}: {
  modal: {
    mode: "create" | "edit";
    kind: Kind;
    pracId: string;
    date: string;
    startMin: number;
    endMin: number;
    editId?: string;
  };
  types: ApptType[];
  athletes: AthleteLite[];
  teams: TeamLite[];
  orgId: string | null;
  profileId: string | null;
  pracs: Practitioner[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = modal.mode === "edit";
  const [kind, setKind] = useState<Kind>(modal.kind);
  const [date, setDate] = useState(modal.date);
  const [pracSel, setPracSel] = useState(modal.pracId);
  const [startMin, setStartMin] = useState(modal.startMin);
  const [endMin, setEndMin] = useState(modal.endMin);
  const [typeId, setTypeId] = useState("");
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [athleteSearch, setAthleteSearch] = useState("");
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [fee, setFee] = useState("");
  const [isGroup, setIsGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [attendees, setAttendees] = useState<Att[]>([]);
  const [removedRows, setRemovedRows] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [manualName, setManualName] = useState("");
  const [existingInv, setExistingInv] = useState<{ id: string; invoice_number: string; status: string }[]>([]);
  const [status, setStatus] = useState<Status>("confirmed");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const prac = pracs.find((p) => p.id === pracSel);

  // hydrate on edit
  useEffect(() => {
    if (hydrated) return;
    if (isEdit && modal.editId) {
      (async () => {
        if (kind === "appointment") {
          const [{ data }, { data: att }, { data: inv }] = await Promise.all([
            supabase.from("bookings").select("*").eq("id", modal.editId).single(),
            supabase
              .from("booking_attendees")
              .select("id, athlete_id, team_id, client_name, price_cents, attendance, invoice_id, athletes(first_name, last_name), teams(name)")
              .eq("booking_id", modal.editId)
              .order("created_at"),
            supabase.from("invoices").select("id, invoice_number, status").eq("booking_id", modal.editId).neq("status", "void"),
          ]);
          if (data) {
            setTypeId((data.appointment_type_id as string) ?? "");
            setAthleteId((data.athlete_id as string) ?? null);
            setClientName((data.client_name as string) ?? "");
            setNotes((data.notes as string) ?? "");
            setStatus((data.status as Status) ?? "confirmed");
            setFee(centsToInput(data.price_cents as number | null));
            setGroupTitle((data.title as string) ?? "");
            if (data.athlete_id) {
              const a = athletes.find((x) => x.id === data.athlete_id);
              if (a) setAthleteSearch(athleteName(a));
            }
          }
          const rows = (att ?? []) as unknown as (AttendeeRow & { price_cents: number | null; attendance: string; invoice_id: string | null })[];
          if (rows.length) {
            setIsGroup(true);
            setAttendees(
              rows.map((r) => {
                const a = one(r.athletes);
                const t = one(r.teams);
                return {
                  key: r.id,
                  rowId: r.id,
                  athlete_id: r.athlete_id,
                  team_id: r.team_id,
                  client_name: r.client_name,
                  label: t ? t.name : a ? athleteName(a) : r.client_name ?? "Client",
                  price: centsToInput(r.price_cents),
                  attendance: r.attendance,
                  invoice_id: r.invoice_id,
                };
              })
            );
          }
          setExistingInv((inv ?? []) as { id: string; invoice_number: string; status: string }[]);
        } else {
          const { data } = await supabase.from("diary_events").select("*").eq("id", modal.editId).single();
          if (data) {
            setTitle((data.title as string) ?? "");
            setNotes((data.notes as string) ?? "");
          }
        }
        setHydrated(true);
      })();
    } else {
      setHydrated(true);
    }
  }, [hydrated, isEdit, modal.editId, kind, athletes]);

  const selectedType = types.find((t) => t.id === typeId);
  const serviceFee = selectedType?.price_cents ?? null;

  function pickType(id: string) {
    setTypeId(id);
    const t = types.find((x) => x.id === id);
    // only reset length when the practitioner picks a service, never on load
    if (t && kind === "appointment") setEndMin(Math.min(24 * 60, startMin + t.duration_min));
  }
  function setDuration(d: number) {
    setEndMin(Math.min(24 * 60, startMin + d));
  }
  function changeStart(v: number) {
    const dur = endMin - startMin;
    setStartMin(v);
    setEndMin(Math.min(24 * 60, v + Math.max(SNAP, dur)));
  }

  const athleteMatches = useMemo(() => {
    const q = athleteSearch.trim().toLowerCase();
    if (!q) return [];
    return athletes.filter((a) => athleteName(a).toLowerCase().includes(q)).slice(0, 6);
  }, [athletes, athleteSearch]);

  const groupMatches = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return [] as { kind: "team" | "athlete"; id: string; label: string }[];
    const tm = teams.filter((t) => t.name.toLowerCase().includes(q) && !attendees.some((x) => x.team_id === t.id)).slice(0, 4)
      .map((t) => ({ kind: "team" as const, id: t.id, label: t.name }));
    const at = athletes.filter((a) => athleteName(a).toLowerCase().includes(q) && !attendees.some((x) => x.athlete_id === a.id)).slice(0, 6)
      .map((a) => ({ kind: "athlete" as const, id: a.id, label: athleteName(a) }));
    return [...tm, ...at];
  }, [groupSearch, teams, athletes, attendees]);

  function addAttendee(m: { kind: "team" | "athlete"; id: string; label: string }) {
    setAttendees((p) => [
      ...p,
      {
        key: `${m.kind}:${m.id}`,
        athlete_id: m.kind === "athlete" ? m.id : null,
        team_id: m.kind === "team" ? m.id : null,
        client_name: null,
        label: m.label,
        price: "",
        attendance: "booked",
        invoice_id: null,
      },
    ]);
    setGroupSearch("");
  }
  function addManual() {
    const n = manualName.trim();
    if (!n) return;
    setAttendees((p) => [...p, { key: `c:${n}:${Date.now()}`, athlete_id: null, team_id: null, client_name: n, label: n, price: "", attendance: "booked", invoice_id: null }]);
    setManualName("");
  }
  function removeAttendee(a: Att) {
    if (a.rowId) setRemovedRows((r) => [...r, a.rowId!]);
    setAttendees((p) => p.filter((x) => x.key !== a.key));
  }
  function editAttendee(key: string, ch: Partial<Att>) {
    setAttendees((p) => p.map((x) => (x.key === key ? { ...x, ...ch } : x)));
  }
  /** Replace a team with its individual athletes (so each can be billed separately). */
  async function splitTeam(a: Att) {
    if (!a.team_id) return;
    const { data } = await supabase.from("athlete_teams").select("athlete_id").eq("team_id", a.team_id);
    const ids = (data ?? []).map((r) => r.athlete_id as string);
    const add = athletes.filter((x) => ids.includes(x.id) && !attendees.some((y) => y.athlete_id === x.id));
    if (!add.length) { setInfo(`No athletes listed under ${a.label}.`); return; }
    if (a.rowId) setRemovedRows((r) => [...r, a.rowId!]);
    setAttendees((p) => [
      ...p.filter((x) => x.key !== a.key),
      ...add.map((x) => ({ key: `athlete:${x.id}`, athlete_id: x.id, team_id: null, client_name: null, label: athleteName(x), price: a.price, attendance: "booked", invoice_id: null })),
    ]);
  }
  function toggleGroup(on: boolean) {
    setIsGroup(on);
    if (on && attendees.length === 0) {
      const linked = athleteId ? athletes.find((a) => a.id === athleteId) : null;
      if (linked) addAttendee({ kind: "athlete", id: linked.id, label: athleteName(linked) });
      else if (clientName.trim()) setAttendees([{ key: `c:${clientName}`, athlete_id: null, team_id: null, client_name: clientName.trim(), label: clientName.trim(), price: "", attendance: "booked", invoice_id: null }]);
    }
  }

  async function save(thenInvoice = false) {
    if (!orgId || !prac) return;
    if (endMin <= startMin) {
      setErr("End must be after start.");
      return;
    }
    setSaving(true);
    setErr(null);
    setInfo(null);
    const startIso = toInstant(date, startMin);
    const endIso = toInstant(date, endMin);

    try {
      if (kind === "appointment") {
        const feeCents = fee.trim() === "" ? null : parseMoney(fee);
        if (feeCents != null && feeCents < 0) throw { message: "Fee can't be negative." };
        let display: string;
        if (isGroup) {
          if (attendees.length === 0) throw { message: "Add at least one athlete or team." };
          for (const a of attendees) {
            const pc = a.price.trim() === "" ? null : parseMoney(a.price);
            if (pc != null && pc < 0) throw { message: `Fee for ${a.label} can't be negative.` };
          }
          display = groupTitle.trim() || attendees.map((a) => a.label).slice(0, 3).join(", ") + (attendees.length > 3 ? ` +${attendees.length - 3}` : "");
        } else {
          const linked = athleteId ? athletes.find((a) => a.id === athleteId) ?? null : null;
          display = linked ? athleteName(linked) : clientName.trim();
          if (!display) throw { message: "Add a client name or link an athlete." };
        }
        const payload = {
          organisation_id: orgId,
          practitioner_id: prac.id,
          clinician_id: prac.profile_id,
          appointment_type_id: typeId || null,
          athlete_id: isGroup ? null : athleteId,
          start_at: startIso,
          end_at: endIso,
          status,
          client_name: isGroup ? display : athleteId ? null : clientName.trim() || null,
          title: isGroup ? groupTitle.trim() || null : null,
          price_cents: feeCents,
          notes: notes.trim() || null,
          source: "staff",
        };
        let bookingId = modal.editId ?? "";
        if (isEdit) {
          const res = await supabase.from("bookings").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", modal.editId!);
          if (res.error) throw res.error;
        } else {
          const res = await supabase.from("bookings").insert(payload).select("id").single();
          if (res.error) throw res.error;
          bookingId = res.data.id as string;
        }

        // attendees
        const toDelete = isGroup ? removedRows : attendees.filter((a) => a.rowId).map((a) => a.rowId!).concat(removedRows);
        if (toDelete.length) {
          const { error: de } = await supabase.from("booking_attendees").delete().in("id", toDelete);
          if (de) throw de;
        }
        if (isGroup) {
          for (const a of attendees.filter((x) => x.rowId)) {
            const { error: ue } = await supabase
              .from("booking_attendees")
              .update({ price_cents: a.price.trim() === "" ? null : parseMoney(a.price), attendance: a.attendance })
              .eq("id", a.rowId!);
            if (ue) throw ue;
          }
          const fresh = attendees.filter((x) => !x.rowId);
          if (fresh.length) {
            const { error: ie } = await supabase.from("booking_attendees").insert(
              fresh.map((a) => ({
                organisation_id: orgId,
                booking_id: bookingId,
                athlete_id: a.athlete_id,
                team_id: a.team_id,
                client_name: a.client_name,
                price_cents: a.price.trim() === "" ? null : parseMoney(a.price),
                attendance: a.attendance,
              }))
            );
            if (ie) throw ie;
          }
        }

        if (thenInvoice) {
          const r = await invoiceBooking(bookingId, profileId);
          if (r.error && r.ids.length === 0) throw { message: r.error };
          if (r.ids.length === 1) { window.location.href = `/dashboard/invoices?open=${r.ids[0]}`; return; }
          if (r.ids.length > 1) { window.location.href = "/dashboard/invoices?filter=outstanding"; return; }
          throw { message: r.error ?? "Everyone on this booking is already invoiced." };
        }
      } else {
        const payload = {
          organisation_id: orgId,
          practitioner_id: prac.id,
          kind,
          start_at: startIso,
          end_at: endIso,
          title: title.trim() || (kind === "block" ? "Blocked" : "Note"),
          notes: notes.trim() || null,
        };
        const res = isEdit
          ? await supabase.from("diary_events").update(payload).eq("id", modal.editId!)
          : await supabase.from("diary_events").insert(payload);
        if (res.error) throw res.error;
      }
      onSaved();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const msg = (e as { message?: string })?.message ?? "Save failed";
      setErr(code === "23P01" || /bookings_no_overlap/.test(msg) ? "That time overlaps an existing booking." : msg);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!isEdit || !modal.editId) return;
    setSaving(true);
    if (kind === "appointment") {
      await supabase.from("bookings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", modal.editId);
    } else {
      await supabase.from("diary_events").delete().eq("id", modal.editId);
    }
    onSaved();
  }

  const input = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200";
  const small = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200";
  const dur = endMin - startMin;
  const uninvoiced = attendees.filter((a) => !a.invoice_id && a.attendance !== "cancelled").length;
  const groupTotal = attendees
    .filter((a) => a.attendance !== "cancelled")
    .reduce((s, a) => s + ((a.price.trim() === "" ? null : parseMoney(a.price)) ?? (fee.trim() === "" ? serviceFee : parseMoney(fee)) ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            {isEdit ? "Edit" : "New"} {kind === "appointment" && isGroup ? "group booking" : kind}
          </h2>
          <span className="text-xs text-slate-400">{prac?.full_name}</span>
        </div>

        {!isEdit ? (
          <div className="mt-4 flex overflow-hidden rounded-lg border border-slate-700">
            {(["appointment", "block", "note"] as Kind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 px-3 py-1.5 text-xs capitalize ${kind === k ? "bg-lime-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>
                {k}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {/* When */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400">Date</label>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Start</label>
              <input type="time" step={300} value={minToHHMM(startMin)} onChange={(e) => e.target.value && changeStart(hhmmToMin(e.target.value))} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">End</label>
              <input type="time" step={300} value={minToHHMM(endMin)} onChange={(e) => e.target.value && setEndMin(hhmmToMin(e.target.value))} className={input} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-slate-400">Length <span className="font-semibold text-slate-200">{fmtDur(dur)}</span></span>
            {DURATIONS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-full border px-2 py-0.5 text-[11px] ${dur === d ? "border-lime-400 bg-lime-400/15 text-lime-200" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}>
                {fmtDur(d)}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Practitioner</label>
            <select value={pracSel} onChange={(e) => setPracSel(e.target.value)} className={input}>
              {pracs.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>

          {kind === "appointment" ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400">Appointment type</label>
                  <select value={typeId} onChange={(e) => pickType(e.target.value)} className={input}>
                    <option value="">— None —</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.duration_min}m{t.price_cents != null ? ` · ${money(t.price_cents)}` : ""})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400">Fee{isGroup ? " each" : ""} ($)</label>
                  <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder={serviceFee != null ? centsToInput(serviceFee) : "0.00"} className={input} />
                </div>
              </div>
              {fee.trim() !== "" && serviceFee != null && parseMoney(fee) !== serviceFee ? (
                <p className="-mt-2 text-[11px] text-amber-300">Custom fee (service price {money(serviceFee)}) · <button type="button" onClick={() => setFee("")} className="underline">reset</button></p>
              ) : null}

              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={isGroup} onChange={(e) => toggleGroup(e.target.checked)} className="accent-lime-400" />
                Group booking (several athletes and/or teams)
              </label>

              {isGroup ? (
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400">Session name <span className="text-slate-600">(optional)</span></label>
                    <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="e.g. U16 squad testing" className={input} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400">Add athletes or teams</label>
                    <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search…" className={input} />
                    {groupMatches.length ? (
                      <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
                        {groupMatches.map((m) => (
                          <button key={`${m.kind}${m.id}`} type="button" onClick={() => addAttendee(m)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800">
                            <span>{m.label}</span>
                            <span className="text-[10px] uppercase text-slate-500">{m.kind}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <input value={manualName} onChange={(e) => setManualName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }} placeholder="Or add someone not in the system" className={`flex-1 ${small}`} />
                      <button type="button" onClick={addManual} className="rounded-lg border border-slate-700 px-2 text-xs text-slate-300 hover:bg-slate-800">Add</button>
                    </div>
                  </div>
                  {attendees.length ? (
                    <div className="space-y-1.5">
                      <div className="flex text-[10px] uppercase tracking-wide text-slate-500">
                        <span className="flex-1">{attendees.length} attendee{attendees.length === 1 ? "" : "s"}</span>
                        <span className="w-20">Fee $</span>
                        {isEdit ? <span className="w-24">Attendance</span> : null}
                        <span className="w-5" />
                      </div>
                      {attendees.map((a) => (
                        <div key={a.key} className="flex items-center gap-2 text-xs text-slate-200">
                          <span className="min-w-0 flex-1 truncate">
                            {a.label}
                            {a.team_id ? <span className="ml-1 rounded bg-slate-700/60 px-1 text-[9px] uppercase text-slate-300">team</span> : null}
                            {a.invoice_id ? <span className="ml-1 rounded bg-lime-500/20 px-1 text-[9px] uppercase text-lime-200">invoiced</span> : null}
                            {a.team_id && !a.invoice_id ? (
                              <button type="button" onClick={() => void splitTeam(a)} className="ml-1 text-[10px] text-sky-300 hover:underline">split into athletes</button>
                            ) : null}
                          </span>
                          <input value={a.price} onChange={(e) => editAttendee(a.key, { price: e.target.value })} placeholder={fee || (serviceFee != null ? centsToInput(serviceFee) : "0.00")} className={`w-20 ${small}`} />
                          {isEdit ? (
                            <select value={a.attendance} onChange={(e) => editAttendee(a.key, { attendance: e.target.value })} className={`w-24 ${small}`}>
                              {ATTENDANCE.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                            </select>
                          ) : null}
                          <button type="button" onClick={() => removeAttendee(a)} className="w-5 text-slate-500 hover:text-rose-300">×</button>
                        </div>
                      ))}
                      <div className="pt-1 text-right text-[11px] text-slate-400">Session total {money(groupTotal)}</div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400">Link athlete <span className="text-slate-600">(optional)</span></label>
                    {athleteId ? (
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 text-xs text-lime-200">
                          {athleteSearch}
                          <button type="button" onClick={() => { setAthleteId(null); setAthleteSearch(""); }} className="text-lime-400 hover:text-rose-300">×</button>
                        </span>
                      </div>
                    ) : (
                      <>
                        <input value={athleteSearch} onChange={(e) => setAthleteSearch(e.target.value)} placeholder="Search…" className={input} />
                        {athleteMatches.length ? (
                          <div className="mt-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
                            {athleteMatches.map((a) => (
                              <button key={a.id} type="button" onClick={() => { setAthleteId(a.id); setAthleteSearch(athleteName(a)); }} className="flex w-full rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800">
                                {athleteName(a)}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  {!athleteId ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-400">Client name</label>
                      <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={input} />
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-400">{kind === "block" ? "Reason" : "Note"}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "block" ? "e.g. Lunch, Meeting" : "e.g. Call back re results"} className={input} />
            </div>
          )}

          {kind === "appointment" ? (
            <div>
              <label className="block text-xs font-medium text-slate-400">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={input} />
            </div>
          ) : null}

          {isEdit && kind === "appointment" ? (
            <div>
              <label className="block text-xs font-medium text-slate-400">Status</label>
              <select value={status === "cancelled" ? "confirmed" : status} onChange={(e) => setStatus(e.target.value as Status)} className={input}>
                {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
          ) : null}

          {existingInv.length && !isGroup ? (
            <p className="text-xs text-slate-400">
              Invoiced:{" "}
              {existingInv.map((i) => (
                <a key={i.id} href={`/dashboard/invoices?open=${i.id}`} className="mr-2 text-lime-300 hover:underline">{i.invoice_number} ({i.status.replace("_", " ")})</a>
              ))}
            </p>
          ) : null}

          {info ? <p className="text-xs text-slate-300">{info}</p> : null}
          {err ? <p className="text-xs text-rose-400">{err}</p> : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            {isEdit ? (
              <button type="button" onClick={() => void remove()} disabled={saving} className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
                {kind === "appointment" ? "Cancel booking" : "Delete"}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
            {kind === "appointment" && (isGroup ? uninvoiced > 0 : existingInv.length === 0) ? (
              <button type="button" onClick={() => void save(true)} disabled={saving} className="rounded-lg border border-sky-500/40 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/10 disabled:opacity-50">
                {isGroup ? `Save & invoice ${uninvoiced}` : "Save & invoice"}
              </button>
            ) : null}
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
