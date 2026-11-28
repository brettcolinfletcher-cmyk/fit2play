"use client";

import Link from "next/link";
import type { Flag } from "@/lib/gpsTeam";
import { Card } from "./ui";

export default function FlagsList({ flags, names }: { flags: Flag[]; names: Map<string, string> }) {
  const high = flags.filter((f) => f.severity === "high");
  const medium = flags.filter((f) => f.severity === "medium");
  return (
    <Card
      id="flags"
      title="Watch list"
      subtitle="ACWR outside 0.8–1.3, load spike +50% or more, no 90%+ max velocity exposure in 14+ days."
    >
      {flags.length === 0 ? (
        <p className="mt-3 text-xs text-lime-700">No flags in this range.</p>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[...high, ...medium].map((f, i) => (
            <Link
              key={`${f.athleteId}-${i}`}
              href={`/dashboard/athletes/${f.athleteId}#gps`}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs hover:shadow-sm ${
                f.severity === "high" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <span className="font-medium text-slate-800">{names.get(f.athleteId) ?? "Athlete"}</span>
              <span className={f.severity === "high" ? "font-semibold text-rose-700" : "text-amber-700"}>{f.text}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
