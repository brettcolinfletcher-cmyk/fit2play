"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation for the practice-management ("Scheduling") section.
 * Vertical sidebar on desktop; horizontal scrollable strip on mobile so the
 * sub-pages stay reachable without crowding the top nav.
 */

const TABS = [
  { href: "/dashboard/diary", label: "Diary" },
  { href: "/dashboard/availability", label: "Availability" },
  { href: "/dashboard/practitioners", label: "Practitioners" },
  { href: "/dashboard/appointment-types", label: "Services" },
  { href: "/dashboard/invoices", label: "Invoices" },
];

export default function PracticeSidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
      <div className="mb-2 hidden text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:block">
        Scheduling
      </div>
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition lg:rounded-lg lg:border-y-0 lg:border-r-0 lg:border-l-2 ${
              active
                ? "border-lime-400 bg-white/5 font-semibold text-slate-100"
                : "border-slate-800 text-slate-400 hover:text-slate-200 lg:border-transparent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
