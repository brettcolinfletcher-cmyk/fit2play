"use client";

import { useState } from "react";

type Props = {
  name: string;
  role: string;
  /** One string per paragraph. The first shows by default; the rest open with "Show more". */
  bio: readonly string[];
};

export default function TeamBioCard({ name, role, bio }: Props) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = bio;
  const bioId = `bio-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className="mb-4 flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center"
        role="img"
        aria-label={`${name} photo placeholder`}
      >
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-600">
          Photo
        </span>
      </div>
      <h3 className="text-base font-semibold text-slate-900 md:text-lg">{name}</h3>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-lime-600">{role}</p>
      <div id={bioId} className="space-y-3 text-xs leading-relaxed text-slate-600 md:text-sm">
        <p>{first}</p>
        {open ? rest.map((para) => <p key={para.slice(0, 40)}>{para}</p>) : null}
      </div>
      {rest.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bioId}
          className="mt-3 self-start text-xs font-semibold text-slate-900 underline decoration-lime-400 decoration-2 underline-offset-4 hover:text-lime-700 md:text-sm"
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
