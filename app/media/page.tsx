import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Media — Fit2Perform",
  description:
    "Insights, case studies and updates from Fit2Perform.",
};

export default function MediaPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <SiteNav dark />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        <section className="pb-12">
          <p className="mb-3 inline-flex rounded-full bg-slate-900/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-300">
            Media
          </p>
          <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-100 md:text-4xl">
            Insights &amp; updates.
          </h1>
          <p className="max-w-3xl text-sm text-slate-300 md:text-base">
            Case studies, articles and updates on return-to-play and performance testing —
            and how objective data is changing the way athletes are assessed.
          </p>
        </section>

        <section className="pb-16">
          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-6 text-center shadow-xl shadow-lime-400/10 md:p-10">
            <span className="mb-3 inline-flex rounded-full bg-amber-400/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-300">
              Coming soon
            </span>
            <h2 className="mb-2 text-lg font-semibold text-slate-100 md:text-xl">
              First posts on the way.
            </h2>
            <p className="mx-auto max-w-xl text-sm text-slate-300 md:text-base">
              We&apos;re putting together case studies and articles from the field. Follow
              along on Instagram in the meantime.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
