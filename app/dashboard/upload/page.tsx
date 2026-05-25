"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import DashboardNav from "@/components/DashboardNav";
import { formatDisplayDateTime } from "@/lib/dateDisplay";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { normalizeForceplateMetrics } from "@/lib/uploadForceplateNormalize";

const META_SKIP = new Set(
  [
    "testid",
    "date",
    "time",
    "name",
    "segment",
    "position",
    "type",
    "excluded",
    "tags",
  ].map((c) => c.toLowerCase())
);

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function mapHawkinsType(type: string): string {
  const t = type.trim().toLowerCase();
  if (t.includes("cmj") || t.includes("countermovement")) return "force_plate_cmj";
  if (t.includes("drop") || t.includes("dj")) return "force_plate_dj";
  if (t.includes("imtp") || t.includes("mid-thigh")) return "force_plate_imtp";
  if (t.includes("calf")) return "force_plate_calf";
  return "force_plate";
}

function hawkinsRowToRaw(row: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = normHeader(k).replace(/\s/g, "");
    if (META_SKIP.has(nk)) continue;
    const t = v?.trim() ?? "";
    if (t === "" || t.toLowerCase() === "n/a") continue;
    if (k.trim() === "Impact Peak") {
      const y = t.toLowerCase();
      if (y === "yes") out[k] = 1;
      else if (y === "no") out[k] = 0;
      continue;
    }
    out[k] = v;
  }
  return out;
}

function getCol(
  row: Record<string, string>,
  aliases: string[]
): string | undefined {
  for (const [k, v] of Object.entries(row)) {
    const nk = k.trim().toLowerCase().replace(/[\s_-]/g, "");
    for (const a of aliases) {
      if (nk === a) return v?.trim();
    }
  }
  return undefined;
}

type HawkinsPreview = {
  testId: string;
  date: string;
  time: string;
  athleteName: string;
  testType: string;
  tags: string;
  metricCount: number;
  metrics: Record<string, number>;
};

type MotionPreview = {
  sessionId: string;
  date: string;
  athleteName: string;
  exerciseName: string;
  sets: Array<Record<string, number>>;
  metricCount: number;
};

function formatPreviewDate(iso: string) {
  const s = formatDisplayDateTime(iso);
  return s === "—" ? iso : s;
}

export default function UploadPage() {
  const staffOk = useRequireDashboardStaff();
  const hawkinsInputRef = useRef<HTMLInputElement>(null);
  const motionInputRef = useRef<HTMLInputElement>(null);

  const [hawkinsPreview, setHawkinsPreview] = useState<HawkinsPreview | null>(
    null
  );
  const [motionPreview, setMotionPreview] = useState<MotionPreview | null>(
    null
  );
  const [hawkinsWarn, setHawkinsWarn] = useState<string | null>(null);
  const [motionWarn, setMotionWarn] = useState<string | null>(null);
  const [hawkinsOk, setHawkinsOk] = useState<string | null>(null);
  const [motionOk, setMotionOk] = useState<string | null>(null);
  const [hawkinsBusy, setHawkinsBusy] = useState(false);
  const [motionBusy, setMotionBusy] = useState(false);

  const [dupDialog, setDupDialog] = useState<{
    kind: "hawkins" | "1080";
    session: { id: string; session_date: string; test_type: string };
    payload: Record<string, unknown>;
  } | null>(null);

  const syncHeaders = {
    "Content-Type": "application/json",
    "x-sync-secret": process.env.NEXT_PUBLIC_SYNC_SECRET ?? "",
  };

  const parseHawkinsFile = useCallback((file: File) => {
    setHawkinsWarn(null);
    setHawkinsOk(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data.filter((r) =>
          Object.values(r).some((v) => String(v ?? "").trim() !== "")
        );
        if (rows.length === 0) {
          setHawkinsPreview(null);
          setHawkinsWarn("CSV has no data rows.");
          return;
        }
        const row = rows[0];
        const testId =
          getCol(row, ["testid"]) ?? row.TestId ?? row["Test ID"] ?? "";
        const date = getCol(row, ["date"]) ?? "";
        const time = getCol(row, ["time"]) ?? "";
        const athleteName =
          getCol(row, ["name"]) ?? row.Name ?? "";
        const typeRaw =
          getCol(row, ["type"]) ?? row.Type ?? "force_plate";
        const tags = getCol(row, ["tags"]) ?? "";

        const raw = hawkinsRowToRaw(row as Record<string, string>);
        const normalized = normalizeForceplateMetrics(raw);
        const metrics: Record<string, number> = {};
        for (const [k, v] of Object.entries(normalized)) {
          if (v != null && typeof v === "number" && !Number.isNaN(v)) {
            metrics[k] = v;
          }
        }

        setHawkinsPreview({
          testId: String(testId).trim(),
          date: String(date).trim(),
          time: String(time).trim(),
          athleteName: String(athleteName).trim(),
          testType: mapHawkinsType(String(typeRaw)),
          tags: String(tags).trim(),
          metricCount: Object.keys(metrics).length,
          metrics,
        });
      },
      error: (err) => {
        setHawkinsPreview(null);
        setHawkinsWarn(err.message);
      },
    });
  }, []);

  const parse1080File = useCallback((file: File) => {
    setMotionWarn(null);
    setMotionOk(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data.filter((r) =>
          Object.values(r).some((v) => String(v ?? "").trim() !== "")
        );
        if (rows.length === 0) {
          setMotionPreview(null);
          setMotionWarn("CSV has no data rows.");
          return;
        }
        const metaAliases = new Set([
          "sessionid",
          "session_id",
          "date",
          "name",
          "athletename",
          "athlete",
          "exercise",
          "exercisename",
          "exercise_name",
        ]);

        const first = rows[0];
        const sessionId =
          getCol(first, ["sessionid", "session_id"]) ?? "";
        const date = getCol(first, ["date"]) ?? "";
        const athleteName =
          getCol(first, ["name", "athletename", "athlete"]) ?? "";
        const exerciseName =
          getCol(first, ["exercise", "exercisename", "exercise_name"]) ?? "";

        const metaKeys = new Set<string>();
        for (const k of Object.keys(first)) {
          const nk = k.trim().toLowerCase().replace(/[\s_-]/g, "");
          if (metaAliases.has(nk)) metaKeys.add(k);
        }

        const sets: Array<Record<string, number>> = [];
        for (const row of rows) {
          const setObj: Record<string, number> = {};
          for (const [k, v] of Object.entries(row)) {
            if (metaKeys.has(k)) continue;
            const t = String(v ?? "").trim();
            if (t === "" || t.toLowerCase() === "n/a") continue;
            const n = Number(t);
            if (!Number.isNaN(n)) setObj[k.trim()] = n;
          }
          if (Object.keys(setObj).length > 0) sets.push(setObj);
        }

        let mc = 0;
        for (const s of sets) mc += Object.keys(s).length;

        setMotionPreview({
          sessionId: String(sessionId).trim(),
          date: String(date).trim(),
          athleteName: String(athleteName).trim(),
          exerciseName: String(exerciseName).trim(),
          sets,
          metricCount: mc,
        });
      },
      error: (err) => {
        setMotionPreview(null);
        setMotionWarn(err.message);
      },
    });
  }, []);

  async function postHawkins(
    payload: Record<string, unknown>,
    force?: boolean
  ) {
    const res = await fetch("/api/upload/hawkins", {
      method: "POST",
      credentials: "include",
      headers: syncHeaders,
      body: JSON.stringify(force ? { ...payload, force: true } : payload),
    });
    return res.json() as Promise<Record<string, unknown>>;
  }

  async function post1080(payload: Record<string, unknown>, force?: boolean) {
    const res = await fetch("/api/upload/1080", {
      method: "POST",
      credentials: "include",
      headers: syncHeaders,
      body: JSON.stringify(force ? { ...payload, force: true } : payload),
    });
    return res.json() as Promise<Record<string, unknown>>;
  }

  async function submitHawkins(force?: boolean) {
    if (!hawkinsPreview) return;
    setHawkinsBusy(true);
    setHawkinsWarn(null);
    setHawkinsOk(null);
    try {
      const payload = {
        testId: hawkinsPreview.testId,
        date: hawkinsPreview.date,
        time: hawkinsPreview.time,
        athleteName: hawkinsPreview.athleteName,
        testType: hawkinsPreview.testType,
        tags: hawkinsPreview.tags,
        metrics: hawkinsPreview.metrics,
      };
      const json = await postHawkins(payload, force);
      if (json.status === "athlete_not_found") {
        setHawkinsWarn(
          `No athlete found matching "${String(json.name)}". Create them first or check spelling.`
        );
        return;
      }
      if (json.status === "duplicate" && json.session && !force) {
        setDupDialog({
          kind: "hawkins",
          session: json.session as {
            id: string;
            session_date: string;
            test_type: string;
          },
          payload,
        });
        setHawkinsBusy(false);
        return;
      }
      if (json.error) {
        setHawkinsWarn(String(json.error));
        return;
      }
      if (json.status === "ok") {
        setHawkinsOk(`Uploaded. Session ${String(json.sessionId)}`);
        setHawkinsPreview(null);
      }
    } catch (e) {
      setHawkinsWarn(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setHawkinsBusy(false);
    }
  }

  async function submit1080(force?: boolean) {
    if (!motionPreview) return;
    setMotionBusy(true);
    setMotionWarn(null);
    setMotionOk(null);
    try {
      const payload = {
        sessionId: motionPreview.sessionId,
        date: motionPreview.date,
        athleteName: motionPreview.athleteName,
        exerciseName: motionPreview.exerciseName,
        sets: motionPreview.sets,
      };
      const json = await post1080(payload, force);
      if (json.status === "athlete_not_found") {
        setMotionWarn(
          `No athlete found matching "${String(json.name)}". Create them first or check spelling.`
        );
        return;
      }
      if (json.status === "duplicate" && json.session && !force) {
        setDupDialog({
          kind: "1080",
          session: json.session as {
            id: string;
            session_date: string;
            test_type: string;
          },
          payload,
        });
        setMotionBusy(false);
        return;
      }
      if (json.error) {
        setMotionWarn(String(json.error));
        return;
      }
      if (json.status === "ok") {
        setMotionOk(`Uploaded. Session ${String(json.sessionId)}`);
        setMotionPreview(null);
      }
    } catch (e) {
      setMotionWarn(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setMotionBusy(false);
    }
  }

  async function confirmOverwrite() {
    if (!dupDialog) return;
    const { kind, payload } = dupDialog;
    setDupDialog(null);
    if (kind === "hawkins") {
      setHawkinsBusy(true);
      setHawkinsWarn(null);
      setHawkinsOk(null);
      try {
        const json = await postHawkins(payload, true);
        if (json.error) {
          setHawkinsWarn(String(json.error));
          return;
        }
        if (json.status === "ok") {
          setHawkinsOk(`Uploaded. Session ${String(json.sessionId)}`);
          setHawkinsPreview(null);
        }
      } catch (e) {
        setHawkinsWarn(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setHawkinsBusy(false);
      }
    } else {
      setMotionBusy(true);
      setMotionWarn(null);
      setMotionOk(null);
      try {
        const json = await post1080(payload, true);
        if (json.error) {
          setMotionWarn(String(json.error));
          return;
        }
        if (json.status === "ok") {
          setMotionOk(`Uploaded. Session ${String(json.sessionId)}`);
          setMotionPreview(null);
        }
      } catch (e) {
        setMotionWarn(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setMotionBusy(false);
      }
    }
  }

  const dropCls =
    "flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/50 px-4 py-8 text-center transition hover:border-lime-400/40 hover:bg-slate-900";

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-24">
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">
          Add data
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Import CSV exports or enter test data manually.
        </p>

        {/* Manual entry shortcut */}
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <h2 className="text-sm font-medium text-lime-300">Manual entry</h2>
          <p className="mt-1 text-xs text-slate-500">
            Enter dynamometry, hop test, or force plate results by hand.
          </p>
          <Link
            href="/dashboard/add-test"
            className="mt-4 inline-block rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-lime-400/50 hover:text-lime-300"
          >
            Open manual entry →
          </Link>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* Hawkins */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 shadow-xl shadow-lime-400/10">
            <h2 className="text-sm font-medium text-lime-300">Hawkins</h2>
            <p className="mt-1 text-xs text-slate-500">
              Force plate CSV — one test per file (first data row).
            </p>
            <input
              ref={hawkinsInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void parseHawkinsFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className={dropCls + " mt-4 w-full"}
              onClick={() => hawkinsInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void parseHawkinsFile(f);
              }}
            >
              <span className="text-sm text-slate-300">
                Drop CSV here or click to browse
              </span>
              <span className="mt-2 text-xs text-slate-500">
                Papa Parse · metadata columns skipped
              </span>
            </button>

            {hawkinsPreview ? (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-4 text-xs">
                <p className="font-medium text-slate-200">Preview</p>
                <ul className="mt-2 space-y-1 text-slate-400">
                  <li>
                    <span className="text-slate-500">Athlete:</span>{" "}
                    {hawkinsPreview.athleteName || "—"}
                  </li>
                  <li>
                    <span className="text-slate-500">Test type:</span>{" "}
                    {hawkinsPreview.testType}
                  </li>
                  <li>
                    <span className="text-slate-500">Date / time:</span>{" "}
                    {hawkinsPreview.date} {hawkinsPreview.time}
                  </li>
                  <li>
                    <span className="text-slate-500">Metrics:</span>{" "}
                    {hawkinsPreview.metricCount}
                  </li>
                </ul>
                <button
                  type="button"
                  disabled={hawkinsBusy || !hawkinsPreview.testId}
                  className="mt-4 w-full rounded-lg border border-lime-400/40 bg-lime-400/10 py-2 text-sm text-lime-300 hover:bg-lime-400/20 disabled:opacity-40"
                  onClick={() => void submitHawkins()}
                >
                  {hawkinsBusy ? "Uploading…" : "Submit upload"}
                </button>
              </div>
            ) : null}

            {hawkinsWarn ? (
              <p className="mt-3 text-xs text-amber-400">{hawkinsWarn}</p>
            ) : null}
            {hawkinsOk ? (
              <p className="mt-3 text-xs text-lime-400">{hawkinsOk}</p>
            ) : null}
          </div>

          {/* 1080 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 shadow-xl shadow-lime-400/10">
            <h2 className="text-sm font-medium text-lime-300">1080 Motion</h2>
            <p className="mt-1 text-xs text-slate-500">
              Session rows — each row is one set; metric columns are numeric.
            </p>
            <input
              ref={motionInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void parse1080File(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className={dropCls + " mt-4 w-full"}
              onClick={() => motionInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void parse1080File(f);
              }}
            >
              <span className="text-sm text-slate-300">
                Drop CSV here or click to browse
              </span>
              <span className="mt-2 text-xs text-slate-500">
                Session ID, date, athlete, exercise + metrics per row
              </span>
            </button>

            {motionPreview ? (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-4 text-xs">
                <p className="font-medium text-slate-200">Preview</p>
                <ul className="mt-2 space-y-1 text-slate-400">
                  <li>
                    <span className="text-slate-500">Athlete:</span>{" "}
                    {motionPreview.athleteName || "—"}
                  </li>
                  <li>
                    <span className="text-slate-500">Exercise:</span>{" "}
                    {motionPreview.exerciseName || "—"}
                  </li>
                  <li>
                    <span className="text-slate-500">Date:</span>{" "}
                    {motionPreview.date}
                  </li>
                  <li>
                    <span className="text-slate-500">Sets / metrics:</span>{" "}
                    {motionPreview.sets.length} sets, {motionPreview.metricCount}{" "}
                    values
                  </li>
                </ul>
                <button
                  type="button"
                  disabled={
                    motionBusy ||
                    !motionPreview.sessionId ||
                    motionPreview.sets.length === 0
                  }
                  className="mt-4 w-full rounded-lg border border-lime-400/40 bg-lime-400/10 py-2 text-sm text-lime-300 hover:bg-lime-400/20 disabled:opacity-40"
                  onClick={() => void submit1080()}
                >
                  {motionBusy ? "Uploading…" : "Submit upload"}
                </button>
              </div>
            ) : null}

            {motionWarn ? (
              <p className="mt-3 text-xs text-amber-400">{motionWarn}</p>
            ) : null}
            {motionOk ? (
              <p className="mt-3 text-xs text-lime-400">{motionOk}</p>
            ) : null}
          </div>
        </div>
      </section>

      {dupDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
            <p className="text-sm text-slate-200">
              This test already exists (uploaded{" "}
              {formatPreviewDate(dupDialog.session.session_date)}). Overwrite?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                onClick={() => setDupDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 hover:bg-amber-500/20"
                onClick={() => void confirmOverwrite()}
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
