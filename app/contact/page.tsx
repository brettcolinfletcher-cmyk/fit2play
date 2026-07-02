import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Contact — Fit2Play",
  description:
    "Get in touch with Fit2Play to book a testing session or make an enquiry.",
};

const CONTACT_EMAIL = "info@fit2play.com.au";
const MAIL_BOOK = `mailto:${CONTACT_EMAIL}?subject=Testing%20session%20booking`;
const MAIL_ENQUIRY = `mailto:${CONTACT_EMAIL}?subject=Enquiry`;

const btnPrimary =
  "inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm";
const btnSecondary =
  "inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-lime-500 hover:text-lime-600 md:text-sm";

export default function ContactPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-900">
      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        <section className="pb-12">
          <p className="mb-3 inline-flex rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-700">
            Contact
          </p>
          <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
            Let&apos;s talk testing.
          </h1>
          <p className="max-w-3xl text-sm text-slate-600 md:text-base">
            Whether you&apos;re a clinician, S&amp;C coach or athlete, get in touch to book a
            testing session or ask about how Fit2Play can support your decisions.
          </p>
        </section>

        <section className="pb-16">
          <div className="flex flex-col gap-5 rounded-2xl border border-lime-300 bg-gradient-to-r from-lime-50 to-emerald-50 px-5 py-6 shadow-sm md:px-8 md:py-8">
            <div>
              <h2 className="mb-1 text-lg font-semibold text-slate-900 md:text-xl">
                Book a testing session
              </h2>
              <p className="text-sm text-slate-600">
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
            <p className="text-xs text-slate-600">
              Or email us directly at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-lime-700 hover:text-lime-800"
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
