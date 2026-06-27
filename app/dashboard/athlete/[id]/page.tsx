"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  FormEvent,
  ChangeEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import AthleteRingPanel from "@/components/AthleteRingPanel";
import AthleteTestSummary from "@/components/AthleteTestSummary";
import SprintTrendPanel, {
  type SprintReportRow,
} from "@/components/SprintTrendPanel";
import CmjTrendPanel, { type CmjRow } from "@/components/CmjTrendPanel";
import DjTrendPanel, { type DjRow } from "@/components/DjTrendPanel";
import SlDjTrendPanel, { type SlDjRow } from "@/components/SlDjTrendPanel";
import AthleteAvatar from "@/components/AthleteAvatar";
import DynamometryTrendPanel, { type DynamometryRows } from "@/components/DynamometryTrendPanel";
import HopJumpTrendPanel, { type HopJumpRows } from "@/components/HopJumpTrendPanel";
import type { NormalizedSession } from "@/lib/athleteDashboardData";
import { formatDisplayDate } from "@/lib/dateDisplay";
import {
  formatTestTypeLabel,
  isSprintLikeType,
  isForcePlateType,
} from "@/lib/athleteDashboardData";

type AthleteRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_sport: string | null;
  team: string | null;
  organisation: string | null;
  profile_image_url: string | null;
};

type InjuryRow = {
  id: string;
  diagnosis: string | null;
  body_region: string | null;
  side: string | null;
  date_injured: string | null;
  date_rtp: string | null;
  status: string | null;
  notes: string | null;
};

function createSupabaseBrowser() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function keyResultsLine(s: NormalizedSession): string {
  if (isSprintLikeType(s.testType)) {
    const parts: string[] = [];
    if (s.peakSpeed != null) parts.push(`Peak ${s.peakSpeed.toFixed(2)} m/s`);
    if (s.split05m != null) parts.push(`5m ${s.split05m.toFixed(2)} s`);
    return parts.length ? parts.join(" · ") : "—";
  }
  if (isForcePlateType(s.testType)) {
    const parts: string[] = [];
    if (s.jumpHeightCm != null) parts.push(`Jump ${s.jumpHeightCm.toFixed(1)} cm`);
    if (s.rsi != null) parts.push(`RSI ${s.rsi.toFixed(2)}`);
    return parts.length ? parts.join(" · ") : "—";
  }
  return "—";
}

export default function AthleteProfilePage() {
  const { id: athleteId } = useParams<{ id: string }>();
  const router = useRouter();

  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [sessions, setSessions] = useState<NormalizedSession[]>([]);
  const [injuries, setInjuries] = useState<InjuryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [injuryForm, setInjuryForm] = useState({
    diagnosis: "",
    body_region: "",
    side: "",
    date_injured: "",
    date_rtp: "",
    status: "",
    notes: "",
  });
  const [injurySaving, setInjurySaving] = useState(false);
  const [injuryError, setInjuryError] = useState<string | null>(null);
  const [metricLatest, setMetricLatest] = useState<Record<string, number>>({});
  const [metricPrev, setMetricPrev] = useState<Record<string, number>>({});
  const [metricSides, setMetricSides] = useState<Record<string, number>>({});
  const [sectionComments, setSectionComments] = useState<Record<string, string>>({});
  const [fpTrendMetrics, setFpTrendMetrics] = useState<{
    session_date: string;
    test_type: string;
    test_sub_type: string | null;
    key: string;
    value: string;
    side: string | null;
  }[]>([]);
  const [hopJumpMetrics, setHopJumpMetrics] = useState<{
    session_date: string;
    test_sub_type: string;
    key: string;
    value: string;
    side: string | null;
  }[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);

  const loadData = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = createSupabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role === "athlete") {
        const { data: ownRecord } = await supabase
          .from("athletes")
          .select("id")
          .eq("id", athleteId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!ownRecord) {
          router.replace("/dashboard/athlete/me");
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/athlete-dashboard/${athleteId}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json?.error || "Failed to load athlete");
        setAthlete(null);
        setSessions([]);
        setInjuries([]);
        setMetricLatest({});
        setMetricPrev({});
        setMetricSides({});
        return;
      }
      setAthlete(json.athlete as AthleteRow);
      setSessions((json.sessions as NormalizedSession[]) ?? []);
      setInjuries((json.injuries as InjuryRow[]) ?? []);
      setMetricLatest((json.metricLatest as Record<string, number>) ?? {});
      setMetricPrev((json.metricPrev as Record<string, number>) ?? {});
      setMetricSides((json.metricSides as Record<string, number>) ?? {});
      setSectionComments((json.sectionComments as Record<string, string>) ?? {});
      setFpTrendMetrics((json.fpTrendMetrics as typeof fpTrendMetrics) ?? []);
      setHopJumpMetrics((json.hopJumpMetrics as typeof hopJumpMetrics) ?? []);
    } catch {
      setLoadError("Failed to load athlete");
      setAthlete(null);
      setMetricLatest({});
      setMetricPrev({});
      setMetricSides({});
    } finally {
      setLoading(false);
    }
  }, [athleteId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedDesc = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.sessionDate ?? b.createdAt).getTime() -
          new Date(a.sessionDate ?? a.createdAt).getTime()
      ),
    [sessions]
  );

  const sprintChrono = useMemo(
    () =>
      sessions
        .filter((s) => isSprintLikeType(s.testType))
        .sort(
          (a, b) =>
            new Date(a.sessionDate ?? a.createdAt).getTime() -
            new Date(b.sessionDate ?? b.createdAt).getTime()
        ),
    [sessions]
  );

  const dynoChrono = useMemo(
    () =>
      sessions
        .filter((s) => s.testType === "force_plate_isometric")
        .sort(
          (a, b) =>
            new Date(a.sessionDate ?? a.createdAt).getTime() -
            new Date(b.sessionDate ?? b.createdAt).getTime()
        ),
    [sessions]
  );

  const lastTestDate = useMemo(() => {
    if (!sessions.length) return null;
    const t = Math.max(
      ...sessions.map((s) => new Date(s.sessionDate ?? s.createdAt).getTime())
    );
    return new Date(t);
  }, [sessions]);

  // One sprint row per date (best peak speed) so "vs previous" compares dates,
  // not two runs on the same day.
  const sprintByDate = useMemo(() => {
    const map = new Map<string, NormalizedSession>();
    for (const s of sprintChrono) {
      const d = (s.sessionDate ?? s.createdAt).slice(0, 10);
      const cur = map.get(d);
      if (!cur || (s.peakSpeed ?? -Infinity) > (cur.peakSpeed ?? -Infinity)) {
        map.set(d, s);
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        new Date(a.sessionDate ?? a.createdAt).getTime() -
        new Date(b.sessionDate ?? b.createdAt).getTime()
    );
  }, [sprintChrono]);

  const lastSprintDomain = useMemo(() => {
    const arr = sessions.filter((s) => isSprintLikeType(s.testType));
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.sessionDate ?? s.createdAt).getTime()))
    );
  }, [sessions]);

  const lastForcePlateDomain = useMemo(() => {
    const arr = sessions.filter((s) => isForcePlateType(s.testType));
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.sessionDate ?? s.createdAt).getTime()))
    );
  }, [sessions]);

  const lastDynoDomain = useMemo(() => {
    const arr = sessions.filter((s) => s.testType === "force_plate_isometric");
    if (!arr.length) return null;
    return new Date(
      Math.max(...arr.map((s) => new Date(s.sessionDate ?? s.createdAt).getTime()))
    );
  }, [sessions]);

  const sprintReportRows = useMemo<SprintReportRow[]>(
    () =>
      sprintByDate.map((s) => ({
        date: formatDisplayDate(s.sessionDate ?? s.createdAt),
        rawDate: s.sessionDate ?? s.createdAt,
        topSpeed: s.peakSpeed,
        totalTime: s.totalTime,
        split5m: s.split05m,
        maxAcceleration: s.maxAcceleration,
      })),
    [sprintByDate]
  );

  const cmjRows = useMemo<CmjRow[]>(() => {
    const dates = [...new Set(
      fpTrendMetrics
        .filter((r) => r.test_type === "force_plate_cmj")
        .map((r) => r.session_date.slice(0, 10))
    )].sort();
    return dates.map((d) => {
      const rows = fpTrendMetrics.filter(
        (r) => r.test_type === "force_plate_cmj" && r.session_date.slice(0, 10) === d
      );
      const get = (key: string) => {
        const r = rows.find((x) => x.key === key);
        return r ? Number(r.value) : null;
      };
      const jumpM = get("fp_jump_height");
      return {
        date: formatDisplayDate(d),
        rawDate: d,
        jumpHeightCm: jumpM != null ? Math.round(jumpM * 1000) / 10 : null,
        mrsi: get("fp_mrsi"),
        peakPropulsiveForce: get("fp_peak_propulsive_force"),
        lrAsymmetryPct: get("fp_lr_peak_propulsive_force"),
      };
    });
  }, [fpTrendMetrics]);

  const djRows = useMemo<DjRow[]>(() => {
    const dates = [...new Set(
      fpTrendMetrics
        .filter((r) => r.test_type === "force_plate_dj")
        .map((r) => r.session_date.slice(0, 10))
    )].sort();
    return dates.map((d) => {
      const rows = fpTrendMetrics.filter(
        (r) => r.test_type === "force_plate_dj" && r.session_date.slice(0, 10) === d
      );
      const get = (key: string) => {
        const r = rows.find((x) => x.key === key);
        return r ? Number(r.value) : null;
      };
      const jumpM = get("fp_jump_height");
      return {
        date: formatDisplayDate(d),
        rawDate: d,
        rsi: get("fp_rsi_best"),
        jumpHeightCm: jumpM != null ? Math.round(jumpM * 1000) / 10 : null,
        contactTime: get("fp_contact_time"),
        flightTime: get("fp_flight_time"),
      };
    });
  }, [fpTrendMetrics]);

  const slDjRows = useMemo<SlDjRow[]>(() => {
    const dates = [...new Set(
      fpTrendMetrics
        .filter((r) => r.test_type === "force_plate_dj_single")
        .map((r) => r.session_date.slice(0, 10))
    )].sort();
    return dates.map((d) => {
      const rows = fpTrendMetrics.filter(
        (r) => r.test_type === "force_plate_dj_single" && r.session_date.slice(0, 10) === d
      );
      const getSide = (key: string, side: string) => {
        const r = rows.find((x) => x.key === key && x.side === side);
        return r ? Number(r.value) : null;
      };
      const jumpL = getSide("fp_jump_height", "left");
      const jumpR = getSide("fp_jump_height", "right");
      return {
        date: formatDisplayDate(d),
        rawDate: d,
        rsiLeft: getSide("fp_rsi_best", "left"),
        rsiRight: getSide("fp_rsi_best", "right"),
        jumpLeft: jumpL != null ? Math.round(jumpL * 1000) / 10 : null,
        jumpRight: jumpR != null ? Math.round(jumpR * 1000) / 10 : null,
      };
    });
  }, [fpTrendMetrics]);

  const dynamometryRows = useMemo<DynamometryRows>(() => {
    const isoRows = fpTrendMetrics.filter(
      (r) => r.test_type === "force_plate_isometric"
    );
    const dates = [...new Set(isoRows.map((r) => r.session_date.slice(0, 10)))].sort();

    function buildSubTest(
      subKeyword: string
    ): import("@/components/DynamometryTrendPanel").IsoTestRow[] {
      return dates.map((d) => {
        const dayRows = isoRows.filter(
          (r) =>
            r.session_date.slice(0, 10) === d &&
            (r.test_sub_type ?? "").toLowerCase().includes(subKeyword)
        );
        const get = (key: string, side: string) => {
          const r = dayRows.find((x) => x.key === key && x.side === side);
          return r ? Number(r.value) : null;
        };
        return {
          date: formatDisplayDate(d),
          rawDate: d,
          leftForce: get("peak_force", "left"),
          rightForce: get("peak_force", "right"),
          leftRfd: get("peak_rfd", "left"),
          rightRfd: get("peak_rfd", "right"),
        };
      }).filter((r) => r.leftForce != null || r.rightForce != null);
    }

    return {
      kneeExtension: buildSubTest("knee extension"),
      kneeFlexion: buildSubTest("knee flexion"),
      hipAbduction: buildSubTest("hip abduction"),
    };
  }, [fpTrendMetrics]);

  const hopJumpRows = useMemo<HopJumpRows>(() => {
    function buildRows(
      subType: string,
      bilateral: boolean
    ): import("@/components/HopJumpTrendPanel").HopJumpRow[] {
      const rows = hopJumpMetrics.filter((r) => r.test_sub_type === subType);
      const dates = [...new Set(rows.map((r) => r.session_date.slice(0, 10)))].sort();
      return dates.map((d) => {
        const day = rows.filter((r) => r.session_date.slice(0, 10) === d);
        const get = (key: string, side: string | null) => {
          const r = day.find((x) => x.key === key && x.side === side);
          return r ? Number(r.value) : null;
        };
        return {
          date: formatDisplayDate(d),
          rawDate: d,
          distLeft: bilateral ? get("total_distance", null) : get("total_distance", "left"),
          distRight: bilateral ? null : get("total_distance", "right"),
          peakForce: get("peak_force", bilateral ? null : null),
        };
      });
    }
    return {
      broadJump: buildRows("Broad Jump", true),
      slHop: buildRows("Single Leg Hop", false),
      tripleHop: buildRows("Triple Hop", false),
    };
  }, [hopJumpMetrics]);

  const isoLatest = useMemo(() => {
    const isoRows = fpTrendMetrics.filter((r) => r.test_type === "force_plate_isometric");
    const latestDate = isoRows.length
      ? [...new Set(isoRows.map((r) => r.session_date.slice(0, 10)))].sort().at(-1)
      : null;
    if (!latestDate) return undefined;
    const day = isoRows.filter((r) => r.session_date.slice(0, 10) === latestDate);
    function getSide(subKeyword: string, side: string): number | null {
      const r = day.find(
        (x) =>
          (x.test_sub_type ?? "").toLowerCase().includes(subKeyword) &&
          x.key === "peak_force" &&
          x.side === side
      );
      return r ? Number(r.value) : null;
    }
    return {
      kneeExtension: { left: getSide("knee extension", "left"), right: getSide("knee extension", "right") },
      kneeFlexion: { left: getSide("knee flexion", "left"), right: getSide("knee flexion", "right") },
      hipAbduction: { left: getSide("hip abduction", "left"), right: getSide("hip abduction", "right") },
    };
  }, [fpTrendMetrics]);

  async function handleAddInjury(e: FormEvent) {
    e.preventDefault();
    if (!athleteId) return;

    setInjurySaving(true);
    setInjuryError(null);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("injuries").insert({
      athlete_id: athleteId,
      ...injuryForm,
    });

    if (error) {
      console.error(error);
      setInjuryError("Failed to save injury");
      setInjurySaving(false);
      return;
    }

    const { data } = await supabase
      .from("injuries")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("date_injured", { ascending: false });

    setInjuries((data as InjuryRow[]) || []);

    setInjuryForm({
      diagnosis: "",
      body_region: "",
      side: "",
      date_injured: "",
      date_rtp: "",
      status: "",
      notes: "",
    });

    setInjurySaving(false);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm text-slate-400 hover:text-lime-300"
          >
            ← Back to dashboard
          </button>
          <Link
            href={`/dashboard/athlete/${athleteId}/compare`}
            className="rounded-full border border-slate-800 bg-slate-900/40 px-4 py-1.5 text-xs font-medium text-slate-200 transition hover:border-lime-400/40 hover:text-lime-300"
          >
            Compare pre / post
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading athlete…</p>
        ) : loadError ? (
          <p className="text-sm text-rose-400">{loadError}</p>
        ) : !athlete ? (
          <p className="text-sm text-rose-400">Athlete not found.</p>
        ) : (
          <>
            {/* ── Header ─────────────────────────────────────────────── */}
            <header className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#a3e63508_0%,_transparent_60%)]" />
              <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <AthleteAvatar
                    url={athlete.profile_image_url}
                    firstName={athlete.first_name}
                    lastName={athlete.last_name}
                    size={72}
                  />
                  <div>
                    <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">Athlete profile</p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-50">
                      {athlete.first_name} {athlete.last_name}
                    </h1>
                    <p className="mt-1 text-sm text-slate-400">
                      {[athlete.primary_sport, athlete.team].filter(Boolean).join(" · ")}
                      {athlete.organisation ? ` · ${athlete.organisation}` : ""}
                    </p>
                  </div>
                </div>
                <dl className="flex flex-wrap gap-5 md:text-right">
                  {[
                    { label: "Last tested", value: lastTestDate ? formatDisplayDate(lastTestDate) : "—" },
                    { label: "Sprint", value: lastSprintDomain ? formatDisplayDate(lastSprintDomain) : "—" },
                    { label: "Force plate", value: lastForcePlateDomain ? formatDisplayDate(lastForcePlateDomain) : "—" },
                    { label: "Strength", value: lastDynoDomain ? formatDisplayDate(lastDynoDomain) : "—" },
                    { label: "Sessions", value: String(sessions.length) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-[0.62rem] uppercase tracking-widest text-slate-500">{label}</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </header>

            {/* ── Performance score ───────────────────────────────────── */}
            <div className="mt-6">
              <AthleteRingPanel metricLatest={metricLatest} metricPrev={metricPrev} />
            </div>

            {/* ── Latest results ──────────────────────────────────────── */}
            <AthleteTestSummary
              metricLatest={metricLatest}
              metricPrev={metricPrev}
              metricSides={metricSides}
              sectionComments={sectionComments}
              isoLatest={isoLatest}
            />

            {/* ── Trend data ──────────────────────────────────────────── */}
            <div className="mt-12 space-y-10">
              {/* Section eyebrow */}
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-800" />
                <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">Longitudinal trends</p>
                <div className="h-px flex-1 bg-slate-800" />
              </div>

              <SprintTrendPanel rows={sprintReportRows} />

              {cmjRows.length > 0 && <CmjTrendPanel rows={cmjRows} />}
              {djRows.length > 0 && <DjTrendPanel rows={djRows} />}
              {slDjRows.length > 0 && <SlDjTrendPanel rows={slDjRows} />}
              <DynamometryTrendPanel rows={dynamometryRows} />
              <HopJumpTrendPanel rows={hopJumpRows} />
            </div>

            {/* ── Admin (collapsed) ───────────────────────────────────── */}
            <div className="mt-12 space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-800" />
                <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">Admin</p>
                <div className="h-px flex-1 bg-slate-800" />
              </div>

              {/* Session history */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                  <h2 className="text-xs font-medium text-slate-400">Session history</h2>
                  <button
                    type="button"
                    onClick={() => setShowAllSessions((v) => !v)}
                    className="text-xs text-slate-500 transition hover:text-lime-300"
                  >
                    {showAllSessions ? "Hide" : `View all (${sortedDesc.length})`}
                  </button>
                </div>
                {showAllSessions && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-800 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3">Type</th>
                          <th className="px-5 py-3">Key results</th>
                          <th className="px-5 py-3">File</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {sortedDesc.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-xs text-slate-400">
                              No sessions recorded.
                            </td>
                          </tr>
                        ) : (
                          sortedDesc.map((s) => (
                            <tr
                              key={s.sessionId}
                              tabIndex={0}
                              role="link"
                              aria-label={`Open session ${formatTestTypeLabel(s.testType)}`}
                              className="cursor-pointer transition-colors hover:bg-slate-800/40"
                              onClick={() => router.push(`/dashboard/session/${s.sessionId}`)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  router.push(`/dashboard/session/${s.sessionId}`);
                                }
                              }}
                            >
                              <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-200">
                                {formatDisplayDate(s.sessionDate ?? s.createdAt)}
                              </td>
                              <td className="px-5 py-3 text-xs text-slate-200">
                                {formatTestTypeLabel(s.testType)}
                              </td>
                              <td className="px-5 py-3 text-xs text-slate-200">
                                {keyResultsLine(s)}
                              </td>
                              <td className="max-w-[200px] truncate px-5 py-3 text-xs text-slate-400">
                                {s.fileName ?? "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Injury / rehab */}
              <details className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <h2 className="text-xs font-medium text-slate-400">Injury &amp; rehab</h2>
                  <span className="text-xs text-slate-500 transition group-open:text-lime-300">
                    {injuries.length > 0 ? `${injuries.length} record${injuries.length !== 1 ? "s" : ""}` : "Add record"} ▾
                  </span>
                </summary>
                <div className="border-t border-slate-800 px-5 pb-5 pt-4">
                  <div className="space-y-4">
                    {injuries.length === 0 ? (
                      <p className="text-sm text-slate-400">No injuries recorded.</p>
                    ) : (
                      injuries.map((inj) => (
                        <div key={inj.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm">
                          <p className="font-semibold text-slate-50">{inj.diagnosis}</p>
                          <p className="mt-1 text-slate-300">
                            {inj.body_region}{inj.side ? ` (${inj.side})` : ""}
                          </p>
                          <p className="mt-2 text-xs text-slate-400">
                            Injured: {inj.date_injured ? formatDisplayDate(inj.date_injured) : "—"}
                            {inj.date_rtp ? ` · RTP: ${formatDisplayDate(inj.date_rtp)}` : ""}
                          </p>
                          {inj.status && <p className="mt-1 text-xs text-emerald-400">Status: {inj.status}</p>}
                          {inj.notes && <p className="mt-2 text-slate-300">{inj.notes}</p>}
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={handleAddInjury} className="mt-6 space-y-3 border-t border-slate-800 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Add record</p>
                    <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Diagnosis" value={injuryForm.diagnosis} onChange={(e: ChangeEvent<HTMLInputElement>) => setInjuryForm((f) => ({ ...f, diagnosis: e.target.value }))} required />
                    <div className="grid grid-cols-2 gap-3">
                      <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Body region" value={injuryForm.body_region} onChange={(e) => setInjuryForm((f) => ({ ...f, body_region: e.target.value }))} />
                      <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Side" value={injuryForm.side} onChange={(e) => setInjuryForm((f) => ({ ...f, side: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-1 text-xs text-slate-500">Date injured</p>
                        <input type="date" className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-lime-500 focus:outline-none" value={injuryForm.date_injured} onChange={(e) => setInjuryForm((f) => ({ ...f, date_injured: e.target.value }))} required />
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-slate-500">RTP date</p>
                        <input type="date" className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-lime-500 focus:outline-none" value={injuryForm.date_rtp} onChange={(e) => setInjuryForm((f) => ({ ...f, date_rtp: e.target.value }))} />
                      </div>
                    </div>
                    <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Status" value={injuryForm.status} onChange={(e) => setInjuryForm((f) => ({ ...f, status: e.target.value }))} />
                    <textarea className="min-h-[72px] w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-lime-500 focus:outline-none" placeholder="Notes" value={injuryForm.notes} onChange={(e) => setInjuryForm((f) => ({ ...f, notes: e.target.value }))} />
                    {injuryError && <p className="text-xs text-rose-400">{injuryError}</p>}
                    <button type="submit" disabled={injurySaving} className="rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50">
                      {injurySaving ? "Saving…" : "Add injury"}
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

