// app/page.tsx
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-[0.18em]">
          <Image src="/logo_full_original.png" alt="Fit2Play logo" width={280} height={120} className="h-16 w-auto md:h-20" priority />
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-slate-300 md:flex">
          <a href="/#how-it-works" className="hover:text-lime-400">How it works</a>
          <Link href="/services" className="hover:text-lime-400">Services</Link>
          <a href="mailto:info@fit2play.com" className="rounded-full border border-slate-600 px-3 py-1 hover:border-lime-400 hover:text-lime-400">Contact</a>
          <Link href="/login" className="rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110">Login</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        <section className="grid gap-10 pb-16 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-slate-900/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-300">
              Return-to-sport intelligence
            </p>
            <h1 className="mb-4 text-3xl font-semibold leading-tight text-lime-400 md:text-4xl">
              Objective return-to-sport testing for high-performance athletes.
            </h1>
            <p className="mb-5 max-w-xl text-sm text-slate-300 md:text-base">
              Fit2Play brings together 1080 Motion and Hawkins force plate data into one performance dashboard — built for physios and S&amp;C coaches working with athletes at all levels. Whether returning from injury or chasing a performance edge, we give you clear, trackable criteria backed by objective data.
            </p>
            <div className="mb-4 flex flex-wrap gap-3">
              <a href="#contact" className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-md hover:brightness-110 md:text-sm">
                Book a testing session
              </a>
              <Link href="/services" className="inline-flex items-center justify-center rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-lime-400 hover:text-lime-400 md:text-sm">
                View services
              </Link>
            </div>
            <div className="flex flex-wrap gap-6 text-[0.72rem] text-slate-400 md:text-xs">
              <span>Injury rehab · Performance testing · Injury prevention.</span>
              <span>1080 Motion · Hawkins force plates · Clinical strength.</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 shadow-xl shadow-lime-400/20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">What we track</p>
                <p className="text-sm font-semibold text-slate-50">Sprint &amp; jump testing dashboard</p>
              </div>
              <span className="rounded-full bg-lime-400/10 px-2 py-1 text-[0.68rem] font-semibold text-lime-300">Fit2Play</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <CapabilityCard label="Speed &amp; power" detail="Peak speed, force, acceleration via 1080 Motion" />
              <CapabilityCard label="Jump testing" detail="CMJ &amp; drop jump — height, RSI, contact time" />
              <CapabilityCard label="Asymmetry" detail="Braking &amp; propulsive impulse, limb symmetry index" />
            </div>
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-3 text-[0.75rem] text-slate-300">
              <p className="mb-1 text-[0.65rem] uppercase tracking-widest text-slate-400">Trend tracking</p>
              <p>Every session is stored against the athlete and test type — so you can track change over time and measure readiness against objective thresholds.</p>
            </div>
            <p className="mt-3 text-[0.7rem] text-slate-400">Data synced automatically from your devices. CSV upload also supported.</p>
          </div>
        </section>

        <section id="how-it-works" className="pb-16">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <StepCard step="1" title="Test with your existing hardware" body="Run sprint and jump protocols using 1080 Motion and Hawkins force plates. No new equipment required." />
            <StepCard step="2" title="Data syncs automatically" body="Sessions pull directly from your devices via API, or upload CSVs. Fit2Play labels and stores every metric." />
            <StepCard step="3" title="Make confident return-to-sport calls" body="Track key metrics over time, spot asymmetries and use clear trend charts to justify your decisions." />
          </div>
        </section>

        <section id="services" className="pb-16">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">Testing battery</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard pill="Speed &amp; power" title="1080 Motion" body="Horizontal force–velocity profiling, resisted and assisted sprints, change of direction. Synced automatically from your 1080 account." />
            <FeatureCard pill="Jump &amp; strength" title="Hawkins force plates" body="CMJ, drop jump and isometric testing with asymmetry tracking. Jump height, RSI, braking and propulsive impulse over time." />
            <FeatureCard pill="Clinical testing" title="Strength &amp; manual testing" body="Upload results from dynamometry and clinical strength assessments. All data stored against the athlete and session for longitudinal tracking." />
          </div>
        </section>

        <section id="dashboard" className="pb-16">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-lime-300">Performance dashboard</h2>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
              <p className="mb-2 text-xs font-semibold text-slate-300">What you see</p>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Sessions grouped by athlete, injury and test type.</li>
                <li>• Trend lines for key RTS metrics over time.</li>
                <li>• Limb symmetry and asymmetry flags.</li>
                <li>• Exportable reports for athletes, coaches and insurers.</li>
              </ul>
            </div>
            <div className="text-xs text-slate-400 md:text-sm">
              <p className="mb-2">The Fit2Play dashboard is designed for busy clinics and high-performance programs — fast to use, easy to explain and shareable with your broader MDT.</p>
              <p>We&apos;ll work with you to design the testing battery, metrics and reporting templates that match your sport, level and caseload.</p>
            </div>
          </div>
        </section>

        <section id="contact">
          <div className="flex flex-col gap-4 rounded-2xl border border-lime-400/50 bg-gradient-to-r from-lime-400/20 to-emerald-500/10 px-5 py-4 text-sm text-slate-50 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Ready to get started?</p>
              <p className="text-xs text-slate-200/80 md:text-sm">Book directly online, call us, or get in touch via email or referral. We work with athletes at all stages — from injury rehab to elite performance.</p>
            </div>
            <a href="mailto:info@fit2play.com.au" className="inline-flex items-center justify-center rounded-full bg-slate-950/90 px-4 py-2 text-xs font-semibold text-lime-400 ring-1 ring-lime-400 hover:bg-slate-900 whitespace-nowrap">
              info@fit2play.com.au
            </a>
          </div>
          <nav className="mt-6 flex justify-center gap-4 text-xs text-slate-400 md:hidden">
            <a href="/#how-it-works" className="hover:text-lime-400">How it works</a>
            <Link href="/services" className="hover:text-lime-400">Services</Link>
            <a href="mailto:info@fit2play.com.au" className="hover:text-lime-400">Contact</a>
            <Link href="/login" className="hover:text-lime-400">Login</Link>
          </nav>
        </section>
      </main>
    </div>
  );
}

function CapabilityCard({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-[0.76rem]">
      <p className="mb-1 font-semibold text-lime-300" dangerouslySetInnerHTML={{ __html: label }} />
      <p className="text-slate-400 leading-snug">{detail}</p>
    </div>
  );
}

function FeatureCard({ pill, title, body }: { pill: string; title: string; body: string }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
      <span className="mb-3 inline-flex w-fit rounded-full bg-lime-400/15 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-lime-400" dangerouslySetInnerHTML={{ __html: pill }} />
      <h3 className="mb-1 text-sm font-semibold md:text-base">{title}</h3>
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
