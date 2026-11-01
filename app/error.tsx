"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4 text-slate-900">
      <div className="max-w-md text-center">
        <h1 className="mb-3 text-2xl font-semibold">Something went wrong</h1>
        <p className="mb-6 text-sm text-slate-600">
          Sorry, this page hit an error. Try again, and if it keeps happening email info@f2p.au.
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:brightness-110"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-lime-500"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
