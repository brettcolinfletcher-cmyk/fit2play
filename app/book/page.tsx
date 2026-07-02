"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Public patient-facing booking widget (D-book 2).
 * No account required. Talks only to /api/public/booking, which returns free
 * slot times and never exposes the clinician's calendar. Perth timezone.
 */

type ApptType = {
  id: string;
  name: string;
  duration_min: number;
  colour: string;
  price_cents: number | null;
};
type Slot = { startIso: string; label: string };
type Clinic = { name: string; clinician: string };

type Step = "service" | "time" | "details" | "done";

const DAYS_SHOWN = 21;

function perthToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function chip(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return {
    wd: d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" }),
    dm: d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }),
  };
}
function longDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function price(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function BookPage() {
  const [step, setStep] = useState<Step>("service");
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [types, setTypes] = useState<ApptType[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [type, setType] = useState<ApptType | null>(null);
  const [date, setDate] = useState<string>(() => perthToday());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dates = useMemo(() => {
    const today = perthToday();
    return Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/public/booking");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to load");
        setClinic(data.clinic);
        setTypes(data.types ?? []);
      } catch (e) {
        setOptionsError(e instanceof Error ? e.message : "Failed to load booking options.");
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  async function loadSlots(t: ApptType, d: string) {
    setLoadingSlots(true);
    setSlot(null);
    try {
      const res = await fetch(`/api/public/booking?typeId=${encodeURIComponent(t.id)}&date=${d}`);
      const data = await res.json();
      setSlots(res.ok ? data.slots ?? [] : []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  function chooseService(t: ApptType) {
    setType(t);
    const d = perthToday();
    setDate(d);
    setStep("time");
    void loadSlots(t, d);
  }

  function chooseDate(d: string) {
    setDate(d);
    if (type) void loadSlots(type, d);
  }

  const grouped = useMemo(() => {
    const morning: Slot[] = [];
    const afternoon: Slot[] = [];
    const evening: Slot[] = [];
    for (const s of slots) {
      const h = new Date(s.startIso).getUTCHours(); // not used for label; label is server Perth
      // derive Perth hour from label instead
      const isPm = /pm/i.test(s.label);
      const hr = parseInt(s.label, 10) % 12;
      const hour24 = isPm ? hr + 12 : hr;
      void h;
      if (hour24 < 12) morning.push(s);
      else if (hour24 < 17) afternoon.push(s);
      else evening.push(s);
    }
    return { morning, afternoon, evening };
  }, [slots]);

  async function submit() {
    if (!type || !slot) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/public/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeId: type.id,
          date,
          startIso: slot.startIso,
          firstName,
          lastName,
          email,
          phone,
          notes,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error ?? "Could not complete your booking.");
        // If the slot was taken, bounce back to time selection.
        if (res.status === 409 && type) {
          await loadSlots(type, date);
          setStep("time");
        }
        return;
      }
      setStep("done");
    } catch {
      setFormError("Could not complete your booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const detailsValid =
    firstName.trim() &&
    lastName.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    phone.trim() &&
    consent;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="font-semibold tracking-tight text-slate-900">
            {clinic?.name ?? "Fit2Perform"}
          </div>
          <a href="/" className="text-sm text-slate-500 hover:text-slate-800">
            ← Back to site
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Book an appointment</h1>
        {clinic ? (
          <p className="mt-1 text-sm text-slate-500">with {clinic.clinician}</p>
        ) : null}

        {/* Stepper */}
        <ol className="mt-6 flex items-center gap-2 text-xs font-medium">
          {(["service", "time", "details"] as Step[]).map((s, i) => {
            const active = step === s;
            const done =
              (s === "service" && step !== "service") ||
              (s === "time" && (step === "details" || step === "done"));
            return (
              <li key={s} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    active
                      ? "bg-slate-900 text-white"
                      : done
                      ? "bg-lime-400 text-slate-900"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={active ? "text-slate-900" : "text-slate-400"}>
                  {s === "service" ? "Service" : s === "time" ? "Time" : "Your details"}
                </span>
                {i < 2 ? <span className="mx-1 text-slate-300">/</span> : null}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {/* STEP 1 — SERVICE */}
          {step === "service" ? (
            <div>
              <h2 className="text-base font-semibold text-slate-900">Choose a service</h2>
              {loadingOptions ? (
                <p className="mt-4 text-sm text-slate-500">Loading…</p>
              ) : optionsError ? (
                <p className="mt-4 text-sm text-rose-600">{optionsError}</p>
              ) : types.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No services are available for online booking right now.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => chooseService(t)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left transition hover:border-lime-400 hover:bg-lime-50"
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className="h-8 w-1.5 rounded-full"
                          style={{ backgroundColor: t.colour }}
                        />
                        <span>
                          <span className="block font-medium text-slate-900">{t.name}</span>
                          <span className="block text-sm text-slate-500">
                            {t.duration_min} min
                            {price(t.price_cents) ? ` · ${price(t.price_cents)}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="text-slate-400">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* STEP 2 — TIME */}
          {step === "time" && type ? (
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Pick a time</h2>
                <button
                  type="button"
                  onClick={() => setStep("service")}
                  className="text-sm text-slate-500 hover:text-slate-800"
                >
                  Change service
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {type.name} · {type.duration_min} min
              </p>

              {/* date strip */}
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {dates.map((d) => {
                  const c = chip(d);
                  const selected = d === date;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => chooseDate(d)}
                      className={`flex min-w-[62px] flex-col items-center rounded-xl border px-2 py-2 text-center transition ${
                        selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:border-slate-400"
                      }`}
                    >
                      <span className="text-[11px] uppercase tracking-wide opacity-70">{c.wd}</span>
                      <span className="text-sm font-semibold">{c.dm}</span>
                    </button>
                  );
                })}
              </div>

              {/* times */}
              <div className="mt-4">
                {loadingSlots ? (
                  <p className="text-sm text-slate-500">Loading times…</p>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No available times on {longDate(date)}. Try another day.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {(
                      [
                        ["Morning", grouped.morning],
                        ["Afternoon", grouped.afternoon],
                        ["Evening", grouped.evening],
                      ] as const
                    ).map(([label, list]) =>
                      list.length ? (
                        <div key={label}>
                          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                            {label}
                          </div>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {list.map((s) => (
                              <button
                                key={s.startIso}
                                type="button"
                                onClick={() => {
                                  setSlot(s);
                                  setStep("details");
                                }}
                                className="rounded-lg border border-slate-200 px-2 py-2 text-sm font-medium text-slate-700 transition hover:border-lime-400 hover:bg-lime-50"
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* STEP 3 — DETAILS */}
          {step === "details" && type && slot ? (
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Your details</h2>
                <button
                  type="button"
                  onClick={() => setStep("time")}
                  className="text-sm text-slate-500 hover:text-slate-800"
                >
                  Change time
                </button>
              </div>

              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <span className="font-medium text-slate-900">{type.name}</span> ·{" "}
                {longDate(date)} at{" "}
                <span className="font-medium text-slate-900">{slot.label}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500">First name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Last name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500">
                    Reason for visit <span className="text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {/* honeypot */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="hidden"
                  aria-hidden="true"
                />
              </div>

              <label className="mt-4 flex items-start gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  I consent to {clinic?.name ?? "the clinic"} collecting and storing the details
                  I've provided for the purpose of managing my appointment, in line with their
                  privacy practices.
                </span>
              </label>

              {formError ? <p className="mt-3 text-sm text-rose-600">{formError}</p> : null}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={!detailsValid || submitting}
                className="mt-5 w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Requesting…" : "Request this appointment"}
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                We'll confirm your appointment once the clinic reviews the request.
              </p>
            </div>
          ) : null}

          {/* STEP 4 — DONE */}
          {step === "done" && type && slot ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-lime-400 text-2xl text-slate-900">
                ✓
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Request received</h2>
              <p className="mt-2 text-sm text-slate-600">
                Thanks {firstName}. Your request for{" "}
                <span className="font-medium text-slate-900">{type.name}</span> on{" "}
                <span className="font-medium text-slate-900">
                  {longDate(date)} at {slot.label}
                </span>{" "}
                has been sent to {clinic?.clinician ?? "the clinic"}.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                You'll be contacted at {email} to confirm. (Automatic email confirmations aren't
                switched on yet.)
              </p>
              <a
                href="/"
                className="mt-6 inline-block rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Done
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
