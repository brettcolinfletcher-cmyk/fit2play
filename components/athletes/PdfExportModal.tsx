"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  sessionOptionLabel,
  sortedSessionOptions,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import {
  athleteDisplayName,
  downloadBlob,
  generateAthletePdfBlob,
  inDateRange,
  logPdfReport,
  pdfFileName,
  type AthleteForPdf,
} from "@/lib/generateAthletePdf";
import type { CriteriaResolver, ReportVisibility } from "@/lib/reportSections";
import { supabase } from "@/lib/supabaseClient";

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
  const [includeTargets, setIncludeTargets] = useState(false);
  const [includeAnthropometry, setIncludeAnthropometry] = useState(true);
  const [summaryComment, setSummaryComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setExportFrom(rangeStart);
    setExportTo(rangeEnd);
    setFormError(null);
    setMode("best");
    setIncludeNotes(false);
    setIncludeTargets(false);
    setIncludeAnthropometry(true);
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

  const athleteName = athleteDisplayName(athlete);

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

      const trimmedComment = summaryComment.trim();
      const blob = await generateAthletePdfBlob({
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
        dateAId,
        dateBId,
        includeNotes,
        includeTargets,
        includeAnthropometry,
        summaryComment: trimmedComment,
      });

      // Logged after a successful render so failed exports leave no record.
      await logPdfReport({
        athleteId: athlete.id,
        userId: user.id,
        rangeStart: exportFrom,
        rangeEnd: exportTo,
        mode,
        dateAId,
        dateBId,
        includeNotes,
        summaryComment: trimmedComment,
      });

      downloadBlob(blob, pdfFileName(athleteName));
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not generate PDF.");
    } finally {
      setBusy(false);
    }
  }, [
    athlete,
    athleteName,
    criteria,
    dateAId,
    dateBId,
    exportFrom,
    exportTo,
    includeAnthropometry,
    includeNotes,
    includeTargets,
    metricsBySession,
    mode,
    onClose,
    scopeHopTests,
    scopeSessions,
    sectionComments,
    summaryComment,
    visibility,
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

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={includeTargets}
              onChange={(e) => setIncludeTargets(e.target.checked)}
              className="rounded border-slate-600 bg-slate-950 text-lime-500 focus:ring-lime-500/40"
            />
            Show targets in the performance summary
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={includeAnthropometry}
              onChange={(e) => setIncludeAnthropometry(e.target.checked)}
              className="rounded border-slate-600 bg-slate-950 text-lime-500 focus:ring-lime-500/40"
            />
            Show height and weight (anthropometry)
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
