"use client";

import { useEffect, useMemo, useState } from "react";
import { computePerformanceSummary, type MetricTarget } from "@/lib/performanceSummary";
import {
  fetchTargetOverridesForAthlete,
  fetchTargetProfiles,
  setAthleteTargetProfile,
  type TargetProfile,
} from "@/lib/performanceTargets";
import type { ReportMetricRow, ReportSessionRow } from "@/lib/athleteReportData";
import { supabase } from "@/lib/supabaseClient";
import PerformanceSummaryCategories from "@/components/athletes/PerformanceSummaryCategories";
import SectionComment from "@/components/athletes/SectionComment";

type Props = {
  athleteId: string;
  targetProfileId: string | null;
  sessions: ReportSessionRow[];
  metricsBySession: Map<string, ReportMetricRow[]>;
  sectionComment: string | null;
  onProfileChange?: (profileId: string | null) => void;
};

/**
 * Staff-side wrapper around PerformanceSummaryCategories: resolves which
 * target profile applies to this athlete (their own, or the clinic
 * default), lets staff switch profiles right here, and carries the
 * editable clinician note that also surfaces read-only on the athlete's
 * own profile page.
 */
export default function PerformanceSummaryGrid({
  athleteId,
  targetProfileId,
  sessions,
  metricsBySession,
  sectionComment,
  onProfileChange,
}: Props) {
  const [profiles, setProfiles] = useState<TargetProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(targetProfileId);
  const [targets, setTargets] = useState<Record<string, MetricTarget>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setActiveProfileId(targetProfileId);
  }, [targetProfileId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchTargetProfiles(supabase);
      if (!cancelled) setProfiles(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      const { profileId, targets: resolved } = await fetchTargetOverridesForAthlete(
        supabase,
        activeProfileId
      );
      if (cancelled) return;
      // Reflect the resolved fallback (e.g. clinic default) back into the
      // dropdown when the athlete has no profile explicitly assigned.
      if (!activeProfileId && profileId) setActiveProfileId(profileId);
      setTargets(resolved);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfileId]);

  const categories = useMemo(
    () => computePerformanceSummary(sessions, metricsBySession, targets),
    [sessions, metricsBySession, targets]
  );

  async function handleProfileChange(nextId: string) {
    const value = nextId || null;
    setActiveProfileId(value);
    onProfileChange?.(value);
    await setAthleteTargetProfile(supabase, athleteId, value);
  }

  if (!loaded) return null;

  return (
    <div className="space-y-3">
      <PerformanceSummaryCategories
        categories={categories}
        headerRight={
          <label className="flex items-center gap-2 text-[0.7rem] text-slate-400">
            Targets
            <span className="relative inline-flex items-center">
              <select
                value={activeProfileId ?? ""}
                onChange={(e) => void handleProfileChange(e.target.value)}
                className="appearance-none rounded-lg border border-slate-700 bg-slate-950 py-1 pl-2 pr-6 text-xs text-slate-200 focus:border-lime-500 focus:outline-none [color-scheme:dark]"
                style={{ backgroundColor: "#020617", color: "#e2e8f0" }}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id} style={{ backgroundColor: "#020617", color: "#e2e8f0" }}>
                    {p.name}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-1.5 h-3 w-3 text-slate-500"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <a
              href="/dashboard/performance-targets"
              className="text-lime-400/90 hover:text-lime-300 hover:underline"
            >
              Manage →
            </a>
          </label>
        }
      />
      <SectionComment
        athleteId={athleteId}
        section="performance_summary"
        initialComment={sectionComment}
      />
    </div>
  );
}
