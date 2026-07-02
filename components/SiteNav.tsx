"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";

const btnPrimary =
  "inline-flex items-center justify-center rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Research", href: "/research" },
  { label: "Media", href: "/media" },
  { label: "Contact", href: "/contact" },
] as const;

export default function SiteNav({ dark = false }: { dark?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const pathname = usePathname();

  const linkClass = (href: string) =>
    pathname === href
      ? "text-lime-400 font-semibold"
      : dark
      ? "text-slate-300 hover:text-lime-400"
      : "text-slate-600 hover:text-lime-600";

  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src={dark ? "/fit2play_logo_white.png" : "/fit2play_logo_light.png"}
            alt="Fit2Play logo"
            width={260}
            height={100}
            className="max-h-14 w-auto"
            priority
          />
        </Link>

        <nav className="hidden flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm md:flex md:gap-x-3">
          {NAV_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href)}>
              {item.label}
            </Link>
          ))}
          <Link href="/login" className={linkClass("/login")}>
            Login
          </Link>
          <Link href="/book" className={`ml-2 ${btnPrimary}`}>
            Book now
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/book"
            className="inline-flex items-center justify-center rounded-full bg-lime-400 px-3 py-1.5 text-[0.65rem] font-semibold text-slate-950 shadow-md hover:brightness-110"
          >
            Book
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div
          className="border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm md:hidden"
          id="mobile-nav"
        >
          <nav className="mx-auto flex max-w-5xl flex-col gap-3 text-sm">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(item.href)}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" className={linkClass("/login")} onClick={closeMenu}>
              Login
            </Link>
            <Link href="/book" className={`mt-1 w-fit ${btnPrimary}`} onClick={closeMenu}>
              Book now
            </Link>
          </nav>
        </div>
      ) : null}
    </>
  );
}
