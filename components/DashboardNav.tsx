"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

function classNames(...classes: (string | boolean | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function DashboardNav() {
  const pathname = usePathname();

  const athleteMatch = pathname.match(/^\/dashboard\/athlete\/([^/]+)/);
  const athleteId = athleteMatch?.[1];

  const navItems = [
    {
      href: "/dashboard",
      label: "Dashboard",
      active: pathname === "/dashboard",
    },
    {
      href: "/dashboard/athletes",
      label: "Athletes",
      active: pathname.startsWith("/dashboard/athletes"),
    },
  ];

  if (athleteId) {
    navItems.push(
      {
        href: `/dashboard/athlete/${athleteId}`,
        label: "Profile",
        active:
          pathname === `/dashboard/athlete/${athleteId}` &&
          !pathname.includes("/compare"),
      },
      {
        href: `/dashboard/athlete/${athleteId}/compare`,
        label: "Pre vs Post",
        active: pathname.includes("/compare"),
      }
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/fit2play_logo_transparent.png"
              alt="Fit2Play logo"
              width={120}
              height={40}
              className="h-8 w-auto"
            />
          </Link>
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            Data-driven return-to-sport testing
          </span>
        </div>

        <nav className="flex items-center gap-1 text-xs sm:text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={classNames(
                "rounded-full px-3 py-1.5",
                "hover:bg-slate-900 hover:text-lime-300",
                item.active
                  ? "bg-slate-900 text-lime-300 border border-lime-400/40"
                  : "text-slate-300 border border-transparent"
              )}
            >
              {item.label}
            </Link>
          ))}

          <Link
            href="/"
            className="ml-1 rounded-full px-3 py-1.5 text-slate-300 border border-slate-700 hover:border-lime-400 hover:text-lime-300"
          >
            Home
          </Link>
        </nav>
      </div>
    </header>
  );
}