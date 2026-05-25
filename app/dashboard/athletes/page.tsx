"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import DashboardNav from "@/components/DashboardNav";
import { formatDisplayDateTime } from "@/lib/dateDisplay";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type AthleteStatus = "active" | "monitoring" | "archived";

type AthleteRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  team: string | null; // legacy text column, kept for backward compat
  primary_sport: string | null;
  profile_image_url: string | null;
  status: AthleteStatus;
};

type SessionRow = {
  athlete_id: string | null;
  session_date: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type AthleteTeamRow = {
  athlete_id: string;
  team_id: string;
};

type Scope =
  | { kind: "all" }
  | { kind: "team"; id: string }
  | { kind: "unassigned" }
  | { kind: "archived" };

type ViewMode = "cards" | "table";
type SortMode = "last_tested_desc" | "name_asc";
type StatusFilter = "active_and_monitoring" | "active" | "monitoring";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function displayName(a: { first_name: string | null; last_name: string | null }): string {
  const n = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  return n || "—";
}

function initials(a: { first_name: string | null; last_name: string | null }): string {
  const f = (a.first_name ?? "").trim().charAt(0);
  const l = (a.last_name ?? "").trim().charAt(0);
  const out = `${f}${l}`.toUpperCase();
  return out || "—";
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function formatLastTested(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return formatDisplayDateTime(iso);
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function AthletesListPage() {
  const staffOk = useRequireDashboardStaff();

  // Raw data
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [athleteTeams, setAthleteTeams] = useState<AthleteTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active_and_monitoring");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [sortMode, setSortMode] = useState<SortMode>("last_tested_desc");

  // ──────────────────────────────────────────────────────────────────────────
  // Data fetch
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!staffOk) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const [aRes, sRes, tRes, atRes] = await Promise.all([
        supabase
          .from("athletes")
          .select(
            "id, first_name, last_name, team, primary_sport, profile_image_url, status"
          )
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
        supabase.from("sessions").select("athlete_id, session_date"),
        supabase.from("teams").select("id, name").order("name", { ascending: true }),
        supabase.from("athlete_teams").select("athlete_id, team_id"),
      ]);

      if (cancelled) return;

      const firstErr =
        aRes.error?.message ||
        sRes.error?.message ||
        tRes.error?.message ||
        atRes.error?.message ||
        null;
      if (firstErr) {
        setError(firstErr);
        setLoading(false);
        return;
      }

      setAthletes((aRes.data ?? []) as AthleteRow[]);
      setSessions((sRes.data ?? []) as SessionRow[]);
      setTeams((tRes.data ?? []) as TeamRow[]);
      setAthleteTeams((atRes.data ?? []) as AthleteTeamRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk]);

  // ──────────────────────────────────────────────────────────────────────────
  // Derived: stats per athlete, team memberships, sport options
  // ──────────────────────────────────────────────────────────────────────────

  const statsByAthlete = useMemo(() => {
    const m = new Map<string, { count: number; lastSession: string | null }>();
    for (const s of sessions) {
      const aid = s.athlete_id;
      if (!aid) continue;
      const cur = m.get(aid) ?? { count: 0, lastSession: null as string | null };
      cur.count += 1;
      const sd = s.session_date;
      if (sd && (!cur.lastSession || new Date(sd) > new Date(cur.lastSession))) {
        cur.lastSession = sd;
      }
      m.set(aid, cur);
    }
    return m;
  }, [sessions]);

  const teamIdsByAthlete = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const at of athleteTeams) {
      const arr = m.get(at.athlete_id) ?? [];
      arr.push(at.team_id);
      m.set(at.athlete_id, arr);
    }
    return m;
  }, [athleteTeams]);

  const teamNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.name);
    return m;
  }, [teams]);

  const sportOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of athletes) {
      if (a.primary_sport && a.primary_sport.trim()) set.add(a.primary_sport.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [athletes]);

  // ──────────────────────────────────────────────────────────────────────────
  // Derived: filtering
  // ──────────────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return athletes.filter((a) => {
      // Scope first
      if (scope.kind === "archived") {
        if (a.status !== "archived") return false;
      } else {
        if (a.status === "archived") return false;
        if (scope.kind === "team") {
          const ids = teamIdsByAthlete.get(a.id) ?? [];
          if (!ids.includes(scope.id)) return false;
        } else if (scope.kind === "unassigned") {
          const ids = teamIdsByAthlete.get(a.id) ?? [];
          if (ids.length > 0) return false;
        }
        // Status filter only applies outside archived scope
        if (statusFilter === "active" && a.status !== "active") return false;
        if (statusFilter === "monitoring" && a.status !== "monitoring") return false;
        // active_and_monitoring: both pass (archived already excluded above)
      }

      // Sport
      if (sportFilter !== "__all__") {
        if ((a.primary_sport ?? "").trim() !== sportFilter) return false;
      }

      // Search
      if (q) {
        const name = displayName(a).toLowerCase();
        if (!name.includes(q)) return false;
      }

      return true;
    });
  }, [athletes, scope, search, sportFilter, statusFilter, teamIdsByAthlete]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortMode === "name_asc") {
      arr.sort((a, b) => displayName(a).localeCompare(displayName(b)));
    } else {
      arr.sort((a, b) => {
        const la = statsByAthlete.get(a.id)?.lastSession ?? null;
        const lb = statsByAthlete.get(b.id)?.lastSession ?? null;
        if (la && lb) return new Date(lb).getTime() - new Date(la).getTime();
        if (la) return -1;
        if (lb) return 1;
        // Both never tested — fall back to name
        return displayName(a).localeCompare(displayName(b));
      });
    }
    return arr;
  }, [filtered, sortMode, statsByAthlete]);

  // ──────────────────────────────────────────────────────────────────────────
  // Derived: summary strip
  // ──────────────────────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    let active = 0;
    let monitoring = 0;
    let archived = 0;
    let staleActive = 0; // active or monitoring, no test in 30+ days OR never
    for (const a of athletes) {
      if (a.status === "active") active += 1;
      else if (a.status === "monitoring") monitoring += 1;
      else if (a.status === "archived") archived += 1;

      if (a.status === "active" || a.status === "monitoring") {
        const last = statsByAthlete.get(a.id)?.lastSession ?? null;
        const d = daysSince(last);
        if (d === null || d > 30) staleActive += 1;
      }
    }
    return { active, monitoring, archived, staleActive };
  }, [athletes, statsByAthlete]);

  // Sidebar counts
  const sidebarCounts = useMemo(() => {
    const nonArchived = athletes.filter((a) => a.status !== "archived");
    const byTeam = new Map<string, number>();
    let unassigned = 0;
    for (const a of nonArchived) {
      const ids = teamIdsByAthlete.get(a.id) ?? [];
      if (ids.length === 0) unassigned += 1;
      for (const tid of ids) byTeam.set(tid, (byTeam.get(tid) ?? 0) + 1);
    }
    return { all: nonArchived.length, byTeam, unassigned, archived: summary.archived };
  }, [athletes, teamIdsByAthlete, summary.archived]);

  // ──────────────────────────────────────────────────────────────────────────
  // Render guards
  // ──────────────────────────────────────────────────────────────────────────

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  const scopeLabel =
    scope.kind === "all"
      ? "All athletes"
      : scope.kind === "team"
      ? teamNameById.get(scope.id) ?? "Team"
      : scope.kind === "unassigned"
      ? "Unassigned"
      : "Archived";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Athletes
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage roster, sessions, and profiles.
            </p>
            <Link
              href="/dashboard/athletes/compare"
              className="mt-2 inline-block text-xs text-slate-400 hover:text-lime-300 hover:underline"
            >
              Compare athletes →
            </Link>
          </div>
          <Link
            href="/dashboard/athletes/new"
            className="rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110"
          >
            New Athlete
          </Link>
        </div>

        {/* Summary strip */}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs">
          <SummaryStat label="Active" value={summary.active} dot="bg-lime-400" />
          <SummaryStat label="Monitoring" value={summary.monitoring} dot="bg-amber-400" />
          <SummaryStat label="Archived" value={summary.archived} dot="bg-slate-500" />
          <span className="text-slate-700">·</span>
          <SummaryStat
            label="Not tested >30d"
            value={summary.staleActive}
            dot={summary.staleActive > 0 ? "bg-rose-400" : "bg-slate-600"}
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        ) : null}

        {/* Layout: sidebar + main */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
          {/* Sidebar */}
          <aside className="md:sticky md:top-6 md:self-start">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
              <SidebarItem
                label="All"
                count={sidebarCounts.all}
                active={scope.kind === "all"}
                onClick={() => setScope({ kind: "all" })}
              />
              <div className="mx-2 my-2 border-t border-slate-800" />
              <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wider text-slate-500">
                Teams
              </div>
              {teams.map((t) => (
                <SidebarItem
                  key={t.id}
                  label={t.name}
                  count={sidebarCounts.byTeam.get(t.id) ?? 0}
                  active={scope.kind === "team" && scope.id === t.id}
                  onClick={() => setScope({ kind: "team", id: t.id })}
                />
              ))}
              <SidebarItem
                label="Unassigned"
                count={sidebarCounts.unassigned}
                active={scope.kind === "unassigned"}
                onClick={() => setScope({ kind: "unassigned" })}
                muted
              />
              <div className="mx-2 my-2 border-t border-slate-800" />
              <SidebarItem
                label="Archived"
                count={sidebarCounts.archived}
                active={scope.kind === "archived"}
                onClick={() => setScope({ kind: "archived" })}
                muted
              />
            </div>
          </aside>

          {/* Main */}
          <div className="min-w-0">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="min-w-[180px] flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-lime-500 focus:outline-none"
              />
              <select
                value={sportFilter}
                onChange={(e) => setSportFilter(e.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
              >
                <option value="__all__">All sports</option>
                {sportOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {scope.kind !== "archived" ? (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                >
                  <option value="active_and_monitoring">Active + Monitoring</option>
                  <option value="active">Active only</option>
                  <option value="monitoring">Monitoring only</option>
                </select>
              ) : null}
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
              >
                <option value="last_tested_desc">Sort: Last tested</option>
                <option value="name_asc">Sort: Name A–Z</option>
              </select>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-slate-500">
                  {sorted.length} {sorted.length === 1 ? "athlete" : "athletes"}
                </span>
                <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
              </div>
            </div>

            {/* Scope title (small) */}
            <div className="mt-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-300">{scopeLabel}</h2>
            </div>

            {/* Results */}
            {loading ? (
              <p className="mt-8 text-center text-xs text-slate-500">Loading…</p>
            ) : sorted.length === 0 ? (
              <p className="mt-8 text-center text-xs text-slate-500">
                No athletes match these filters.
              </p>
            ) : viewMode === "cards" ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map((a) => {
                  const st = statsByAthlete.get(a.id);
                  const teamIds = teamIdsByAthlete.get(a.id) ?? [];
                  const teamNames = teamIds
                    .map((id) => teamNameById.get(id))
                    .filter((x): x is string => Boolean(x));
                  return (
                    <AthleteCard
                      key={a.id}
                      athlete={a}
                      teamNames={teamNames}
                      sessionCount={st?.count ?? 0}
                      lastSession={st?.lastSession ?? null}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Team(s)</th>
                      <th className="px-4 py-3 font-medium">Sport</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Sessions</th>
                      <th className="px-4 py-3 font-medium">Last Session</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((a) => {
                      const st = statsByAthlete.get(a.id);
                      const teamIds = teamIdsByAthlete.get(a.id) ?? [];
                      const teamNames = teamIds
                        .map((id) => teamNameById.get(id))
                        .filter((x): x is string => Boolean(x));
                      return (
                        <tr
                          key={a.id}
                          className="border-b border-slate-800/80 hover:bg-slate-900/80"
                        >
                          <td className="px-4 py-3 text-slate-100">
                            <Link
                              href={`/dashboard/athletes/${a.id}`}
                              className="hover:text-lime-300 hover:underline"
                            >
                              {displayName(a)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {teamNames.length > 0 ? teamNames.join(", ") : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {a.primary_sport ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill status={a.status} />
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-300">
                            {st?.count ?? 0}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {formatLastTested(st?.lastSession)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/dashboard/athletes/${a.id}`}
                              className="mr-2 text-xs text-lime-300 hover:underline"
                            >
                              View
                            </Link>
                            <Link
                              href={`/dashboard/athletes/${a.id}/edit`}
                              className="text-xs text-slate-300 hover:text-lime-300 hover:underline"
                            >
                              Edit
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents (kept in-file for v1)
// ────────────────────────────────────────────────────────────────────────────

function SummaryStat({
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

function SidebarItem({
  label,
  count,
  active,
  onClick,
  muted = false,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  const base = "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition";
  const activeCls = active
    ? "bg-lime-400/10 text-lime-200"
    : muted
    ? "text-slate-500 hover:bg-slate-800/60 hover:text-slate-200"
    : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-50";
  return (
    <button type="button" onClick={onClick} className={`${base} ${activeCls}`}>
      <span className="truncate">{label}</span>
      <span className="tabular-nums text-slate-500">{count}</span>
    </button>
  );
}

function ViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-800">
      <button
        type="button"
        onClick={() => setViewMode("cards")}
        className={`px-2 py-1 text-[11px] ${
          viewMode === "cards"
            ? "bg-slate-800 text-slate-100"
            : "bg-slate-950 text-slate-400 hover:text-slate-200"
        }`}
      >
        Cards
      </button>
      <button
        type="button"
        onClick={() => setViewMode("table")}
        className={`px-2 py-1 text-[11px] ${
          viewMode === "table"
            ? "bg-slate-800 text-slate-100"
            : "bg-slate-950 text-slate-400 hover:text-slate-200"
        }`}
      >
        Table
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: AthleteStatus }) {
  const map: Record<AthleteStatus, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-lime-400/15 text-lime-300 border-lime-400/30" },
    monitoring: {
      label: "Monitoring",
      cls: "bg-amber-400/15 text-amber-200 border-amber-400/30",
    },
    archived: {
      label: "Archived",
      cls: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    },
  };
  const s = map[status];
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

function AthleteCard({
  athlete,
  teamNames,
  sessionCount,
  lastSession,
}: {
  athlete: AthleteRow;
  teamNames: string[];
  sessionCount: number;
  lastSession: string | null;
}) {
  const d = daysSince(lastSession);
  const stale = athlete.status !== "archived" && (d === null || d > 30);
  const teamLabel =
    teamNames.length === 0
      ? "Unassigned"
      : teamNames.length === 1
      ? teamNames[0]
      : `${teamNames[0]} +${teamNames.length - 1}`;
  return (
    <Link
      href={`/dashboard/athletes/${athlete.id}`}
      className="group block rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-lime-400/40 hover:bg-slate-900/70 hover:shadow-lg hover:shadow-lime-400/10"
    >
      <div className="flex items-start gap-3">
        {athlete.profile_image_url ? (
          <Image
            src={athlete.profile_image_url}
            alt={displayName(athlete)}
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
            {initials(athlete)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-slate-100 group-hover:text-lime-200">
              {displayName(athlete)}
            </p>
            {athlete.status !== "active" ? (
              <StatusPill status={athlete.status} />
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {teamLabel}
            {athlete.primary_sport ? ` · ${athlete.primary_sport}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-[11px]">
        <div>
          <p className="text-slate-500">Last tested</p>
          <p
            className={`mt-0.5 tabular-nums ${
              stale ? "text-rose-300" : "text-slate-200"
            }`}
          >
            {formatLastTested(lastSession)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-slate-500">Sessions</p>
          <p className="mt-0.5 tabular-nums text-slate-200">{sessionCount}</p>
        </div>
      </div>
    </Link>
  );
}
