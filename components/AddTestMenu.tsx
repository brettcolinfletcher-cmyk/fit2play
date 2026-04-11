"use client";

import Link from "next/link";

export default function AddTestMenu({ onClose }: { onClose: () => void }) {
  const menu = [
    { label: "All test types…", href: "/dashboard/add-test" },
    { label: "1080 Sprint", href: "/dashboard/add-test/1080" },
    { label: "Force Plate (Hawkin)", href: "/dashboard/add-test/forceplate" },
    { label: "Handheld Dynamometer", href: "/dashboard/add-test/dynamometer" },
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur p-3 text-xs w-48">
      {menu.map(item => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClose}
          className="block px-2 py-1.5 rounded hover:bg-slate-800 text-slate-200"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}