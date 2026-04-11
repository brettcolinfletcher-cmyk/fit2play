"use client";

export type AsymmetryRow = {
  id?: string;
  metricKey: string;
  leftValue: number | null;
  rightValue: number | null;
  asymmetryPercent: number | null;
  repIndex: number | null;
};

function normalizeAsymmetryRow(raw: Record<string, unknown>): AsymmetryRow | null {
  const metricKey =
    (typeof raw.metric_key === "string" && raw.metric_key) ||
    (typeof raw.metricKey === "string" && raw.metricKey) ||
    (typeof raw.metric_name === "string" && raw.metric_name) ||
    null;
  if (!metricKey) return null;

  const lv =
    typeof raw.left_value === "number"
      ? raw.left_value
      : typeof raw.leftValue === "number"
        ? raw.leftValue
        : null;
  const rv =
    typeof raw.right_value === "number"
      ? raw.right_value
      : typeof raw.rightValue === "number"
        ? raw.rightValue
        : null;
  const ap =
    typeof raw.asymmetry_percent === "number"
      ? raw.asymmetry_percent
      : typeof raw.asymmetry_pct === "number"
        ? raw.asymmetry_pct
        : typeof raw.asymmetryPercent === "number"
          ? raw.asymmetryPercent
          : null;
  const repIndex =
    typeof raw.rep_index === "number"
      ? raw.rep_index
      : typeof raw.repIndex === "number"
        ? raw.repIndex
        : null;

  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    metricKey,
    leftValue: lv,
    rightValue: rv,
    asymmetryPercent: ap,
    repIndex,
  };
}

export function parseAsymmetryResults(
  rows: Record<string, unknown>[]
): AsymmetryRow[] {
  const out: AsymmetryRow[] = [];
  for (const r of rows) {
    const n = normalizeAsymmetryRow(r);
    if (n) out.push(n);
  }
  return out;
}

function barWidthPct(left: number, right: number): { leftPct: number; rightPct: number } {
  const t = Math.abs(left) + Math.abs(right);
  if (t <= 0) return { leftPct: 50, rightPct: 50 };
  return {
    leftPct: (Math.abs(left) / t) * 100,
    rightPct: (Math.abs(right) / t) * 100,
  };
}

function asymmetryFlagClass(absPct: number): string {
  if (absPct > 15) return "text-red-500 font-semibold";
  if (absPct > 10) return "text-yellow-400 font-semibold";
  return "text-slate-400";
}

export default function AsymmetryPanel({
  rows,
  variant = "dark",
}: {
  rows: AsymmetryRow[];
  variant?: "dark" | "light";
}) {
  if (!rows.length) return null;

  const shell =
    variant === "dark"
      ? "rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
      : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  const title = variant === "dark" ? "text-lime-300" : "text-slate-900";
  const sub = variant === "dark" ? "text-slate-500" : "text-slate-500";
  const item =
    variant === "dark"
      ? "rounded-xl border border-slate-800 bg-slate-950/50 p-3"
      : "rounded-xl border border-slate-100 bg-slate-50/80 p-3";
  const mono = variant === "dark" ? "text-slate-200" : "text-slate-800";
  const track = variant === "dark" ? "bg-slate-800" : "bg-slate-200";
  const foot = variant === "dark" ? "text-slate-500" : "text-slate-500";

  return (
    <section className={shell}>
      <h3 className={`text-sm font-semibold ${title}`}>
        Left vs right asymmetry
      </h3>
      <p className={`mt-1 text-xs ${sub}`}>
        &gt;10% asymmetry highlighted (yellow); &gt;15% (red).
      </p>
      <ul className="mt-4 space-y-4">
        {rows.map((row, i) => {
          const key = row.id ?? `${row.metricKey}-${row.repIndex ?? i}`;
          const L = row.leftValue ?? 0;
          const R = row.rightValue ?? 0;
          const { leftPct, rightPct } = barWidthPct(L, R);
          const ap = row.asymmetryPercent;
          const absAp = ap != null ? Math.abs(ap) : 0;

          return (
            <li key={key} className={item}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`font-mono text-xs ${mono}`}>
                  {row.metricKey}
                  {row.repIndex != null ? ` · rep ${row.repIndex}` : ""}
                </span>
                {ap != null && (
                  <span className={`text-xs tabular-nums ${asymmetryFlagClass(absAp)}`}>
                    {ap >= 0 ? "+" : ""}
                    {ap.toFixed(1)}% asymmetry
                  </span>
                )}
              </div>
              <div className={`mt-2 flex h-2 overflow-hidden rounded-full ${track}`}>
                <div
                  className="bg-sky-500 transition-all"
                  style={{ width: `${leftPct}%` }}
                  title={`Left ${L}`}
                />
                <div
                  className="bg-violet-500 transition-all"
                  style={{ width: `${rightPct}%` }}
                  title={`Right ${R}`}
                />
              </div>
              <div className={`mt-1 flex justify-between text-[0.65rem] ${foot}`}>
                <span>L: {row.leftValue != null ? row.leftValue.toFixed(2) : "—"}</span>
                <span>R: {row.rightValue != null ? row.rightValue.toFixed(2) : "—"}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
