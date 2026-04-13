"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

function classNames(...classes: (string | boolean | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function DashboardNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
    {
      href: "/dashboard/sprint-report",
      label: "Sprint report",
      active: pathname.startsWith("/dashboard/sprint-report"),
    },
    {
      href: "/dashboard/add-test",
      label: "Add test",
      active: pathname.startsWith("/dashboard/add-test"),
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

  const linkClass = (active: boolean) =>
    classNames(
      "rounded-full px-3 py-2 text-center text-xs sm:text-sm",
      "hover:bg-slate-900 hover:text-lime-300",
      active
        ? "bg-slate-900 text-lime-300 border border-lime-400/40"
        : "text-slate-300 border border-transparent"
    );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <Image
              src="/fit2play_logo_transparent.png"
              alt="Fit2Play logo"
              width={120}
              height={40}
              className="h-8 w-auto"
            />
          </Link>
          <span className="hidden text-[11px] text-slate-400 lg:inline">
            Data-driven return-to-sport testing
          </span>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-200 hover:border-lime-400/50 hover:text-lime-300 md:hidden"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? (
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(item.active)}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/"
            className="ml-1 rounded-full border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-lime-400 hover:text-lime-300 sm:text-sm"
          >
            Home
          </Link>
        </nav>
      </div>

      {menuOpen ? (
        <nav
          className="flex flex-col gap-1 border-t border-slate-800 bg-slate-950 px-4 py-3 md:hidden"
          aria-label="Mobile"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(item.active)}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/"
            className="rounded-full border border-slate-700 px-3 py-2 text-center text-xs text-slate-300 hover:border-lime-400 hover:text-lime-300"
          >
            Home
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
