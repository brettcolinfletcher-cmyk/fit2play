"use client";

import { useState } from "react";
import AddTestMenu from "./AddTestMenu";

export default function AddTestButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110"
      >
        + Add test
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50">
          <AddTestMenu onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}