import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export default function NotFound() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-900">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-16 text-center">
        <p className="mb-3 text-sm font-semibold text-lime-700">404</p>
        <h1 className="mb-3 text-3xl font-semibold text-slate-900 md:text-4xl">Page not found</h1>
        <p className="mx-auto mb-8 max-w-md text-sm text-slate-600 md:text-base">
          That page doesn&apos;t exist or has moved.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:brightness-110"
          >
            Go to home
          </Link>
          <Link
            href="/book"
            className="inline-flex items-center rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-lime-500 hover:text-lime-600"
          >
            Book an appointment
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
