"use client";

import Link from "next/link";

export default function AddTestMenu({ onClose }: { onClose: () => void }) {
  const menu = [
    { label: "1080 Sprint", href: "/dashboard/add-test/1080" },
    { label: "Force Plate (Hawkin)", href: "/dashboard/add-test/forceplate" },
    { label: "EMG Test", href: "/dashboard/add-test/emg" },
    { label: "GPS Test", href: "/dashboard/add-test/gps" },
    { label: "NordBord Test", href: "/dashboard/add-test/nordbord" },
    { label: "Custom Test", href: "/dashboard/add-test/custom" }
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