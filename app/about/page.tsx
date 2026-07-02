import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "About — Fit2Play",
  description:
    "The team behind Fit2Play — decades of experience across elite and professional sport.",
};

const TEAM = [
  {
    name: "Brett Fletcher",
    role: "Founder · Sports & Exercise Physiotherapist",
    bio: "Bio coming soon.",
  },
  {
    name: "Emidio Pacecca",
    role: "Coming soon",
    bio: "Bio coming soon.",
  },
  {
    name: "Simon Trinca",
    role: "Coming soon",
    bio: "Bio coming soon.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-900">
      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        <section className="pb-12">
          <p className="mb-3 inline-flex rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-700">
            About us
          </p>
          <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
            Built by people who&apos;ve worked inside elite sport.
          </h1>
          <p className="max-w-3xl text-sm text-slate-600 md:text-base">
            Fit2Play turns objective testing — force plates, sprint testing and
            dynamometry — into clear, decision-ready insight. It&apos;s built on decades of
            hands-on experience across professional and Olympic sport, from return-to-play
            to peak performance.
          </p>
        </section>

        <section className="pb-16">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-lime-600">
            The team
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {TEAM.map((member) => (
              <div
                key={member.name}
                className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div
                  className="mb-4 flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center"
                  role="img"
                  aria-label={`${member.name} — photo placeholder`}
                >
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-600">
                    Photo
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 md:text-lg">
                  {member.name}
                </h3>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-lime-600">
                  {member.role}
                </p>
                <p className="text-xs text-slate-600 md:text-sm">{member.bio}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
