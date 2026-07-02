import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export default function ServicesPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-900">
      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        {/* Hero */}
        <section className="pb-14 text-center md:pb-16">
          <h1 className="mx-auto max-w-3xl text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
            Performance Testing &amp; Return to Sport Assessment
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm text-slate-600 md:text-base">
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
          <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-lg font-semibold text-lime-600 md:text-xl">
              Return to Sport Testing
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Comprehensive lower limb assessments for athletes rehabilitating
              from injury. Whether it&apos;s a final clearance before return to
              play or milestone checks throughout your rehab journey, our
              gold-standard battery of tests takes the guesswork out of
              return-to-sport decisions.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
              {[
                "Injury-specific testing protocols",
                "Milestone and final clearance assessments",
                "Strength testing — isometric and dynamic",
                "Injury-specific jump and landing assessments",
                "Sprint and change of direction profiling",
                "Limb symmetry index reporting",
                "Objective data to support clinical decision-making",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-lg font-semibold text-lime-600 md:text-xl">
              Performance Assessment
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Identify the physical qualities holding your performance back. Our
              performance assessments give athletes and coaches objective data
              on strength, power, speed, and reactive ability — with clear
              recommendations on where to focus training.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
              {[
                "Strength and power profiling",
                "Jump and reactive strength assessment",
                "Sprint mechanics and acceleration analysis",
                "Longitudinal tracking across the season",
                "Individual athlete reporting with benchmarks",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Who we work with */}
        <section className="pb-16 md:pb-20">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-lime-600">
            Who We Work With
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Elite & Semi-Elite Athletes",
                body: "High-performance programs that need reliable numbers for clearance, load management, and progression.",
              },
              {
                title: "Amateur & Community Sport",
                body: "Local clubs and motivated athletes who want the same objective testing used at the top level.",
              },
              {
                title: "Adolescent Athletes",
                body: "Age-appropriate testing to track growth, readiness, and safe return after injury.",
              },
            ].map(({ title, body }) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-3 text-xs leading-relaxed text-slate-600 md:text-sm">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="pb-16 md:pb-20">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-lime-600">
            How it works
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { step: "Book", body: "Book your session online or contact us directly" },
              { step: "Test", body: "Complete your assessment using our industry-leading force plate and sprint technology" },
              { step: "Report", body: "Receive a detailed report with benchmarks, trends, and recommendations" },
            ].map(({ step, body }) => (
              <div key={step} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-lime-600">{step}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-lime-300 bg-gradient-to-r from-lime-50 to-emerald-50 px-6 py-8 text-center shadow-sm md:px-10">
          <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
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
