"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

/**
 * Practitioner-aware clinic diary.
 * - Day / Week / Month views; "All practitioners" columns in Day view.
 * - Drag to select a time range, then create an Appointment, Block (rule-out) or Note.
 * - Bookings live in `bookings`; blocks + notes in `diary_events`.
 * - Perth timezone (UTC+8, no DST). No-overlap enforced in Postgres per practitioner.
 */

const PERTH_TZ = "Australia/Perth";
const PERTH_OFFSET = "+08:00";
const DAY_START = 6;
const DAY_END = 21;
const PX = 1;
const GRID_MIN = (DAY_END - DAY_START) * 60;
const STATUSES = ["confirmed", "pending", "completed", "no_show"] as const;

type Status = (typeof STATUSES)[number] | "cancelled";
type View = "day" | "week" | "month";
type Kind = "appointment" | "block" | "note";

type ApptType = { id: string; name: string; duration_min: number; colour: string };
type AthleteLite = { id: string; first_name: string | null; last_name: string | null };
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
function snap15(min: number): number {
  return Math.max(0, Math.min(GRID_MIN, Math.round(min / 15) * 15));
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
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [availRows, setAvailRows] = useState<AvailRow[]>([]);
  const [excRows, setExcRows] = useState<ExcRow[]>([]);
  const [loading, setLoading] = useState(true);

  const today = todayPerth();
  const activePracs = pracs;
  const isAll = pracId === "all";

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

    const [{ data: pr }, { data: t }, { data: a }] = await Promise.all([
      supabase
        .from("practitioners")
        .select("id, full_name, colour, profile_id")
        .eq("organisation_id", profile.organisation_id)
        .eq("is_active", true)
        .order("full_name"),
      supabase.from("appointment_types").select("id, name, duration_min, colour").eq("is_active", true).order("name"),
      supabase.from("athletes").select("id, first_name, last_name").order("last_name"),
    ]);
    const list = (pr ?? []) as Practitioner[];
    setPracs(list);
    setTypes((t ?? []) as ApptType[]);
    setAthletes((a ?? []) as AthleteLite[]);
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
          "id, practitioner_id, start_at, end_at, status, client_name, client_email, client_phone, notes, athlete_id, appointment_type_id, appointment_types(name, colour, duration_min), athletes(first_name, last_name)"
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
      push(date, b.practitioner_id ?? "", {
        type: "booking",
        id: b.id,
        start: b.start_at,
        end: b.end_at,
        colour: t?.colour ?? prac?.colour ?? "#64748b",
        title: ath ? athleteName(ath) : b.client_name || "(no name)",
        sub: t?.name ?? (b.status === "pending" ? "Pending request" : ""),
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
    const s = snap15(startMin);
    let e = snap15(endMin);
    if (e <= s) e = Math.min(GRID_MIN, s + 30);
    setModal({ mode: "create", kind: "appointment", pracId: p, date, startMin: s, endMin: e });
  }
  function openEditBooking(b: BookingRow) {
    const s = minsFromDayStart(b.start_at);
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
    const s = minsFromDayStart(e.start_at);
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
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Week beginning</div>
            <div className="mb-3 text-lg font-semibold text-slate-100">
              {calDate(mondayOf(anchor)).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "UTC" })}
            </div>
            <MiniMonth monthStart={firstOfMonth(anchor)} anchor={anchor} today={today} onPick={setAnchor} />
            <div className="mt-4">
              <MiniMonth monthStart={nextMonth(anchor)} anchor={anchor} today={today} onPick={setAnchor} />
            </div>
          </aside>
          <div className="min-w-0 flex-1">
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
          <span className="ml-auto text-slate-500">Drag on the grid to create · click an item to edit</span>
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
                    onItemClick={onItemClick}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {loading ? <p className="mt-3 text-xs text-slate-500">Loading…</p> : null}
          </div>
        </div>
      </section>

      {modal ? (
        <EntryModal
          modal={modal}
          types={types}
          athletes={athletes}
          orgId={orgId}
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
  onItemClick,
}: {
  isToday: boolean;
  items: Item[];
  openWindows: { s: number; e: number }[];
  onCreate: (startMin: number, endMin: number) => void;
  onItemClick: (it: Item) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const dragging = useRef(false);

  function yToMin(clientY: number): number {
    const rect = ref.current!.getBoundingClientRect();
    return snap15((clientY - rect.top) / PX);
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
        const top = Math.max(0, minsFromDayStart(it.start)) * PX;
        const height = Math.max(18, durMin(it.start, it.end) * PX - 2);
        if (it.type === "note") {
          return (
            <button
              key={it.id}
              data-item
              type="button"
              onClick={() => onItemClick(it)}
              className="absolute inset-x-1 overflow-hidden rounded-md border-l-4 border-amber-400 bg-amber-100/90 px-2 py-1 text-left text-[11px] text-amber-900 hover:brightness-105"
              style={{ top, height }}
              title={it.title}
            >
              <div className="truncate font-medium">📌 {it.title}</div>
            </button>
          );
        }
        if (it.type === "block") {
          return (
            <button
              key={it.id}
              data-item
              type="button"
              onClick={() => onItemClick(it)}
              className="absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-left text-[11px] text-slate-100 hover:brightness-110"
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
            </button>
          );
        }
        return (
          <button
            key={it.id}
            data-item
            type="button"
            onClick={() => onItemClick(it)}
            className="absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-black/5 hover:brightness-105"
            style={{ top, height, backgroundColor: `${it.colour}22`, borderLeft: `3px solid ${it.colour}` }}
            title={`${fmtTime(it.start)}–${fmtTime(it.end)} · ${it.title}`}
          >
            <div className="font-semibold text-slate-800">{fmtTime(it.start)}</div>
            <div className="truncate text-slate-700">{it.title}</div>
            {it.sub ? <div className="truncate text-slate-500">{it.sub}</div> : null}
          </button>
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

function EntryModal({
  modal,
  types,
  athletes,
  orgId,
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
  orgId: string | null;
  pracs: Practitioner[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = modal.mode === "edit";
  const [kind, setKind] = useState<Kind>(modal.kind);
  const [startMin, setStartMin] = useState(modal.startMin);
  const [endMin, setEndMin] = useState(modal.endMin);
  const [typeId, setTypeId] = useState("");
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [athleteSearch, setAthleteSearch] = useState("");
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>("confirmed");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const prac = pracs.find((p) => p.id === modal.pracId);

  // hydrate on edit
  useEffect(() => {
    if (hydrated) return;
    if (isEdit && modal.editId) {
      (async () => {
        if (kind === "appointment") {
          const { data } = await supabase.from("bookings").select("*").eq("id", modal.editId).single();
          if (data) {
            setTypeId((data.appointment_type_id as string) ?? "");
            setAthleteId((data.athlete_id as string) ?? null);
            setClientName((data.client_name as string) ?? "");
            setNotes((data.notes as string) ?? "");
            setStatus((data.status as Status) ?? "confirmed");
            if (data.athlete_id) {
              const a = athletes.find((x) => x.id === data.athlete_id);
              if (a) setAthleteSearch(athleteName(a));
            }
          }
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
  useEffect(() => {
    if (kind === "appointment" && selectedType) setEndMin(Math.min(GRID_MIN, startMin + selectedType.duration_min));
  }, [typeId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const athleteMatches = useMemo(() => {
    const q = athleteSearch.trim().toLowerCase();
    if (!q) return [];
    return athletes.filter((a) => athleteName(a).toLowerCase().includes(q)).slice(0, 6);
  }, [athletes, athleteSearch]);

  async function save() {
    if (!orgId || !prac) return;
    if (endMin <= startMin) {
      setErr("End must be after start.");
      return;
    }
    setSaving(true);
    setErr(null);
    const startIso = toInstant(modal.date, startMin);
    const endIso = toInstant(modal.date, endMin);

    try {
      if (kind === "appointment") {
        const linked = athleteId ? athletes.find((a) => a.id === athleteId) ?? null : null;
        const display = linked ? athleteName(linked) : clientName.trim();
        if (!display) throw { message: "Add a client name or link an athlete." };
        const payload = {
          organisation_id: orgId,
          practitioner_id: prac.id,
          clinician_id: prac.profile_id,
          appointment_type_id: typeId || null,
          athlete_id: athleteId,
          start_at: startIso,
          end_at: endIso,
          status,
          client_name: linked ? null : clientName.trim() || null,
          notes: notes.trim() || null,
          source: "staff",
        };
        const res = isEdit
          ? await supabase.from("bookings").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", modal.editId!)
          : await supabase.from("bookings").insert(payload);
        if (res.error) throw res.error;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            {isEdit ? "Edit" : "New"} {kind}
          </h2>
          <span className="text-xs text-slate-400">{prac?.full_name} · {calDate(modal.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
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
          {kind === "appointment" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400">Appointment type</label>
                <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={input}>
                  <option value="">— None —</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.duration_min}m)</option>
                  ))}
                </select>
              </div>
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
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-400">{kind === "block" ? "Reason" : "Note"}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "block" ? "e.g. Lunch, Meeting" : "e.g. Call back re results"} className={input} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400">Start</label>
              <input type="time" step={900} value={minToHHMM(startMin)} onChange={(e) => setStartMin(hhmmToMin(e.target.value))} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">End</label>
              <input type="time" step={900} value={minToHHMM(endMin)} onChange={(e) => setEndMin(hhmmToMin(e.target.value))} className={input} />
            </div>
          </div>

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

          {err ? <p className="text-xs text-rose-400">{err}</p> : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <div>
            {isEdit ? (
              <button type="button" onClick={() => void remove()} disabled={saving} className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
                {kind === "appointment" ? "Cancel booking" : "Delete"}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Close</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
