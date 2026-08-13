"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import AthletePdfDocument from "@/components/athletes/AthletePdfDocument";
import {
  computeBestInRangeData,
  computeDateComparisonData,
  formatChartAxisDate,
  sessionOptionLabel,
  sortedSessionOptions,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import {
  buildPdfReportCharts,
  buildPdfReportContext,
  type MetricRowWithSide,
  type PdfReportContext,
} from "@/lib/pdfReportChartData";
import {
  normalizePerformanceBandRow,
  type NormalizedPerformanceBand,
} from "@/lib/performanceBands";
import {
  computeAthleteSnapshot,
  type AthleteSnapshot,
} from "@/lib/athleteSnapshot";
import {
  computePerformanceSummary,
  type SummaryCategory,
} from "@/lib/performanceSummary";
import type { CriteriaResolver, ReportVisibility } from "@/lib/reportSections";
import { supabase } from "@/lib/supabaseClient";

type AthleteForPdf = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  /** Optional extended fields used by the new snapshot page. */
  primary_sport?: string | null;
  team?: string | null;
  date_of_birth?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  athlete: AthleteForPdf;
  sessions: ReportSessionRow[];
  metricsBySession: Map<string, ReportMetricRow[]>;
  hopTests: ReportHopTestRow[];
  sectionComments: Record<string, string | null>;
  rangeStart: string | null;
  rangeEnd: string | null;
  visibility: ReportVisibility;
  criteria: CriteriaResolver;
};

function inDateRange(dateIso: string | null, start: string | null, end: string | null): boolean {
  if (!dateIso) return true;
  const d = dateIso.slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function todayPdfSuffix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200";

export default function PdfExportModal({
  open,
  onClose,
  athlete,
  sessions,
  metricsBySession,
  hopTests,
  sectionComments,
  rangeStart,
  rangeEnd,
  visibility,
  criteria,
}: Props) {
  const [exportFrom, setExportFrom] = useState<string | null>(null);
  const [exportTo, setExportTo] = useState<string | null>(null);
  const [mode, setMode] = useState<"best" | "date_comparison">("best");
  const [dateAId, setDateAId] = useState<string | null>(null);
  const [dateBId, setDateBId] = useState<string | null>(null);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [summaryComment, setSummaryComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bands, setBands] = useState<NormalizedPerformanceBand[]>([]);

  // Fetch performance bands once the modal opens; cached in state for the
  // lifetime of the modal. Empty array on error — the resolver falls back to
  // its built-in defaults (currently only peakSpeed has one).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("performance_bands")
        .select("*");
      if (cancelled) return;
      if (error || !data) {
        setBands([]);
        return;
      }
      const norm: NormalizedPerformanceBand[] = [];
      for (const row of data) {
        const r = normalizePerformanceBandRow(row as Record<string, unknown>);
        if (r) norm.push(r);
      }
      setBands(norm);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setExportFrom(rangeStart);
    setExportTo(rangeEnd);
    setFormError(null);
    setMode("best");
    setIncludeNotes(false);
    setSummaryComment("");
  }, [open, rangeStart, rangeEnd]);

  const scopeSessions = useMemo(
    () => sessions.filter((s) => inDateRange(s.session_date, exportFrom, exportTo)),
    [sessions, exportFrom, exportTo]
  );

  const scopeHopTests = useMemo(
    () => hopTests.filter((h) => inDateRange(h.session_date, exportFrom, exportTo)),
    [hopTests, exportFrom, exportTo]
  );

  const sessionOptions = useMemo(() => sortedSessionOptions(scopeSessions), [scopeSessions]);

  useEffect(() => {
    if (!open) return;
    if (sessionOptions.length >= 1) {
      setDateAId(sessionOptions[0]!.id);
      setDateBId(sessionOptions[1]?.id ?? sessionOptions[0]!.id);
    } else {
      setDateAId(null);
      setDateBId(null);
    }
  }, [open, sessionOptions]);

  const athleteName = `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim() || "Athlete";

  const sessA = useMemo(
    () => (dateAId ? scopeSessions.find((s) => s.id === dateAId) ?? null : null),
    [dateAId, scopeSessions]
  );
  const sessB = useMemo(
    () => (dateBId ? scopeSessions.find((s) => s.id === dateBId) ?? null : null),
    [dateBId, scopeSessions]
  );

  const compareDateALabel = sessA?.session_date
    ? formatChartAxisDate(sessA.session_date)
    : "Date A";
  const compareDateBLabel = sessB?.session_date
    ? formatChartAxisDate(sessB.session_date)
    : "Date B";

  const onGenerate = useCallback(async () => {
    setFormError(null);
    if (scopeSessions.length === 0) {
      setFormError("No sessions in the selected export date range.");
      return;
    }
    if (mode === "date_comparison") {
      if (!dateAId || !dateBId) {
        setFormError("Choose two sessions for date comparison.");
        return;
      }
    }

    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFormError("You must be signed in to export.");
        setBusy(false);
        return;
      }

      const bestInRange = computeBestInRangeData(
        scopeSessions,
        metricsBySession,
        scopeHopTests
      );
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
      const pdfContext: PdfReportContext | null =
        mode === "best"
          ? buildPdfReportContext(
              scopeSessions,
              metricsBySession as Map<string, MetricRowWithSide[]>,
              scopeHopTests,
              bands
            )
          : null;
      const snapshot: AthleteSnapshot | null =
        mode === "best"
          ? computeAthleteSnapshot(
              scopeSessions,
              metricsBySession,
              scopeHopTests,
              visibility,
              criteria
            )
          : null;
      const performanceSummary: SummaryCategory[] | null =
        mode === "best" ? computePerformanceSummary(scopeSessions, metricsBySession) : null;
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

      const insertPayload = {
        athlete_id: athlete.id,
        created_by: user.id,
        date_range_start: exportFrom || null,
        date_range_end: exportTo || null,
        mode,
        specific_dates:
          mode === "date_comparison" && dateAId && dateBId ? [dateAId, dateBId] : [],
        include_notes: includeNotes,
        summary_comment: summaryComment.trim() || null,
      };

      const { error: insErr } = await supabase.from("pdf_reports").insert(insertPayload);
      if (insErr) {
        console.warn("pdf_reports insert skipped:", insErr.message);
      }

      const blob = await pdf(
        <AthletePdfDocument
          athleteName={athleteName}
          athleteSport={athlete.primary_sport ?? null}
          athleteTeam={athlete.team ?? null}
          athleteDob={athlete.date_of_birth ?? null}
          rangeStart={exportFrom}
          rangeEnd={exportTo}
          mode={mode}
          compareDateALabel={compareDateALabel}
          compareDateBLabel={compareDateBLabel}
          includeNotes={includeNotes}
          summaryComment={summaryComment.trim() || null}
          sectionComments={sectionComments}
          bestInRange={bestInRange}
          dateComparisonData={dateComparisonData}
          pdfCharts={pdfCharts}
          pdfContext={pdfContext}
          snapshot={snapshot}
          performanceSummary={performanceSummary}
          visibility={visibility}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = athleteName.replace(/\s+/g, "_");
      a.download = `${safeName}_report_${todayPdfSuffix()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not generate PDF.");
    } finally {
      setBusy(false);
    }
  }, [
    athlete.id,
    athlete.primary_sport,
    athlete.team,
    athlete.date_of_birth,
    athleteName,
    bands,
    compareDateALabel,
    compareDateBLabel,
    dateAId,
    dateBId,
    exportFrom,
    exportTo,
    includeNotes,
    metricsBySession,
    mode,
    onClose,
    scopeHopTests,
    scopeSessions,
    sectionComments,
    summaryComment,
    visibility,
    criteria,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-export-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <h2 id="pdf-export-title" className="text-base font-semibold text-slate-100">
          Export PDF Report
        </h2>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-400">Date range</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-500">From</label>
                <input
                  type="date"
                  value={exportFrom ?? ""}
                  onChange={(e) => setExportFrom(e.target.value || null)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">To</label>
                <input
                  type="date"
                  value={exportTo ?? ""}
                  onChange={(e) => setExportTo(e.target.value || null)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-400">Mode</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("best")}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "best"
                    ? "border-lime-400 bg-lime-400/15 text-lime-300"
                    : "border-slate-700 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                }`}
              >
                Best in range
              </button>
              <button
                type="button"
                onClick={() => setMode("date_comparison")}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "date_comparison"
                    ? "border-lime-400 bg-lime-400/15 text-lime-300"
                    : "border-slate-700 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                }`}
              >
                Date comparison
              </button>
            </div>
          </div>

          {mode === "date_comparison" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-400">Date A</label>
                <select
                  value={dateAId ?? ""}
                  onChange={(e) => setDateAId(e.target.value || null)}
                  className={inputClass}
                >
                  {sessionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sessionOptionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Date B</label>
                <select
                  value={dateBId ?? ""}
                  onChange={(e) => setDateBId(e.target.value || null)}
                  className={inputClass}
                >
                  {sessionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sessionOptionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              className="rounded border-slate-600 bg-slate-950 text-lime-500 focus:ring-lime-500/40"
            />
            Include clinical notes
          </label>

          <div>
            <label className="block text-xs font-medium text-slate-400">Summary comment</label>
            <textarea
              value={summaryComment}
              onChange={(e) => setSummaryComment(e.target.value)}
              rows={4}
              placeholder="Overall clinical summary for this report period…"
              className={`${inputClass} mt-1 resize-y`}
            />
          </div>

          {formError ? <p className="text-xs text-rose-400">{formError}</p> : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={busy}
            className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50"
          >
            {busy ? "Working…" : "Generate & Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
