import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import TeamBioCard from "@/components/TeamBioCard";

export const metadata: Metadata = {
  title: "About — Fit2Perform",
  description:
    "The team behind Fit2Perform — decades of experience across elite and professional sport.",
};

const TEAM = [
  {
    name: "Brett Fletcher",
    role: "Sports & Exercise Physiotherapist",
    bio: [
      "Brett Fletcher is an APA Titled Sports and Exercise Physiotherapist with more than ten years of experience in elite sport across Australian football and cricket. He is the Lead Physiotherapist for WA Cricket\u2019s female programs and has worked with the Fremantle AFLW and Perth Football Club.",
      "Brett has worked with athletes from junior to elite level, across different sports, injury profiles and stages of recovery, helping them return from injury and improve their athletic performance.",
      "Within elite environments, he works closely with coaches, strength and conditioning staff, medical teams and athletes to make return-to-play and availability decisions under the pressure of a competitive season. His approach is centred on understanding each athlete\u2019s injury and individual profile, setting clear and measurable criteria for return, and tracking meaningful change over time.",
      "Brett also supervises registered physiotherapists completing postgraduate sports physiotherapy training at Curtin University, helping develop the next generation of sports physiotherapists.",
      "By combining force plate, sprint and strength testing with clinical reasoning, he provides athletes, parents, coaches and medical professionals with clear information to guide rehabilitation and training, identify deficits early, support a confident return from injury and improve athletic performance.",
    ],
  },
  {
    name: "Emidio Pacecca",
    role: "High Performance Practitioner",
    bio: [
      "Emidio Pacecca is an internationally experienced high-performance practitioner who has worked across Olympic sport, AFL, NFL, rugby and European soccer, supporting athletes, teams and performance programmes in demanding competitive environments.",
      "His expertise spans performance testing, athlete monitoring, injury rehabilitation, strength and conditioning, movement analysis, load management and the use of objective data to guide training, recovery and development. Emidio has worked with athletes across different sporting demands, physical profiles and levels of competition.",
      "He has contributed to high-performance environments internationally, collaborating with coaches, medical professionals, performance staff and athletes to translate testing and monitoring data into clear, actionable strategies. His approach is centred on understanding each athlete\u2019s individual profile, tracking meaningful change over time and helping athletes build the physical qualities required to perform consistently while managing athlete health.",
      "His experience across a variety of sports and countries has provided Emidio with an understanding of the different demands of individual and team sports, including repeated high-intensity efforts, collision, change of direction, sprinting, endurance, competition congestion and the need to manage athletes across long seasons and demanding schedules.",
      "By applying the same principles used in elite sport, he can apply practical recommendations in a way that is appropriate to each individual\u2019s current abilities, development, health, rehabilitation needs and sporting goals. By analysing testing and monitoring data he provides athletes, coaches, medical professionals and support teams with clear information to guide training and rehabilitation, recognise potential concerns early and support a healthy, sustainable pathway in sport.",
    ],
  },
  {
    name: "Simon Trinca",
    role: "Physiotherapist",
    bio: [
      "Simon Trinca is an experienced Physiotherapist with a Bachelor of Sports Science and a Bachelor of Physiotherapy. Having competed in professional football himself, Simon brings a unique understanding of the physical and mental demands placed on athletes at all levels.",
      "Over the course of his career, Simon has worked within professional sporting environments as a physiotherapist, while also spending many years in private practice helping clients achieve their health, rehabilitation, and performance goals. He has worked across a broad range of sports, including AFL, rugby, soccer, netball, Brazilian Jiu-Jitsu (BJJ), and CrossFit, giving him valuable insight into the unique physical demands and injury profiles of different athletes and sporting codes.",
      "Simon focuses on the assessment, treatment, and management of musculoskeletal injuries, with a particular passion for facilitating a safe and effective return to sport. His experience in sport has seen him guide athlete training programs, monitor training loads and volumes, and implement evidence based injury management strategies that optimise both performance and long term health.",
      "A strong believer in collaborative care, Simon works closely with coaches, strength and conditioning staff, and other medical professionals to develop clear, measurable goals that support both the individual athlete and the wider team environment. His focus is on ensuring every athlete receives a coordinated approach to their care, rehabilitation, and performance development.",
      "Above all, Simon's primary goal is to support the health and wellbeing of every athlete he works with. Whether helping an elite competitor return to competition or assisting an everyday athlete to stay active and injury free, he is committed to delivering practical, personalised care that enables people to perform at their best.",
    ],
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
            Fit2Perform turns objective testing — force plates, sprint testing and
            dynamometry — into clear, decision-ready insight. It&apos;s built on decades of
            hands-on experience across professional and Olympic sport, from return-to-play
            to peak performance.
          </p>
        </section>

        <section className="pb-16">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-lime-600">
            The team
          </h2>
          <div className="grid items-start gap-4 md:grid-cols-3">
            {TEAM.map((member) => (
              <TeamBioCard key={member.name} name={member.name} role={member.role} bio={member.bio} />
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
