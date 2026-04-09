"use client";

import JumpHeightGraph from "@/components/graphs/JumpHeightGraph";

export default function AthleteProgressPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <h1 className="text-xl font-semibold mb-6">Athlete Progress Dashboard</h1>

      <section className="mb-6">
        <JumpHeightGraph data={[]} />
      </section>

      {/* We will add:
          - RSI graph
          - Peak force L/R graph
          - Asymmetry graph
          - RTS graphs
          - Sprint trend graphs
          - IMTP trends
          - DJ trends
          - Export to PDF
       */}
    </main>
  );
}