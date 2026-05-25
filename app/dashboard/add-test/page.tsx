"use client";

import Link from "next/link";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";

const devices = [
  {
    title: "1080 Sprint",
    description:
      "Linear sprints (10m / 20m / 40m) and COD 5-10-5. Upload 1080 CSV exports.",
    href: "/dashboard/add-test/1080",
    subtypes: ["Linear sprint", "COD 5-10-5"],
  },
  {
    title: "Hawkins Force Plate",
    description:
      "Drop jump, CMJ, IMTP, isometric calf raise — single or double leg.",
    href: "/dashboard/add-test/forceplate",
    subtypes: ["Drop jump", "CMJ", "IMTP", "Calf raise", "Leg: single / double / lead"],
  },
  {
    title: "Handheld Dynamometer",
    description:
      "Hip abduction / adduction, knee extension (30° & 90°), knee flexion (30°).",
    href: "/dashboard/add-test/dynamometer",
    subtypes: ["Hip abd/add", "Knee ext 30°/90°", "Knee flex 30°"],
  },
];

export default function AddTestHubPage() {
  const staffOk = useRequireDashboardStaff();

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-20">
        <header className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">
            Add test
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Choose a device, then pick the test variant on the next screen.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
          {devices.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:border-lime-400/40 hover:bg-slate-900/70 hover:shadow-lg hover:shadow-lime-400/10"
            >
              <h2 className="text-base font-semibold text-slate-100 group-hover:text-lime-300">
                {d.title}
              </h2>
              <p className="mt-2 flex-1 text-sm text-slate-400">{d.description}</p>
              <ul className="mt-4 space-y-1 text-xs text-slate-500">
                {d.subtypes.map((s) => (
                  <li key={s}>• {s}</li>
                ))}
              </ul>
              <span className="mt-4 text-xs font-medium text-lime-300">
                Open upload →
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          <Link
            href="/dashboard/athletes"
            className="text-lime-300 hover:underline"
          >
            Athletes dashboard
          </Link>{" "}
          also supports 1080 CSV upload for quick access.
        </p>
      </section>
    </main>
  );
}
