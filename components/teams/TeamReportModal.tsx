"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadBlob } from "@/lib/generateAthletePdf";
import { generateTeamPdfBlob, loadTeamPdfData, teamPdfFileName, type TeamPdfData } from "@/lib/generateTeamPdf";
import { buildTeamReport, type ColourMode } from "@/lib/teamReport";
import { perthToday } from "@/lib/retestDue";

export default function TeamReportModal({
  teamId,
  teamName,
  onClose,
}: {
  teamId: string;
  teamName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TeamPdfData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [colourMode, setColourMode] = useState<ColourMode>("bands");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTeamPdfData(teamId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        const today = perthToday();
        setFrom(d.round?.from ?? today);
        setTo(d.round?.to ?? today);
        // Bands are adult norms, so only default to them for adult teams.
        // Juniors and teams with no level set get squad thirds.
        setColourMode(d.level && d.level !== "junior" ? "bands" : "squad");
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load team data");
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const preview = useMemo(() => {
    if (!data || !from || !to || from > to) return null;
    return buildTeamReport({
      teamName: data.teamName,
      intervalWeeks: data.intervalWeeks,
      athletes: data.athletes,
      results: data.results,
      lsi: data.lsi,
      testDates: data.testDates,
      from,
      to,
      today: perthToday(),
      protocolTests: data.protocolTests,
      colourMode,
      bands: data.bands,
    });
  }, [data, from, to, colourMode]);

  async function generate() {
    if (!data || !from || !to) return;
    if (from > to) {
      setError("The start date is after the end date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await generateTeamPdfBlob(data, { from, to, colourMode, comment });
      downloadBlob(blob, teamPdfFileName(data.teamName));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-lime-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-report-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <h2 id="team-report-title" className="text-lg font-semibold text-slate-100">
          Team report
        </h2>
        <p className="mt-1 text-sm text-slate-400">{teamName}</p>

        {loadError ? (
          <p className="mt-4 text-sm text-rose-400">{loadError}</p>
        ) : !data ? (
          <p className="mt-4 text-sm text-slate-500">Loading squad results…</p>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Testing round</p>
              <div className="mt-1 grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">
                  From
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
                </label>
                <label className="text-xs text-slate-400">
                  To
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
                </label>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Defaults to the 4 weeks up to the squad&apos;s latest test. Flags and coverage only count tests in
                this window.
              </p>
            </div>

            <label className="block text-xs text-slate-400">
              Colour the squad table by
              <select
                value={colourMode}
                onChange={(e) => setColourMode(e.target.value as ColourMode)}
                className={input}
              >
                <option value="bands">Performance bands (Elite / Good / Fair / Poor)</option>
                <option value="squad">Squad thirds (top / middle / bottom)</option>
              </select>
              <span className="mt-1 block text-slate-500">
                Bands are adult norms and only exist for max speed, acceleration and CMJ. Squad thirds suits juniors.
              </span>
            </label>

            <label className="block text-xs text-slate-400">
              Summary for coaches (optional)
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className={input}
                placeholder="Key messages from this testing round"
              />
            </label>

            {preview ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
                <p>
                  {preview.coverage.tested.length} of {preview.rows.length} athletes tested ·{" "}
                  {preview.metrics.length} tests · {preview.flags.length} flag
                  {preview.flags.length === 1 ? "" : "s"}
                </p>
                {preview.coverage.missed.length > 0 ? (
                  <p className="mt-1 text-slate-500">Missed: {preview.coverage.missed.join(", ")}</p>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-200">
            Close
          </button>
          <button
            type="button"
            disabled={!data || busy}
            onClick={() => void generate()}
            className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-300 disabled:opacity-50"
          >
            {busy ? "Building PDF…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
