import Link from "next/link";
import Image from "next/image";

// Public contact email (decided 1 Nov 2026). Keep in sync with app/contact, app/privacy, app/page, app/services.
const CONTACT_EMAIL = "info@f2p.au";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-slate-500 md:flex-row">
        <Link href="/" className="opacity-90 hover:opacity-100">
          <Image
            src="/fit2perform_logo_canva.png"
            alt="Fit2Perform"
            width={260}
            height={100}
            className="max-h-8 w-auto"
          />
        </Link>
        <p>
          © {new Date().getFullYear()} Fit2Perform ·{" "}
          <Link href="/privacy" className="hover:text-lime-600">
            Privacy
          </Link>
        </p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-lime-600">
          {CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
}
