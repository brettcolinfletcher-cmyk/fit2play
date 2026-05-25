"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";
import { useRequireDashboardStaff } from "@/lib/useRequireDashboardStaff";
import { supabase } from "@/lib/supabaseClient";

const LR_OPTIONS = ["Left", "Right", "Both"] as const;

type AthleteStatus = "active" | "monitoring" | "archived";

const STATUS_OPTIONS: { value: AthleteStatus; label: string; hint: string }[] = [
  { value: "active", label: "Active", hint: "Current caseload" },
  { value: "monitoring", label: "Monitoring", hint: "Watch-list / discharged check-ins" },
  { value: "archived", label: "Archived", hint: "Hidden from main list" },
];

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  team: string;
  primary_sport: string;
  status: AthleteStatus;
  height_cm: string;
  weight_kg: string;
  dominant_leg: string;
  dominant_hand: string;
  notes: string;
};

const emptyForm: FormState = {
  first_name: "",
  last_name: "",
  email: "",
  team: "",
  primary_sport: "",
  status: "active",
  height_cm: "",
  weight_kg: "",
  dominant_leg: "",
  dominant_hand: "",
  notes: "",
};

export default function EditAthletePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const staffOk = useRequireDashboardStaff();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!staffOk || !id) return;
    let cancelled = false;
    (async () => {
      const { data, error: qErr } = await supabase
        .from("athletes")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      if (qErr || !data) {
        setError(qErr?.message ?? "Not found");
        setLoading(false);
        return;
      }

      const a = data as Record<string, unknown>;
      const loadedStatus = String(a.status ?? "active");
      const safeStatus: AthleteStatus =
        loadedStatus === "monitoring" || loadedStatus === "archived"
          ? loadedStatus
          : "active";
      setForm({
        first_name: String(a.first_name ?? ""),
        last_name: String(a.last_name ?? ""),
        email: String(a.email ?? ""),
        team: String(a.team ?? ""),
        primary_sport: String(a.primary_sport ?? ""),
        status: safeStatus,
        height_cm:
          a.height_cm != null && a.height_cm !== ""
            ? String(a.height_cm)
            : "",
        weight_kg:
          a.weight_kg != null && a.weight_kg !== ""
            ? String(a.weight_kg)
            : "",
        dominant_leg: String(a.dominant_leg ?? ""),
        dominant_hand: String(a.dominant_hand ?? ""),
        notes: String(a.notes ?? ""),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffOk, id]);

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
      status: form.status,
      notes: form.notes.trim() || null,
      dominant_leg: form.dominant_leg || null,
      dominant_hand: form.dominant_hand || null,
    };

    const h = parseFloat(form.height_cm);
    const w = parseFloat(form.weight_kg);
    if (!Number.isNaN(h)) body.height_cm = h;
    else body.height_cm = null;
    if (!Number.isNaN(w)) body.weight_kg = w;
    else body.weight_kg = null;

    const res = await fetch(`/api/athletes/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-sync-secret": process.env.NEXT_PUBLIC_SYNC_SECRET ?? "",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Update failed");
      setSaving(false);
      return;
    }

    router.push(`/dashboard/athletes/${id}`);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/athletes/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "x-sync-secret": process.env.NEXT_PUBLIC_SYNC_SECRET ?? "",
      },
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Delete failed");
      setDeleting(false);
      setShowDelete(false);
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
          href={`/dashboard/athletes/${id}`}
          className="text-xs text-slate-400 hover:text-lime-300"
        >
          ← Back to profile
        </Link>

        <h1 className="mt-6 text-xl font-semibold tracking-tight">
          Edit athlete
        </h1>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">
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
                <label className="mb-1 block text-xs text-slate-400">
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
              <label className="mb-1 block text-xs text-slate-400">Email</label>
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
                <label className="mb-1 block text-xs text-slate-400">Team</label>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                  value={form.team}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, team: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
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

            <div>
              <label className="mb-1 block text-xs text-slate-400">Status</label>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as AthleteStatus,
                  }))
                }
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                {STATUS_OPTIONS.find((o) => o.value === form.status)?.hint}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">
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
                <label className="mb-1 block text-xs text-slate-400">
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
                <label className="mb-1 block text-xs text-slate-400">
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
                <label className="mb-1 block text-xs text-slate-400">
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
              <label className="mb-1 block text-xs text-slate-400">Notes</label>
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
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        )}

        {!loading ? (
          <div className="mt-12 border-t border-slate-800 pt-8">
            <button
              type="button"
              className="text-xs text-rose-400 hover:text-rose-300"
              onClick={() => setShowDelete(true)}
            >
              Delete athlete
            </button>
          </div>
        ) : null}

        {showDelete ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
              <p className="text-sm text-slate-200">
                Delete this athlete and all sessions and metrics? This cannot be
                undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                  onClick={() => setShowDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                  onClick={() => void handleDelete()}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
