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
      <h2 className="text-sm font-semibold text-lime-300 mb-3">
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
              <table className="min-w-full text-[0.7rem]">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-1 px-2 text-left">Metric</th>
                    <th className="py-1 px-2 text-left">Left</th>
                    <th className="py-1 px-2 text-left">Right</th>
                    <th className="py-1 px-2 text-left">Both</th>
                    <th className="py-1 px-2 text-left">Asymmetry</th>
                    <th className="py-1 px-2 text-left">Band</th>
                  </tr>
                </thead>
                <tbody>
                  {lrRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-800"
                    >
                      <td className="py-1 px-2 text-slate-200">{row.label}</td>
                      <td className="py-1 px-2 tabular-nums">
                        {row.left != null ? row.left : "—"}
                      </td>
                      <td className="py-1 px-2 tabular-nums">
                        {row.right != null ? row.right : "—"}
                      </td>
                      <td className="py-1 px-2 tabular-nums">
                        {row.both != null ? row.both : "—"}
                      </td>
                      <td
                        className={`py-1 px-2 tabular-nums ${asymmetryCellClass(row.asymPct)}`}
                      >
                        {row.asymPct != null ? `${row.asymPct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-1 px-2">
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
              <h3 className="text-[0.7rem] font-semibold text-slate-400 mb-2">
                Per-rep metrics
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[0.7rem]">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-1 px-2 text-left">Key</th>
                      <th className="py-1 px-2 text-left">Rep</th>
                      <th className="py-1 px-2 text-left">Side</th>
                      <th className="py-1 px-2 text-left">Value</th>
                      <th className="py-1 px-2 text-left">Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repMetrics.map((m) => (
                      <tr
                        key={m.id}
                        className="border-t border-slate-800"
                      >
                        <td className="py-1 px-2 font-mono">{m.key}</td>
                        <td className="py-1 px-2">{m.rep_index}</td>
                        <td className="py-1 px-2">{m.side ?? "—"}</td>
                        <td className="py-1 px-2">
                          {m.value != null ? m.value : "—"}
                        </td>
                        <td className="py-1 px-2">
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

export function fpPanelKind(
  testType: string | null
): "jump" | "iso" | null {
  if (!testType) return null;
  const t = testType.toLowerCase();
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
      <h2 className="text-sm font-semibold text-lime-300 mb-3">
        Force plate — jump / plyometric
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-2 pr-4 font-medium">Metric</th>
              {singleLeg ? (
                <>
                  <th className="py-2 px-2 font-medium">Left</th>
                  <th className="py-2 px-2 font-medium">Right</th>
                  <th className="py-2 px-2 font-medium">Asymmetry</th>
                </>
              ) : (
                <th className="py-2 px-2 font-medium">Both</th>
              )}
            </tr>
          </thead>
          <tbody>
            {JUMP_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-slate-800/80">
                <td className="py-2 pr-4 text-slate-300">{row.label}</td>
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
      <h2 className="text-sm font-semibold text-lime-300 mb-3">
        Force plate — isometric
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-2 pr-4 font-medium">Metric</th>
              {showLrColumns ? (
                <>
                  <th className="py-2 px-2 font-medium">Left</th>
                  <th className="py-2 px-2 font-medium">Right</th>
                  <th className="py-2 px-2 font-medium">Asymmetry</th>
                </>
              ) : (
                <th className="py-2 px-2 font-medium">Both</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasPair =
                row.L != null &&
                row.R != null &&
                Number.isFinite(row.L) &&
                Number.isFinite(row.R);
              const asym = hasPair ? asymmetryPctLR(row.L!, row.R!) : null;
              return (
                <tr key={row.label} className="border-b border-slate-800/80">
                  <td className="py-2 pr-4 text-slate-300">{row.label}</td>
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
        <h2 className="text-sm font-semibold text-lime-300 mb-3">
          Handheld dynamometer
        </h2>
        <p className="text-slate-500">No dynamometer metrics for this session.</p>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
      <h2 className="text-sm font-semibold text-lime-300 mb-3">
        Handheld dynamometer
      </h2>
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.id}>
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500 mb-2">
              {g.label}
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-2 pr-4 font-medium">Metric</th>
                    <th className="py-2 px-2 font-medium">Left</th>
                    <th className="py-2 px-2 font-medium">Right</th>
                    <th className="py-2 px-2 font-medium">Asymmetry</th>
                  </tr>
                </thead>
                <tbody>
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
