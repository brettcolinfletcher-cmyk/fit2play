"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { staffAuthHeaders } from "@/lib/staffAuthHeaders";
import type { SourceHealth } from "@/lib/sync/syncHealth";

/**
 * Shows a warning when a nightly sync is overdue or logged errors.
 * Renders nothing when everything is healthy (or while loading).
 * Pass `refreshKey` to re-check after a manual sync.
 */
export default function SyncHealthBanner({
  showLink = true,
  refreshKey = 0,
}: {
  showLink?: boolean;
  refreshKey?: number;
}) {
  const [health, setHealth] = useState<SourceHealth[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sync/status", { headers: await staffAuthHeaders() });
        if (!res.ok) return;
        const json = (await res.json()) as { health?: SourceHealth[] };
        if (!cancelled) setHealth(json.health ?? null);
      } catch {
        // Banner is advisory; stay silent on network errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const problems = (health ?? []).filter((h) => h.status !== "ok");
  if (!problems.length) return null;
  const overdue = problems.some((h) => h.status === "overdue");

  return (
    <div
      role="alert"
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
        overdue ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold">{overdue ? "Data sync is overdue" : "Last data sync had errors"}</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {problems.map((h) => (
          <li key={h.source}>
            <span className="font-medium">{h.label}:</span> {h.message}
          </li>
        ))}
      </ul>
      {showLink ? (
        <Link href="/dashboard/sync" className="mt-2 inline-block text-xs font-semibold underline">
          Open the Sync page
        </Link>
      ) : null}
    </div>
  );
}
