"use client";

export type ChartType = "bar" | "line";

export default function ChartTypeToggle({
  value,
  onChange,
}: {
  value: ChartType;
  onChange: (v: ChartType) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs font-medium">
      {(["bar", "line"] as ChartType[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={
            t === value
              ? "rounded-md bg-slate-700 px-2.5 py-1 text-slate-100"
              : "rounded-md px-2.5 py-1 text-slate-400 hover:text-slate-200"
          }
        >
          {t === "bar" ? "⬛ Bar" : "📈 Line"}
        </button>
      ))}
    </div>
  );
}
