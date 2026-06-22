"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const NAV_ITEMS: { id: string; label: string; key: string }[] = [
  { id: "summary", label: "Summary", key: "summary" },
  { id: "linear", label: "Sprint", key: "linear" },
  { id: "cod", label: "COD", key: "cod" },
  { id: "cmj", label: "Force Plate CMJ", key: "cmj" },
  { id: "drop_jump", label: "Force Plate Drop Jump", key: "drop_jump" },
  { id: "drop_jump_single", label: "Single-Leg Drop Jump", key: "drop_jump_single" },
  { id: "hop_tests", label: "Hop Tests", key: "hop_tests" },
  { id: "dynamometry", label: "Dynamometry", key: "dynamometry" },
];

type Props = {
  sectionsWithData: string[];
};

export default function SectionJumpNav({ sectionsWithData }: Props) {
  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter(
        (item) =>
          item.key === "summary" ||
          item.key === "dynamometry" ||
          sectionsWithData.includes(item.key)
      ),
    [sectionsWithData]
  );
  const [active, setActive] = useState<string>("summary");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const first = visibleItems[0]?.id ?? "dynamometry";
    setActive((a) => (visibleItems.some((i) => i.id === a) ? a : first));
  }, [visibleItems]);

  useEffect(() => {
    const seen = new Set(sectionsWithData);
    const ids = NAV_ITEMS.filter(
      (item) =>
        item.key === "summary" ||
        item.key === "dynamometry" ||
        seen.has(item.key)
    ).map((i) => i.id);

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.id;
        if (top) setActive(top);
      },
      { root: null, rootMargin: "-72px 0px -45% 0px", threshold: [0.15, 0.35, 0.55] }
    );

    for (const el of elements) {
      observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [sectionsWithData]);

  return (
    <nav className="sticky top-0 z-30 border-b border-white/5 bg-white/[0.03] py-2 backdrop-blur-md">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleItems.map((item) => {
          const on = active === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                on
                  ? "border-lime-400 bg-lime-400/15 text-lime-300"
                  : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
