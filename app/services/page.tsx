import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export default function ServicesPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <SiteNav dark />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        {/* Hero */}
        <section className="pb-14 text-center md:pb-16">
          <h1 className="mx-auto max-w-3xl text-3xl font-semibold leading-tight text-lime-400 md:text-4xl">
            Performance Testing &amp; Return to Sport Assessment
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm text-slate-300 md:text-base">
            Data-driven testing for athletes at every level — from first steps
            back after injury to peak performance benchmarking.
          </p>
          <a
            href="mailto:info@fit2play.com.au?subject=Testing%20session%20booking"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-lime-400 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-md hover:brightness-110"
          >
            Book an Assessment
          </a>
        </section>

        {/* Service cards */}
        <section className="grid gap-6 pb-16 md:grid-cols-2 md:pb-20">
          <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 md:p-8">
            <h2 className="text-lg font-semibold text-lime-400 md:text-xl">
              Return to Sport Testing
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Comprehensive lower limb assessments for athletes rehabilitating
              from injury. Whether it&apos;s a final clearance before return to
              play or milestone checks throughout your rehab journey, our
              gold-standard battery of tests takes the guesswork out of
              return-to-sport decisions.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Injury-specific testing protocols</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Milestone and final clearance assessments</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Strength testing — isometric and dynamic</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Injury-specific jump and landing assessments</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Sprint and change of direction profiling</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Limb symmetry index reporting</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Objective data to support clinical decision-making</span>
              </li>
            </ul>
          </div>

          <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 md:p-8">
            <h2 className="text-lg font-semibold text-lime-400 md:text-xl">
              Performance Assessment
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Identify the physical qualities holding your performance back. Our
              performance assessments give athletes and coaches objective data
              on strength, power, speed, and reactive ability — with clear
              recommendations on where to focus training.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Strength and power profiling</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Jump and reactive strength assessment</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Sprint mechanics and acceleration analysis</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>Longitudinal tracking across the season</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                <span>
                  Individual athlete reporting with benchmarks
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Who we work with */}
        <section className="pb-16 md:pb-20">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-lime-400">
            Who We Work With
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-center">
              <h3 className="text-sm font-semibold text-slate-100">
                Elite &amp; Semi-Elite Athletes
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-slate-400 md:text-sm">
                High-performance programs that need reliable numbers for
                clearance, load management, and progression.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-center">
              <h3 className="text-sm font-semibold text-slate-100">
                Amateur &amp; Community Sport
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-slate-400 md:text-sm">
                Local clubs and motivated athletes who want the same objective
                testing used at the top level.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-center">
              <h3 className="text-sm font-semibold text-slate-100">
                Adolescent Athletes
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-slate-400 md:text-sm">
                Age-appropriate testing to track growth, readiness, and safe
                return after injury.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="pb-16 md:pb-20">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-lime-400">
            How it works
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="relative rounded-xl border border-slate-800 bg-slate-900/50 p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-lime-400">
                Book
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Book your session online or contact us directly
              </p>
            </div>
            <div className="relative rounded-xl border border-slate-800 bg-slate-900/50 p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-lime-400">
                Test
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Complete your assessment using our industry-leading force plate
                and sprint technology
              </p>
            </div>
            <div className="relative rounded-xl border border-slate-800 bg-slate-900/50 p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-lime-400">
                Report
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Receive a detailed report with benchmarks, trends, and
                recommendations
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-lime-400/40 bg-gradient-to-r from-lime-400/15 to-emerald-500/10 px-6 py-8 text-center md:px-10">
          <h2 className="text-lg font-semibold text-slate-50 md:text-xl">
            Ready to get started?
          </h2>
          <a
            href="mailto:info@fit2play.com.au?subject=Testing%20session%20booking"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-lime-400 px-8 py-2.5 text-sm font-semibold text-slate-950 shadow-md hover:brightness-110"
          >
            Book Now
          </a>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
