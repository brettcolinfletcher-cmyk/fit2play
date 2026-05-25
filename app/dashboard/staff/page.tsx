"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import { formatDisplayDate } from "@/lib/dateDisplay";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 12 weeks
const OVERDUE_DAYS = 84;
const DAY_MS = 24 * 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type AthleteStatus = "active" | "monitoring" | "archived";

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status: AthleteStatus;
};

type SessionRow = {
  id: string;
  athlete_id: string | null;
  session_date: string | null;
  source: string | null;
  test_type: string | null;
  test_sub_type: string | null;
  created_at: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function athleteName(a: { first_name: string | null; last_name: string | null }) {
  const n = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  return n || "Unnamed athlete";
}

function daysBetween(isoFrom: string, nowMs: number): number {
  const t = new Date(isoFrom).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((nowMs - t) / DAY_MS);
}

function describeOverdue(days: number): string {
  if (days < 14) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDisplayDate(iso);
}

function fmtTestType(raw: string | null) {
  if (!raw) return "Session";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function typeColor(t: string | null) {
  const s = t ?? "";
  if (s.startsWith("force_plate")) return "text-violet-300";
  if (s.startsWith("sprint") || s === "1080") return "text-lime-300";
  if (s.startsWith("dynamom")) return "text-sky-300";
  if (s.startsWith("hop")) return "text-amber-300";
  return "text-slate-400";
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function StaffDashboardPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Auth + role check
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      if (pErr || profile?.role !== "staff") {
        router.replace("/dashboard/athlete/me");
        return;
      }
      setAuthChecked(true);

      // Data
      const [aRes, sRes] = await Promise.all([
        supabase
          .from("athletes")
          .select("id, first_name, last_name, status"),
        supabase
          .from("sessions")
          .select(
            "id, athlete_id, session_date, source, test_type, test_sub_type, created_at"
          )
          .order("session_date", { ascending: false, nullsFirst: false }),
      ]);

      if (cancelled) return;
      const err = aRes.error?.message || sRes.error?.message;
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }

      setAthletes((aRes.data ?? []) as Athlete[]);
      setSessions((sRes.data ?? []) as SessionRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ──────────────────────────────────────────────────────────────────────────
  // Derivations
  // ──────────────────────────────────────────────────────────────────────────

  const athleteById = useMemo(() => {
    const m = new Map<string, Athlete>();
    for (const a of athletes) m.set(a.id, a);
    return m;
  }, [athletes]);

  const lastSessionByAthlete = useMemo(() => {
    const m = new Map<string, string>();
    // sessions already sorted desc; first match wins
    for (const s of sessions) {
      if (!s.athlete_id || !s.session_date) continue;
      if (!m.has(s.athlete_id)) m.set(s.athlete_id, s.session_date);
    }
    return m;
  }, [sessions]);

  const counts = useMemo(() => {
    let active = 0;
    let monitoring = 0;
    let archived = 0;
    for (const a of athletes) {
      if (a.status === "active") active++;
      else if (a.status === "monitoring") monitoring++;
      else if (a.status === "archived") archived++;
    }
    return { active, monitoring, archived };
  }, [athletes]);

  const nowMs = Date.now();

  const testsThisWeek = useMemo(() => {
    const cutoff = nowMs - 7 * DAY_MS;
    return sessions.reduce((acc, s) => {
      if (!s.session_date) return acc;
      return new Date(s.session_date).getTime() >= cutoff ? acc + 1 : acc;
    }, 0);
  }, [sessions, nowMs]);

  const last1080SyncIso = useMemo(() => {
    let best: string | null = null;
    for (const s of sessions) {
      if (s.source !== "1080" || !s.created_at) continue;
      if (!best || new Date(s.created_at) > new Date(best)) best = s.created_at;
    }
    return best;
  }, [sessions]);

  const overdue = useMemo(() => {
    const cutoffMs = nowMs - OVERDUE_DAYS * DAY_MS;
    const rows: { athlete: Athlete; lastSession: string; days: number }[] = [];
    for (const a of athletes) {
      if (a.status === "archived") continue;
      const last = lastSessionByAthlete.get(a.id);
      if (!last) continue;
      const t = new Date(last).getTime();
      if (t < cutoffMs) {
        rows.push({ athlete: a, lastSession: last, days: daysBetween(last, nowMs) });
      }
    }
    rows.sort((x, y) => y.days - x.days);
    return rows;
  }, [athletes, lastSessionByAthlete, nowMs]);

  const neverTested = useMemo(() => {
    const rows: Athlete[] = [];
    for (const a of athletes) {
      if (a.status === "archived") continue;
      if (!lastSessionByAthlete.has(a.id)) rows.push(a);
    }
    return rows;
  }, [athletes, lastSessionByAthlete]);

  const recent = useMemo(() => sessions.slice(0, 10), [sessions]);

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Dashboard
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              What needs your attention.
            </p>
          </div>
          <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            Live · Fit2Play
          </div>
        </header>

        {/* Snapshot strip */}
        <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs">
          <SnapStat label="Active" value={counts.active} dot="bg-lime-400" />
          <SnapStat label="Monitoring" value={counts.monitoring} dot="bg-amber-400" />
          <SnapStat label="Archived" value={counts.archived} dot="bg-slate-500" />
          <span className="text-slate-700">·</span>
          <SnapStat label="Tests this week" value={testsThisWeek} dot="bg-emerald-400" />
          <span className="text-slate-700">·</span>
          <span className="inline-flex items-center gap-2 text-slate-500">
            <span className="text-slate-500">Last 1080 sync</span>
            <span className="text-slate-200">
              {last1080SyncIso ? fmtDate(last1080SyncIso) : "—"}
            </span>
          </span>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        ) : null}

        {/* Two-column main layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Needs attention — left, wider */}
          <div className="lg:col-span-3">
            <SectionCard
              title="Needs attention"
              accent="amber"
              subtitle={`Threshold: ${Math.floor(OVERDUE_DAYS / 7)} weeks without a test`}
            >
              {loading ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">
                  Loading…
                </p>
              ) : (
                <div className="divide-y divide-slate-800">
                  <AttentionGroup
                    label="Overdue testing"
                    count={overdue.length}
                    tone="overdue"
                  >
                    {overdue.length === 0 ? (
                      <EmptyRow text="Everyone tested within the last 12 weeks." />
                    ) : (
                      overdue.map((r) => (
                        <AttentionRow
                          key={r.athlete.id}
                          href={`/dashboard/athletes/${r.athlete.id}`}
                          name={athleteName(r.athlete)}
                          right={`${describeOverdue(r.days)} ago`}
                          subtle={`Last: ${fmtDate(r.lastSession)}`}
                          status={r.athlete.status}
                        />
                      ))
                    )}
                  </AttentionGroup>

                  <AttentionGroup
                    label="Never tested"
                    count={neverTested.length}
                    tone="never"
                  >
                    {neverTested.length === 0 ? (
                      <EmptyRow text="All non-archived athletes have at least one session." />
                    ) : (
                      neverTested.map((a) => (
                        <AttentionRow
                          key={a.id}
                          href={`/dashboard/athletes/${a.id}`}
                          name={athleteName(a)}
                          right="No sessions"
                          subtle="Awaiting first test"
                          status={a.status}
                        />
                      ))
                    )}
                  </AttentionGroup>

                  <AttentionGroup label="Asymmetry flags" count={0} tone="deferred">
                    <EmptyRow text="Deferred — waiting on real Hawkins data." />
                  </AttentionGroup>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Recent activity — right */}
          <div className="lg:col-span-2">
            <SectionCard title="Recent activity" accent="lime">
              {loading ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">
                  Loading…
                </p>
              ) : recent.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">
                  No sessions yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {recent.map((s) => {
                    const a = s.athlete_id ? athleteById.get(s.athlete_id) : null;
                    const name = a ? athleteName(a) : "Unknown athlete";
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/dashboard/session/${s.id}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-900/60"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate-100">{name}</p>
                            <p
                              className={`mt-0.5 truncate text-[11px] font-medium ${typeColor(
                                s.test_type
                              )}`}
                            >
                              {fmtTestType(s.test_type)}
                              {s.test_sub_type ? (
                                <span className="text-slate-500">
                                  {" · "}
                                  {s.test_sub_type}
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                            {fmtDate(s.session_date)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction
            href="/dashboard/athletes/new"
            label="New athlete"
            primary
          />
          <QuickAction href="/dashboard/upload" label="Upload data" />
          <QuickAction href="/dashboard/sync" label="Run 1080 sync" />
          <QuickAction href="/dashboard/athletes/compare" label="Compare athletes" />
        </div>
      </section>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────────

function SnapStat({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="tabular-nums text-slate-200">{value}</span>
      <span className="text-slate-500">{label}</span>
    </span>
  );
}

function SectionCard({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent: "amber" | "lime";
  children: React.ReactNode;
}) {
  const dotCls = accent === "amber" ? "bg-amber-400" : "bg-lime-400";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dotCls}`} />
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        </div>
        {subtitle ? (
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function AttentionGroup({
  label,
  count,
  tone,
  children,
}: {
  label: string;
  count: number;
  tone: "overdue" | "never" | "deferred";
  children: React.ReactNode;
}) {
  const pillCls =
    tone === "overdue"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
      : tone === "never"
      ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
      : "border-slate-700 bg-slate-800/40 text-slate-400";
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${pillCls}`}
        >
          {count}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function AttentionRow({
  href,
  name,
  right,
  subtle,
  status,
}: {
  href: string;
  name: string;
  right: string;
  subtle: string;
  status: AthleteStatus;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-slate-900/60"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-slate-100">{name}</p>
          {status === "monitoring" ? (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">
              Monitoring
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtle}</p>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-amber-200">
        {right}
      </span>
    </Link>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-4 py-3 text-[11px] text-slate-500">{text}</p>;
}

function QuickAction({
  href,
  label,
  primary = false,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  const cls = primary
    ? "border-lime-400/40 bg-lime-400/10 text-lime-300 hover:bg-lime-400/20"
    : "border-slate-700 text-slate-200 hover:border-slate-500 hover:bg-slate-900/60";
  return (
    <Link
      href={href}
      className={`rounded-xl border px-4 py-3 text-center text-xs font-medium transition ${cls}`}
    >
      {label}
    </Link>
  );
}
