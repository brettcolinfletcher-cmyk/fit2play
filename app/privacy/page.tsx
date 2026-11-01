import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy — Fit2Perform",
  description:
    "How Fit2Perform collects, uses, stores and protects your personal and health information.",
};

// Keep in sync with SiteFooter.tsx.
const CONTACT_EMAIL = "info@f2p.au";
const LAST_UPDATED = "1 November 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 py-8">
      <h2 className="mb-3 text-lg font-semibold text-slate-900 md:text-xl">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 md:text-base">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-900">
      <SiteNav />

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10">
        <p className="mb-3 inline-flex rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-700">
          Privacy
        </p>
        <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
          Privacy Policy
        </h1>
        <p className="mb-2 text-sm text-slate-600 md:text-base">
          Fit2Perform provides performance and squad testing, and return-to-sport testing under
          the Fit2Play name. This policy covers both. We handle
          your personal and health information under the <em>Privacy Act 1988</em> (Cth) and the
          Australian Privacy Principles. This page explains what we collect, why, who sees it, and
          how to access or correct it.
        </p>
        <p className="text-xs text-slate-400">Last updated {LAST_UPDATED}</p>

        <Section title="In short">
          <ul className="list-disc space-y-1 pl-5">
            <li>We collect what we need to assess you, test you, report results and run your appointments.</li>
            <li>Your test results are only seen by our clinicians and, where your team arranged the testing, the team staff you or your club agreed to.</li>
            <li>Your information is stored in Australia on secure, access-controlled systems.</li>
            <li>You can ask to see or correct your information at any time.</li>
          </ul>
        </Section>

        <Section title="What we collect">
          <p><strong>Contact and booking details:</strong> name, email, phone, appointment times and notes you add when booking.</p>
          <p><strong>Profile details:</strong> date of birth, sex, height, weight, sport, team, playing level and dominant side.</p>
          <p><strong>Health information:</strong> injury history, clinical notes, and test results such as strength, jump, sprint, change-of-direction and hop testing, including left and right side comparisons.</p>
          <p><strong>Billing details:</strong> invoices and how they were paid. We do not store card numbers.</p>
        </Section>

        <Section title="How we collect it">
          <p>
            Mostly directly from you: when you book, attend an appointment or complete testing. Test
            results are recorded by our testing equipment and transferred into our platform.
          </p>
          <p>
            If your club, school or team arranges testing, we may receive your name and team details
            from them. For athletes under 18, we collect information with the consent of a parent or
            guardian, and may collect details from them.
          </p>
        </Section>

        <Section title="Why we use it">
          <ul className="list-disc space-y-1 pl-5">
            <li>To assess, treat and test you, and to track changes over time.</li>
            <li>To produce reports and return-to-sport recommendations.</li>
            <li>To compare your results with benchmarks and, where testing is done through a team, with your teammates.</li>
            <li>To manage bookings, send confirmations and reminders, and issue invoices.</li>
            <li>To meet our legal and professional obligations.</li>
          </ul>
          <p>We do not sell your information or use it for third-party advertising.</p>
        </Section>

        <Section title="Who we share it with">
          <p>
            <strong>Your team:</strong> if your club or team arranged the testing, we share your
            results and reports with the coaching, strength and conditioning and medical staff
            involved, as agreed with you or your club.
          </p>
          <p>
            <strong>Other health providers:</strong> only with your consent, or where the law allows
            (for example, in an emergency).
          </p>
          <p>
            <strong>Service providers:</strong> companies that run the systems we rely on, such as
            our database and website hosting, email delivery and testing equipment software. They
            only handle your information to provide that service to us.
          </p>
          <p>
            <strong>When the law requires it:</strong> for example, a court order.
          </p>
        </Section>

        <Section title="Overseas disclosure">
          <p>
            Our database is hosted in Sydney, Australia. Some of our service providers are based
            overseas and may process your information outside Australia, mainly in the United States
            (website hosting and email delivery) and Europe (testing equipment software). We choose
            providers with strong security practices and only share what each service needs.
          </p>
        </Section>

        <Section title="How we store and protect it">
          <ul className="list-disc space-y-1 pl-5">
            <li>Information is stored electronically in encrypted, access-controlled systems.</li>
            <li>Only our clinicians and staff can see athlete records. Athletes with a login can see only their own results.</li>
            <li>We keep health records for at least 7 years after your last appointment. For people under 18, we keep them until at least age 25.</li>
            <li>When records are no longer needed, we securely delete or de-identify them.</li>
          </ul>
        </Section>

        <Section title="Automated scoring">
          <p>
            Our software calculates scores from your test results, including limb symmetry
            percentages, performance bands and rankings within your team. These help our clinicians
            and your team staff make decisions. No decision about your treatment, clearance to
            return to sport or selection is made by software alone; a clinician always reviews the
            results. The information used is your test results and profile details listed above.
          </p>
        </Section>

        <Section title="Accessing and correcting your information">
          <p>
            You can ask for a copy of the information we hold about you, or ask us to correct it, by
            emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-slate-900 underline">
              {CONTACT_EMAIL}
            </a>
            . We will respond within 30 days. In rare cases the law allows us to refuse access; if
            so, we will tell you why.
          </p>
        </Section>

        <Section title="Complaints">
          <p>
            If you think we have mishandled your information, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-slate-900 underline">
              {CONTACT_EMAIL}
            </a>{" "}
            with the details. We will acknowledge your complaint and aim to resolve it within 30
            days.
          </p>
          <p>
            If you are not satisfied with our response, you can contact the Office of the
            Australian Information Commissioner at{" "}
            <a href="https://www.oaic.gov.au" className="font-medium text-slate-900 underline">
              oaic.gov.au
            </a>{" "}
            or on 1300 363 992.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. The date at the top shows when it last
            changed. Questions? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-slate-900 underline">
              {CONTACT_EMAIL}
            </a>{" "}
            or <Link href="/contact" className="font-medium text-slate-900 underline">contact us</Link>.
          </p>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
