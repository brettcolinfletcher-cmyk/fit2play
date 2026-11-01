"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  athleteDisplayName,
  downloadBlob,
  generateAthletePdfBlob,
  inDateRange,
  logPdfReport,
  pdfFileName,
  todayPdfSuffix,
} from "@/lib/generateAthletePdf";
import { loadAthleteReportData } from "@/lib/loadAthleteReportData";
import { supabase } from "@/lib/supabaseClient";

type BulkAthlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  athletes: BulkAthlete[];
  scopeLabel: string;
};

type Result = {
  id: string;
  name: string;
  status: "ok" | "skipped" | "failed";
  detail?: string;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200";

const checkboxClass =
  "rounded border-slate-600 bg-slate-950 text-lime-500 focus:ring-lime-500/40";

/** Same PDF as the single-athlete export ("best in range" mode), one per athlete, zipped. */
export default function BulkPdfExportModal({ open, onClose, athletes, scopeLabel }: Props) {
  const [exportFrom, setExportFrom] = useState<string | null>(null);
  const [exportTo, setExportTo] = useState<string | null>(null);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeTargets, setIncludeTargets] = useState(false);
  // Off by default for batch exports (team reports usually leave height/weight out).
  const [includeAnthropometry, setIncludeAnthropometry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(
    null
  );
  const [results, setResults] = useState<Result[]>([]);
  const [finished, setFinished] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setExportFrom(null);
    setExportTo(null);
    setIncludeNotes(false);
    setIncludeTargets(false);
    setIncludeAnthropometry(false);
    setBusy(false);
    setProgress(null);
    setResults([]);
    setFinished(false);
    setFormError(null);
    stopRef.current = false;
  }, [open]);

  const onGenerate = useCallback(async () => {
    setFormError(null);
    setResults([]);
    setFinished(false);
    stopRef.current = false;
    if (athletes.length === 0) {
      setFormError("Select at least one athlete.");
      return;
    }

    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFormError("You must be signed in to export.");
        return;
      }

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const out: Result[] = [];
      let added = 0;

      for (let i = 0; i < athletes.length; i++) {
        if (stopRef.current) break;
        const a = athletes[i]!;
        const name = athleteDisplayName(a);
        setProgress({ done: i, total: athletes.length, name });
        // Let the progress text paint before the heavy render starts.
        await new Promise((r) => setTimeout(r, 0));

        try {
          const bundle = await loadAthleteReportData(a.id);
          const sessions = bundle.sessions.filter((s) =>
            inDateRange(s.session_date, exportFrom, exportTo)
          );
          if (sessions.length === 0) {
            out.push({ id: a.id, name, status: "skipped", detail: "No sessions in this date range" });
            continue;
          }
          const hopTests = bundle.hopTests.filter((h) =>
            inDateRange(h.session_date, exportFrom, exportTo)
          );

          const blob = await generateAthletePdfBlob({
            athlete: bundle.athlete,
            sessions,
            metricsBySession: bundle.metricsBySession,
            hopTests,
            sectionComments: bundle.sectionComments,
            rangeStart: exportFrom,
            rangeEnd: exportTo,
            visibility: bundle.visibility,
            criteria: bundle.criteria,
            mode: "best",
            includeNotes,
            includeTargets,
            includeAnthropometry,
            summaryComment: "",
          });

          // Two athletes can share a name: keep both files.
          const base = pdfFileName(name);
          let fileName = base;
          for (let n = 2; usedNames.has(fileName); n++) {
            fileName = base.replace(/\.pdf$/, `_${n}.pdf`);
          }
          usedNames.add(fileName);
          zip.file(fileName, blob);
          added += 1;

          await logPdfReport({
            athleteId: a.id,
            userId: user.id,
            rangeStart: exportFrom,
            rangeEnd: exportTo,
            mode: "best",
            includeNotes,
            summaryComment: "",
          });
          out.push({ id: a.id, name, status: "ok" });
        } catch (e) {
          out.push({
            id: a.id,
            name,
            status: "failed",
            detail: e instanceof Error ? e.message : "Could not generate PDF",
          });
        }
        setResults([...out]);
      }

      setProgress({ done: out.length, total: athletes.length, name: "Zipping" });
      if (added > 0) {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `Fit2Perform_reports_${todayPdfSuffix()}.zip`);
      }
      setResults(out);
      setFinished(true);
      if (added === 0) setFormError("No reports were generated.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Bulk export failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [athletes, exportFrom, exportTo, includeNotes, includeTargets, includeAnthropometry]);

  if (!open) return null;

  const okCount = results.filter((r) => r.status === "ok").length;
  const problems = results.filter((r) => r.status !== "ok");
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-pdf-export-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <h2 id="bulk-pdf-export-title" className="text-base font-semibold text-slate-100">
          Export reports
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {athletes.length} {athletes.length === 1 ? "athlete" : "athletes"} selected · {scopeLabel}.
          One PDF each (best in range), downloaded as a single zip.
        </p>

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
                  disabled={busy}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">To</label>
                <input
                  type="date"
                  value={exportTo ?? ""}
                  onChange={(e) => setExportTo(e.target.value || null)}
                  disabled={busy}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Leave blank for each athlete&apos;s full history.</p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              disabled={busy}
              className={checkboxClass}
            />
            Include clinical notes
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={includeTargets}
              onChange={(e) => setIncludeTargets(e.target.checked)}
              disabled={busy}
              className={checkboxClass}
            />
            Show targets in the performance summary
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={includeAnthropometry}
              onChange={(e) => setIncludeAnthropometry(e.target.checked)}
              disabled={busy}
              className={checkboxClass}
            />
            Show height and weight (anthropometry)
          </label>

          {busy && progress ? (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="truncate pr-3">
                  {progress.name === "Zipping"
                    ? "Zipping files…"
                    : `Building ${progress.done + 1} of ${progress.total}: ${progress.name}`}
                </span>
                <span className="tabular-nums text-slate-500">{pct}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full bg-lime-400 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}

          {finished ? (
            <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
              <p>
                {okCount} of {athletes.length} reports added to the zip.
              </p>
              {problems.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[11px]">
                  {problems.map((r) => (
                    <li key={r.id} className={r.status === "failed" ? "text-rose-300" : "text-amber-200"}>
                      {r.name}: {r.status === "failed" ? "failed" : "skipped"}
                      {r.detail ? ` (${r.detail})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {formError ? <p className="text-xs text-rose-400">{formError}</p> : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {busy ? (
            <button
              type="button"
              onClick={() => {
                stopRef.current = true;
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Stop and download what&apos;s done
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              {finished ? "Close" : "Cancel"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={busy || athletes.length === 0}
            className="rounded-lg border border-lime-500/50 bg-lime-500/15 px-4 py-2 text-xs font-medium text-lime-200 hover:bg-lime-500/25 disabled:opacity-50"
          >
            {busy ? "Working…" : finished ? "Run again" : "Generate & Download zip"}
          </button>
        </div>
      </div>
    </div>
  );
}
