import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Research — Fit2Perform",
  description:
    "The evidence behind Fit2Perform — validated testing methods and return-to-play literature.",
};

type Article = {
  author: string;
  year: string;
  title: string;
  /** Publisher, DOI or PubMed link. Never host publisher PDFs on this site. */
  url: string;
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
        url: "https://doi.org/10.1136/bjsports-2021-104692",
      },
      {
        author: "Wolfe et al.",
        year: "2023",
        title: "The Deceleration Index: Is it the Missing Link in Rehabilitation?",
        url: "https://doi.org/10.26603/001c.73799",
      },
      {
        author: "Palmieri et al.",
        year: "2004",
        title: "Arthrogenic muscle response induced by an experimental knee joint effusion is mediated by pre- and post-synaptic spinal mechanisms",
        url: "https://pubmed.ncbi.nlm.nih.gov/15491837/",
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
        url: "https://doi.org/10.3389/fphys.2024.1376047",
      },
      {
        author: "Baena-Raya et al.",
        year: "2024",
        title: "Effects of Light Versus Very Heavy Resisted Sprint Training on Multidirectional Speed in Semi-professional Soccer Players",
        url: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Effects%20of%20Light%20Versus%20Very%20Heavy%20Resisted%20Sprint%20Training%20on%20Multidirectional%20Speed%20in%20Semi-professional%20Soccer%20Players%22",
      },
      {
        author: "Clarke et al.",
        year: "2022",
        title: "The Deceleration Deficit: A Novel Field-Based Method to Quantify Deceleration During Change of Direction Performance",
        url: "https://pubmed.ncbi.nlm.nih.gov/33044369/",
      },
      {
        author: "Westheim et al.",
        year: "2023",
        title: "Reliability of phase-specific outcome measurements in change-of-direction tests using a motorized resistance device",
        url: "https://doi.org/10.3389/fspor.2023.1212414",
      },
      {
        author: "Rakovic et al.",
        year: "2022",
        title: "Validity and reliability of a motorized sprint resistance device",
        url: "https://pubmed.ncbi.nlm.nih.gov/35916750/",
      },
      {
        author: "Stewart et al.",
        year: "2014",
        title: "Reliability, factorial validity, and interrelationships of five commonly used change of direction speed tests",
        url: "https://doi.org/10.1111/sms.12019",
      },
      {
        author: "Hamner et al.",
        year: "2013",
        title: "Muscle contributions to fore-aft and vertical body mass center accelerations over a range of running speeds",
        url: "https://pubmed.ncbi.nlm.nih.gov/23246045/",
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
        url: "https://doi.org/10.1249/MSS.0000000000002605",
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
        url: "https://pubmed.ncbi.nlm.nih.gov/?term=%22Effects%20of%20Resistance%20and%20Speed%20on%20Electromyographic%20Activity%20of%20Thigh%20and%20Gluteal%20Muscles%20in%20Elite%20Athletes%20Throughout%20Resisted%20Sprint%20Running%22",
      },
      {
        author: "McManus et al.",
        year: "2020",
        title: "Analysis and Biophysics of Surface EMG for Physiotherapists and Kinesiologists: Toward a Common Language With Rehabilitation Engineers",
        url: "https://doi.org/10.3389/fneur.2020.576729",
      },
      {
        author: "Campanini et al.",
        year: "2020",
        title: "Surface EMG in Clinical Assessment and Neurorehabilitation: Barriers Limiting Its Use",
        url: "https://doi.org/10.3389/fneur.2020.00934",
      },
      {
        author: "Suydam et al.",
        year: "2017",
        title: "The Advantages of Normalizing Electromyography to Ballistic rather than isometric or isotonic tasks",
        url: "https://pubmed.ncbi.nlm.nih.gov/?term=%22The%20Advantages%20of%20Normalizing%20Electromyography%20to%20Ballistic%20rather%20than%20isometric%20or%20isotonic%20tasks%22",
      },
      {
        author: "Vigotsky et al.",
        year: "2018",
        title: "Interpreting signal amplitudes in surface electromyography studies in sport and rehabilitation sciences",
        url: "https://doi.org/10.3389/fphys.2017.00985",
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
            Every protocol in Fit2Perform is built on established return-to-play and
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
                    key={article.url}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-lime-50 ${
                      i < cat.articles.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                  >
                    {/* Link icon */}
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lime-50 text-[0.6rem] font-bold uppercase tracking-wider text-lime-700">
                      Read
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
