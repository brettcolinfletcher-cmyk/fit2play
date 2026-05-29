"use client";

import { useMemo } from "react";
import PerformanceBandPill from "@/components/PerformanceBandPill";
import {
  resolveBandForMetric,
  type NormalizedPerformanceBand,
} from "@/lib/performanceBands";
import {
  asymmetryCellClass,
  asymmetryPctLR,
  buildLrDisplayRows,
  buildSummaryMap,
  type SummaryMap,
} from "@/lib/metricsLrDisplay";

type Metric = {
  id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
  side?: string | null;
  unit?: string | null;
};

function MetricValueWithBand({
  valueText,
  metricKey,
  numericValue,
  bands,
  sessionTestType,
}: {
  valueText: string;
  metricKey: string;
  numericValue: number | null;
  bands: NormalizedPerformanceBand[];
  sessionTestType?: string | null;
}) {
  const band = resolveBandForMetric(
    metricKey,
    numericValue,
    bands,
    sessionTestType
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{valueText}</span>
      <PerformanceBandPill band={band} />
    </div>
  );
}

function fmtNum(
  v: number | null | undefined,
  decimals: number,
  suffix = ""
): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(decimals)}${suffix}`;
}

function getMap(
  map: SummaryMap,
  keys: string[]
): number | null {
  for (const k of keys) {
    const v = map[k];
    if (v != null && typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return null;
}

export function SessionSummaryLrTable({
  metrics,
  bands,
  sessionTestType,
}: {
  metrics: Metric[];
  bands: NormalizedPerformanceBand[];
  sessionTestType?: string | null;
}) {
  const summaryOnly = useMemo(
    () => metrics.filter((m) => m.rep_index == null),
    [metrics]
  );
  const repMetrics = useMemo(
    () => metrics.filter((m) => m.rep_index != null),
    [metrics]
  );
  const map = useMemo(
    () => buildSummaryMap(summaryOnly),
    [summaryOnly]
  );
  const lrRows = useMemo(() => buildLrDisplayRows(map), [map]);

  return (
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
        Session metrics (summary)
      </h2>
      {lrRows.length === 0 && repMetrics.length === 0 ? (
        <p className="text-xs text-slate-500">
          No metrics stored for this session.
        </p>
      ) : (
        <>
          {lrRows.length > 0 && (
            <div className="overflow-x-auto mb-6">
              <table className="min-w-full divide-y divide-slate-800/60">
                <thead>
                  <tr>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Metric
                    </th>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Left
                    </th>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Right
                    </th>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Both
                    </th>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Asymmetry
                    </th>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Band
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {lrRows.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 px-2 text-xs text-slate-200">
                        {row.label}
                      </td>
                      <td className="py-2 px-2 text-xs tabular-nums text-slate-200">
                        {row.left != null ? row.left : "—"}
                      </td>
                      <td className="py-2 px-2 text-xs tabular-nums text-slate-200">
                        {row.right != null ? row.right : "—"}
                      </td>
                      <td className="py-2 px-2 text-xs tabular-nums text-slate-200">
                        {row.both != null ? row.both : "—"}
                      </td>
                      <td
                        className={`py-2 px-2 text-xs tabular-nums ${asymmetryCellClass(row.asymPct)}`}
                      >
                        {row.asymPct != null ? `${row.asymPct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        <PerformanceBandPill
                          band={resolveBandForMetric(
                            row.bandKey,
                            row.both ?? row.left ?? row.right,
                            bands,
                            sessionTestType
                          )}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {repMetrics.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-lime-300">
                Per-rep metrics
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800/60">
                  <thead>
                    <tr>
                      <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                        Key
                      </th>
                      <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                        Rep
                      </th>
                      <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                        Side
                      </th>
                      <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                        Value
                      </th>
                      <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                        Band
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {repMetrics.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2 px-2 font-mono text-xs text-slate-200">
                          {m.key}
                        </td>
                        <td className="py-2 px-2 text-xs text-slate-200">
                          {m.rep_index}
                        </td>
                        <td className="py-2 px-2 text-xs text-slate-200">
                          {m.side ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-xs text-slate-200">
                          {m.value != null ? m.value : "—"}
                        </td>
                        <td className="py-2 px-2 text-xs">
                          <PerformanceBandPill
                            band={resolveBandForMetric(
                              m.key,
                              m.value,
                              bands,
                              sessionTestType
                            )}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export const SESSION_TYPE_LABELS: Record<string, string> = {
  force_plate_cmj: "Force Plate — CMJ",
  force_plate_dj: "Force Plate — Drop Jump",
  force_plate_imtp: "Force Plate — IMTP",
  force_plate_isometric: "Handheld Dynamometry",
  force_plate_calf: "Force Plate — Calf",
  force_plate: "Force Plate",
  "1080_sprint": "1080 Motion — Sprint",
};

export function sessionTypeLabel(testType: string | null | undefined): string {
  if (!testType) return "Test session";
  const key = testType.toLowerCase();
  if (SESSION_TYPE_LABELS[key]) return SESSION_TYPE_LABELS[key];
  return testType.replace(/_/g, " ");
}

export function parseHhdSubTypeLabel(segment: string | null | undefined): string {
  if (!segment) return "";
  const cleaned = segment
    .replace(/^TS\s+/i, "")
    .replace(/^Isometric\s+Test[-\s]*/i, "");
  const colonIdx = cleaned.lastIndexOf(":");
  const name = colonIdx >= 0 ? cleaned.slice(0, colonIdx) : cleaned;
  const repStr = colonIdx >= 0 ? cleaned.slice(colonIdx + 1).trim() : "";
  const parts = name.split("-").map((p) => p.trim()).filter(Boolean);
  const label = parts.join(" – ");
  return repStr ? `${label} (rep ${repStr})` : label;
}

export function fpPanelKind(
  testType: string | null
): "jump" | "iso" | "hhd_isometric" | null {
  if (!testType) return null;
  const t = testType.toLowerCase();
  if (t === "force_plate_isometric") return "hhd_isometric";
  if (t === "force_plate_imtp" || t === "force_plate_calf") return "iso";
  if (
    t === "force_plate_cmj" ||
    t === "force_plate_dj" ||
    t === "force_plate"
  )
    return "jump";
  if (t.includes("force_plate")) return "jump";
  return null;
}

const HHD_METRICS = [
  { key: "peak_force", label: "Peak Force", unit: "N" },
  { key: "peak_net_force", label: "Peak Net Force", unit: "N" },
  { key: "net_impulse", label: "Net Impulse", unit: "N·s" },
  { key: "total_impulse", label: "Total Impulse", unit: "N·s" },
  { key: "peak_rfd", label: "Peak RFD", unit: "N/s" },
  { key: "time_to_peak_force", label: "Time to Peak Force", unit: "s" },
  { key: "explosive_strength_index", label: "Explosive Strength Index", unit: "" },
  { key: "avg_force", label: "Avg Force", unit: "N" },
  { key: "avg_net_force", label: "Avg Net Force", unit: "N" },
  { key: "net_force_at_50_ms", label: "Net Force @ 50ms", unit: "N" },
  { key: "net_force_at_100_ms", label: "Net Force @ 100ms", unit: "N" },
  { key: "net_force_at_150_ms", label: "Net Force @ 150ms", unit: "N" },
  { key: "net_force_at_200_ms", label: "Net Force @ 200ms", unit: "N" },
  { key: "net_force_at_250_ms", label: "Net Force @ 250ms", unit: "N" },
  { key: "duration", label: "Duration", unit: "s" },
  { key: "pretension", label: "Pretension", unit: "N" },
] as const;

function normalizeSide(side: string | null | undefined): "left" | "right" | "both" {
  const s = (side ?? "").toLowerCase().trim();
  if (s === "left" || s === "l") return "left";
  if (s === "right" || s === "r") return "right";
  return "both";
}

function hhdMetricValue(
  metrics: Metric[],
  key: string,
  column: "left" | "right" | "both"
): number | null {
  const matches = metrics.filter((m) => {
    if (m.key !== key || m.value == null || !Number.isFinite(m.value)) return false;
    const side = normalizeSide(m.side);
    if (column === "left") return side === "left";
    if (column === "right") return side === "right";
    return side === "both";
  });
  if (matches.length === 0) return null;
  return Math.max(...matches.map((m) => m.value as number));
}

function hhdLsi(left: number, right: number): number {
  const stronger = Math.max(left, right);
  const weaker = Math.min(left, right);
  return stronger === 0 ? 100 : (weaker / stronger) * 100;
}

function hhdLsiColorClass(value: number): string {
  if (value >= 90) return "text-lime-400";
  if (value >= 80) return "text-amber-400";
  return "text-rose-400";
}

export function HhdIsometricPanel({ metrics }: { metrics: Metric[] }) {
  const hasAny = HHD_METRICS.some(
    (def) =>
      hhdMetricValue(metrics, def.key, "left") != null ||
      hhdMetricValue(metrics, def.key, "right") != null ||
      hhdMetricValue(metrics, def.key, "both") != null
  );

  const peakLeft = hhdMetricValue(metrics, "peak_force", "left");
  const peakRight = hhdMetricValue(metrics, "peak_force", "right");
  const peakLsi =
    peakLeft != null && peakRight != null ? hhdLsi(peakLeft, peakRight) : null;

  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
        Handheld Dynamometry
      </h2>
      {!hasAny ? (
        <p className="text-slate-500">No handheld dynamometry metrics for this session.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800/60 text-left">
            <thead>
              <tr>
                <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                  Metric
                </th>
                <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-blue-400">
                  Left
                </th>
                <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-lime-400">
                  Right
                </th>
                <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                  Both
                </th>
                <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                  LSI%
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {HHD_METRICS.map((def) => {
                const left = hhdMetricValue(metrics, def.key, "left");
                const right = hhdMetricValue(metrics, def.key, "right");
                const both = hhdMetricValue(metrics, def.key, "both");
                const rowLsi =
                  def.key === "peak_force" && peakLsi != null ? peakLsi : null;
                return (
                  <tr key={def.key}>
                    <td className="py-2 pr-4 text-xs text-slate-200">
                      {def.label}
                      {def.unit ? (
                        <span className="ml-1 text-slate-500">({def.unit})</span>
                      ) : null}
                    </td>
                    <td className="py-2 px-2 font-mono text-xs tabular-nums text-slate-200">
                      {left != null ? left.toFixed(2) : "—"}
                    </td>
                    <td className="py-2 px-2 font-mono text-xs tabular-nums text-slate-200">
                      {right != null ? right.toFixed(2) : "—"}
                    </td>
                    <td className="py-2 px-2 font-mono text-xs tabular-nums text-slate-200">
                      {both != null ? both.toFixed(2) : "—"}
                    </td>
                    <td
                      className={`py-2 px-2 font-mono text-xs font-semibold tabular-nums ${
                        rowLsi != null ? hhdLsiColorClass(rowLsi) : "text-slate-500"
                      }`}
                    >
                      {rowLsi != null ? `${rowLsi.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type JumpRowDef = {
  label: string;
  bandKey: string;
  both: string[];
  left: string[];
  right: string[];
  decimals: number;
  suffix?: string;
};

const JUMP_ROWS: JumpRowDef[] = [
  {
    label: "Jump height",
    bandKey: "fp_jump_height_cm_best",
    both: ["fp_jump_height_cm_best"],
    left: ["fp_jump_height_cm_left"],
    right: ["fp_jump_height_cm_right"],
    decimals: 1,
    suffix: " cm",
  },
  {
    label: "RSI",
    bandKey: "fp_rsi_best",
    both: ["fp_rsi_best"],
    left: ["fp_rsi_left"],
    right: ["fp_rsi_right"],
    decimals: 2,
  },
  {
    label: "Contact time",
    bandKey: "fp_contact_time_s_best",
    both: ["fp_contact_time_s_best"],
    left: ["fp_contact_time_s_left"],
    right: ["fp_contact_time_s_right"],
    decimals: 3,
    suffix: " s",
  },
  {
    label: "Flight time",
    bandKey: "fp_flight_time_s_best",
    both: ["fp_flight_time_s_best"],
    left: ["fp_flight_time_s_left"],
    right: ["fp_flight_time_s_right"],
    decimals: 3,
    suffix: " s",
  },
  {
    label: "Concentric impulse",
    bandKey: "fp_concentric_impulse",
    both: ["fp_concentric_impulse"],
    left: ["fp_concentric_impulse_left"],
    right: ["fp_concentric_impulse_right"],
    decimals: 2,
    suffix: " Ns",
  },
  {
    label: "Eccentric impulse",
    bandKey: "fp_eccentric_impulse",
    both: ["fp_eccentric_impulse"],
    left: ["fp_eccentric_impulse_left"],
    right: ["fp_eccentric_impulse_right"],
    decimals: 2,
    suffix: " Ns",
  },
  {
    label: "Peak braking force",
    bandKey: "fp_peak_braking_force",
    both: ["fp_peak_braking_force"],
    left: ["fp_peak_braking_force_left"],
    right: ["fp_peak_braking_force_right"],
    decimals: 0,
    suffix: " N",
  },
  {
    label: "Peak propulsive force",
    bandKey: "fp_peak_propulsive_force",
    both: ["fp_peak_propulsive_force"],
    left: ["fp_peak_propulsive_force_left"],
    right: ["fp_peak_propulsive_force_right"],
    decimals: 0,
    suffix: " N",
  },
];

function JumpRowCells({
  row,
  map,
  singleLeg,
  bands,
  sessionTestType,
}: {
  row: JumpRowDef;
  map: SummaryMap;
  singleLeg: boolean;
  bands: NormalizedPerformanceBand[];
  sessionTestType?: string | null;
}) {
  const L = getMap(map, row.left);
  const R = getMap(map, row.right);
  const B = getMap(map, row.both);
  const hasPair =
    singleLeg && L != null && R != null && Number.isFinite(L) && Number.isFinite(R);
  const asym = hasPair ? asymmetryPctLR(L, R) : null;

  if (hasPair) {
    return (
      <>
        <td className="py-2 px-2">
          <MetricValueWithBand
            valueText={fmtNum(L, row.decimals, row.suffix ?? "")}
            metricKey={row.left[0]}
            numericValue={L}
            bands={bands}
            sessionTestType={sessionTestType}
          />
        </td>
        <td className="py-2 px-2">
          <MetricValueWithBand
            valueText={fmtNum(R, row.decimals, row.suffix ?? "")}
            metricKey={row.right[0]}
            numericValue={R}
            bands={bands}
            sessionTestType={sessionTestType}
          />
        </td>
        <td className={`py-2 px-2 tabular-nums ${asymmetryCellClass(asym)}`}>
          {asym != null ? `${asym.toFixed(1)}%` : "—"}
        </td>
      </>
    );
  }

  return (
    <td className="py-2 px-2" colSpan={3}>
      <MetricValueWithBand
        valueText={fmtNum(B, row.decimals, row.suffix ?? "")}
        metricKey={row.bandKey}
        numericValue={B}
        bands={bands}
        sessionTestType={sessionTestType}
      />
    </td>
  );
}

export function ForcePlateJumpPanel({
  metrics,
  testSubType,
  sessionTestType,
  bands,
}: {
  metrics: Metric[];
  testSubType: string | null | undefined;
  sessionTestType?: string | null;
  bands: NormalizedPerformanceBand[];
}) {
  const summary = useMemo(
    () =>
      buildSummaryMap(metrics.filter((m) => m.rep_index == null)),
    [metrics]
  );
  const singleLeg = (testSubType ?? "").toLowerCase().includes("single");

  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
        Force plate — jump / plyometric
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800/60 text-left">
          <thead>
            <tr>
              <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                Metric
              </th>
              {singleLeg ? (
                <>
                  <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                    Left
                  </th>
                  <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                    Right
                  </th>
                  <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                    Asymmetry
                  </th>
                </>
              ) : (
                <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                  Both
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {JUMP_ROWS.map((row) => (
              <tr key={row.label}>
                <td className="py-2 pr-4 text-xs text-slate-200">{row.label}</td>
                <JumpRowCells
                  row={row}
                  map={summary}
                  singleLeg={singleLeg}
                  bands={bands}
                  sessionTestType={sessionTestType}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const ISO_PEAK_LEFT = [
  "fp_peak_force_n_left",
  "fp_peak_force_l_n_best",
];
const ISO_PEAK_RIGHT = [
  "fp_peak_force_n_right",
  "fp_peak_force_r_n_best",
];

export function ForcePlateIsoPanel({
  metrics,
  testSubType,
  sessionTestType,
  bands,
}: {
  metrics: Metric[];
  testSubType: string | null | undefined;
  sessionTestType?: string | null;
  bands: NormalizedPerformanceBand[];
}) {
  const map = useMemo(
    () =>
      buildSummaryMap(metrics.filter((m) => m.rep_index == null)),
    [metrics]
  );
  const singleLeg = (testSubType ?? "").toLowerCase().includes("single");
  const peakBoth = getMap(map, ["fp_peak_force_n_best"]);
  const peakL = getMap(map, ISO_PEAK_LEFT);
  const peakR = getMap(map, ISO_PEAK_RIGHT);
  const ttpBoth = getMap(map, ["isometric_time_to_peak"]);
  const ttpL = getMap(map, ["isometric_time_to_peak_left"]);
  const ttpR = getMap(map, ["isometric_time_to_peak_right"]);
  const rfdBoth = getMap(map, ["isometric_rfd"]);
  const rfdL = getMap(map, ["isometric_rfd_left"]);
  const rfdR = getMap(map, ["isometric_rfd_right"]);

  const rows: {
    label: string;
    bandKey: string;
    both: number | null;
    L: number | null;
    R: number | null;
    lk: string;
    rk: string;
    decimals: number;
    suffix?: string;
  }[] = [
    {
      label: "Peak force",
      bandKey: "fp_peak_force_n_best",
      both: peakBoth,
      L: peakL,
      R: peakR,
      lk: "fp_peak_force_n_left",
      rk: "fp_peak_force_n_right",
      decimals: 0,
      suffix: " N",
    },
    {
      label: "Time to peak force",
      bandKey: "isometric_time_to_peak",
      both: ttpBoth,
      L: ttpL,
      R: ttpR,
      lk: "isometric_time_to_peak_left",
      rk: "isometric_time_to_peak_right",
      decimals: 3,
      suffix: " s",
    },
    {
      label: "Rate of force development",
      bandKey: "isometric_rfd",
      both: rfdBoth,
      L: rfdL,
      R: rfdR,
      lk: "isometric_rfd_left",
      rk: "isometric_rfd_right",
      decimals: 0,
      suffix: " N/s",
    },
  ];

  const anyIsoLr = rows.some(
    (r) =>
      r.L != null &&
      r.R != null &&
      Number.isFinite(r.L) &&
      Number.isFinite(r.R)
  );
  const showLrColumns = anyIsoLr || singleLeg;

  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
        Force plate — isometric
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800/60 text-left">
          <thead>
            <tr>
              <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                Metric
              </th>
              {showLrColumns ? (
                <>
                  <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                    Left
                  </th>
                  <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                    Right
                  </th>
                  <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                    Asymmetry
                  </th>
                </>
              ) : (
                <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                  Both
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map((row) => {
              const hasPair =
                row.L != null &&
                row.R != null &&
                Number.isFinite(row.L) &&
                Number.isFinite(row.R);
              const asym = hasPair ? asymmetryPctLR(row.L!, row.R!) : null;
              return (
                <tr key={row.label}>
                  <td className="py-2 pr-4 text-xs text-slate-200">{row.label}</td>
                  {hasPair ? (
                    <>
                      <td className="py-2 px-2">
                        <MetricValueWithBand
                          valueText={fmtNum(
                            row.L,
                            row.decimals,
                            row.suffix ?? ""
                          )}
                          metricKey={row.lk}
                          numericValue={row.L}
                          bands={bands}
                          sessionTestType={sessionTestType}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <MetricValueWithBand
                          valueText={fmtNum(
                            row.R,
                            row.decimals,
                            row.suffix ?? ""
                          )}
                          metricKey={row.rk}
                          numericValue={row.R}
                          bands={bands}
                          sessionTestType={sessionTestType}
                        />
                      </td>
                      <td
                        className={`py-2 px-2 tabular-nums ${asymmetryCellClass(asym)}`}
                      >
                        {asym != null ? `${asym.toFixed(1)}%` : "—"}
                      </td>
                    </>
                  ) : (
                    <td className="py-2 px-2" colSpan={3}>
                      <MetricValueWithBand
                        valueText={fmtNum(
                          row.both,
                          row.decimals,
                          row.suffix ?? ""
                        )}
                        metricKey={row.bandKey}
                        numericValue={row.both}
                        bands={bands}
                        sessionTestType={sessionTestType}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type DynoGroup = {
  id: string;
  label: string;
  peakL: number | null;
  peakR: number | null;
  peakBoth: number | null;
  rfdL: number | null;
  rfdR: number | null;
  rfdBoth: number | null;
  lrPeakAsym: number | null;
  /** Session-level asymmetry % (manual entry), not derived from L vs R peak */
  manualAsymmetryPct: number | null;
};

function humanizeDynoMovement(slug: string): string {
  const m: Record<string, string> = {
    knee_ext: "Knee extension",
    knee_flex: "Knee flexion",
    hip_abd: "Hip abduction",
    hip_add: "Hip adduction",
  };
  return (
    m[slug] ??
    slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function buildDynoGroups(map: SummaryMap): DynoGroup[] {
  const byMove = new Map<
    string,
    {
      peakL: number | null;
      peakR: number | null;
      peakBoth: number | null;
      rfdL: number | null;
      rfdR: number | null;
      rfdBoth: number | null;
    }
  >();

  const ensure = (mov: string) => {
    if (!byMove.has(mov)) {
      byMove.set(mov, {
        peakL: null,
        peakR: null,
        peakBoth: null,
        rfdL: null,
        rfdR: null,
        rfdBoth: null,
      });
    }
    return byMove.get(mov)!;
  };

  for (const [k, v] of Object.entries(map)) {
    if (!k.startsWith("dyno_") || v == null) continue;
    if (k === "dyno_asymmetry_pct") continue;

    const peakBothM = k.match(/^dyno_(.+)_peak_force$/);
    if (peakBothM) {
      ensure(peakBothM[1]).peakBoth = v;
      continue;
    }
    const peakLrM = k.match(/^dyno_(.+)_peak_force_(left|right)$/);
    if (peakLrM) {
      const slot = ensure(peakLrM[1]);
      if (peakLrM[2] === "left") slot.peakL = v;
      else slot.peakR = v;
      continue;
    }
    const rfdBothM = k.match(/^dyno_(.+)_rfd$/);
    if (rfdBothM) {
      ensure(rfdBothM[1]).rfdBoth = v;
      continue;
    }
    const rfdLrM = k.match(/^dyno_(.+)_rfd_(left|right)$/);
    if (rfdLrM) {
      const slot = ensure(rfdLrM[1]);
      if (rfdLrM[2] === "left") slot.rfdL = v;
      else slot.rfdR = v;
      continue;
    }
  }

  const legacyPeak = map.dyno_peak_force ?? null;
  const legacyRfd = map.dyno_rfd ?? null;
  const legacyAsym = map.dyno_asymmetry_pct ?? null;
  if (legacyPeak != null || legacyRfd != null || legacyAsym != null) {
    const slot = ensure("general");
    if (legacyPeak != null) slot.peakBoth = legacyPeak;
    if (legacyRfd != null) slot.rfdBoth = legacyRfd;
  }

  const groups: DynoGroup[] = [];
  for (const [id, s] of byMove) {
    const lrPeakAsym =
      s.peakL != null && s.peakR != null
        ? asymmetryPctLR(s.peakL, s.peakR)
        : null;
    groups.push({
      id,
      label: humanizeDynoMovement(id),
      peakL: s.peakL,
      peakR: s.peakR,
      peakBoth: s.peakBoth,
      rfdL: s.rfdL,
      rfdR: s.rfdR,
      rfdBoth: s.rfdBoth,
      lrPeakAsym,
      manualAsymmetryPct: id === "general" ? legacyAsym : null,
    });
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

function DynoMetricRow({
  label,
  bandKey,
  L,
  R,
  both,
  decimals,
  suffix,
  bands,
  sessionTestType,
}: {
  label: string;
  bandKey: string;
  L: number | null;
  R: number | null;
  both: number | null;
  decimals: number;
  suffix?: string;
  bands: NormalizedPerformanceBand[];
  sessionTestType?: string | null;
}) {
  const hasPair =
    L != null &&
    R != null &&
    Number.isFinite(L) &&
    Number.isFinite(R);
  const asym = hasPair ? asymmetryPctLR(L, R) : null;

  if (hasPair) {
    return (
      <tr className="border-b border-slate-800/80">
        <td className="py-2 pr-4 text-slate-300">{label}</td>
        <td className="py-2 px-2">
          <MetricValueWithBand
            valueText={fmtNum(L, decimals, suffix ?? "")}
            metricKey={`${bandKey}_left`}
            numericValue={L}
            bands={bands}
            sessionTestType={sessionTestType}
          />
        </td>
        <td className="py-2 px-2">
          <MetricValueWithBand
            valueText={fmtNum(R, decimals, suffix ?? "")}
            metricKey={`${bandKey}_right`}
            numericValue={R}
            bands={bands}
            sessionTestType={sessionTestType}
          />
        </td>
        <td className={`py-2 px-2 tabular-nums ${asymmetryCellClass(asym)}`}>
          {asym != null ? `${asym.toFixed(1)}%` : "—"}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-800/80">
      <td className="py-2 pr-4 text-slate-300">{label}</td>
      <td className="py-2 px-2" colSpan={3}>
        <MetricValueWithBand
          valueText={fmtNum(both, decimals, suffix ?? "")}
          metricKey={bandKey}
          numericValue={both}
          bands={bands}
          sessionTestType={sessionTestType}
        />
      </td>
    </tr>
  );
}

export function DynamometerSummaryPanel({
  metrics,
  bands,
  sessionTestType,
}: {
  metrics: Metric[];
  bands: NormalizedPerformanceBand[];
  sessionTestType?: string | null;
}) {
  const map = useMemo(
    () =>
      buildSummaryMap(metrics.filter((m) => m.rep_index == null)),
    [metrics]
  );
  const groups = buildDynoGroups(map);

  if (groups.length === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
          Handheld dynamometer
        </h2>
        <p className="text-slate-500">No dynamometer metrics for this session.</p>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">
        Handheld dynamometer
      </h2>
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.id}>
            <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-400">
              {g.label}
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800/60 text-left">
                <thead>
                  <tr>
                    <th className="py-2 pr-4 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Metric
                    </th>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Left
                    </th>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Right
                    </th>
                    <th className="py-2 px-2 text-left text-[0.7rem] font-medium uppercase tracking-widest text-slate-400">
                      Asymmetry
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <DynoMetricRow
                    label="Peak force (N)"
                    bandKey={`dyno_${g.id}_peak_force`}
                    L={g.peakL}
                    R={g.peakR}
                    both={g.peakBoth}
                    decimals={0}
                    suffix=" N"
                    bands={bands}
                    sessionTestType={sessionTestType}
                  />
                  <DynoMetricRow
                    label="RFD (N/s)"
                    bandKey={`dyno_${g.id}_rfd`}
                    L={g.rfdL}
                    R={g.rfdR}
                    both={g.rfdBoth}
                    decimals={0}
                    suffix=" N/s"
                    bands={bands}
                    sessionTestType={sessionTestType}
                  />
                  {g.manualAsymmetryPct != null &&
                  g.lrPeakAsym == null &&
                  (g.peakL == null || g.peakR == null) ? (
                    <tr className="border-b border-slate-800/80">
                      <td className="py-2 pr-4 text-slate-300">
                        Asymmetry %
                      </td>
                      <td className="py-2 px-2" colSpan={3}>
                        <span
                          className={`tabular-nums ${asymmetryCellClass(g.manualAsymmetryPct)}`}
                        >
                          {g.manualAsymmetryPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
