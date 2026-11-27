"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";

/**
 * Sticky section bar for the athlete page. Sits directly under the site
 * header, lists every section that is actually on the page (checked in the
 * DOM, so it follows protocol, visibility and data without extra wiring) and
 * highlights the section currently in view.
 */

type NavItem = { id: string; label: string; group: "view" | "detail" };

const NAV_ITEMS: NavItem[] = [
  // Summary sections (clinician view; overview/latest/trends also in athlete view)
  { id: "overview", label: "Status", group: "view" },
  { id: "latest", label: "Latest results", group: "view" },
  { id: "summary", label: "Compare", group: "view" },
  { id: "targets", label: "Targets", group: "view" },
  { id: "trends", label: "Trends", group: "view" },
  // Detail, in the one test order used everywhere: speed, COD, jumps, hops, strength
  { id: "linear", label: "Sprint", group: "detail" },
  { id: "sprint-reps", label: "Sprint reps", group: "detail" },
  { id: "cod", label: "COD", group: "detail" },
  { id: "cmj", label: "CMJ", group: "detail" },
  { id: "drop_jump", label: "Drop jump", group: "detail" },
  { id: "drop_jump_single", label: "SL drop jump", group: "detail" },
  { id: "hop_tests", label: "Hops", group: "detail" },
  { id: "dynamometry", label: "Strength", group: "detail" },
  { id: "gps", label: "GPS", group: "detail" },
  { id: "lr_settings", label: "LR settings", group: "detail" },
  { id: "sessions", label: "Sessions", group: "detail" },
];

const DEFAULT_HEADER_PX = 65;

function siteHeaderHeight(): number {
  const header = document.querySelector("header");
  return header ? Math.round(header.getBoundingClientRect().height) : DEFAULT_HEADER_PX;
}

export default function SectionJumpNav() {
  const navRef = useRef<HTMLElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [headerPx, setHeaderPx] = useState(DEFAULT_HEADER_PX);

  // Which sections exist right now. Sections mount after data loads, so
  // re-check whenever the page's DOM changes.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const ids = NAV_ITEMS.filter((i) => document.getElementById(i.id)).map((i) => i.id);
        setPresent((prev) => (prev.join("|") === ids.join("|") ? prev : ids));
        setHeaderPx(siteHeaderHeight());
      });
    };
    check();
    const root = navRef.current?.closest("main") ?? document.body;
    const mo = new MutationObserver(check);
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);

  const offset = useCallback(
    () => headerPx + (navRef.current?.offsetHeight ?? 48) + 12,
    [headerPx]
  );

  // Scroll-spy: the active section is the last one whose top has passed the bar.
  useEffect(() => {
    if (present.length === 0) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = offset() + 4;
        const atBottom =
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        let current: string | null = null;
        for (const id of present) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= line) current = id;
        }
        if (atBottom) current = present[present.length - 1]!;
        setActive(current);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, [present, offset]);

  // Keep the highlighted chip visible inside the horizontally scrolling strip.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || !active) return;
    const chip = strip.querySelector<HTMLElement>(`[data-nav="${active}"]`);
    if (!chip) return;
    const left = chip.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + chip.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - 24), behavior: "smooth" });
    }
  }, [active]);

  const jump = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    // Sessions is a collapsed <details>; open it when jumped to.
    if (el instanceof HTMLDetailsElement) el.open = true;
    const top = el.getBoundingClientRect().top + window.scrollY - offset();
    window.scrollTo({ top, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  };

  const items = NAV_ITEMS.filter((i) => present.includes(i.id));
  if (items.length === 0) return <nav ref={navRef} aria-hidden="true" />;

  return (
    <nav
      ref={navRef}
      aria-label="Athlete page sections"
      style={{ top: headerPx }}
      className="sticky z-30 -mx-4 mt-4 border-b border-slate-200 bg-[#f8fafc]/90 px-4 py-2 backdrop-blur-md"
    >
      <div
        ref={stripRef}
        className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => {
          const on = active === item.id;
          const groupBreak = i > 0 && items[i - 1]!.group !== item.group;
          return (
            <span key={item.id} className="flex shrink-0 items-center gap-2">
              {groupBreak ? <span aria-hidden="true" className="h-5 w-px bg-slate-300" /> : null}
              <a
                href={`#${item.id}`}
                data-nav={item.id}
                aria-current={on ? "location" : undefined}
                onClick={jump(item.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  on
                    ? "border-lime-400 bg-lime-400/15 text-lime-300"
                    : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                {item.label}
              </a>
            </span>
          );
        })}
      </div>
    </nav>
  );
}
