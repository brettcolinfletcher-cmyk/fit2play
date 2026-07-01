"use client";

import { QUALITY_MODEL } from "@/lib/qualityModel";

type Props = {
  metricLatest: Record<string, number>;
  metricPrev: Record<string, number>;
  metricSides: Record<string, number>;
  sectionComments?: Record<string, string>;
  isoLatest?: {
    kneeExtension: { left: number | null; right: number | null };
    kneeFlexion: { left: number | null; right: number | null };
    hipAbduction: { left: number | null; right: number | null };
  };
};

type HeadlineMetric = {
  key: string;
  label: string;
  unit: string;
  digits: number;
  scale?: number;
  lowerIsBetter?: boolean;
};

type TestDef = {
  type: string;
  label: string;
  icon: string;
  headline: HeadlineMetric[];
  symmetry?: { key: string; label: string; unit: string; digits: number };
};

const TESTS: TestDef[] = [
  {
    type: "1080_sprint",
    label: "Sprint",
    icon: "⚡",
    headline: [
      { key: "top_speed", label: "Top speed", unit: "m/s", digits: 2 },
      { key: "split_5m_time", label: "5m split", unit: "s", digits: 2, lowerIsBetter: true },
    ],
  },
  {
    type: "force_plate_cmj",
    label: "Counter-movement jump",
    icon: "↑",
    headline: [
      { key: "fp_jump_height", label: "Jump height", unit: "cm", digits: 1, scale: 100 },
      { key: "fp_rsi_best", label: "mRSI", unit: "", digits: 2 },
    ],
  },
  {
    type: "force_plate_dj",
    label: "Drop jump",
    icon: "▼",
    headline: [
      { key: "fp_rsi_best", label: "RSI", unit: "", digits: 2 },
      { key: "fp_jump_height", label: "Jump height", unit: "cm", digits: 1, scale: 100 },
    ],
  },
  {
    type: "force_plate_dj_single",
    label: "Single-leg drop jump",
    icon: "◐",
    headline: [{ key: "fp_rsi_best", label: "RSI", unit: "", digits: 2 }],
    symmetry: { key: "fp_rsi_best", label: "RSI", unit: "", digits: 2 },
  },
  // Isometric strength rendered separately via isoLatest prop
];

const SECTION_KEY: Record<string, string> = {
  "1080_sprint": "linear",
  force_plate_cmj: "cmj",
  force_plate_dj: "drop_jump",
  force_plate_dj_single: "drop_jump_single",
  force_plate_isometric: "dynamometry",
};

function feedsFor(testType: string): string[] {
  return QUALITY_MODEL.filter((q) =>
    q.contributors.some((c) => c.testType === testType)
  ).map((q) => q.label);
}

function fmtTrend(latest: number | null, prev: number | null, lowerIsBetter: boolean) {
  if (latest == null || prev == null || prev === 0) return null;
  const pct = ((latest - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return { text: "—", better: null as boolean | null };
  const better = lowerIsBetter ? pct < 0 : pct > 0;
  return { text: `${better ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}%`, better };
}

function lsiStatus(lsi: number): { color: string; label: string } {
  if (lsi >= 90) return { color: "text-emerald-400", label: "Symmetrical" };
  if (lsi >= 80) return { color: "text-amber-400", label: "Monitoring" };
  return { color: "text-rose-400", label: "Asymmetric" };
}

function SymmetryBars({
  left, right, label, unit, digits,
}: {
  left: number; right: number; label: string; unit: string; digits: number;
}) {
  const max = Math.max(left, right) || 1;
  const lsi = Math.round((Math.min(left, right) / max) * 100);
  const status = lsiStatus(lsi);

  return (
    <div className="mt-4 border-t border-slate-800/80 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">{label} · L / R</p>
        <span className={`shrink-0 text-xs font-bold tabular-nums ${status.color}`}>
          {lsi}% LSI
          <span className="ml-1 font-normal opacity-60">· {status.label}</span>
        </span>
      </div>
      <div className="space-y-2">
        {[
          { side: "L", val: left, color: "#60a5fa" },
          { side: "R", val: right, color: "#a3e635" },
        ].map(({ side, val, color }) => (
          <div key={side} className="flex items-center gap-2">
            <span className="w-3 text-[0.6rem] font-bold" style={{ color }}>{side}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(val / max) * 100}%`, background: color }}
              />
            </div>
            <span className="w-14 text-right text-xs tabular-nums text-slate-300">
              {val.toFixed(digits)}{unit ? ` ${unit}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AthleteTestSummary({
  metricLatest, metricPrev, metricSides, sectionComments = {}, isoLatest,
}: Props) {
  const cards = TESTS.map((t) => {
    const metrics = t.headline
      .map((h) => {
        const rawLatest = metricLatest[`${t.type}:${h.key}`] ?? null;
        const rawPrev = metricPrev[`${t.type}:${h.key}`] ?? null;
        if (rawLatest == null) return null;
        const scale = h.scale ?? 1;
        return { h, value: rawLatest * scale, trend: fmtTrend(rawLatest, rawPrev, h.lowerIsBetter ?? false) };
      })
      .filter(Boolean) as { h: HeadlineMetric; value: number; trend: ReturnType<typeof fmtTrend> }[];

    if (!metrics.length) return null;

    let sym: { left: number; right: number } | null = null;
    if (t.symmetry) {
      const l = metricSides[`${t.type}:${t.symmetry.key}:left`];
      const r = metricSides[`${t.type}:${t.symmetry.key}:right`];
      if (l != null && r != null) sym = { left: l, right: r };
    }

    // No card-level glow — ring panel glow is the signature element

    return { t, metrics, sym, feeds: feedsFor(t.type) };
  }).filter(Boolean) as {
    t: TestDef;
    metrics: { h: HeadlineMetric; value: number; trend: ReturnType<typeof fmtTrend> }[];
    sym: { left: number; right: number } | null;
    feeds: string[];
  }[];

  if (!cards.length && !isoLatest) return null;

  const isoSubTests = isoLatest ? [
    { label: "Knee Extension", ...isoLatest.kneeExtension },
    { label: "Knee Flexion", ...isoLatest.kneeFlexion },
    { label: "Hip Abduction", ...isoLatest.hipAbduction },
  ] : [];

  const isoHasData = isoSubTests.some((s) => s.left != null || s.right != null);

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-800" />
        <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Latest test results</p>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ t, metrics, sym, feeds }) => (
          <div
            key={t.type}
            className="f2p-dark-tile rounded-xl border p-5 transition-all duration-200"
          >
            {/* Card header */}
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-sm">
                {t.icon}
              </span>
              <p className="text-sm font-semibold text-slate-100">{t.label}</p>
            </div>

            {/* Headline metrics */}
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {metrics.map(({ h, value, trend }) => (
                <div key={h.key}>
                  <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">{h.label}</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-50 leading-none">
                    {value.toFixed(h.digits)}
                    {h.unit ? <span className="ml-1 text-sm font-normal text-slate-400">{h.unit}</span> : null}
                  </p>
                  {trend ? (
                    <p className={`mt-0.5 text-[0.7rem] font-medium tabular-nums ${
                      trend.better == null ? "text-slate-500" : trend.better ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      {trend.text} vs prev
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Symmetry bars */}
            {sym ? (
              <SymmetryBars
                left={sym.left}
                right={sym.right}
                label={t.symmetry!.label}
                unit={t.symmetry!.unit}
                digits={t.symmetry!.digits}
              />
            ) : null}

            {/* Feeds pills */}
            {feeds.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <span className="text-[0.6rem] uppercase tracking-widest text-slate-600">Feeds</span>
                {feeds.map((f) => (
                  <span key={f} className="rounded-full border border-slate-700/60 bg-slate-800/60 px-2 py-0.5 text-[0.62rem] text-slate-400">
                    {f}
                  </span>
                ))}
              </div>
            ) : null}

            {/* Clinician comment */}
            {(() => {
              const note = sectionComments[SECTION_KEY[t.type] ?? ""];
              if (!note) return null;
              return (
                <div className="mt-4 flex gap-2 rounded-lg border border-slate-700/40 bg-slate-950/60 px-3 py-2.5">
                  <span className="mt-0.5 shrink-0 text-[0.75rem]">💬</span>
                  <p className="text-xs leading-relaxed text-slate-300">{note}</p>
                </div>
              );
            })()}
          </div>
        ))}

        {/* Isometric strength card — stacked sub-tests */}
        {isoHasData && (
          <div className="f2p-dark-tile rounded-xl border p-5 transition-all duration-200">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-sm">▮</span>
              <p className="text-sm font-semibold text-slate-100">Isometric strength</p>
            </div>
            <div className="space-y-4">
              {isoSubTests.map(({ label, left, right }) => {
                if (left == null && right == null) return null;
                const max = Math.max(left ?? 0, right ?? 0) || 1;
                const lsiPct = left != null && right != null
                  ? Math.round((Math.min(left, right) / Math.max(left, right)) * 100)
                  : null;
                const lsiCol = lsiPct == null ? "text-slate-400"
                  : lsiPct >= 90 ? "text-emerald-400"
                  : lsiPct >= 80 ? "text-amber-400"
                  : "text-rose-400";
                return (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[0.62rem] uppercase tracking-widest text-slate-500">{label}</p>
                      {lsiPct != null && (
                        <span className={`text-[0.7rem] font-bold tabular-nums ${lsiCol}`}>{lsiPct}% LSI</span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {[{ side: "L", val: left, color: "#60a5fa" }, { side: "R", val: right, color: "#a3e635" }].map(({ side, val, color }) => (
                        <div key={side} className="flex items-center gap-2">
                          <span className="w-3 text-[0.6rem] font-bold" style={{ color }}>{side}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: val != null ? `${(val / max) * 100}%` : "0%", background: color }} />
                          </div>
                          <span className="w-14 text-right text-xs tabular-nums text-slate-300">
                            {val != null ? `${val.toFixed(0)} N` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Feeds */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[0.6rem] uppercase tracking-widest text-slate-600">Feeds</span>
              <span className="rounded-full border border-slate-700/60 bg-slate-800/60 px-2 py-0.5 text-[0.62rem] text-slate-400">Strength</span>
            </div>
            {sectionComments["dynamometry"] && (
              <div className="mt-4 flex gap-2 rounded-lg border border-slate-700/40 bg-slate-950/60 px-3 py-2.5">
                <span className="mt-0.5 shrink-0 text-[0.75rem]">💬</span>
                <p className="text-xs leading-relaxed text-slate-300">{sectionComments["dynamometry"]}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
