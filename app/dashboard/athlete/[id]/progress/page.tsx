"use client";

import DashboardNav from "@/components/DashboardNav";
import JumpHeightGraph from "@/components/graphs/JumpHeightGraph";

export default function AthleteProgressPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-20">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">
            Athlete progress
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Long-running trend charts across all test sources.
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">
            Jump height
          </h2>
          <div className="mt-4">
            <JumpHeightGraph data={[]} />
          </div>
        </div>

        {/* Future: RSI, peak force L/R, asymmetry, RTS, sprint trend, IMTP, DJ, PDF export */}
      </section>
    </main>
  );
}