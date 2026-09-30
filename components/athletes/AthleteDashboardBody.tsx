"use client";

// The body of an athlete's dashboard: top panel (score rings or team ranking),
// latest results, performance summary and longitudinal trends, filtered by what
// the practitioner has chosen the athlete sees (report builder, protocol, panel).
//
// Used by BOTH the athlete's own page (app/dashboard/athlete/[id]) and the
// practitioner's page (app/dashboard/athletes/[id]), so the practitioner sees
// what the athlete sees. The practitioner page swaps in editable versions of the
// top panel and performance summary through the two slot props.

import { useMemo, type ReactNode } from "react";
import AthleteRingPanel from "@/components/AthleteRingPanel";
import AthleteTestSummary from "@/components/AthleteTestSummary";
import SprintTrendPanel, { type SprintReportRow } from "@/components/SprintTrendPanel";
import CmjTrendPanel, { type CmjRow } from "@/components/CmjTrendPanel";
import DjTrendPanel, { type DjRow } from "@/components/DjTrendPanel";
import SlDjTrendPanel, { type SlDjRow } from "@/components/SlDjTrendPanel";
import DynamometryTrendPanel, {
  type DynamometryRows,
  type IsoTestRow,
} from "@/components/DynamometryTrendPanel";
import HopJumpTrendPanel, { type HopJumpRow, type HopJumpRows } from "@/components/HopJumpTrendPanel";
import PerformanceSummaryCategories from "@/components/athletes/PerformanceSummaryCategories";
import { ReadOnlyRankDials, type RankRow } from "@/components/athletes/TeamRankDials";
import type { SummaryCategory } from "@/lib/performanceSummary";
import { isSprintLikeType, type NormalizedSession } from "@/lib/athleteDashboardData";
import type { ResolvedProtocol } from "@/lib/protocols";
import { normaliseSubType, parseHhdMovement } from "@/lib/reportCore";
import { formatDisplayDate } from "@/lib/dateDisplay";
import {
  sectionShown,
  type AthleteViewSettings,
  type ReportVisibilityRow,
  type TopView,
} from "@/lib/athleteViewSettings";

// ─── Data (shape of GET /api/athlete-dashboard/[id]) ─────────────────────────

export type FpTrendMetric = {
  session_date: string;
  test_type: string;
  test_sub_type: string | null;
  key: string;
  value: string;
  side: string | null;
};

export type HopJumpMetric = {
  session_date: string;
  test_sub_type: string;
  key: string;
  value: string;
  side: string | null;
};

export type AthleteViewData = {
  sessions: NormalizedSession[];
  metricLatest: Record<string, number>;
  metricPrev: Record<string, number>;
  metricSides: Record<string, number>;
  sectionComments: Record<string, string>;
  fpTrendMetrics: FpTrendMetric[];
  hopJumpMetrics: HopJumpMetric[];
  performanceSummary: SummaryCategory[];
  reportVisibility: ReportVisibilityRow[];
  protocol: ResolvedProtocol | null;
  cohortRanks: RankRow[];
};

export function parseAthleteViewData(json: Record<string, unknown>): AthleteViewData {
  return {
    sessions: (json.sessions as NormalizedSession[]) ?? [],
    metricLatest: (json.metricLatest as Record<string, number>) ?? {},
    metricPrev: (json.metricPrev as Record<string, number>) ?? {},
    metricSides: (json.metricSides as Record<string, number>) ?? {},
    sectionComments: (json.sectionComments as Record<string, string>) ?? {},
    fpTrendMetrics: (json.fpTrendMetrics as FpTrendMetric[]) ?? [],
    hopJumpMetrics: (json.hopJumpMetrics as HopJumpMetric[]) ?? [],
    performanceSummary: (json.performanceSummary as SummaryCategory[]) ?? [],
    reportVisibility: (json.reportVisibility as ReportVisibilityRow[]) ?? [],
    protocol: (json.protocol as ResolvedProtocol | null) ?? null,
    cohortRanks: (json.cohortRanks as RankRow[]) ?? [],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sessionTime(s: NormalizedSession): number {
  return new Date(s.sessionDate ?? s.createdAt).getTime();
}

function isCodSubType(sub: string | null): boolean {
  const l = normaliseSubType(sub).toLowerCase();
  return l.includes("5-10-5") || l.includes("5-0-5");
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  data: AthleteViewData;
  settings: AthleteViewSettings;
  topView: TopView;
  /**
   * undefined = default (score rings, or read-only ranking dials when topView is "dials").
   * null = no top panel. A node replaces it (the practitioner's editable dials).
   */
  topPanel?: ReactNode;
  /** Replaces the read-only performance summary (the practitioner passes the editable one). */
  performanceSummary?: ReactNode;
};

export default function AthleteDashboardBody({
  data,
  settings,
  topView,
  topPanel,
  performanceSummary,
}: Props) {
  const { sessions, metricLatest, metricPrev, metricSides, sectionComments, fpTrendMetrics, hopJumpMetrics } = data;
  const { visibility } = settings;

  const show = useMemo(
    () => ({
      linear: sectionShown("linear", settings),
      cod: sectionShown("cod", settings),
      cmj: sectionShown("cmj", settings),
      drop_jump: sectionShown("drop_jump", settings),
      drop_jump_single: sectionShown("drop_jump_single", settings),
      dynamometry: sectionShown("dynamometry", settings),
      hop_tests: sectionShown("hop_tests", settings),
    }),
    [settings]
  );

  const hiddenSections = useMemo(() => {
    const hidden = new Set<string>();
    for (const k of ["linear", "cmj", "drop_jump", "drop_jump_single", "dynamometry"] as const) {
      if (!show[k]) hidden.add(k);
    }
    return hidden;
  }, [show]);

  // One sprint row per date (best peak speed) so "vs previous" compares dates,
  // not two runs on the same day. Sessions the practitioner hid in the report
  // builder (whole section or a single sub-test) are left out.
  const sprintReportRows = useMemo<SprintReportRow[]>(() => {
    const eligible = sessions
      .filter((s) => isSprintLikeType(s.testType))
      .filter((s) => {
        const cod = isCodSubType(s.testSubType);
        if (cod ? !show.cod : !show.linear) return false;
        return visibility.isSubtestVisible(cod ? "cod" : "linear", s.testSubType ?? "");
      })
      .sort((a, b) => sessionTime(a) - sessionTime(b));

    const byDate = new Map<string, NormalizedSession>();
    for (const s of eligible) {
      const d = (s.sessionDate ?? s.createdAt).slice(0, 10);
      const cur = byDate.get(d);
      if (!cur || (s.peakSpeed ?? -Infinity) > (cur.peakSpeed ?? -Infinity)) {
        byDate.set(d, s);
      }
    }
    return [...byDate.values()]
      .sort((a, b) => sessionTime(a) - sessionTime(b))
      .map((s) => ({
        date: formatDisplayDate(s.sessionDate ?? s.createdAt),
        rawDate: s.sessionDate ?? s.createdAt,
        topSpeed: s.peakSpeed,
        totalTime: s.totalTime,
        split5m: s.split05m,
        maxAcceleration: s.maxAcceleration,
      }));
  }, [sessions, show.linear, show.cod, visibility]);

  const cmjRows = useMemo<CmjRow[]>(() => {
    const dates = [
      ...new Set(
        fpTrendMetrics
          .filter((r) => r.test_type === "force_plate_cmj")
          .map((r) => r.session_date.slice(0, 10))
      ),
    ].sort();
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
    const dates = [
      ...new Set(
        fpTrendMetrics
          .filter((r) => r.test_type === "force_plate_dj")
          .map((r) => r.session_date.slice(0, 10))
      ),
    ].sort();
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
    const dates = [
      ...new Set(
        fpTrendMetrics
          .filter((r) => r.test_type === "force_plate_dj_single")
          .map((r) => r.session_date.slice(0, 10))
      ),
    ].sort();
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

  // Isometric rows the practitioner hasn't hidden (report builder switches these
  // off per movement, keyed by the parsed HHD movement name).
  const isoRows = useMemo(
    () =>
      fpTrendMetrics.filter(
        (r) =>
          r.test_type === "force_plate_isometric" &&
          visibility.isSubtestVisible("dynamometry", parseHhdMovement(r.test_sub_type))
      ),
    [fpTrendMetrics, visibility]
  );

  const dynamometryRows = useMemo<DynamometryRows>(() => {
    const dates = [...new Set(isoRows.map((r) => r.session_date.slice(0, 10)))].sort();

    function buildSubTest(subKeyword: string): IsoTestRow[] {
      return dates
        .map((d) => {
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
        })
        .filter((r) => r.leftForce != null || r.rightForce != null);
    }

    return {
      kneeExtension: buildSubTest("knee extension"),
      kneeFlexion: buildSubTest("knee flexion"),
      hipAbduction: buildSubTest("hip abduction"),
    };
  }, [isoRows]);

  const hopJumpRows = useMemo<HopJumpRows>(() => {
    function buildRows(subType: string, bilateral: boolean): HopJumpRow[] {
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
          peakForce: bilateral ? get("peak_force", null) : null,
          peakForceLeft: bilateral ? null : get("peak_force", "left"),
          peakForceRight: bilateral ? null : get("peak_force", "right"),
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
  }, [isoRows]);

  const topPanelNode =
    topPanel !== undefined ? (
      topPanel
    ) : topView === "dials" ? (
      <ReadOnlyRankDials protocol={data.protocol} rows={data.cohortRanks} />
    ) : (
      <AthleteRingPanel metricLatest={metricLatest} metricPrev={metricPrev} />
    );

  return (
    <>
      {/* ── Top panel: score rings or team ranking ─────────────── */}
      {topPanelNode ? <div className="mt-6">{topPanelNode}</div> : null}

      {/* ── Latest results ─────────────────────────────────────── */}
      <AthleteTestSummary
        metricLatest={metricLatest}
        metricPrev={metricPrev}
        metricSides={metricSides}
        sectionComments={sectionComments}
        isoLatest={isoLatest}
        hiddenSections={hiddenSections}
      />

      {/* ── Performance summary (targets set by the clinician) ─── */}
      {performanceSummary !== undefined ? (
        performanceSummary ? <div className="mt-6">{performanceSummary}</div> : null
      ) : data.performanceSummary.length > 0 ? (
        <div className="mt-6 space-y-3">
          <PerformanceSummaryCategories categories={data.performanceSummary} />
          {sectionComments.performance_summary?.trim() ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                Clinician note
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                {sectionComments.performance_summary}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Trend data ─────────────────────────────────────────── */}
      <div className="mt-12 space-y-10">
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-800" />
          <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">Longitudinal trends</p>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {show.linear && <SprintTrendPanel rows={sprintReportRows} />}

        {show.cmj && cmjRows.length > 0 && <CmjTrendPanel rows={cmjRows} />}
        {show.drop_jump && djRows.length > 0 && <DjTrendPanel rows={djRows} />}
        {show.drop_jump_single && slDjRows.length > 0 && <SlDjTrendPanel rows={slDjRows} />}
        {show.dynamometry && <DynamometryTrendPanel rows={dynamometryRows} />}
        {show.hop_tests && <HopJumpTrendPanel rows={hopJumpRows} />}
      </div>
    </>
  );
}
