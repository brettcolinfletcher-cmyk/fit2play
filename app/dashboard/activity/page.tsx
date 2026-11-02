"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardNav from "@/components/DashboardNav";
import { formatDisplayDateTime } from "@/lib/dateDisplay";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { staffAuthHeaders } from "@/lib/staffAuthHeaders";
import { describeAudit } from "@/lib/auditLabels";

type Row = {
  id: number;
  at: string;
  action: string;
  table_name: string;
  athlete_id: string | null;
  detail: Record<string, unknown> | null;
  actor_name: string;
  athlete_name: string | null;
};

export default function ActivityPage() {
  const staffOk = useRequireDashboardStaff();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [athleteFilter, setAthleteFilter] = useState("");
  const [hideViews, setHideViews] = useState(false);

  useEffect(() => {
    if (!staffOk) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/audit?limit=500", { headers: await staffAuthHeaders() });
        const json = (await res.json()) as { rows?: Row[]; error?: string };
        if (cancelled) return;
        if (!res.ok) setError(json.error ?? "Could not load the activity log.");
        else setRows(json.rows ?? []);
      } catch {
        if (!cancelled) setError("Could not load the activity log.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk]);

  const athletes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.athlete_id && r.athlete_name) m.set(r.athlete_id, r.athlete_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const shown = rows.filter(
    (r) => (!athleteFilter || r.athlete_id === athleteFilter) && (!hideViews || r.action !== "view")
  );

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafc]" data-theme="light">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Activity log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Who viewed or changed athlete records. Staff actions only; nightly syncs are not listed. Showing the latest 500.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={athleteFilter}
            onChange={(e) => setAthleteFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All athletes</option>
            {athletes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={hideViews} onChange={(e) => setHideViews(e.target.checked)} />
            Hide views
          </label>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-400">Loading…</p>
          ) : error ? (
            <p className="px-4 py-6 text-sm text-rose-600">{error}</p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((r) => (
                <li key={r.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[11rem_9rem_1fr_12rem] sm:gap-4">
                  <span className="text-xs text-slate-500 sm:text-sm">{formatDisplayDateTime(r.at)}</span>
                  <span className="font-medium text-slate-800">{r.actor_name}</span>
                  <span className={r.action === "delete" ? "text-rose-700" : "text-slate-700"}>{describeAudit(r)}</span>
                  <span className="text-slate-600">
                    {r.athlete_id && r.athlete_name ? (
                      r.action === "delete" && r.table_name === "athletes" ? (
                        r.athlete_name
                      ) : (
                        <Link href={`/dashboard/athletes/${r.athlete_id}`} className="hover:text-lime-700 hover:underline">
                          {r.athlete_name}
                        </Link>
                      )
                    ) : (
                      "—"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
