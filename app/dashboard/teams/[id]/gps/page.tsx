"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/DashboardNav";
import FlagsList from "@/components/teamGps/FlagsList";
import SessionComparison from "@/components/teamGps/SessionComparison";
import SquadTable from "@/components/teamGps/SquadTable";
import TeamTrends from "@/components/teamGps/TeamTrends";
import { Seg, shortDate } from "@/components/teamGps/ui";
import { athleteStatus, statusFlags, type LoadKey } from "@/lib/gpsTeam";
import { bandRangeLabel, bandsFromThresholds, loadThresholds } from "@/lib/speedBands";
import { supabase } from "@/lib/supabaseClient";
import { loadTeamGps, type TeamGpsData } from "@/lib/teamGpsData";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";

type RangePreset = "3m" | "6m" | "12m" | "all" | "custom";
const MONTHS: Record<"3m" | "6m" | "12m", number> = { "3m": 3, "6m": 6, "12m": 12 };
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function addMonths(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
}

const LOADS: { v: LoadKey; label: string }[] = [
  { v: "bands", label: "Distance (selected bands)" },
  { v: "gps_high_speed_run_distance_m", label: "HSR" },
  { v: "gps_total_sprint_distance_m", label: "Sprint distance" },
];

export default function TeamGpsPage() {
  const staffOk = useRequireDashboardStaff();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loaded, setData] = useState<TeamGpsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  // Only show data for the team in the URL (switching teams shows "Loading" until it arrives)
  const data = loaded && loaded.team.id === id ? loaded : null;
  const [today] = useState(() => iso(Date.now()));
  const [preset, setPreset] = useState<RangePreset>("3m");
  const [upTo, setUpTo] = useState<"today" | "last" | null>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loadKey, setLoadKey] = useState<LoadKey>("bands");
  const [chronicWeeks, setChronicWeeks] = useState(4);
  const [bands] = useState(() => bandsFromThresholds(typeof window === "undefined" ? [] : loadThresholds()));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const enabled = useMemo(() => new Set(bands.map((b) => b.id).filter((b) => !hidden.has(b))), [bands, hidden]);

  useEffect(() => {
    if (!staffOk || !id) return;
    let cancelled = false;
    loadTeamGps(id)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    void supabase
      .from("teams")
      .select("id, name")
      .order("name")
      .then(({ data: t }) => !cancelled && setTeams((t ?? []) as { id: string; name: string }[]));
    return () => {
      cancelled = true;
    };
  }, [staffOk, id]);

  const lastSession = useMemo(
    () => (data?.sessions ?? []).reduce<string | null>((m, s) => (!m || s.date > m ? s.date : m), null),
    [data]
  );
  // Default "up to": last session when the squad's data is more than 3 weeks old
  const upToEff = upTo ?? (lastSession && Date.parse(today) - Date.parse(lastSession) > 21 * DAY ? "last" : "today");
  const rangeEnd =
    preset === "custom"
      ? customTo || today
      : upToEff === "last" && lastSession
        ? iso(Math.min(Date.parse(lastSession) + 7 * DAY, Date.parse(today)))
        : today;
  const rangeStart = preset === "custom" ? customFrom || null : preset === "all" ? null : addMonths(rangeEnd, -MONTHS[preset]);

  const names = useMemo(() => new Map((data?.athletes ?? []).map((a) => [a.id, a.name])), [data]);

  const statuses = useMemo(() => {
    if (!data) return [];
    const byAthlete = new Map<string, typeof data.sessions>();
    for (const s of data.sessions) byAthlete.set(s.athleteId, [...(byAthlete.get(s.athleteId) ?? []), s]);
    return data.athletes
      .filter((a) => byAthlete.has(a.id))
      .map((a) => ({
        name: a.name,
        ...athleteStatus({
          athleteId: a.id,
          sessions: byAthlete.get(a.id)!,
          metrics: data.metrics,
          loadKey,
          bands,
          enabled,
          chronicDays: chronicWeeks * 7,
          rangeStart,
          rangeEnd,
          setMaxVelocity: a.setMaxVelocity,
          best1080: data.best1080.get(a.id) ?? null,
        }),
      }));
  }, [data, loadKey, bands, enabled, chronicWeeks, rangeStart, rangeEnd]);

  const flags = useMemo(() => statuses.flatMap((s) => statusFlags(s)), [statuses]);
  const maxVelocity = useMemo(() => new Map(statuses.map((s) => [s.athleteId, s.maxVelocity])), [statuses]);
  const loadLabel =
    loadKey === "bands"
      ? enabled.size === bands.length
        ? "all speed bands"
        : bands.filter((b) => enabled.has(b.id)).map((b) => b.label).join(" + ") || "no bands"
      : LOADS.find((l) => l.v === loadKey)!.label;

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] athlete-frosted" data-theme="light">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  const withoutGps = data ? data.athletes.length - statuses.length : 0;

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 athlete-frosted" data-theme="light">
      <DashboardNav lightTheme />
      <section className="mx-auto max-w-7xl px-4 pb-20 pt-8">
        <Link href="/dashboard/teams" className="text-xs text-slate-400 hover:text-slate-600">
          ← Teams
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{data?.team.name ?? "Team"} · GPS report</h1>
            <p className="mt-1 text-sm text-slate-500">
              {data
                ? `${statuses.length} player${statuses.length === 1 ? "" : "s"} with GPS data${withoutGps ? `, ${withoutGps} without` : ""} · ${
                    rangeStart ? shortDate(rangeStart) : "first session"
                  } to ${shortDate(rangeEnd)}`
                : "Loading…"}
            </p>
          </div>
          {teams.length > 1 ? (
            <select
              value={id}
              onChange={(e) => router.push(`/dashboard/teams/${e.target.value}/gps`)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Controls */}
        <div className="sticky top-16 z-20 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <Seg
            value={preset}
            onChange={setPreset}
            options={[
              { v: "3m", label: "3 mo" },
              { v: "6m", label: "6 mo" },
              { v: "12m", label: "12 mo" },
              { v: "all", label: "All" },
              { v: "custom", label: "Custom" },
            ]}
          />
          {preset === "custom" ? (
            <span className="flex items-center gap-1.5 text-xs">
              <input type="date" value={customFrom} max={customTo || today} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
              <span className="text-slate-400">to</span>
              <input type="date" value={customTo} min={customFrom || undefined} max={today} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
            </span>
          ) : (
            <Seg label="Up to" value={upToEff} onChange={setUpTo} options={[{ v: "today", label: "Today" }, { v: "last", label: "Last session" }]} />
          )}
          <Seg label="Load" value={loadKey} onChange={setLoadKey} options={LOADS} />
          <Seg
            label="Chronic (wk)"
            value={chronicWeeks}
            onChange={setChronicWeeks}
            options={[2, 3, 4, 5, 6, 7, 8, 9, 10].map((w) => ({ v: w, label: String(w), title: `${w * 7}-day chronic EWMA` }))}
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {bands.map((b) => {
              const on = enabled.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  title={bandRangeLabel(b)}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(b.id)) next.delete(b.id);
                      else next.add(b.id);
                      return next;
                    })
                  }
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 focus:outline-none ${
                    on ? "border-slate-200 text-slate-700" : "border-dashed border-slate-200 text-slate-400 line-through"
                  }`}
                >
                  <span className="h-2 w-2 rounded-sm" style={{ background: b.color, opacity: on ? 1 : 0.35 }} />
                  {b.label.replace("Band ", "B")}
                </button>
              );
            })}
          </div>
          <nav className="ml-auto flex gap-3 text-xs text-slate-400">
            <a href="#flags" className="hover:text-slate-700">Watch list</a>
            <a href="#squad" className="hover:text-slate-700">Squad</a>
            <a href="#trends" className="hover:text-slate-700">Trends</a>
            <a href="#session" className="hover:text-slate-700">Sessions</a>
          </nav>
        </div>

        {error ? <p className="mt-6 text-sm text-rose-600">{error}</p> : null}
        {!data && !error ? <p className="mt-6 text-sm text-slate-400">Loading team GPS data…</p> : null}
        {data && statuses.length === 0 ? (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No players in this team have GPS sessions yet. Link PlayerData athletes on the Data sync page.
          </p>
        ) : null}

        {data && statuses.length > 0 ? (
          <>
            <FlagsList flags={flags} names={names} />
            <SquadTable rows={statuses} loadLabel={loadLabel} asOf={rangeEnd} />
            <TeamTrends
              statuses={statuses}
              sessions={data.sessions}
              metrics={data.metrics}
              bands={bands}
              enabled={enabled}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              phases={data.phases}
              loadLabel={loadLabel}
            />
            <SessionComparison
              sessions={data.sessions}
              metrics={data.metrics}
              names={names}
              maxVelocity={maxVelocity}
              bands={bands}
              enabled={enabled}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
