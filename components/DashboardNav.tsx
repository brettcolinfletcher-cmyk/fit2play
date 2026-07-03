"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

function classNames(...classes: (string | boolean | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const logoutButtonClass =
  "text-xs text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-400 rounded-full px-3 py-1.5";

export default function DashboardNav({ lightTheme = false }: { lightTheme?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileRole, setProfileRole] = useState<string | null>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProfileRole(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setProfileRole(profile?.role ?? null);
    })();
  }, [pathname]);

  const athleteMatch = pathname.match(/^\/dashboard\/athlete\/([^/]+)/);
  const athleteId = athleteMatch?.[1];
  const isAthleteRole = profileRole === "athlete";

  const navItems: { href: string; label: string; active: boolean }[] = [
    {
      href: "/",
      label: "Home",
      active: false,
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      active: pathname === "/dashboard",
    },
  ];

  if (!isAthleteRole) {
    navItems.push(
      {
        href: "/dashboard/athletes",
        label: "Athletes",
        active:
          pathname.startsWith("/dashboard/athletes") &&
          !pathname.startsWith("/dashboard/athletes/compare"),
      },
      {
        href: "/dashboard/athletes/compare",
        label: "Compare",
        active: pathname.startsWith("/dashboard/athletes/compare"),
      },
      {
        href: "/dashboard/teams",
        label: "Teams",
        active: pathname.startsWith("/dashboard/teams"),
      },
      {
        href: "/dashboard/diary",
        label: "Scheduling",
        active:
          pathname.startsWith("/dashboard/diary") ||
          pathname.startsWith("/dashboard/availability") ||
          pathname.startsWith("/dashboard/practitioners") ||
          pathname.startsWith("/dashboard/appointment-types") ||
          pathname.startsWith("/dashboard/invoices"),
      },
      {
        href: "/dashboard/sprint-report",
        label: "Sprint Report",
        active: pathname.startsWith("/dashboard/sprint-report"),
      },
      {
        href: "/dashboard/sync",
        label: "Sync",
        active: pathname.startsWith("/dashboard/sync"),
      },
      {
        href: "/dashboard/upload",
        label: "Add Data",
        active:
          pathname.startsWith("/dashboard/upload") ||
          pathname.startsWith("/dashboard/add-test"),
      }
    );
  }

  if (!isAthleteRole && athleteId) {
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

  async function handleLogout() {
    setMenuOpen(false);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            {lightTheme ? (
              <Image
                src="/fit2play_logo_canva.png"
                alt="Fit2Play logo"
                width={260}
                height={100}
                className="h-10 w-auto"
              />
            ) : (
              <Image
                src="/fit2play_logo_transparent.png"
                alt="Fit2Play logo"
                width={160}
                height={50}
                className="h-10 w-auto"
              />
            )}
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
          <button
            type="button"
            onClick={() => void handleLogout()}
            className={classNames("ml-1 shrink-0", logoutButtonClass)}
          >
            Log out
          </button>
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
          <button
            type="button"
            onClick={() => void handleLogout()}
            className={classNames("text-center", logoutButtonClass)}
          >
            Log out
          </button>
        </nav>
      ) : null}
    </header>
  );
}
