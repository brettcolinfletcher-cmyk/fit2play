"use client";

import type { ReactNode } from "react";

export function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: readonly { v: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {label ? <span className="text-slate-400">{label}</span> : null}
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 font-medium">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            title={o.title}
            onClick={() => onChange(o.v)}
            className={
              o.v === value
                ? "rounded-md bg-[#0f172a] px-2.5 py-1 text-white"
                : "rounded-md px-2.5 py-1 text-slate-500 hover:text-slate-800"
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Card({ title, subtitle, right, children, id }: { title: string; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div id={id} className="mt-6 scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[0.7rem] text-slate-400">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function n0(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("en-AU");
}

export function pct(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v)}%`;
}

export function shortDate(iso: string | number): string {
  const d = typeof iso === "number" ? new Date(iso) : new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function acwrChip(v: number | null | undefined): string {
  if (v == null) return "bg-slate-100 text-slate-500";
  if (v > 1.5) return "bg-rose-100 text-rose-700";
  if (v > 1.3 || v < 0.8) return "bg-amber-100 text-amber-700";
  return "bg-lime-100 text-lime-800";
}
