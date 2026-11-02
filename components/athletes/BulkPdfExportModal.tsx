"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { staffAuthHeaders } from "@/lib/staffAuthHeaders";
import {
  DEFAULT_REPORT_BODY,
  DEFAULT_REPORT_SUBJECT,
  REPORT_TEMPLATES,
  REPORT_TESTS,
  fillSendPlaceholders,
  testsToLines,
  unresolvedPlaceholders,
} from "@/lib/email/reportEmail";

type Mode = "zip" | "email";

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

type EmailAttachment = { fileName: string; base64: string };

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
  const [mode, setMode] = useState<Mode>("zip");
  // Kept between openings so edits are not lost if the window is closed.
  const [templateKey, setTemplateKey] = useState(REPORT_TEMPLATES[0]!.key);
  const [subject, setSubject] = useState(DEFAULT_REPORT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_REPORT_BODY);
  const [squad, setSquad] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [testKeys, setTestKeys] = useState<string[]>([]);
  const [extra, setExtra] = useState<EmailAttachment | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
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
    setTestMsg(null);
    stopRef.current = false;
  }, [open]);

  // {squad}, {date} and {tests} are the same for every email in a send, so fill them here.
  const prepared = useMemo(() => {
    const values = { squad, date: sessionDate, tests: testsToLines(testKeys) };
    return { subject: fillSendPlaceholders(subject, values), body: fillSendPlaceholders(body, values) };
  }, [subject, body, squad, sessionDate, testKeys]);

  const emailProblem = useMemo((): string | null => {
    const unresolved = unresolvedPlaceholders(`${subject}\n${body}`).filter((p) => {
      if (p === "{squad}") return !squad.trim();
      if (p === "{date}") return !sessionDate.trim();
      if (p === "{tests}") return testKeys.length === 0;
      return true;
    });
    if (unresolved.includes("{squad}")) return "Enter the squad or event name.";
    if (unresolved.includes("{date}")) return "Enter the session date.";
    if (unresolved.includes("{tests}")) return "Tick at least one test under What we tested.";
    if (unresolved.length) return `Unknown placeholder in the message: ${unresolved.join(", ")}`;
    if (/\[[^\]]*\]/.test(prepared.body)) return "The message still has [square bracket] text to fill in.";
    if (/attached document/i.test(prepared.body) && !extra)
      return "The message mentions an attached document. Add the PDF below or remove that sentence.";
    return null;
  }, [subject, body, squad, sessionDate, testKeys, prepared, extra]);

  const sendEmail = useCallback(
    async (athleteId: string, report: EmailAttachment, test: boolean) => {
      const res = await fetch("/api/reports/email", {
        method: "POST",
        headers: await staffAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ athleteId, subject: prepared.subject, body: prepared.body, report, extra, test }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        sent?: boolean;
        skipped?: boolean;
        reason?: string;
        recipient?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Send failed (${res.status})`);
      return json;
    },
    [prepared, extra]
  );

  const onGenerate = useCallback(async () => {
    setFormError(null);
    setResults([]);
    setFinished(false);
    stopRef.current = false;
    if (athletes.length === 0) {
      setFormError("Select at least one athlete.");
      return;
    }

    if (mode === "email" && emailProblem) {
      setFormError(emailProblem);
      return;
    }
    if (
      mode === "email" &&
      !window.confirm(
        `Email ${athletes.length} report${athletes.length === 1 ? "" : "s"} to parents/athletes now? This cannot be undone.`
      )
    ) {
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

          if (mode === "email") {
            const sent = await sendEmail(
              a.id,
              { fileName: pdfFileName(name), base64: await blobToBase64(blob) },
              false
            );
            if (sent.skipped) {
              out.push({ id: a.id, name, status: "skipped", detail: sent.reason });
            } else {
              added += 1;
              out.push({ id: a.id, name, status: "ok", detail: sent.recipient });
            }
            setResults([...out]);
            continue;
          }

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

      if (mode === "zip") setProgress({ done: out.length, total: athletes.length, name: "Zipping" });
      if (mode === "zip" && added > 0) {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `Fit2Perform_reports_${todayPdfSuffix()}.zip`);
      }
      setResults(out);
      setFinished(true);
      if (added === 0) setFormError(mode === "email" ? "No emails were sent." : "No reports were generated.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Bulk export failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [athletes, exportFrom, exportTo, includeNotes, includeTargets, includeAnthropometry, mode, sendEmail, emailProblem]);

  /** Builds the first athlete's report that has data and sends it to the clinic inbox. */
  const onSendTest = useCallback(async () => {
    setFormError(null);
    setTestMsg(null);
    if (emailProblem) {
      setFormError(emailProblem);
      return;
    }
    setBusy(true);
    try {
      for (const a of athletes) {
        const name = athleteDisplayName(a);
        setProgress({ done: 0, total: 1, name: `Test: ${name}` });
        const bundle = await loadAthleteReportData(a.id);
        const sessions = bundle.sessions.filter((s) => inDateRange(s.session_date, exportFrom, exportTo));
        if (sessions.length === 0) continue;
        const blob = await generateAthletePdfBlob({
          athlete: bundle.athlete,
          sessions,
          metricsBySession: bundle.metricsBySession,
          hopTests: bundle.hopTests.filter((h) => inDateRange(h.session_date, exportFrom, exportTo)),
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
        const r = await sendEmail(a.id, { fileName: pdfFileName(name), base64: await blobToBase64(blob) }, true);
        setTestMsg(`Test sent to ${r.recipient ?? "info@f2p.au"} using ${name}'s report.`);
        return;
      }
      setFormError("None of the selected athletes have sessions in this date range.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Test send failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [athletes, exportFrom, exportTo, includeNotes, includeTargets, includeAnthropometry, sendEmail, emailProblem]);

  const onPickExtra = useCallback(async (file: File | null) => {
    setFormError(null);
    if (!file) {
      setExtra(null);
      return;
    }
    if (!/\.pdf$/i.test(file.name)) {
      setFormError("The extra attachment must be a PDF.");
      return;
    }
    if (file.size > 2_000_000) {
      setFormError("The extra attachment must be under 2 MB.");
      return;
    }
    setExtra({ fileName: file.name, base64: await blobToBase64(file) });
  }, []);

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
          {mode === "zip"
            ? "One PDF each (best in range), downloaded as a single zip."
            : "One PDF each (best in range), emailed from info@f2p.au. Under 18s go to their parent/guardian email only."}
        </p>

        <div className="mt-4 inline-flex rounded-lg border border-slate-700 p-0.5 text-xs">
          {(["zip", "email"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={busy}
              className={`rounded-md px-3 py-1.5 font-medium ${
                mode === m ? "bg-lime-500/20 text-lime-200" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m === "zip" ? "Download zip" : "Email"}
            </button>
          ))}
        </div>

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

          {mode === "email" ? (
            <div className="space-y-3 border-t border-slate-800 pt-4">
              <div>
                <label className="block text-xs text-slate-500">Template</label>
                <select
                  value={templateKey}
                  onChange={(e) => {
                    const t = REPORT_TEMPLATES.find((x) => x.key === e.target.value);
                    if (!t) return;
                    setTemplateKey(t.key);
                    setSubject(t.subject);
                    setBody(t.body);
                  }}
                  disabled={busy}
                  className={inputClass}
                >
                  {REPORT_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500">Squad or event {"{squad}"}</label>
                  <input
                    value={squad}
                    onChange={(e) => setSquad(e.target.value)}
                    placeholder="e.g. Perth Glory U15 Girls"
                    disabled={busy}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Session date {"{date}"}</label>
                  <input
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    placeholder="e.g. 14 November"
                    disabled={busy}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">What we tested {"{tests}"}</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {REPORT_TESTS.map((t) => (
                    <label key={t.key} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={testKeys.includes(t.key)}
                        onChange={(e) =>
                          setTestKeys((k) => (e.target.checked ? [...k, t.key] : k.filter((x) => x !== t.key)))
                        }
                        disabled={busy}
                        className={checkboxClass}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={busy}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={busy}
                  rows={12}
                  className={`${inputClass} font-mono text-[11px] leading-relaxed`}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {"{athlete}"} = first name. {"{greeting}"} = &quot;Hi [parent]&quot; or &quot;Dear parent/guardian of [athlete]&quot;.
                  {" {squad}, {date} and {tests}"} come from the fields above. Lines starting &quot;- &quot; become bullets.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      const t = REPORT_TEMPLATES.find((x) => x.key === templateKey) ?? REPORT_TEMPLATES[0]!;
                      setSubject(t.subject);
                      setBody(t.body);
                    }}
                    disabled={busy}
                    className="underline hover:text-slate-300"
                  >
                    Reset to template
                  </button>
                </p>
              </div>
              <div>
                <label className="block text-xs text-slate-500">Extra attachment for every email (PDF, optional)</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => void onPickExtra(e.target.files?.[0] ?? null)}
                  disabled={busy}
                  className="mt-1 block w-full text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200"
                />
                {extra ? <p className="mt-1 text-[11px] text-lime-300">Attaching {extra.fileName}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onSendTest()}
                  disabled={busy || athletes.length === 0}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  Send me a test first
                </button>
                {testMsg ? <span className="text-[11px] text-lime-300">{testMsg}</span> : null}
              </div>
              {emailProblem ? <p className="text-[11px] text-amber-300">{emailProblem}</p> : null}
            </div>
          ) : null}

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
                {okCount} of {athletes.length} {mode === "email" ? "reports emailed." : "reports added to the zip."}
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
              {mode === "email" ? "Stop sending" : "Stop and download what\u2019s done"}
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
            {busy
              ? "Working…"
              : mode === "email"
              ? `Send ${athletes.length} email${athletes.length === 1 ? "" : "s"}`
              : finished
              ? "Run again"
              : "Generate & Download zip"}
          </button>
        </div>
      </div>
    </div>
  );
}
