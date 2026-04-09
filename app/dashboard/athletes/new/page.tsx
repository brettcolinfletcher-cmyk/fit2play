"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NewAthletePage() {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    organisation: "",
    team: "",
    primary_sport: "",
    email: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: any) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Insert athlete profile
    const { data, error: insertErr } = await supabase
      .from("athletes")
      .insert({
        first_name: form.first_name,
        last_name: form.last_name,
        organisation: form.organisation,
        team: form.team,
        primary_sport: form.primary_sport,
        email: form.email || null,
        notes: form.notes || null,
      })
      .select("id")
      .single();

    if (insertErr || !data) {
      setError(insertErr?.message ?? "Failed to create athlete.");
      setSaving(false);
      return;
    }

    // Redirect to athlete profile
    router.push(`/dashboard/athlete/${data.id}`);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-xl px-6 pt-8 pb-20">
        <button
          onClick={() => router.push("/dashboard/athletes")}
          className="text-xs text-slate-400 hover:text-lime-300 mb-6"
        >
          ← Back to athletes
        </button>

        <h1 className="text-xl font-semibold mb-4">Add New Athlete</h1>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {/* FIRST NAME */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              First name *
            </label>
            <input
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
              value={form.first_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, first_name: e.target.value }))
              }
            />
          </div>

          {/* LAST NAME */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Last name *
            </label>
            <input
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
              value={form.last_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, last_name: e.target.value }))
              }
            />
          </div>

          {/* ORGANISATION */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Organisation
            </label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
              value={form.organisation}
              onChange={(e) =>
                setForm((f) => ({ ...f, organisation: e.target.value }))
              }
            />
          </div>

          {/* TEAM */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Team
            </label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
              value={form.team}
              onChange={(e) =>
                setForm((f) => ({ ...f, team: e.target.value }))
              }
            />
          </div>

          {/* SPORT */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Primary sport
            </label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
              value={form.primary_sport}
              onChange={(e) =>
                setForm((f) => ({ ...f, primary_sport: e.target.value }))
              }
            />
          </div>

          {/* EMAIL */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Email (optional)
            </label>
            <input
              type="email"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>

          {/* NOTES */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Notes (optional)
            </label>
            <textarea
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 min-h-[80px]"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>

          {/* ERROR */}
          {error && (
            <p className="text-rose-400 text-xs">{error}</p>
          )}

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-lime-400 text-slate-900 font-semibold px-5 py-2 mt-4 hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create Athlete"}
          </button>
        </form>
      </section>
    </main>
  );
}