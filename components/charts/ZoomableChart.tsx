"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ZoomableChartProps = {
  /** Shown in the zoomed modal's header (and used as the a11y label). */
  title?: string;
  subtitle?: string | null;
  /** Classes for the small inline wrapper (background/border/rounded/etc.) —
   * do NOT include a height utility here; use the `height` prop instead. */
  className?: string;
  /** Inline (small) chart height in px — matches whatever the chart used
   * before it was wrapped (e.g. 130, 190, 200). */
  height: number;
  /** Zoomed chart height in px, shown in the modal. Defaults to 440. */
  zoomedHeight?: number;
  /**
   * Renders the chart itself (typically a <ResponsiveContainer> wrapping a
   * recharts chart), parameterized by the height it should render at. Same
   * render function is called for both the small and zoomed views, so the
   * chart genuinely gets bigger/more readable when zoomed rather than the
   * modal just being a bigger empty frame around a same-size chart.
   */
  children: (height: number) => ReactNode;
};

/**
 * Click-to-zoom wrapper for any recharts chart. Wraps the small inline
 * chart with a hover-visible expand affordance; clicking anywhere in the
 * chart area opens a full-screen modal re-rendering the same chart at
 * `zoomedHeight`. Used app-wide (SprintPerformanceCharts, DynamometrySection,
 * ForcePlateCMJ/DJ sections, trend panels, comparison page, etc.) — see
 * Brett's Aug 2026 request to be able to zoom in on any chart in the app.
 */
export default function ZoomableChart({
  title,
  subtitle,
  className,
  height,
  zoomedHeight = 440,
  children,
}: ZoomableChartProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <div
        className={`group relative cursor-zoom-in ${className ?? ""}`}
        style={{ height }}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        aria-label={title ? `Zoom in on ${title} chart` : "Zoom in on chart"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div
          className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border border-slate-200 bg-white/90 p-1 text-slate-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        >
          <ExpandIcon />
        </div>
        {children(height)}
      </div>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 sm:p-8"
              onClick={() => setOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={title ? `${title} (zoomed)` : "Zoomed chart"}
            >
              <div
                className="relative w-full max-w-5xl cursor-default rounded-xl bg-white p-4 shadow-2xl sm:p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    {title ? (
                      <p className="text-sm font-semibold text-slate-700">{title}</p>
                    ) : null}
                    {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div style={{ height: zoomedHeight }} className="w-full">
                  {children(zoomedHeight)}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M3.5 3.5a.75.75 0 01.75-.75h4a.75.75 0 010 1.5H5.56l3.72 3.72a.75.75 0 11-1.06 1.06L4.5 5.56v2.69a.75.75 0 01-1.5 0v-4a.75.75 0 01.5-.71zM16.5 16.5a.75.75 0 01-.75.75h-4a.75.75 0 010-1.5h2.69l-3.72-3.72a.75.75 0 111.06-1.06l3.72 3.72v-2.69a.75.75 0 011.5 0v4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
