import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Contact — Fit2Perform",
  description:
    "Get in touch with Fit2Perform to book a testing session or make an enquiry.",
};

// Domain decision pending — keep in sync with SiteNav.tsx / SiteFooter.tsx.
const CONTACT_EMAIL = "info@fit2play.com.au";
const MAIL_BOOK = `mailto:${CONTACT_EMAIL}?subject=Testing%20session%20booking`;
const MAIL_ENQUIRY = `mailto:${CONTACT_EMAIL}?subject=Enquiry`;

const btnPrimary =
  "inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm";
const btnSecondary =
  "inline-flex items-center justify-center rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-lime-400 hover:text-lime-400 md:text-sm";

export default function ContactPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        <section className="pb-12">
          <p className="mb-3 inline-flex rounded-full bg-slate-900/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-300">
            Contact
          </p>
          <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-100 md:text-4xl">
            Let&apos;s talk testing.
          </h1>
          <p className="max-w-3xl text-sm text-slate-300 md:text-base">
            Whether you&apos;re a clinician, S&amp;C coach or athlete, get in touch to book a
            testing session or ask about how Fit2Perform can support your decisions.
          </p>
        </section>

        <section className="pb-16">
          <div className="flex flex-col gap-5 rounded-2xl border border-lime-400/50 bg-gradient-to-r from-lime-400/20 to-emerald-500/10 px-5 py-6 shadow-xl shadow-lime-400/10 md:px-8 md:py-8">
            <div>
              <h2 className="mb-1 text-lg font-semibold text-slate-100 md:text-xl">
                Book a testing session
              </h2>
              <p className="text-sm text-slate-200/80">
                Arrange a full return-to-play or performance testing battery.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={MAIL_BOOK} className={btnPrimary}>
                Book a testing session
              </a>
              <a href={MAIL_ENQUIRY} className={btnSecondary}>
                Make an enquiry
              </a>
            </div>
            <p className="text-xs text-slate-200/80">
              Or email us directly at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-lime-200 hover:text-lime-100"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
