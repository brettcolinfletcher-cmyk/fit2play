"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import DashboardShowcase from "@/components/DashboardShowcase";
import {
  AsymmetryMiniCard,
  ReportFindingsCard,
  TrendMiniCard,
} from "@/components/ProductProofVisuals";

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
  { label: "ACL & traumatic knee injuries" },
  { label: "Muscle injuries", detail: "hamstring, quadriceps, calf" },
  { label: "Tendon injuries & tendinopathy", detail: "Achilles, patellar, proximal hamstring" },
  { label: "Athletic groin pain" },
  { label: "Ankle injuries" },
  { label: "Bone stress injuries" },
] as const;

const btnPrimary =
  "inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm";
const btnSecondary =
  "inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-lime-500 hover:text-lime-600 md:text-sm";

const CREDIBILITY_CLUBS = [
  { name: "AC Milan / Serie A", file: "serie-a.png" },
  { name: "NFL / New England Patriots", file: "nfl.webp" },
  { name: "Australian Institute of Sport", file: "ais.png" },
  { name: "Carlton FC", file: "carlton.png" },
  { name: "Western Force", file: "western-force.svg" },
  { name: "WA Cricket", file: "waca.svg" },
  { name: "Fremantle Dockers", file: "fremantle.svg" },
  { name: "Perth FC", file: "perth-fc.png" },
  { name: "Perth Scorchers", file: "perth-scorchers.png" },
  { name: "AFLW", file: "aflw.png" },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-900">
      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        {/* 1 — Hero */}
        <section className="grid gap-10 pb-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-lime-50 border border-lime-200 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-700">
              Return-to-play &amp; performance testing
            </p>
            <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
              Know when they&apos;re ready — and how far they can go.
            </h1>
            <p className="mb-5 max-w-xl text-sm text-slate-600 md:text-base">
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

          <DashboardShowcase />
        </section>

        {/* 2 — Credibility strip */}
        <section className="scroll-mt-24 border-y border-slate-200 py-10">
          <h2 className="mb-3 text-xl font-semibold text-slate-900 md:text-2xl">
            Decades inside elite sport.
          </h2>
          <p className="mb-6 max-w-3xl text-sm text-slate-600 md:text-base">
            Fit2Perform is built by people who&apos;ve worked across professional sport —
            from AFL and the NFL to Serie A and Olympic programs — including Carlton FC, the
            New England Patriots, AC Milan, the Australian Institute of Sport, the Western
            Force and WA Cricket. That experience shapes everything we do, from
            return-to-play to peak performance.
          </p>
          <div className="mx-auto grid max-w-3xl grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {CREDIBILITY_CLUBS.map((club) => (
              <ClubLogo key={club.name} name={club.name} file={club.file} />
            ))}
          </div>
        </section>

        {/* Our solutions */}
        <section id="solutions" className="scroll-mt-24 pb-16">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-lime-600">
            Our solutions
          </h2>
          <p className="mb-6 max-w-2xl text-sm text-slate-600 md:text-base">
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
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-lime-600">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="mb-3 text-xl font-semibold text-slate-900 md:text-2xl">
              Built for the whole roster.
            </h2>
            <p className="max-w-3xl text-sm text-slate-600 md:text-base">
              Return-to-play and performance testing has historically been built around
              male athletes. Fit2Perform brings real experience across female sport,
              including AFLW, elite netball and women&apos;s cricket, with benchmarks that
              reflect the athlete in front of you — not a population average.
            </p>
          </div>
        </section>

        {/* What every assessment covers */}
        <section id="testing" className="scroll-mt-24 pb-16">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-lime-600">
            What every assessment covers
          </h2>
          <p className="mb-6 max-w-2xl text-sm text-slate-600 md:text-base">
            A complete picture, in one session.
          </p>
          <ul className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            {ASSESSMENT_COVERAGE.map((item) => (
              <CheckListItem key={item}>{item}</CheckListItem>
            ))}
          </ul>
        </section>

        {/* Injuries / range */}
        <section className="scroll-mt-24 pb-16">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-lime-600">
            From first session to full performance
          </h2>
          <p className="mb-4 max-w-2xl text-sm text-slate-600 md:text-base">
            Fit2Perform isn&apos;t just for injured athletes. Screen a healthy squad before
            problems start, benchmark performance in your best players, or guide a safe
            return — the same objective testing serves all three.
          </p>
          <p className="mb-6 max-w-2xl text-sm text-slate-600 md:text-base">
            And when injury does happen, our testing supports return-to-play across the
            areas that matter most:
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INJURY_AREAS.map((item) => (
              <li
                key={item.label}
                className="flex gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400"
                  aria-hidden
                />
                <span>
                  {item.label}
                  {"detail" in item && item.detail ? (
                    <span className="block text-xs text-slate-400">{item.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8 text-center">
            <a href={MAIL_BOOK} className={btnPrimary}>
              Book a testing session
            </a>
          </div>
        </section>

        {/* 7 — Product proof */}
        <section id="product-proof" className="scroll-mt-24 pb-16">
          <h2 className="mb-2 text-xl font-semibold text-slate-900 md:text-2xl">
            From raw test to clear decision.
          </h2>
          <p className="mb-6 text-sm text-slate-500">
            De-identified examples of what clinicians and athletes receive after every
            session.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ReportFindingsCard />
            <TrendMiniCard />
            <AsymmetryMiniCard className="sm:col-span-2 lg:col-span-1" />
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
          <h2 className="mb-3 text-xl font-semibold text-slate-900 md:text-2xl">
            Grounded in the evidence.
          </h2>
          <p className="mb-4 max-w-3xl text-sm text-slate-600 md:text-base">
            Every protocol in Fit2Perform is built on established return-to-play and
            performance literature and validated testing methods — the same equipment and
            benchmarks used by leading high-performance programs.
          </p>
          <Link href="/research" className="text-sm font-semibold text-lime-600 hover:text-lime-700">
            Read the evidence →
          </Link>
        </section>

        {/* 9 — Final CTA */}
        <section id="contact" className="scroll-mt-24 pb-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-lime-300 bg-gradient-to-r from-lime-50 to-emerald-50 px-5 py-6 shadow-sm md:px-8 md:py-8">
            <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
              Make your next decision with confidence — from return to play to peak
              performance.
            </h2>
            <div>
              <a href={MAIL_BOOK} className={btnPrimary}>
                Book a testing session
              </a>
            </div>
            <p className="text-xs text-slate-600">
              Questions?{" "}
              <a
                href="mailto:info@fit2play.com.au"
                className="font-semibold text-lime-700 hover:text-lime-800"
              >
                info@fit2play.com.au
              </a>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
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
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-2 text-base font-semibold text-slate-900 md:text-lg">{title}</h3>
      <p className="text-xs text-slate-600 md:text-sm">{body}</p>
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
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <h3 className="mb-2 text-base font-semibold text-slate-900 md:text-lg">{title}</h3>
      <p className="flex-1 text-xs text-slate-600 md:text-sm">{body}</p>
      <a href={href} className="mt-4 text-xs font-semibold text-lime-600 hover:text-lime-700 md:text-sm">
        {cta} →
      </a>
    </div>
  );
}

function CheckListItem({ children }: { children: string }) {
  return (
    <li className="flex gap-2 text-sm text-slate-700">
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500"
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}
