"use client";

import { useMemo } from "react";

type Preset = "all" | "30d" | "90d" | "6m" | "1y";

type Props = {
  rangeStart: string | null;
  rangeEnd: string | null;
  onChange: (start: string | null, end: string | null) => void;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): string {
  const d = startOfTodayLocal();
  d.setDate(d.getDate() - days);
  return toYmd(d);
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "6m", label: "6m" },
  { id: "1y", label: "1y" },
];

export default function DateRangeBar({ rangeStart, rangeEnd, onChange }: Props) {
  const activePreset = useMemo((): Preset | null => {
    if (rangeStart == null && rangeEnd == null) return "all";
    if (rangeEnd != null) return null;
    const d30 = daysAgo(30);
    const d90 = daysAgo(90);
    const d180 = daysAgo(180);
    const d365 = daysAgo(365);
    if (rangeStart === d30) return "30d";
    if (rangeStart === d90) return "90d";
    if (rangeStart === d180) return "6m";
    if (rangeStart === d365) return "1y";
    return null;
  }, [rangeStart, rangeEnd]);

  function applyPreset(id: Preset) {
    if (id === "all") onChange(null, null);
    else if (id === "30d") onChange(daysAgo(30), null);
    else if (id === "90d") onChange(daysAgo(90), null);
    else if (id === "6m") onChange(daysAgo(180), null);
    else if (id === "1y") onChange(daysAgo(365), null);
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(({ id, label }) => {
          const on = activePreset === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? "border-lime-400 bg-lime-400/15 text-lime-300"
                  : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400">From</label>
          <input
            type="date"
            value={rangeStart ?? ""}
            onChange={(e) =>
              onChange(e.target.value ? e.target.value : null, rangeEnd)
            }
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400">To</label>
          <input
            type="date"
            value={rangeEnd ?? ""}
            onChange={(e) =>
              onChange(rangeStart, e.target.value ? e.target.value : null)
            }
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          />
        </div>
      </div>
    </div>
  );
}
