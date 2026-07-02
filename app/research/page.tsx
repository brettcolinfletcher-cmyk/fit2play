import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Research — Fit2Play",
  description:
    "The evidence behind Fit2Play — validated testing methods and return-to-play literature.",
};

type Article = {
  author: string;
  year: string;
  title: string;
  file: string;
};

type Category = {
  label: string;
  articles: Article[];
};

const CATEGORIES: Category[] = [
  {
    label: "Return to Sport & Rehabilitation",
    articles: [
      {
        author: "Kotsifaki et al.",
        year: "2021",
        title: "Single leg vertical jump performance identifies knee function deficits at return to sport after ACL reconstruction in male athletes",
        file: "Kotsifaki (2021) - Single leg vertical jump performance identifies knee function deficits at return to sport after ACL reconstruction in male athletes.pdf",
      },
      {
        author: "Wolfe et al.",
        year: "2023",
        title: "The Deceleration Index: Is it the Missing Link in Rehabilitation?",
        file: "Wolfe (2023) - The Deceleration Index - Is it the Missing Link in Rehabilitation.pdf",
      },
      {
        author: "Palmieri et al.",
        year: "2004",
        title: "Arthrogenic muscle response induced by an experimental knee joint effusion is mediated by pre- and post-synaptic spinal mechanisms",
        file: "Palmieri (2004) - Arthrogenic muscle response induced by an experimental knee joint effusion is mediated by pre- and post-synaptic spinal mechanisms.pdf",
      },
    ],
  },
  {
    label: "Sprint, Speed & Change of Direction",
    articles: [
      {
        author: "Buchheit & Eriksrud",
        year: "2024",
        title: "Maximal locomotor function in elite football",
        file: "Buchheit, Eriksrud (2024) - Maximal locomotor function in elite football.pdf",
      },
      {
        author: "Baena-Raya et al.",
        year: "2024",
        title: "Effects of Light Versus Very Heavy Resisted Sprint Training on Multidirectional Speed in Semi-professional Soccer Players",
        file: "Baena-Raya (2024) - Effects of Light Versus Very Heavy Resisted Sprint Training on Multidirectional Speed in Semi-professional Soccer Players.pdf",
      },
      {
        author: "Clarke et al.",
        year: "2022",
        title: "The Deceleration Deficit: A Novel Field-Based Method to Quantify Deceleration During Change of Direction Performance",
        file: "Clarke (2022) - The Deceleration Deficit_ A Novel Field-Based Method to Quantify Deceleration During Change of Direction Performance.pdf",
      },
      {
        author: "Westheim et al.",
        year: "2023",
        title: "Reliability of phase-specific outcome measurements in change-of-direction tests using a motorized resistance device",
        file: "Westheim (2023) - Reliability of phase-specific outcome measurements in change-of-direction tests using a motorized resistance device.pdf",
      },
      {
        author: "Rakovic et al.",
        year: "2022",
        title: "Validity and reliability of a motorized sprint resistance device",
        file: "Rakovic (2022) - Validity and reliability of a motorized sprint resistance device.pdf",
      },
      {
        author: "Stewart et al.",
        year: "2014",
        title: "Reliability, factorial validity, and interrelationships of five commonly used change of direction speed tests",
        file: "Stewart (2014) - Reliability, factorial validity, and interrelationships of five commonly used change of direction speed tests.pdf",
      },
      {
        author: "Hamner et al.",
        year: "2013",
        title: "Muscle contributions to fore-aft and vertical body mass center accelerations over a range of running speeds",
        file: "Hamner (2013) - Muscle contributions to fore-aft and vertical body mass center accelerations over a range of running speeds.pdf",
      },
    ],
  },
  {
    label: "Lower Limb Strength & Power",
    articles: [
      {
        author: "",
        year: "",
        title: "Relationships between Lower Limb Muscle Characteristics and Force–Velocity Profiles Derived during Sprinting and Jumping",
        file: "Relationships between Lower Limb Muscle Characteristics and Force–Velocity Profiles Derived during Sprinting and Jumping.pdf",
      },
    ],
  },
  {
    label: "Surface EMG",
    articles: [
      {
        author: "Macchi et al.",
        year: "2025",
        title: "Effects of Resistance and Speed on EMG activity of Thigh muscles in Elite Athletes Throughout Resisted Sprint Running",
        file: "Macchi (2025) - Effects of Resistance and Speed on EMG activity of Thigh muscles in Elite Athletes Throughout Resisted Sprint Running.pdf",
      },
      {
        author: "McManus et al.",
        year: "2020",
        title: "Analysis and Biophysics of Surface EMG for Physiotherapists and Kinesiologists: Toward a Common Language With Rehabilitation Engineers",
        file: "McManus (2020) - Analysis and Biophysics of Surface EMG for Physiotherapists and Kinesiologists Toward a Common Language With Rehabilitation Engineers.pdf",
      },
      {
        author: "Campanini et al.",
        year: "2020",
        title: "Surface EMG in Clinical Assessment and Neurorehabilitation: Barriers Limiting Its Use",
        file: "Campanini (2020) - Surface EMG in Clinical Assessment and Neurorehabilitation - Barriers Limiting Its Use.pdf",
      },
      {
        author: "Suydam et al.",
        year: "2017",
        title: "The Advantages of Normalizing Electromyography to Ballistic rather than isometric or isotonic tasks",
        file: "Suydam (2017) - The Advantages of Normalizing Electromyography to Ballistic rather than isometric or isotonic tasks.pdf",
      },
      {
        author: "Vigotsky et al.",
        year: "2018",
        title: "Interpreting signal amplitudes in surface electromyography studies in sport and rehabilitation sciences",
        file: "2018 Vigotsky - interpreting sEMG.pdf",
      },
    ],
  },
];

export default function ResearchPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-900">
      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        {/* Hero */}
        <section className="pb-12">
          <p className="mb-3 inline-flex rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-lime-700">
            Research
          </p>
          <h1 className="mb-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
            Grounded in the evidence.
          </h1>
          <p className="max-w-3xl text-sm text-slate-600 md:text-base">
            Every protocol in Fit2Play is built on established return-to-play and
            performance literature and validated testing methods — the same equipment and
            benchmarks used by leading high-performance programs.
          </p>
        </section>

        {/* Article library */}
        <section className="space-y-8">
          {CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-lime-600">
                {cat.label}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {cat.articles.map((article, i) => (
                  <a
                    key={article.file}
                    href={`/Research/${encodeURIComponent(article.file)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-lime-50 ${
                      i < cat.articles.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                  >
                    {/* PDF icon */}
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[0.6rem] font-bold uppercase tracking-wider text-red-500">
                      PDF
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-slate-900">
                        {article.title}
                      </p>
                      {(article.author || article.year) && (
                        <p className="mt-1 text-xs text-slate-400">
                          {[article.author, article.year].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    {/* Arrow */}
                    <span className="mt-1 shrink-0 text-slate-300 transition-colors group-hover:text-lime-500">
                      ↗
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
