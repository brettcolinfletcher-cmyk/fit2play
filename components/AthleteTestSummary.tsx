"use client";

import { QUALITY_MODEL } from "@/lib/qualityModel";

type Props = {
  metricLatest: Record<string, number>;
  metricPrev: Record<string, number>;
  metricSides: Record<string, number>;
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
  headline: HeadlineMetric[];
  symmetry?: { key: string; label: string; unit: string; digits: number };
};

const TESTS: TestDef[] = [
  {
    type: "1080_sprint",
    label: "Sprint",
    headline: [
      { key: "top_speed", label: "Top speed", unit: "m/s", digits: 2 },
      {
        key: "split_5m_time",
        label: "5m split",
        unit: "s",
        digits: 2,
        lowerIsBetter: true,
      },
    ],
  },
  {
    type: "force_plate_cmj",
    label: "Counter-movement jump",
    headline: [
      {
        key: "fp_jump_height",
        label: "Jump height",
        unit: "cm",
        digits: 1,
        scale: 100,
      },
      { key: "fp_rsi_best", label: "mRSI", unit: "", digits: 2 },
    ],
  },
  {
    type: "force_plate_dj",
    label: "Drop jump",
    headline: [
      { key: "fp_rsi_best", label: "RSI", unit: "", digits: 2 },
      {
        key: "fp_jump_height",
        label: "Jump height",
        unit: "cm",
        digits: 1,
        scale: 100,
      },
    ],
  },
  {
    type: "force_plate_dj_single",
    label: "Single-leg drop jump",
    headline: [{ key: "fp_rsi_best", label: "RSI", unit: "", digits: 2 }],
    symmetry: { key: "fp_rsi_best", label: "RSI", unit: "", digits: 2 },
  },
  {
    type: "force_plate_isometric",
    label: "Isometric (IMTP)",
    headline: [{ key: "peak_force", label: "Peak force", unit: "N", digits: 0 }],
    symmetry: { key: "peak_force", label: "Peak force", unit: "N", digits: 0 },
  },
];

/** Which quality rings a given test feeds, derived from the model so they stay in sync. */
function feedsFor(testType: string): string[] {
  return QUALITY_MODEL.filter((q) =>
    q.contributors.some((c) => c.testType === testType)
  ).map((q) => q.label);
}

function fmtTrend(
  latest: number | null,
  prev: number | null,
  lowerIsBetter: boolean
) {
  if (latest == null || prev == null || prev === 0) return null;
  const pct = ((latest - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return { text: "—", better: null as boolean | null };
  const better = lowerIsBetter ? pct < 0 : pct > 0;
  return {
    text: `${better ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}%`,
    better,
  };
}

function SymmetryBars({
  left,
  right,
  label,
  unit,
  digits,
}: {
  left: number;
  right: number;
  label: string;
  unit: string;
  digits: number;
}) {
  const max = Math.max(left, right) || 1;
  const lsi = Math.round((Math.min(left, right) / max) * 100);
  const lsiColor =
    lsi >= 90
      ? "text-emerald-400"
      : lsi >= 80
        ? "text-amber-400"
        : "text-rose-400";
  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {label} · L / R
        </p>
        <p className={`text-xs font-medium tabular-nums ${lsiColor}`}>
          {lsi}% LSI
        </p>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-4 text-[0.65rem] text-slate-400">L</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-[#60a5fa]"
              style={{ width: `${(left / max) * 100}%` }}
            />
          </div>
          <span className="w-12 text-right text-xs tabular-nums text-slate-300">
            {left.toFixed(digits)}
            {unit ? ` ${unit}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 text-[0.65rem] text-slate-400">R</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-[#a3e635]"
              style={{ width: `${(right / max) * 100}%` }}
            />
          </div>
          <span className="w-12 text-right text-xs tabular-nums text-slate-300">
            {right.toFixed(digits)}
            {unit ? ` ${unit}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AthleteTestSummary({
  metricLatest,
  metricPrev,
  metricSides,
}: Props) {
  const cards = TESTS.map((t) => {
    const metrics = t.headline
      .map((h) => {
        const rawLatest = metricLatest[`${t.type}:${h.key}`] ?? null;
        const rawPrev = metricPrev[`${t.type}:${h.key}`] ?? null;
        if (rawLatest == null) return null;
        const scale = h.scale ?? 1;
        return {
          h,
          value: rawLatest * scale,
          trend: fmtTrend(rawLatest, rawPrev, h.lowerIsBetter ?? false),
        };
      })
      .filter(Boolean) as {
      h: HeadlineMetric;
      value: number;
      trend: ReturnType<typeof fmtTrend>;
    }[];

    if (!metrics.length) return null;

    let sym: { left: number; right: number } | null = null;
    if (t.symmetry) {
      const l = metricSides[`${t.type}:${t.symmetry.key}:left`];
      const r = metricSides[`${t.type}:${t.symmetry.key}:right`];
      if (l != null && r != null) sym = { left: l, right: r };
    }

    return { t, metrics, sym, feeds: feedsFor(t.type) };
  }).filter(Boolean) as {
    t: TestDef;
    metrics: {
      h: HeadlineMetric;
      value: number;
      trend: ReturnType<typeof fmtTrend>;
    }[];
    sym: { left: number; right: number } | null;
    feeds: string[];
  }[];

  if (!cards.length) return null;

  return (
    <div className="mt-6">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">Tests</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ t, metrics, sym, feeds }) => (
          <div
            key={t.type}
            className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-100">{t.label}</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {metrics.map(({ h, value, trend }) => (
                <div key={h.key}>
                  <p className="text-[0.7rem] uppercase tracking-wide text-slate-500">
                    {h.label}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-slate-50">
                    {value.toFixed(h.digits)}
                    {h.unit ? (
                      <span className="ml-1 text-xs text-slate-400">
                        {h.unit}
                      </span>
                    ) : null}
                  </p>
                  {trend ? (
                    <p
                      className={`text-[0.7rem] tabular-nums ${
                        trend.better == null
                          ? "text-slate-400"
                          : trend.better
                            ? "text-emerald-400"
                            : "text-rose-400"
                      }`}
                    >
                      {trend.text}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            {sym ? (
              <SymmetryBars
                left={sym.left}
                right={sym.right}
                label={t.symmetry!.label}
                unit={t.symmetry!.unit}
                digits={t.symmetry!.digits}
              />
            ) : null}

            {feeds.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[0.65rem] text-slate-500">Feeds</span>
                {feeds.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[0.65rem] text-slate-300"
                  >
                    {f}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
