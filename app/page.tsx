"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

const MAIL_REFER =
  "mailto:info@fit2play.com?subject=Patient%20referral";
const MAIL_BOOK =
  "mailto:info@fit2play.com?subject=Testing%20session%20booking";
const MAIL_TOUCH =
  "mailto:info@fit2play.com?subject=Fit2Play%20enquiry";

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {/* TODO: replace logo with transparent-bg export from Canva — current asset has baked-in dark background */}
          <Image
            src="/logo_full_original.png"
            alt="Fit2Play logo"
            width={200}
            height={80}
            className="max-h-10 w-auto"
            priority
          />
        </Link>

        <nav className="hidden flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm text-slate-300 md:flex md:gap-x-2">
          <a href="#how-it-works" className="hover:text-lime-400">
            How it works
          </a>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
          <a href="#testing" className="hover:text-lime-400">
            Testing
          </a>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
          <a href="#about" className="hover:text-lime-400">
            About
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
          <a
            href={MAIL_BOOK}
            className="ml-2 inline-flex items-center justify-center rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm"
          >
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
            <a href="#how-it-works" className="hover:text-lime-400" onClick={closeMenu}>
              How it works
            </a>
            <a href="#testing" className="hover:text-lime-400" onClick={closeMenu}>
              Testing
            </a>
            <a href="#about" className="hover:text-lime-400" onClick={closeMenu}>
              About
            </a>
            <a href="#contact" className="hover:text-lime-400" onClick={closeMenu}>
              Contact
            </a>
            <Link href="/login" className="hover:text-lime-400" onClick={closeMenu}>
              Login
            </Link>
            <a
              href={MAIL_BOOK}
              className="mt-1 inline-flex w-fit items-center justify-center rounded-full bg-lime-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110"
              onClick={closeMenu}
            >
              Book a testing session
            </a>
          </nav>
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        <section className="grid gap-10 pb-16 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-slate-900/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-300">
              Objective return-to-sport testing
            </p>
            <h1 className="mb-4 text-3xl font-semibold leading-tight text-lime-400 md:text-4xl">
              Know when you&apos;re ready to return to sport.
            </h1>
            <p className="mb-5 max-w-xl text-sm italic text-slate-300 md:text-base">
              Fit2Play gives clinicians, athletes and performance teams an objective, trackable answer to the most important question in rehabilitation — built on the testing standards used in elite sport.
            </p>
            <div className="mb-4 flex flex-wrap gap-3">
              <a
                href={MAIL_REFER}
                className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm"
              >
                Refer a patient
              </a>
              <a
                href={MAIL_BOOK}
                className="inline-flex items-center justify-center rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-lime-400 hover:text-lime-400 md:text-sm"
              >
                Book a testing session
              </a>
            </div>
            <p className="text-[0.72rem] text-slate-400 md:text-xs">
              Objective criteria · Trackable progression · Shared across your medical team
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 shadow-xl shadow-lime-400/20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">What we track</p>
                <p className="text-sm font-semibold text-slate-50">Return-to-sport dashboard</p>
              </div>
              <span className="rounded-full bg-lime-400/10 px-2 py-1 text-[0.68rem] font-semibold text-lime-300">Fit2Play</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <CapabilityCard
                label="Speed &amp; power"
                detail="Peak speed, force and acceleration across sport-specific distances"
              />
              <CapabilityCard
                label="Jump testing"
                detail="CMJ, drop jump — height, RSI, contact time"
              />
              <CapabilityCard
                label="Symmetry"
                detail="Braking and propulsive impulse, limb symmetry index"
              />
            </div>
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-3 text-[0.75rem] text-slate-300">
              <p className="mb-1 text-[0.65rem] uppercase tracking-widest text-slate-400">Trend tracking</p>
              <p>Every session is stored against the athlete and test type — so you can track change over time and measure readiness against objective thresholds.</p>
            </div>
          </div>
        </section>

        <section className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] border-y border-slate-800 bg-slate-900/40 py-4">
          {/* TODO: replace with logo row when assets available */}
          <p className="mx-auto max-w-5xl px-4 text-center text-xs text-slate-400">
            Used in elite and community sport — Fremantle Football Club (AFLW) · Western Australia Cricket · East Vic Park Physiotherapy
          </p>
        </section>

        <section id="who" className="scroll-mt-24 pb-16 pt-16">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">Who it&apos;s for</h2>
          <h3 className="mb-6 text-xl font-semibold text-slate-50 md:text-2xl">
            Built for the whole return-to-sport team.
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <WhoForCard
              title="For referring clinicians"
              body="Send your patient for an objective return-to-sport assessment and receive a clear, shareable report with benchmarked outcomes your MDT can act on. No more relying on self-report or time-since-injury alone."
              href={MAIL_REFER}
              linkText="Refer a patient →"
            />
            <WhoForCard
              title="For athletes & patients"
              body={`Understand exactly where you are in your recovery. See measurable progress, and know with confidence when it's genuinely safe to return to training and competition.`}
              href={MAIL_BOOK}
              linkText="Book a testing session →"
            />
            <WhoForCard
              title="For physios & S&C coaches"
              body="A single dashboard for all your return-to-sport testing — built by clinicians working in elite sport. Spend your time with the athlete, not with spreadsheets."
              href={MAIL_TOUCH}
              linkText="Get in touch →"
            />
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 pb-16">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <StepCard
              step="1"
              title="Get tested"
              body="A comprehensive sport-specific battery covering speed, power, strength, jump mechanics, symmetry and functional performance — run in a single session at our facility."
            />
            <StepCard
              step="2"
              title="Track progression"
              body="Every result is compared to evidence-based thresholds and tracked over time, so progress is visible and decisions are driven by data."
            />
            <StepCard
              step="3"
              title="Return with confidence"
              body="Objective criteria replace guesswork. Athlete, clinician and MDT share the same language and the same evidence for every return-to-sport decision."
            />
          </div>
        </section>

        <section id="testing" className="scroll-mt-24 pb-16">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">What we test</h2>
          <h3 className="mb-6 text-xl font-semibold text-slate-50 md:text-2xl">
            A complete return-to-sport testing battery.
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <BatteryCard
              title="Speed & acceleration"
              body="10m, 20m and 40m sprint testing with split times and force–velocity profiling to identify specific speed-development needs."
            />
            <BatteryCard
              title="Change of direction"
              body="5-10-5 agility testing with left/right asymmetry tracking to benchmark cutting and deceleration performance."
            />
            <BatteryCard
              title="Jump & landing"
              body="Countermovement jump, drop jump and single-leg testing with force-plate derived metrics — jump height, RSI, contact time, braking and propulsive impulse."
            />
            <BatteryCard
              title="Strength & symmetry"
              body="Isometric and handheld dynamometry testing of key lower-limb and trunk muscle groups, with limb symmetry tracking across time."
            />
            <BatteryCard
              title="Functional hop battery"
              body="Standard hop tests (single, triple, crossover, timed) for late-stage return-to-sport decision-making."
            />
          </div>
          <p className="mt-6 text-center text-[0.72rem] text-slate-500 md:text-xs">
            Testing is performed using force plates, sprint timing systems and calibrated dynamometry widely used in elite professional sport.
          </p>
        </section>

        <section id="report" className="scroll-mt-24 pb-16">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">In the report</h2>
          <h3 className="mb-6 text-xl font-semibold text-slate-50 md:text-2xl">
            Reports built to be shared.
          </h3>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-start">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
              <p className="mb-2 text-xs font-semibold text-slate-300">What&apos;s in every report</p>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Sport-specific benchmarks (Elite / Good / Fair / Poor)</li>
                <li>• Trend lines for every metric across the rehabilitation journey</li>
                <li>• Limb symmetry and asymmetry flags</li>
                <li>• Plain-English summary for the athlete</li>
                <li>• Clinical summary for the referring team</li>
              </ul>
            </div>
            <div className="text-xs text-slate-400 md:text-sm">
              <p>
                Athletes understand their progress, coaches see the numbers that matter, and referring clinicians receive a document they can file confidently. Every test, threshold and visual has been designed in an elite-sport clinical setting.
              </p>
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 pb-16">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">About</h2>
          <h3 className="mb-4 text-xl font-semibold text-slate-50 md:text-2xl">
            Built by a clinician working in elite sport.
          </h3>
          <p className="max-w-3xl text-sm text-slate-300 md:text-base">
            Fit2Play is built and led by Brett Fletcher — consulting physiotherapist to Fremantle Football Club (AFLW), Western Australia Cricket, and principal physiotherapist at East Vic Park Physiotherapy. Every test, threshold and report has been developed in active elite and community clinical practice.
          </p>
        </section>

        <section id="contact" className="scroll-mt-24 pb-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-lime-400/50 bg-gradient-to-r from-lime-400/20 to-emerald-500/10 px-5 py-6 text-sm text-slate-50 md:px-6">
            <h3 className="text-lg font-semibold md:text-xl">
              Take the guesswork out of return-to-sport.
            </h3>
            <p className="text-xs text-slate-200/90 md:text-sm">
              Refer a patient, book a testing session, or talk to us about using Fit2Play in your clinic.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={MAIL_REFER}
                className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm"
              >
                Refer a patient
              </a>
              <a
                href={MAIL_BOOK}
                className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-950/40 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-lime-400 hover:text-lime-400 md:text-sm"
              >
                Book a testing session
              </a>
            </div>
            <p className="text-xs text-slate-200/80">
              Questions?{" "}
              <a href="mailto:info@fit2play.com" className="font-semibold text-lime-200 hover:text-lime-100">
                info@fit2play.com
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-slate-500 md:flex-row">
          <Link href="/" className="opacity-90 hover:opacity-100">
            <Image
              src="/logo_full_original.png"
              alt="Fit2Play"
              width={160}
              height={64}
              className="max-h-8 w-auto"
            />
          </Link>
          <p>© {new Date().getFullYear()} Fit2Play</p>
          <a href="mailto:info@fit2play.com" className="hover:text-lime-400">
            info@fit2play.com
          </a>
        </div>
      </footer>
    </div>
  );
}

function CapabilityCard({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-[0.76rem]">
      <p className="mb-1 font-semibold text-lime-300" dangerouslySetInnerHTML={{ __html: label }} />
      <p className="leading-snug text-slate-400">{detail}</p>
    </div>
  );
}

function BatteryCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
      <h3 className="mb-2 text-sm font-semibold text-lime-300 md:text-base">{title}</h3>
      <p className="text-xs text-slate-300 md:text-[0.86rem]">{body}</p>
    </div>
  );
}

function StepCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
      <div className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-lime-400/20 text-[0.75rem] font-semibold text-lime-400">{step}</div>
      <h3 className="mb-1 text-sm font-semibold md:text-base">{title}</h3>
      <p className="text-xs text-slate-300 md:text-[0.86rem]">{body}</p>
    </div>
  );
}

function WhoForCard({
  title,
  body,
  href,
  linkText,
}: {
  title: string;
  body: string;
  href: string;
  linkText: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
      <h3 className="mb-2 text-sm font-semibold md:text-base">{title}</h3>
      <p className="flex-1 text-xs text-slate-300 md:text-[0.86rem]">{body}</p>
      <a href={href} className="mt-4 text-xs font-semibold text-lime-400 hover:text-lime-300">
        {linkText}
      </a>
    </div>
  );
}
