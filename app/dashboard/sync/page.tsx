"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import { formatDisplayDateTime } from "@/lib/dateDisplay";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";

type SourceStatus = {
  synced_at: string;
  sessions_created: number;
  errors: string | null;
} | null;

type StatusPayload = {
  hawkins: SourceStatus;
  "1080": SourceStatus;
};

function formatAest(iso: string) {
  const s = formatDisplayDateTime(iso);
  return s === "—" ? iso : s;
}

export default function SyncDashboardPage() {
  const staffOk = useRequireDashboardStaff();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [hawkinsBusy, setHawkinsBusy] = useState(false);
  const [motionBusy, setMotionBusy] = useState(false);
  const [hawkinsMsg, setHawkinsMsg] = useState<string | null>(null);
  const [motionMsg, setMotionMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/sync/status", { credentials: "include" });
      const json = (await res.json()) as StatusPayload & { error?: string };
      if (res.ok) {
        setStatus({
          hawkins: json.hawkins ?? null,
          "1080": json["1080"] ?? null,
        });
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (staffOk) void loadStatus();
  }, [staffOk, loadStatus]);

  async function runHawkins() {
    setHawkinsBusy(true);
    setHawkinsMsg(null);
    try {
      const res = await fetch("/api/sync/hawkins", {
        method: "POST",
        credentials: "include",
        headers: {
          "x-sync-secret": process.env.NEXT_PUBLIC_SYNC_SECRET ?? "",
        },
      });
      const json = (await res.json()) as {
        ok?: boolean;
        sessionsProcessed?: number;
        error?: string;
      };
      if (json.error) {
        setHawkinsMsg(`Error: ${json.error}`);
      } else {
        setHawkinsMsg(
          `Synced ${json.sessionsProcessed ?? 0} session(s)${json.ok === false ? " (with warnings)" : ""}.`
        );
      }
      await loadStatus();
    } catch (e) {
      setHawkinsMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setHawkinsBusy(false);
    }
  }

  async function run1080() {
    setMotionBusy(true);
    setMotionMsg(null);
    try {
      const res = await fetch("/api/sync/1080", {
        method: "POST",
        credentials: "include",
        headers: {
          "x-sync-secret": process.env.NEXT_PUBLIC_SYNC_SECRET ?? "",
        },
      });
      const json = (await res.json()) as {
        ok?: boolean;
        sessionsProcessed?: number;
        error?: string;
      };
      if (json.error) {
        setMotionMsg(`Error: ${json.error}`);
      } else {
        setMotionMsg(
          `Synced ${json.sessionsProcessed ?? 0} session(s)${json.ok === false ? " (with warnings)" : ""}.`
        );
      }
      await loadStatus();
    } catch (e) {
      setMotionMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setMotionBusy(false);
    }
  }

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
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Data sync
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pull sessions from Hawkins Dynamics and 1080 Motion into Supabase.
          Nightly cron runs at midnight AEST.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <SyncCard
            title="Hawkins Dynamics"
            description="Token refresh, athletes, and tests API."
            last={status?.hawkins ?? null}
            statusLoading={statusLoading}
            busy={hawkinsBusy}
            message={hawkinsMsg}
            onSync={runHawkins}
            formatAest={formatAest}
          />
          <SyncCard
            title="1080 Motion"
            description="Public API — athletes, workouts, reps and time series."
            last={status?.["1080"] ?? null}
            statusLoading={statusLoading}
            busy={motionBusy}
            message={motionMsg}
            onSync={run1080}
            formatAest={formatAest}
          />
        </div>
      </section>
    </main>
  );
}

function SyncCard({
  title,
  description,
  last,
  statusLoading,
  busy,
  message,
  onSync,
  formatAest,
}: {
  title: string;
  description: string;
  last: SourceStatus | null | undefined;
  statusLoading: boolean;
  busy: boolean;
  message: string | null;
  onSync: () => void;
  formatAest: (iso: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-lime-700">
        {title}
      </h2>
      <p className="mt-2 text-xs text-slate-500">{description}</p>

      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
            Last synced
          </dt>
          <dd className="text-slate-700">
            {statusLoading ? (
              <span className="text-slate-400">Loading…</span>
            ) : last ? (
              formatAest(last.synced_at)
            ) : (
              <span className="text-slate-400">Never</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
            Sessions (last run)
          </dt>
          <dd className="tabular-nums text-slate-700">
            {statusLoading ? "—" : last?.sessions_created ?? "—"}
          </dd>
        </div>
        {last?.errors ? (
          <div>
            <dt className="text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
              Last log errors
            </dt>
            <dd className="text-xs text-amber-600">{last.errors}</dd>
          </div>
        ) : null}
      </dl>

      <button
        type="button"
        disabled={busy}
        onClick={onSync}
        className="mt-5 inline-flex items-center justify-center rounded-full border border-lime-500 bg-white px-4 py-2 text-xs font-semibold text-lime-700 hover:bg-lime-50 disabled:opacity-50"
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <Spinner />
            Syncing…
          </span>
        ) : (
          "Sync now"
        )}
      </button>

      {message ? (
        <p
          className={`mt-3 text-xs ${
            message.startsWith("Error") ? "text-rose-600" : "text-emerald-600"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-lime-200 border-t-lime-600"
      aria-hidden
    />
  );
}
