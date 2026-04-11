"use client";

import Link from "next/link";
import DashboardNav from "@/components/DashboardNav";

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
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <DashboardNav />
      <section className="mx-auto max-w-5xl px-6 py-10 pb-20">
        <header className="mb-8 rounded-2xl bg-slate-900 px-6 py-6 text-white shadow-lg">
          <h1 className="text-2xl font-semibold tracking-tight">Add test</h1>
          <p className="mt-2 text-sm text-slate-400">
            Choose a device, then pick the test variant on the next screen.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
          {devices.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-slate-900 group-hover:text-slate-950">
                {d.title}
              </h2>
              <p className="mt-2 flex-1 text-sm text-slate-600">{d.description}</p>
              <ul className="mt-4 space-y-1 text-xs text-slate-500">
                {d.subtypes.map((s) => (
                  <li key={s}>• {s}</li>
                ))}
              </ul>
              <span className="mt-4 text-sm font-medium text-sky-600">
                Open upload →
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          <Link href="/dashboard/athletes" className="text-sky-600 hover:underline">
            Athletes dashboard
          </Link>{" "}
          also supports 1080 CSV upload for quick access.
        </p>
      </section>
    </main>
  );
}
