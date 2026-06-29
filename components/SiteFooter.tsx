import Link from "next/link";
import Image from "next/image";

// See SiteNav.tsx — domain decision pending; keep in sync with that constant.
const CONTACT_EMAIL = "info@fit2play.com.au";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-slate-500 md:flex-row">
        <Link href="/" className="opacity-90 hover:opacity-100">
          <Image
            src="/fit2play_logo_light.png"
            alt="Fit2Perform"
            width={259}
            height={88}
            className="max-h-8 w-auto"
          />
        </Link>
        <p>© {new Date().getFullYear()} Fit2Perform</p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-lime-600">
          {CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
}
