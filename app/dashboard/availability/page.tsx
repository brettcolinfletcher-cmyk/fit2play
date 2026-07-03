"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import PracticeSidebar from "@/components/PracticeSidebar";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

/**
 * Per-practitioner availability manager.
 * Recurring weekly hours -> `availability`; one-off changes -> `availability_exceptions`.
 * Everything is keyed by practitioner_id, so each practitioner's hours are independent.
 * The public booking engine reads these, so edits change what patients can book.
 */

const WEEKDAYS: { wd: number; label: string }[] = [
  { wd: 1, label: "Monday" },
  { wd: 2, label: "Tuesday" },
  { wd: 3, label: "Wednesday" },
  { wd: 4, label: "Thursday" },
  { wd: 5, label: "Friday" },
  { wd: 6, label: "Saturday" },
  { wd: 0, label: "Sunday" },
];

type Practitioner = { id: string; full_name: string; profile_id: string | null };
type WindowRow = { key: string; start: string; end: string };
type ExceptionRow = {
  id: string;
  exception_date: string;
  start_time: string | null;
  end_time: string | null;
  is_available: boolean;
  reason: string | null;
};

function hm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}
function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function longDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
let keySeq = 0;
const newKey = () => `w${keySeq++}`;

export default function AvailabilityPage() {
  const staffOk = useRequireDashboardStaff();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [pracs, setPracs] = useState<Practitioner[]>([]);
  const [pracId, setPracId] = useState<string>("");

  const [week, setWeek] = useState<Record<number, WindowRow[]>>({});
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [weekMsg, setWeekMsg] = useState<string | null>(null);

  const [exDate, setExDate] = useState<string>(() => todayStr());
  const [exMode, setExMode] = useState<"block" | "open">("block");
  const [exAllDay, setExAllDay] = useState(true);
  const [exStart, setExStart] = useState("09:00");
  const [exEnd, setExEnd] = useState("12:00");
  const [exReason, setExReason] = useState("");
  const [exSaving, setExSaving] = useState(false);
  const [exMsg, setExMsg] = useState<string | null>(null);

  const selectedPrac = pracs.find((p) => p.id === pracId) ?? null;

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
    const { data: pr } = await supabase
      .from("practitioners")
      .select("id, full_name, profile_id")
      .eq("organisation_id", profile.organisation_id)
      .eq("is_active", true)
      .order("full_name");
    const list = (pr ?? []) as Practitioner[];
    setPracs(list);
    const mine = list.find((p) => p.profile_id === profile.id);
    setPracId(mine?.id ?? list[0]?.id ?? "");
  }, []);

  const loadForPractitioner = useCallback(async (pid: string) => {
    setLoaded(false);
    const [{ data: av }, { data: ex }] = await Promise.all([
      supabase.from("availability").select("weekday, start_time, end_time").eq("practitioner_id", pid).order("start_time"),
      supabase
        .from("availability_exceptions")
        .select("id, exception_date, start_time, end_time, is_available, reason")
        .eq("practitioner_id", pid)
        .gte("exception_date", todayStr())
        .order("exception_date"),
    ]);
    const map: Record<number, WindowRow[]> = {};
    for (const w of WEEKDAYS) map[w.wd] = [];
    for (const r of av ?? []) {
      const wd = r.weekday as number;
      (map[wd] ||= []).push({ key: newKey(), start: hm(r.start_time as string), end: hm(r.end_time as string) });
    }
    setWeek(map);
    setExceptions((ex ?? []) as ExceptionRow[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (staffOk) void loadStatic();
  }, [staffOk, loadStatic]);
  useEffect(() => {
    if (staffOk && pracId) void loadForPractitioner(pracId);
  }, [staffOk, pracId, loadForPractitioner]);

  function addWindow(wd: number) {
    setWeek((prev) => ({ ...prev, [wd]: [...(prev[wd] ?? []), { key: newKey(), start: "09:00", end: "17:00" }] }));
  }
  function removeWindow(wd: number, key: string) {
    setWeek((prev) => ({ ...prev, [wd]: (prev[wd] ?? []).filter((w) => w.key !== key) }));
  }
  function editWindow(wd: number, key: string, field: "start" | "end", value: string) {
    setWeek((prev) => ({ ...prev, [wd]: (prev[wd] ?? []).map((w) => (w.key === key ? { ...w, [field]: value } : w)) }));
  }

  async function saveWeek() {
    if (!orgId || !pracId) return;
    if (!loaded) {
      setWeekMsg("Still loading — give it a second and try again.");
      return;
    }
    for (const { wd, label } of WEEKDAYS) {
      for (const w of week[wd] ?? []) {
        if (!w.start || !w.end || w.start >= w.end) {
          setWeekMsg(`${label}: each window needs a start earlier than its end.`);
          return;
        }
      }
    }
    setSavingWeek(true);
    setWeekMsg(null);
    const rows = WEEKDAYS.flatMap(({ wd }) =>
      (week[wd] ?? []).map((w) => ({
        practitioner_id: pracId,
        clinician_id: selectedPrac?.profile_id ?? null,
        organisation_id: orgId,
        weekday: wd,
        start_time: w.start,
        end_time: w.end,
      }))
    );
    const del = await supabase.from("availability").delete().eq("practitioner_id", pracId);
    if (del.error) {
      setWeekMsg(del.error.message);
      setSavingWeek(false);
      return;
    }
    if (rows.length > 0) {
      const ins = await supabase.from("availability").insert(rows);
      if (ins.error) {
        setWeekMsg(`Saved partially — reload and check. (${ins.error.message})`);
        setSavingWeek(false);
        return;
      }
    }
    setSavingWeek(false);
    setWeekMsg("Weekly hours saved.");
    void loadForPractitioner(pracId);
  }

  async function addException() {
    if (!orgId || !pracId) return;
    if (!exDate) {
      setExMsg("Pick a date.");
      return;
    }
    if (!exAllDay && exStart >= exEnd) {
      setExMsg("Start must be earlier than end.");
      return;
    }
    setExSaving(true);
    setExMsg(null);
    const { error } = await supabase.from("availability_exceptions").insert({
      practitioner_id: pracId,
      clinician_id: selectedPrac?.profile_id ?? null,
      organisation_id: orgId,
      exception_date: exDate,
      is_available: exMode === "open",
      start_time: exAllDay ? null : exStart,
      end_time: exAllDay ? null : exEnd,
      reason: exReason.trim() || null,
    });
    setExSaving(false);
    if (error) {
      setExMsg(error.message);
      return;
    }
    setExReason("");
    void loadForPractitioner(pracId);
  }

  async function deleteException(id: string) {
    await supabase.from("availability_exceptions").delete().eq("id", id);
    void loadForPractitioner(pracId);
  }

  const orderedExceptions = useMemo(
    () => [...exceptions].sort((a, b) => a.exception_date.localeCompare(b.exception_date)),
    [exceptions]
  );

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
          <aside className="w-full shrink-0 lg:w-48"><PracticeSidebar /></aside>
          <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">AVAILABILITY</h1>
            <p className="mt-1 text-sm text-slate-400">Each practitioner's hours are independent. These control what patients can book online.</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">Practitioner</label>
            <select
              value={pracId}
              onChange={(e) => setPracId(e.target.value)}
              className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            >
              {pracs.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {pracs.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">No practitioners yet — add one on the Practitioners page first.</p>
        ) : null}

        {/* Weekly hours */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100">Weekly hours{selectedPrac ? ` — ${selectedPrac.full_name}` : ""}</h2>
            <button
              type="button"
              onClick={() => void saveWeek()}
              disabled={savingWeek || !pracId}
              className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-1.5 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50"
            >
              {savingWeek ? "Saving…" : "Save weekly hours"}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {WEEKDAYS.map(({ wd, label }) => (
              <div key={wd} className="flex flex-wrap items-start gap-3 border-t border-slate-800 pt-3">
                <div className="w-24 pt-1.5 text-sm font-medium text-slate-300">{label}</div>
                <div className="flex-1 space-y-2">
                  {(week[wd] ?? []).length === 0 ? (
                    <span className="text-xs text-slate-500">Closed</span>
                  ) : (
                    (week[wd] ?? []).map((w) => (
                      <div key={w.key} className="flex items-center gap-2">
                        <input type="time" value={w.start} onChange={(e) => editWindow(wd, w.key, "start", e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200" />
                        <span className="text-slate-500">–</span>
                        <input type="time" value={w.end} onChange={(e) => editWindow(wd, w.key, "end", e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200" />
                        <button type="button" onClick={() => removeWindow(wd, w.key)} aria-label="Remove window" className="text-slate-500 hover:text-rose-300">×</button>
                      </div>
                    ))
                  )}
                  <button type="button" onClick={() => addWindow(wd)} className="text-xs text-lime-300 hover:text-lime-200">+ Add hours</button>
                </div>
              </div>
            ))}
          </div>
          {weekMsg ? <p className="mt-3 text-xs text-slate-300">{weekMsg}</p> : null}
        </div>

        {/* Time off / one-off changes */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-base font-semibold text-slate-100">Time off &amp; one-off changes</h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-400">Date</label>
              <input type="date" value={exDate} min={todayStr()} onChange={(e) => setExDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Type</label>
              <select value={exMode} onChange={(e) => setExMode(e.target.value as "block" | "open")} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                <option value="block">Block (time off)</option>
                <option value="open">Add hours (open a closed day)</option>
              </select>
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={exAllDay} onChange={(e) => setExAllDay(e.target.checked)} disabled={exMode === "open"} className="h-4 w-4" />
            All day
          </label>
          {exMode === "open" && exAllDay ? <p className="mt-1 text-xs text-amber-300">Adding hours needs a start and end time.</p> : null}

          {!exAllDay || exMode === "open" ? (
            <div className="mt-3 flex items-center gap-2">
              <input type="time" value={exStart} onChange={(e) => setExStart(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200" />
              <span className="text-slate-500">–</span>
              <input type="time" value={exEnd} onChange={(e) => setExEnd(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200" />
            </div>
          ) : null}

          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-400">Reason (optional)</label>
            <input value={exReason} onChange={(e) => setExReason(e.target.value)} placeholder="e.g. Public holiday, conference" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
          </div>

          <button type="button" onClick={() => void addException()} disabled={exSaving || !pracId || (exMode === "open" && exAllDay)} className="mt-4 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50">
            {exSaving ? "Adding…" : "Add"}
          </button>
          {exMsg ? <p className="mt-2 text-xs text-rose-300">{exMsg}</p> : null}

          <div className="mt-5 border-t border-slate-800 pt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">Upcoming</h3>
            {orderedExceptions.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No upcoming changes.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {orderedExceptions.map((ex) => (
                  <li key={ex.id} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-sm">
                    <span className="text-slate-200">
                      <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ex.is_available ? "bg-lime-500/20 text-lime-200" : "bg-rose-500/20 text-rose-200"}`}>
                        {ex.is_available ? "Open" : "Blocked"}
                      </span>
                      {longDate(ex.exception_date)}
                      {ex.start_time ? ` · ${hm(ex.start_time)}–${hm(ex.end_time)}` : " · all day"}
                      {ex.reason ? <span className="text-slate-400"> — {ex.reason}</span> : null}
                    </span>
                    <button type="button" onClick={() => void deleteException(ex.id)} aria-label="Delete" className="text-slate-500 hover:text-rose-300">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
          </div>
        </div>
      </section>
    </main>
  );
}
