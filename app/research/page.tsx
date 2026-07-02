import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Research — Fit2Play",
  description:
    "The evidence behind Fit2Play — validated testing methods and return-to-play literature.",
};

export default function ResearchPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-900">
      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        <section className="pb-12">
          <p className="mb-3 inline-flex rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-700">
            Research
          </p>
          <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
            Grounded in the evidence.
          </h1>
          <p className="max-w-3xl text-sm text-slate-600 md:text-base">
            Every protocol in Fit2Play is built on established return-to-play and
            performance literature and validated testing methods — the same equipment and
            benchmarks used by leading high-performance programs.
          </p>
        </section>

        <section className="pb-16">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm md:p-10">
            <span className="mb-3 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-600">
              Coming soon
            </span>
            <h2 className="mb-2 text-lg font-semibold text-slate-900 md:text-xl">
              Evidence library in progress.
            </h2>
            <p className="mx-auto max-w-xl text-sm text-slate-600 md:text-base">
              We&apos;re compiling the key literature and validation studies behind each
              testing protocol. Check back soon, or get in touch to discuss the evidence
              base directly.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
