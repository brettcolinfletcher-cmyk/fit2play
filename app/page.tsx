// src/app/page.tsx
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      {/* HEADER */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-[0.18em]"
        >
          <Image
            src="/fit2play_logo_transparent.png"
            alt="Fit2Play logo"
            width={280}
            height={120}
            className="h-16 w-auto md:h-20"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-slate-300 md:flex">
          <a href="#how" className="hover:text-lime-400">
            How it works
          </a>
          <a href="#services" className="hover:text-lime-400">
            Testing
          </a>
          <a href="#dashboard" className="hover:text-lime-400">
            Dashboard
          </a>
          <a
            href="#contact"
            className="rounded-full border border-slate-600 px-3 py-1 hover:border-lime-400 hover:text-lime-400"
          >
            Contact
          </a>
          <Link
            href="/dashboard"
            className="rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110"
          >
            Login
          </Link>
        </nav>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        {/* HERO */}
        <section className="grid gap-10 pb-16 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:items-center">
          {/* Text side */}
          <div>
            <p className="mb-3 inline-flex rounded-full bg-slate-900/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-300">
              Return-to-sport intelligence
            </p>

            <h1 className="mb-4 text-3xl font-semibold leading-tight text-lime-400 md:text-4xl">
              Data-driven return-to-sport testing for athletes &amp; everyday
              individuals.
            </h1>

            <p className="mb-5 max-w-xl text-sm text-slate-300 md:text-base">
              Fit2Play combines 1080 Sprint, Hawkins force plates, Delsys EMG
              and clinical strength testing into one simple performance
              dashboard – built for physios, S&amp;C coaches and sports
              physicians.
            </p>

            <div className="mb-4 flex flex-wrap gap-3">
              <a
                href="#contact"
                className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm"
              >
                Book a testing session
              </a>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-lime-400 hover:text-lime-400 md:text-sm"
              >
                View sample dashboard
              </Link>
            </div>

            <div className="flex flex-wrap gap-6 text-[0.72rem] text-slate-400 md:text-xs">
              <span>Objective RTS criteria · No more guesswork.</span>
              <span>1080 • Force plates • EMG • Clinical strength.</span>
            </div>
          </div>

          {/* Dashboard preview */}
          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 shadow-xl shadow-lime-400/20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">
                  Sample session
                </p>
                <p className="text-sm font-semibold text-slate-50">
                  1080 Sprint – Return to play
                </p>
              </div>
              <span className="rounded-full bg-lime-400/10 px-2 py-1 text-[0.68rem] font-semibold text-lime-300">
                Fit2Play
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Peak speed"
                value="8.54 m/s"
                tag="Above pre-injury"
              />
              <MetricCard
                label="Peak power"
                value="1481 W"
                tag="+7.3% vs last test"
              />
              <MetricCard
                label="Peak force"
                value="354 N"
                tag="Symmetry 98%"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-[0.7rem] text-slate-300">
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-center">
                <p className="text-[0.65rem] text-slate-400">5m split</p>
                <p className="text-sm font-semibold text-lime-300">1.50 s</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-center">
                <p className="text-[0.65rem] text-slate-400">10m split</p>
                <p className="text-sm font-semibold text-lime-300">2.30 s</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-center">
                <p className="text-[0.65rem] text-slate-400">20m split</p>
                <p className="text-sm font-semibold text-lime-300">3.60 s</p>
              </div>
            </div>

            <p className="mt-3 text-[0.7rem] text-slate-400">
              Sessions are standardised so you can track objective RTS criteria
              over time and across tests.
            </p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="pb-16">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">
            How it works
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <StepCard
              step="1"
              title="Capture high-quality data"
              body="Run 1080 Sprint, force plate, EMG and clinical strength tests using your existing hardware."
            />
            <StepCard
              step="2"
              title="Upload &amp; standardise"
              body="Upload CSVs or raw outputs. Fit2Play cleans, labels and stores each metric against a session."
            />
            <StepCard
              step="3"
              title="Make confident decisions"
              body="Use clear dashboards and trends to justify return-to-sport decisions and track readiness."
            />
          </div>
        </section>

        {/* TESTING / SERVICES */}
        <section id="services" className="pb-16">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">
            Testing battery
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              pill="Speed &amp; power"
              title="1080 Sprint"
              body="Objective horizontal force–velocity profiling, acceleration and max-speed metrics for field and court sports."
            />
            <FeatureCard
              pill="Strength &amp; asymmetry"
              title="Hawkins force plates"
              body="Isometric and dynamic force tests with asymmetry tracking and simple green-amber-red thresholds."
            />
            <FeatureCard
              pill="Muscle recruitment"
              title="Delsys EMG + clinical"
              body="Pair EMG with manual and dynamometry testing to build a complete picture of neuromuscular readiness."
            />
          </div>
        </section>

        {/* DASHBOARD SECTION */}
        <section id="dashboard" className="pb-16">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">
            Performance dashboard
          </h2>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
              <p className="mb-2 text-xs font-semibold text-slate-300">
                What you see
              </p>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Sessions grouped by athlete, injury and test type.</li>
                <li>• Trend lines for key RTS metrics over time.</li>
                <li>• Simple traffic-light flags for risk and readiness.</li>
                <li>• Exportable reports for athletes, coaches and insurers.</li>
              </ul>
            </div>

            <div className="text-xs text-slate-400 md:text-sm">
              <p className="mb-2">
                The Fit2Play dashboard is designed for busy clinics and high
                performance programs – fast to use, easy to explain and
                shareable with your broader team.
              </p>
              <p>
                We&apos;ll work with you to design the testing battery, metrics
                and reporting templates that match your sport, level and
                caseload.
              </p>
            </div>
          </div>
        </section>

        {/* CONTACT CTA */}
        <section id="contact">
          <div className="flex flex-col gap-4 rounded-2xl border border-lime-400/50 bg-gradient-to-r from-lime-400/20 to-emerald-500/10 px-5 py-4 text-sm text-slate-50 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">
                Ready to build your return-to-sport testing lab?
              </p>
              <p className="text-xs text-slate-200/80 md:text-sm">
                Book a discovery call to plan your testing battery, reporting
                templates and dashboard requirements.
              </p>
            </div>
            <a
              href="mailto:info@fit2play.com"
              className="inline-flex items-center justify-center rounded-full bg-slate-950/90 px-4 py-2 text-xs font-semibold text-lime-400 ring-1 ring-lime-400 hover:bg-slate-900"
            >
              Email info@fit2play.com
            </a>
          </div>
          {/* Mobile nav fallback */}
          <nav className="mt-6 flex justify-center gap-4 text-xs text-slate-400 md:hidden">
            <a href="#how" className="hover:text-lime-400">
              How it works
            </a>
            <a href="#services" className="hover:text-lime-400">
              Testing
            </a>
            <a href="#dashboard" className="hover:text-lime-400">
              Dashboard
            </a>
          </nav>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ label, value, tag }: any) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-[0.76rem]">
      <p className="mb-0.5 text-slate-300/90">{label}</p>
      <p className="text-[0.9rem] font-semibold text-lime-300">{value}</p>
      <span className="mt-1 inline-flex rounded-full bg-lime-400/15 px-2 py-0.5 text-[0.68rem] text-lime-400">
        {tag}
      </span>
    </div>
  );
}

function FeatureCard({ pill, title, body }: any) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
      <span className="mb-3 inline-flex w-fit rounded-full bg-lime-400/15 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-lime-400">
        {pill}
      </span>
      <h3 className="mb-1 text-sm font-semibold md:text-base">{title}</h3>
      <p className="text-xs text-slate-300 md:text-[0.86rem]">{body}</p>
    </div>
  );
}

function StepCard({ step, title, body }: any) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
      <div className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-lime-400/20 text-[0.75rem] font-semibold text-lime-400">
        {step}
      </div>
      <h3 className="mb-1 text-sm font-semibold md:text-base">{title}</h3>
      <p className="text-xs text-slate-300 md:text-[0.86rem]">{body}</p>
    </div>
  );
}