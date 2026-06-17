import Link from "next/link";
import Image from "next/image";

// See SiteNav.tsx — domain decision pending; keep in sync with that constant.
const CONTACT_EMAIL = "info@fit2play.com.au";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950/80">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-slate-500 md:flex-row">
        <Link href="/" className="opacity-90 hover:opacity-100">
          <Image
            src="/fit2play_logo_transparent.png"
            alt="Fit2Perform"
            width={160}
            height={64}
            className="max-h-8 w-auto"
          />
        </Link>
        <p>© {new Date().getFullYear()} Fit2Perform</p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-lime-400">
          {CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
}
