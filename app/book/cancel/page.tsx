"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Cancel a public booking from the link in the confirmation or reminder email.
 * Talks only to /api/public/booking/cancel. Perth timezone.
 */

type Summary = {
  serviceName: string;
  practitionerName: string | null;
  startAt: string;
  status: string;
  canCancel: boolean;
  reason: "past" | "already_cancelled" | null;
  cancelled?: boolean;
  error?: string;
};

function perthDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-AU", {
    timeZone: "Australia/Perth",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-AU", {
    timeZone: "Australia/Perth",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} at ${time}`;
}

function CancelBooking() {
  const token = useSearchParams().get("token") ?? "";
  const [booking, setBooking] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setError("This cancellation link is missing its code. Please use the link in your email.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/public/booking/cancel?token=${encodeURIComponent(token)}`);
        const json = (await res.json()) as Summary;
        if (cancelled) return;
        if (!res.ok) setError(json.error ?? "We couldn't find that booking.");
        else setBooking(json);
      } catch {
        if (!cancelled) setError("Something went wrong. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/booking/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as Summary;
      if (!res.ok) setError(json.error ?? "We couldn't cancel this booking.");
      setBooking((b) => (json.serviceName ? json : b));
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cancel appointment</h1>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Loading your booking…</p>
        ) : booking ? (
          <>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service</dt>
                <dd className="mt-1 text-slate-900">
                  {booking.serviceName}
                  {booking.practitionerName ? ` with ${booking.practitionerName}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date and time</dt>
                <dd className="mt-1 text-slate-900">{perthDateTime(booking.startAt)}</dd>
              </div>
            </dl>

            {booking.cancelled || booking.status === "cancelled" ? (
              <div className="mt-6 rounded-xl bg-lime-50 px-4 py-3 text-sm text-lime-900">
                {booking.cancelled
                  ? "Your appointment is cancelled. We've emailed you a confirmation."
                  : "This appointment has already been cancelled."}
              </div>
            ) : booking.canCancel ? (
              <button
                type="button"
                onClick={confirmCancel}
                disabled={busy}
                className="mt-6 w-full rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? "Cancelling…" : "Yes, cancel this appointment"}
              </button>
            ) : (
              <div className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                {booking.reason === "past"
                  ? "This appointment time has passed, so it can't be cancelled online."
                  : "This booking can't be cancelled online. Please reply to your booking email and we'll help."}
              </div>
            )}
          </>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      </div>

      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/book" className="font-medium text-slate-900 hover:text-lime-700">
          Book a new time
        </Link>
        <Link href="/" className="text-slate-500 hover:text-slate-800">
          Back to site
        </Link>
      </div>
    </div>
  );
}

export default function CancelBookingPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">
          <div className="font-semibold tracking-tight text-slate-900">Fit2Perform</div>
        </div>
      </header>
      <Suspense fallback={<p className="mx-auto max-w-xl px-5 py-10 text-sm text-slate-500">Loading…</p>}>
        <CancelBooking />
      </Suspense>
    </main>
  );
}
