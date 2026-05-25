"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";

const LR_OPTIONS = ["Left", "Right", "Both"] as const;

export default function NewAthletePage() {
  const router = useRouter();
  const staffOk = useRequireDashboardStaff();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    team: "",
    primary_sport: "",
    height_cm: "",
    weight_kg: "",
    dominant_leg: "",
    dominant_hand: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim() || null,
      team: form.team.trim() || null,
      primary_sport: form.primary_sport.trim() || null,
      notes: form.notes.trim() || null,
      dominant_leg: form.dominant_leg || null,
      dominant_hand: form.dominant_hand || null,
    };

    const h = parseFloat(form.height_cm);
    const w = parseFloat(form.weight_kg);
    if (!Number.isNaN(h)) body.height_cm = h;
    if (!Number.isNaN(w)) body.weight_kg = w;

    const res = await fetch("/api/athletes", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-sync-secret": process.env.NEXT_PUBLIC_SYNC_SECRET ?? "",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to create athlete");
      setSaving(false);
      return;
    }

    router.push("/dashboard/athletes");
  }

  if (!staffOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-xs text-slate-400">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827_0,_#020617_55%)] text-slate-50">
      <DashboardNav />
      <section className="mx-auto max-w-xl px-4 pt-8 pb-20">
        <Link
          href="/dashboard/athletes"
          className="text-xs text-slate-400 hover:text-lime-300"
        >
          ← Back to athletes
        </Link>

        <h1 className="mt-6 text-xl font-semibold tracking-tight">
          New athlete
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm shadow-xl shadow-lime-400/10">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                First name *
              </label>
              <input
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.first_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, first_name: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Last name *
              </label>
              <input
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.last_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, last_name: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Team</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.team}
                onChange={(e) =>
                  setForm((f) => ({ ...f, team: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Primary sport
              </label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.primary_sport}
                onChange={(e) =>
                  setForm((f) => ({ ...f, primary_sport: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Height (cm)
              </label>
              <input
                type="number"
                step="any"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.height_cm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, height_cm: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                step="any"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.weight_kg}
                onChange={(e) =>
                  setForm((f) => ({ ...f, weight_kg: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Dominant leg
              </label>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.dominant_leg}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dominant_leg: e.target.value }))
                }
              >
                <option value="">—</option>
                {LR_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Dominant hand
              </label>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.dominant_hand}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dominant_hand: e.target.value }))
                }
              >
                <option value="">—</option>
                {LR_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>

          {error ? (
            <p className="text-xs text-rose-400">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create athlete"}
          </button>
        </form>
      </section>
    </main>
  );
}
