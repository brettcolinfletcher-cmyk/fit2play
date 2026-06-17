"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

const MAIL_BOOK =
  "mailto:info@fit2play.com.au?subject=Testing%20session%20booking";
const MAIL_ENQUIRY = "mailto:info@fit2play.com.au?subject=Enquiry";

const ASSESSMENT_COVERAGE = [
  "Lower-limb strength and capacity",
  "Power and reactive strength (jump testing)",
  "Acceleration, deceleration and change-of-direction profiling",
  "Left/right asymmetry across every measure",
  "Longitudinal comparison to the athlete's own history and benchmarks",
  "A clear, shareable report with actionable findings",
] as const;

const INJURY_AREAS = [
  "ACL and knee",
  "Hamstring",
  "Calf and Achilles",
  "Lower-limb tendinopathy & overuse",
  "Patellofemoral",
  "Hip, groin & core",
] as const;

const btnPrimary =
  "inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm";
const btnSecondary =
  "inline-flex items-center justify-center rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-lime-400 hover:text-lime-400 md:text-sm";

const CREDIBILITY_CLUBS = [
  { name: "Carlton FC", file: "carlton.png" },
  { name: "Fremantle Dockers", file: "fremantle.svg" },
  { name: "AFLW", file: "aflw.png" },
  { name: "Western Force", file: "western-force.svg" },
  { name: "WACA", file: "waca.svg" },
  { name: "Perth FC", file: "perth-fc.png" },
  { name: "Perth Scorchers", file: "perth-scorchers.png" },
  { name: "Australian Institute of Sport", file: "ais.png" },
  { name: "AC Milan", file: "ac-milan.png" },
  { name: "New England Patriots", file: "patriots.png" },
] as const;

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {/* TODO: replace logo with transparent-bg export from Canva — current asset has baked-in dark background */}
          <Image
            src="/fit2play_logo_transparent.png"
            alt="Fit2Perform logo"
            width={200}
            height={80}
            className="max-h-10 w-auto"
            priority
          />
        </Link>

        <nav className="hidden flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm text-slate-300 md:flex md:gap-x-2">
          <a href="#testing" className="hover:text-lime-400">
            Testing
          </a>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
          <a href="#product-proof" className="hover:text-lime-400">
            Sample report
          </a>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
          <a href="#contact" className="hover:text-lime-400">
            Contact
          </a>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
          <Link href="/login" className="hover:text-lime-400">
            Login
          </Link>
          <a href={MAIL_BOOK} className={`ml-2 ${btnPrimary} px-4 py-1.5 text-xs md:text-sm`}>
            Book a testing session
          </a>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <a
            href={MAIL_BOOK}
            className="inline-flex items-center justify-center rounded-full bg-lime-400 px-3 py-1.5 text-[0.65rem] font-semibold text-slate-950 shadow-md hover:brightness-110"
          >
            Book
          </a>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/80 text-lg leading-none text-slate-200"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div
          className="border-b border-slate-800 bg-slate-950/95 px-4 py-4 md:hidden"
          id="mobile-nav"
        >
          <nav className="mx-auto flex max-w-5xl flex-col gap-3 text-sm text-slate-200">
            <a href="#testing" className="hover:text-lime-400" onClick={closeMenu}>
              Testing
            </a>
            <a href="#product-proof" className="hover:text-lime-400" onClick={closeMenu}>
              Sample report
            </a>
            <a href="#contact" className="hover:text-lime-400" onClick={closeMenu}>
              Contact
            </a>
            <Link href="/login" className="hover:text-lime-400" onClick={closeMenu}>
              Login
            </Link>
            <a href={MAIL_BOOK} className={`mt-1 w-fit ${btnPrimary}`} onClick={closeMenu}>
              Book a testing session
            </a>
          </nav>
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        {/* 1 — Hero */}
        <section className="grid gap-10 pb-16 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-slate-900/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-300">
              Return-to-play &amp; performance testing
            </p>
            <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-100 md:text-4xl">
              Know when they&apos;re ready — and how far they can go.
            </h1>
            <p className="mb-5 max-w-xl text-sm text-slate-300 md:text-base">
              Fit2Perform turns force plates, sprint testing and dynamometry into one
              decision-ready platform — measuring strength, power, asymmetry and readiness.
              Guide athletes safely back from injury, and benchmark performance when
              they&apos;re fit.
            </p>
            <div className="mb-4 flex flex-wrap gap-3">
              <a href={MAIL_BOOK} className={btnPrimary}>
                Book a testing session
              </a>
              <a href="#product-proof" className={btnSecondary}>
                See a sample report
              </a>
            </div>
          </div>

          {/* TODO: replace with de-identified report/dashboard screenshot */}
          <PlaceholderVisual
            label="Hero visual"
            detail="De-identified report or dashboard screenshot"
            className="shadow-xl shadow-lime-400/10"
          />
        </section>

        {/* 2 — Credibility strip */}
        <section className="scroll-mt-24 border-y border-slate-800 py-10">
          <h2 className="mb-3 text-xl font-semibold text-slate-100 md:text-2xl">
            Decades inside elite sport.
          </h2>
          <p className="mb-6 max-w-3xl text-sm text-slate-300 md:text-base">
            The experience behind Fit2Perform spans some of the most demanding programs in
            world sport — Carlton FC (AFL), the New England Patriots (NFL), AC Milan, the
            Australian Institute of Sport, the Western Force and the WACA — in codes with
            historically high rates of lower-limb injury.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {CREDIBILITY_CLUBS.map((club) => (
              <ClubLogo key={club.name} name={club.name} file={club.file} />
            ))}
          </div>
        </section>

        {/* Our solutions */}
        <section id="solutions" className="scroll-mt-24 pb-16">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">
            Our solutions
          </h2>
          <p className="mb-6 max-w-2xl text-sm text-slate-300 md:text-base">
            Four ways we put objective data behind your decisions.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <BenefitCard
              title="Return-to-Play Testing"
              body="Objective benchmarks to guide rehab and confirm an athlete is truly ready to return, not just healed."
            />
            <BenefitCard
              title="Performance Testing"
              body="Track strength, power and speed in fit athletes, and benchmark against their own best and their sport."
            />
            <BenefitCard
              title="Pre-Injury Screening"
              body="Identify asymmetry and capacity gaps before they become an injury, at the individual or squad level."
            />
            <BenefitCard
              title="GPS Hire"
              body="Hire athlete-tracking GPS units to capture running load, speed and distance in training and competition, bringing on-field data into the same picture."
            />
          </div>
          <div className="mt-8 text-center">
            <a href={MAIL_ENQUIRY} className={btnPrimary}>
              Get in touch
            </a>
          </div>
        </section>

        {/* Benefit blocks */}
        <section className="scroll-mt-24 py-16">
          <div className="grid gap-4 sm:grid-cols-2">
            <BenefitCard
              title="Objective, not guesswork"
              body="Every test is quantified — strength, power, jump, sprint, change-of-direction and asymmetry. Limb Symmetry Index and performance bands flag risk at a glance, so decisions rest on data, not feel."
            />
            <BenefitCard
              title="Comprehensive, objective measurement"
              body="We assess strength, power, acceleration, deceleration and change of direction on world-class testing equipment — including force plates and dynamometry — capturing the full picture in one place."
            />
            <BenefitCard
              title="Track the whole journey"
              body="Longitudinal trends follow each athlete — from injury back to play, and beyond into performance. Progress session over session, across every metric that matters."
            />
            <BenefitCard
              title="Reports that drive decisions"
              body="Clear, automated PDF reports — ready to share with athletes, coaches and referring clinicians. Findings up front, detail behind it."
            />
          </div>
        </section>

        {/* 4 — Who it's for */}
        <section id="who" className="scroll-mt-24 pb-16">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">
            Who it&apos;s for
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <WhoPathCard
              title="For clinicians & S&C coaches"
              body="Refer an athlete for a full testing battery, or test in your own facility and monitor the data in Fit2Perform. Objective benchmarks, asymmetry analysis and shareable reports."
              href={MAIL_BOOK}
              cta="Book a testing session"
            />
            <WhoPathCard
              title="For athletes"
              body="Understand where you stand. See your strength, power and symmetry tracked over time — working back from injury or chasing a new level."
              href="#testing"
              cta="How testing works"
            />
          </div>
        </section>

        {/* 5 — Female athletes */}
        <section className="scroll-mt-24 pb-16">
          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-6 shadow-xl shadow-lime-400/10 md:p-8">
            <h2 className="mb-3 text-xl font-semibold text-slate-100 md:text-2xl">
              Built for the whole roster.
            </h2>
            <p className="max-w-3xl text-sm text-slate-300 md:text-base">
              Return-to-play and performance testing has historically been calibrated to
              male athletes. Fit2Perform brings genuine experience across female sport —
              including AFLW, elite netball and women&apos;s cricket — and a commitment to
              benchmarks that reflect the athlete in front of you.
            </p>
          </div>
        </section>

        {/* What every assessment covers */}
        <section id="testing" className="scroll-mt-24 pb-16">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">
            What every assessment covers
          </h2>
          <p className="mb-6 max-w-2xl text-sm text-slate-300 md:text-base">
            A complete picture, in one session.
          </p>
          <ul className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-5 md:p-6">
            {ASSESSMENT_COVERAGE.map((item) => (
              <CheckListItem key={item}>{item}</CheckListItem>
            ))}
          </ul>
        </section>

        {/* Injuries we help you manage */}
        <section className="scroll-mt-24 pb-16">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">
            Built for the injuries that matter
          </h2>
          <p className="mb-6 max-w-2xl text-sm text-slate-300 md:text-base">
            Our testing supports return-to-play and risk monitoring across the lower-limb
            injuries that most affect athletes:
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INJURY_AREAS.map((item) => (
              <li
                key={item}
                className="flex gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400"
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 7 — Product proof */}
        <section id="product-proof" className="scroll-mt-24 pb-16">
          <h2 className="mb-2 text-xl font-semibold text-slate-100 md:text-2xl">
            From raw test to clear decision.
          </h2>
          <p className="mb-6 text-sm text-slate-400">
            De-identified examples of what clinicians and athletes receive after every
            session.
          </p>
          {/* TODO: replace with de-identified athlete report PDF, trend chart, L/R asymmetry screenshots */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PlaceholderVisual
              label="Athlete report PDF"
              detail="De-identified sample report — findings summary"
              aspect="4/3"
            />
            <PlaceholderVisual
              label="Longitudinal trend chart"
              detail="De-identified session-over-session metric trends"
              aspect="4/3"
            />
            <PlaceholderVisual
              label="L/R asymmetry view"
              detail="De-identified limb symmetry index visualisation"
              aspect="4/3"
              className="sm:col-span-2 lg:col-span-1"
            />
          </div>
          <div className="mt-6 flex flex-col items-center gap-4">
            <a href="#product-proof" className={btnSecondary}>
              See a full sample report
            </a>
            <a href={MAIL_BOOK} className={btnPrimary}>
              Book a testing session
            </a>
          </div>
        </section>

        {/* 8 — Evidence */}
        <section className="scroll-mt-24 pb-16">
          <h2 className="mb-3 text-xl font-semibold text-slate-100 md:text-2xl">
            Grounded in the evidence.
          </h2>
          <p className="mb-4 max-w-3xl text-sm text-slate-300 md:text-base">
            Every protocol in Fit2Perform is built on established return-to-play and
            performance literature and validated testing methods — the same equipment and
            benchmarks used by leading high-performance programs.
          </p>
          <Link href="/research" className="text-sm font-semibold text-lime-400 hover:text-lime-300">
            Read the evidence →
          </Link>
        </section>

        {/* 9 — Final CTA */}
        <section id="contact" className="scroll-mt-24 pb-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-lime-400/50 bg-gradient-to-r from-lime-400/20 to-emerald-500/10 px-5 py-6 shadow-xl shadow-lime-400/10 md:px-8 md:py-8">
            <h2 className="text-lg font-semibold text-slate-100 md:text-xl">
              Make your next decision with confidence — from return to play to peak
              performance.
            </h2>
            <div>
              <a href={MAIL_BOOK} className={btnPrimary}>
                Book a testing session
              </a>
            </div>
            <p className="text-xs text-slate-200/80">
              Questions?{" "}
              <a
                href="mailto:info@fit2play.com.au"
                className="font-semibold text-lime-200 hover:text-lime-100"
              >
                info@fit2play.com.au
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-slate-500 md:flex-row">
          <Link href="/" className="opacity-90 hover:opacity-100">
            <Image
              src="/fit2play_logo_transparent.png"
              alt="Fit2Perform"
              width={160}
              height={64}
              className="max-h-8 w-auto"
            />
          </Link>
          <p>© {new Date().getFullYear()} Fit2Perform</p>
          <a href="mailto:info@fit2play.com.au" className="hover:text-lime-400">
            info@fit2play.com.au
          </a>
        </div>
      </footer>
    </div>
  );
}

function ClubLogo({ name, file }: { name: string; file: string }) {
  const [useFallback, setUseFallback] = useState(false);

  return (
    <div className="flex h-20 w-36 items-center justify-center rounded-2xl bg-white px-5 py-3 shadow-sm">
      {useFallback ? (
        <span className="text-center text-[0.65rem] font-semibold leading-tight text-slate-700">
          {name}
        </span>
      ) : (
        <Image
          src={`/logos/${file}`}
          alt={name}
          width={144}
          height={80}
          unoptimized
          className="max-h-full max-w-full object-contain"
          onError={() => setUseFallback(true)}
        />
      )}
    </div>
  );
}

function BenefitCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-700 bg-slate-950/70 p-5 shadow-xl shadow-lime-400/10">
      <h3 className="mb-2 text-base font-semibold text-slate-100 md:text-lg">{title}</h3>
      <p className="text-xs text-slate-300 md:text-sm">{body}</p>
    </div>
  );
}

function WhoPathCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-700 bg-slate-900/60 p-5 md:p-6">
      <h3 className="mb-2 text-base font-semibold text-slate-100 md:text-lg">{title}</h3>
      <p className="flex-1 text-xs text-slate-300 md:text-sm">{body}</p>
      <a href={href} className="mt-4 text-xs font-semibold text-lime-400 hover:text-lime-300 md:text-sm">
        {cta} →
      </a>
    </div>
  );
}

function CheckListItem({ children }: { children: string }) {
  return (
    <li className="flex gap-2 text-sm text-slate-300">
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400"
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

function PlaceholderVisual({
  label,
  detail,
  aspect = "16/10",
  className = "",
}: {
  label: string;
  detail: string;
  aspect?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600 bg-slate-950/80 p-6 text-center ${className}`}
      style={{ aspectRatio: aspect }}
      role="img"
      aria-label={`${label} — placeholder`}
    >
      <span className="mb-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-300">
        Placeholder
      </span>
      <p className="mt-2 text-sm font-semibold text-slate-300">{label}</p>
      <p className="mt-1 max-w-[14rem] text-xs text-slate-500">{detail}</p>
    </div>
  );
}
