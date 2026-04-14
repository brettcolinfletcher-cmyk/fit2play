"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

const METRIC_LABELS: Record<string, string> = {
  fp_jump_height: "Jump Height",
  fp_jump_height_cm_best: "Jump Height",
  fp_rsi_best: "RSI",
  fp_flight_time: "Flight Time",
  fp_flight_time_s_best: "Flight Time",
  fp_contact_time: "Contact Time",
  fp_contact_time_s_best: "Contact Time",
  fp_peak_braking_force: "Peak Braking Force",
  fp_peak_propulsive_force: "Peak Propulsive Force",
  fp_stiffness: "Stiffness",
  fp_countermovement_depth: "CM Depth",
  fp_takeoff_velocity: "Takeoff Velocity",
  fp_peak_velocity: "Peak Velocity",
  peakSpeed: "Peak Speed",
  peakForce: "Peak Force",
  peakPower: "Peak Power",
  split5m: "Split 5m",
  split10m: "Split 10m",
  split20m: "Split 20m",
};

function labelForMetricKey(key: string): string {
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  return key.includes("_") ? key.replace(/_/g, " ") : key;
}

type Athlete = Record<string, unknown> & {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type SessionRow = {
  id: string;
  session_date: string | null;
  test_type: string | null;
  test_sub_type: string | null;
  source: string | null;
};

type MetricRow = {
  session_id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
};

function bucket(
  source: string | null
): "hawkins" | "1080" | "csv" {
  const s = (source ?? "").toLowerCase();
  if (s === "hawkins_csv" || s === "1080_csv") return "csv";
  if (s.includes("1080")) return "1080";
  return "hawkins";
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AthleteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const staffOk = useRequireDashboardStaff();

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [metricsBySession, setMetricsBySession] = useState<
    Map<string, MetricRow[]>
  >(() => new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!staffOk || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: a, error: aErr } = await supabase
        .from("athletes")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      if (aErr || !a) {
        setError(aErr?.message ?? "Athlete not found");
        setLoading(false);
        return;
      }

      const { data: s, error: sErr } = await supabase
        .from("sessions")
        .select("id, session_date, test_type, test_sub_type, source")
        .eq("athlete_id", id)
        .order("session_date", { ascending: false });

      if (cancelled) return;
      if (sErr) {
        setError(sErr.message);
        setLoading(false);
        return;
      }

      const sess = (s ?? []) as SessionRow[];
      setAthlete(a as Athlete);
      setSessions(sess);

      const sids = sess.map((x) => x.id);
      if (sids.length === 0) {
        setMetricsBySession(new Map());
        setLoading(false);
        return;
      }

      const { data: mrows, error: mErr } = await supabase
        .from("metrics")
        .select("session_id, key, value, rep_index")
        .in("session_id", sids);

      if (cancelled) return;
      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        return;
      }

      const map = new Map<string, MetricRow[]>();
      for (const row of (mrows ?? []) as MetricRow[]) {
        const list = map.get(row.session_id) ?? [];
        list.push(row);
        map.set(row.session_id, list);
      }
      setMetricsBySession(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk, id]);

  const grouped = useMemo(() => {
    const h: SessionRow[] = [];
    const m: SessionRow[] = [];
    const c: SessionRow[] = [];
    for (const s of sessions) {
      const b = bucket(s.source);
      if (b === "1080") m.push(s);
      else if (b === "csv") c.push(s);
      else h.push(s);
    }
    return { hawkins: h, motion1080: m, csv: c };
  }, [sessions]);

  const name = athlete
    ? `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() ||
      "Athlete"
    : "";

  function toggleExpand(sid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  function renderSessionSection(title: string, list: SessionRow[]) {
    if (list.length === 0) {
      return (
        <p className="text-xs text-slate-500">No sessions in this group.</p>
      );
    }
    return (
      <div className="space-y-2">
        {list.map((s) => {
          const rows = metricsBySession.get(s.id) ?? [];
          const count = rows.length;
          const open = expanded.has(s.id);
          return (
            <div
              key={s.id}
              className="rounded-lg border border-slate-800 bg-slate-900/50"
            >
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-900"
                onClick={() => toggleExpand(s.id)}
              >
                <span className="text-slate-200">
                  {formatWhen(s.session_date)}
                </span>
                <span className="text-xs text-slate-500">
                  {s.test_type ?? "—"}
                  {s.test_sub_type ? ` · ${s.test_sub_type}` : ""}
                  {" · "}
                  {count} metrics
                </span>
              </button>
              {open ? (
                <div className="border-t border-slate-800 px-3 py-2">
                  {rows.length === 0 ? (
                    <p className="text-xs text-slate-500">No metrics.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.key}-${r.rep_index ?? i}`} className="border-b border-slate-800/80">
                            <td className="py-1 pr-2 text-slate-400">
                              {labelForMetricKey(r.key)}
                              {r.rep_index != null ? ` (rep ${r.rep_index})` : ""}
                            </td>
                            <td className="py-1 text-right font-mono text-slate-200">
                              {r.value != null ? String(r.value) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-4xl px-4 pt-8 pb-20">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/athletes"
            className="text-xs text-slate-400 hover:text-lime-300"
          >
            ← Athletes
          </Link>
          <Link
            href={`/dashboard/athletes/${id}/edit`}
            className="ml-auto text-xs text-lime-300 hover:underline"
          >
            Edit
          </Link>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-rose-400">{error}</p>
        ) : athlete ? (
          <>
            <header className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h1 className="text-xl font-semibold text-slate-50">{name}</h1>
              <dl className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-slate-500">Team</dt>
                  <dd className="text-slate-200">
                    {(athlete.team as string) ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Sport</dt>
                  <dd className="text-slate-200">
                    {(athlete.primary_sport as string) ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Email</dt>
                  <dd className="text-slate-200">
                    {(athlete.email as string) ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Height</dt>
                  <dd className="text-slate-200">
                    {athlete.height_cm != null
                      ? `${athlete.height_cm} cm`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Weight</dt>
                  <dd className="text-slate-200">
                    {athlete.weight_kg != null
                      ? `${athlete.weight_kg} kg`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Dominant</dt>
                  <dd className="text-slate-200">
                    {(athlete.dominant_leg as string) ?? "—"} /{" "}
                    {(athlete.dominant_hand as string) ?? "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-slate-500">Notes</dt>
                  <dd className="text-slate-300 whitespace-pre-wrap">
                    {(athlete.notes as string) ?? "—"}
                  </dd>
                </div>
              </dl>
            </header>

            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-lime-300">
              Sessions
            </h2>

            <div className="mt-4 space-y-8">
              <div>
                <h3 className="mb-2 text-xs font-medium text-slate-400">
                  Hawkins
                </h3>
                {renderSessionSection("Hawkins", grouped.hawkins)}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-slate-400">
                  1080 Motion
                </h3>
                {renderSessionSection("1080", grouped.motion1080)}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-slate-400">
                  CSV uploads
                </h3>
                {renderSessionSection("CSV", grouped.csv)}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
