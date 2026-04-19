"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import SectionComment from "./SectionComment";

export type HopTestTableRow = {
  sessionDate: string;
  dateLabel: string;
  leftCm: number | null;
  rightCm: number | null;
  lsi: number | null;
};

export type HopTestTypeBlock = {
  testType: string;
  displayName: string;
  rows: HopTestTableRow[];
  trendPoints: { label: string; t: number; lsi: number }[];
};

const TEST_OPTIONS = [
  { value: "slhd", label: "Single Leg Hop (SLHD)" },
  { value: "thd", label: "Triple Hop (THD)" },
  { value: "thcod", label: "Triple Hop Crossover (THCOD)" },
  { value: "medial_hop", label: "Medial Hop" },
  { value: "lateral_hop", label: "Lateral Hop" },
] as const;

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(30 41 59)",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

function todayDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseTrialCm(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function bestFromTrials(t1: string, t2: string, t3: string): number | null {
  const vals = [parseTrialCm(t1), parseTrialCm(t2), parseTrialCm(t3)].filter(
    (v): v is number => v != null
  );
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

function computeLsi(leftBest: number | null, rightBest: number | null): number | null {
  if (leftBest == null || rightBest == null) return null;
  const lo = Math.min(leftBest, rightBest);
  const hi = Math.max(leftBest, rightBest);
  if (hi <= 0) return null;
  return Math.round((lo / hi) * 100);
}

function lsiColorClass(lsi: number | null): string {
  if (lsi == null) return "text-slate-500";
  if (lsi >= 90) return "text-lime-400";
  if (lsi >= 80) return "text-amber-400";
  return "text-rose-400";
}

type Props = {
  athleteId: string;
  blocks: HopTestTypeBlock[];
  sectionComment: string | null;
  onHopTestSaved: () => void;
};

export default function HopTestsSection({
  athleteId,
  blocks,
  sectionComment,
  onHopTestSaved,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [sessionDate, setSessionDate] = useState(todayDateLocal);
  const [testType, setTestType] = useState("slhd");
  const [leftTrials, setLeftTrials] = useState<[string, string, string]>(["", "", ""]);
  const [rightTrials, setRightTrials] = useState<[string, string, string]>(["", "", ""]);
  const [hopNotes, setHopNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const leftBest = bestFromTrials(leftTrials[0], leftTrials[1], leftTrials[2]);
  const rightBest = bestFromTrials(rightTrials[0], rightTrials[1], rightTrials[2]);
  const lsi = computeLsi(leftBest, rightBest);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const rows = [
        {
          athlete_id: athleteId,
          session_id: null,
          session_date: sessionDate,
          test_type: testType,
          side: "left",
          trial_1_cm: parseTrialCm(leftTrials[0]),
          trial_2_cm: parseTrialCm(leftTrials[1]),
          trial_3_cm: parseTrialCm(leftTrials[2]),
          clinician_notes: hopNotes.trim() || null,
          created_by: user?.id ?? null,
        },
        {
          athlete_id: athleteId,
          session_id: null,
          session_date: sessionDate,
          test_type: testType,
          side: "right",
          trial_1_cm: parseTrialCm(rightTrials[0]),
          trial_2_cm: parseTrialCm(rightTrials[1]),
          trial_3_cm: parseTrialCm(rightTrials[2]),
          clinician_notes: hopNotes.trim() || null,
          created_by: user?.id ?? null,
        },
      ];
      const { error } = await supabase.from("hop_tests").upsert(rows, {
        onConflict: "athlete_id,session_date,test_type,side",
      });
      if (error) {
        setSaveMsg(error.message);
      } else {
        setSaveMsg("Saved.");
        setLeftTrials(["", "", ""]);
        setRightTrials(["", "", ""]);
        setHopNotes("");
        setFormOpen(false);
        onHopTestSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="hop_tests" className="scroll-mt-28 mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lime-300">
          Hop Tests
        </h2>
        <button
          type="button"
          onClick={() => {
            setFormOpen((v) => !v);
            setSaveMsg(null);
          }}
          className="shrink-0 rounded-full border border-lime-400/40 px-3 py-1 text-xs font-medium text-lime-300 transition-colors hover:bg-lime-400/10"
        >
          {formOpen ? "Cancel" : "+ Add test"}
        </button>
      </div>

      {formOpen && (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-400">
                Session date
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">
                Test type
              </label>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                {TEST_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Side</th>
                  <th className="py-2 pr-3">Trial 1 (cm)</th>
                  <th className="py-2 pr-3">Trial 2 (cm)</th>
                  <th className="py-2 pr-3">Trial 3 (cm)</th>
                  <th className="py-2">Best (cm)</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                <tr className="border-b border-slate-800/80">
                  <td className="py-3 pr-3 font-medium text-lime-300/90">Left</td>
                  {[0, 1, 2].map((i) => (
                    <td key={`l-${i}`} className="py-2 pr-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={leftTrials[i]}
                        onChange={(e) => {
                          const next = [...leftTrials] as [string, string, string];
                          next[i] = e.target.value;
                          setLeftTrials(next);
                        }}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-mono"
                        placeholder="—"
                      />
                    </td>
                  ))}
                  <td className="py-2 font-mono text-lime-300">
                    {leftBest != null ? leftBest.toFixed(1) : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-3 font-medium text-sky-300/90">Right</td>
                  {[0, 1, 2].map((i) => (
                    <td key={`r-${i}`} className="py-2 pr-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={rightTrials[i]}
                        onChange={(e) => {
                          const next = [...rightTrials] as [string, string, string];
                          next[i] = e.target.value;
                          setRightTrials(next);
                        }}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-mono"
                        placeholder="—"
                      />
                    </td>
                  ))}
                  <td className="py-2 font-mono text-sky-300">
                    {rightBest != null ? rightBest.toFixed(1) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-800 pt-4">
            <span className="text-xs font-medium text-slate-400">
              LSI (limb symmetry index)
            </span>
            <span className={`text-lg font-semibold tabular-nums ${lsiColorClass(lsi)}`}>
              {lsi != null ? `${lsi}%` : "—"}
            </span>
          </div>
          <p className="mt-1 text-[0.65rem] text-slate-500">
            Lower score side treated as involved: (min / max) × 100. ≥90% green, 80–89% amber,
            &lt;80% red.
          </p>

          <div className="mt-6">
            <label className="block text-xs font-medium text-slate-400">
              Clinician notes (optional)
            </label>
            <textarea
              value={hopNotes}
              onChange={(e) => setHopNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
              placeholder="Notes for this hop test entry…"
            />
          </div>

          {saveMsg && (
            <p
              className={`mt-3 text-xs ${saveMsg === "Saved." ? "text-lime-400" : "text-rose-400"}`}
            >
              {saveMsg}
            </p>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="mt-6 rounded-full bg-lime-400 px-6 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save test"}
          </button>
        </div>
      )}

      <div className="mt-6 space-y-10">
        {blocks.length === 0 ? (
          <p className="text-xs text-slate-500">No hop test history yet. Add a test above.</p>
        ) : (
          blocks.map((block) => (
            <div key={block.testType}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {block.displayName}
              </h3>
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[320px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-500">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Left (cm)</th>
                      <th className="px-3 py-2 font-medium">Right (cm)</th>
                      <th className="px-3 py-2 font-medium">LSI%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((r) => (
                      <tr
                        key={r.sessionDate}
                        className="border-b border-slate-800/80 last:border-0"
                      >
                        <td className="px-3 py-2 text-slate-300">{r.dateLabel}</td>
                        <td className="px-3 py-2 font-mono text-slate-200">
                          {r.leftCm != null ? r.leftCm.toFixed(1) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-200">
                          {r.rightCm != null ? r.rightCm.toFixed(1) : "—"}
                        </td>
                        <td className={`px-3 py-2 font-mono font-medium ${lsiColorClass(r.lsi)}`}>
                          {r.lsi != null ? `${r.lsi.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h4 className="mb-3 text-xs font-medium text-slate-400">LSI% over time</h4>
                {block.trendPoints.length < 1 ? (
                  <p className="py-8 text-center text-xs text-slate-500">Not enough data</p>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={block.trendPoints}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          stroke="#64748b"
                          tick={AXIS_TICK}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          domain={[0, 100]}
                          stroke="#64748b"
                          tick={AXIS_TICK}
                          tickFormatter={(v) => `${v}%`}
                          label={{
                            value: "LSI%",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#94a3b8",
                            fontSize: 11,
                          }}
                        />
                        <ReferenceLine y={90} stroke="#64748b" strokeDasharray="4 4" />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelFormatter={(label) => String(label)}
                          formatter={(v: number | string) => [
                            typeof v === "number" ? `${v.toFixed(1)}%` : String(v),
                            "LSI",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="lsi"
                          stroke="#84cc16"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <SectionComment
        athleteId={athleteId}
        section="hop_tests"
        initialComment={sectionComment}
      />
    </section>
  );
}
