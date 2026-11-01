import { pdf } from "@react-pdf/renderer";
import AthletePdfDocument from "@/components/athletes/AthletePdfDocument";
import {
  computeDateComparisonData,
  formatChartAxisDate,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import {
  buildPdfReportCharts,
  type MetricRowWithSide,
} from "@/lib/pdfReportChartData";
import {
  computeAthleteSnapshot,
  type AthleteSnapshot,
} from "@/lib/athleteSnapshot";
import {
  computePerformanceSummary,
  type SummaryCategory,
} from "@/lib/performanceSummary";
import { fetchTargetOverridesForAthlete } from "@/lib/performanceTargets";
import { protocolIncludes, resolveAthleteProtocol } from "@/lib/protocols";
import { DIALS } from "@/lib/testCatalogue";
import type { RankRow } from "@/components/athletes/TeamRankDials";
import type { PdfRankDial } from "@/components/athletes/pdf/charts/PdfRankDials";
import type { CriteriaResolver, ReportVisibility } from "@/lib/reportSections";
import { supabase } from "@/lib/supabaseClient";

/**
 * Shared PDF generation for the single-athlete export modal and the bulk
 * export. Both call generateAthletePdfBlob so the two can never drift apart.
 */

export type AthleteForPdf = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  /** Optional extended fields used by the new snapshot page. */
  primary_sport?: string | null;
  team?: string | null;
  /** Numeric columns can arrive as strings from PostgREST; the PDF coerces. */
  height_cm?: number | string | null;
  weight_kg?: number | string | null;
  target_profile_id?: string | null;
  /** "rtp" (exit-criteria/READINESS gauges) vs "performance" (composite monitoring, no READINESS). */
  dashboard_mode?: string | null;
};

export type GenerateAthletePdfInput = {
  athlete: AthleteForPdf;
  /** Sessions already scoped to the export date range. */
  sessions: ReportSessionRow[];
  metricsBySession: Map<string, ReportMetricRow[]>;
  /** Hop tests already scoped to the export date range. */
  hopTests: ReportHopTestRow[];
  sectionComments: Record<string, string | null>;
  rangeStart: string | null;
  rangeEnd: string | null;
  visibility: ReportVisibility;
  criteria: CriteriaResolver;
  mode: "best" | "date_comparison";
  dateAId?: string | null;
  dateBId?: string | null;
  includeNotes: boolean;
  includeTargets: boolean;
  includeAnthropometry: boolean;
  /** Already trimmed; empty string means none. */
  summaryComment: string;
};

export function inDateRange(
  dateIso: string | null,
  start: string | null,
  end: string | null
): boolean {
  if (!dateIso) return true;
  const d = dateIso.slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

export function todayPdfSuffix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function athleteDisplayName(a: {
  first_name: string | null;
  last_name: string | null;
}): string {
  return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Athlete";
}

/** e.g. "Jane_Smith_report_2026-10-08.pdf" */
export function pdfFileName(athleteName: string): string {
  return `${athleteName.replace(/\s+/g, "_")}_report_${todayPdfSuffix()}.pdf`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Records the export in pdf_reports. Failures are logged, never thrown. */
export async function logPdfReport(args: {
  athleteId: string;
  userId: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  mode: "best" | "date_comparison";
  dateAId?: string | null;
  dateBId?: string | null;
  includeNotes: boolean;
  summaryComment: string;
}): Promise<void> {
  const { error } = await supabase.from("pdf_reports").insert({
    athlete_id: args.athleteId,
    created_by: args.userId,
    date_range_start: args.rangeStart || null,
    date_range_end: args.rangeEnd || null,
    mode: args.mode,
    specific_dates:
      args.mode === "date_comparison" && args.dateAId && args.dateBId
        ? [args.dateAId, args.dateBId]
        : [],
    include_notes: args.includeNotes,
    summary_comment: args.summaryComment || null,
  });
  if (error) console.warn("pdf_reports insert skipped:", error.message);
}

export async function generateAthletePdfBlob(
  input: GenerateAthletePdfInput
): Promise<Blob> {
  const {
    athlete,
    sessions: scopeSessions,
    metricsBySession,
    hopTests: scopeHopTests,
    sectionComments,
    rangeStart: exportFrom,
    rangeEnd: exportTo,
    visibility,
    criteria,
    mode,
    includeNotes,
    includeTargets,
    includeAnthropometry,
    summaryComment,
  } = input;
  const dateAId = input.dateAId ?? null;
  const dateBId = input.dateBId ?? null;

  const athleteName = athleteDisplayName(athlete);
  // Matches app/dashboard/athletes/[id]/page.tsx's derivation: READINESS
  // (exit-criteria gauges) only makes sense for "rtp"-tagged athletes.
  // "performance"-tagged athletes (composite monitoring, no rehab exit
  // criteria) never get a READINESS section in their PDF.
  const dashboardMode: "rtp" | "performance" =
    String(athlete.dashboard_mode ?? "rtp") === "performance" ? "performance" : "rtp";

  const sessA = dateAId ? scopeSessions.find((s) => s.id === dateAId) ?? null : null;
  const sessB = dateBId ? scopeSessions.find((s) => s.id === dateBId) ?? null : null;
  const compareDateALabel = sessA?.session_date
    ? formatChartAxisDate(sessA.session_date)
    : "Date A";
  const compareDateBLabel = sessB?.session_date
    ? formatChartAxisDate(sessB.session_date)
    : "Date B";

  const pdfCharts =
    mode === "best"
      ? buildPdfReportCharts(
          scopeSessions,
          metricsBySession as Map<string, MetricRowWithSide[]>,
          scopeHopTests,
          exportFrom,
          exportTo
        )
      : null;
  // Resolved once: the same target profile drives every Performance Summary row.
  const targetOverrides =
    mode === "best"
      ? (await fetchTargetOverridesForAthlete(supabase, athlete.target_profile_id ?? null)).targets
      : {};
  const snapshot: AthleteSnapshot | null =
    mode === "best" && dashboardMode === "rtp"
      ? computeAthleteSnapshot(
          scopeSessions,
          metricsBySession,
          scopeHopTests,
          visibility,
          criteria
        )
      : null;
  const performanceSummary: SummaryCategory[] | null =
    mode === "best"
      ? computePerformanceSummary(scopeSessions, metricsBySession, targetOverrides)
      : null;

  // Speed dials: the same ranking the dashboard shows (athlete_cohort_ranks,
  // comparison group = the athlete's saved setting, else their team). Optional:
  // a failure here must never block the export.
  let rankDials: PdfRankDial[] | null = null;
  if (mode === "best") {
    try {
      const [protocol, rankRes] = await Promise.all([
        resolveAthleteProtocol(supabase, athlete.id).catch(() => null),
        supabase.rpc("athlete_cohort_ranks", { p_athlete_id: athlete.id, p_comparison: null }),
      ]);
      const rows = (rankRes.data ?? []) as RankRow[];
      const byMetric = new Map(rows.map((r) => [r.metric, r] as const));
      const built: PdfRankDial[] = DIALS.filter((d) =>
        protocol ? protocolIncludes(protocol, d.testKey) : byMetric.get(d.metric)?.val != null
      ).map((d) => {
        const r = byMetric.get(d.metric);
        return {
          key: d.metric,
          label: d.label,
          unit: d.unit,
          decimals: d.decimals,
          value: r?.val != null ? Number(r.val) : null,
          rank: r?.rnk ?? null,
          cohortSize: r?.cohort_size ?? null,
        };
      });
      if (built.some((d) => d.value != null)) {
        rankDials = built;
      }
    } catch (e) {
      console.warn("PDF ranking dials skipped:", e);
    }
  }

  const dateComparisonData =
    mode === "date_comparison"
      ? computeDateComparisonData(
          scopeSessions,
          metricsBySession,
          scopeHopTests,
          dateAId,
          dateBId
        )
      : undefined;

  return pdf(
    <AthletePdfDocument
      athleteName={athleteName}
      athleteSport={athlete.primary_sport ?? null}
      athleteTeam={athlete.team ?? null}
      athleteHeightCm={athlete.height_cm ?? null}
      athleteWeightKg={athlete.weight_kg ?? null}
      rangeStart={exportFrom}
      rangeEnd={exportTo}
      mode={mode}
      compareDateALabel={compareDateALabel}
      compareDateBLabel={compareDateBLabel}
      includeNotes={includeNotes}
      showTargets={includeTargets}
      showAnthropometry={includeAnthropometry}
      summaryComment={summaryComment || null}
      sectionComments={sectionComments}
      dateComparisonData={dateComparisonData}
      pdfCharts={pdfCharts}
      snapshot={snapshot}
      rankDials={rankDials}
      performanceSummary={performanceSummary}
      visibility={visibility}
      brand={dashboardMode === "performance" ? "fit2perform" : "fit2play"}
    />
  ).toBlob();
}
