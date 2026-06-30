"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  athleteId: string;
  section: string;
  initialComment: string | null;
};

export default function SectionComment({
  athleteId,
  section,
  initialComment,
}: Props) {
  const [text, setText] = useState(initialComment ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialComment ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const next = initialComment ?? "";
    setText(next);
    if (!editing) setDraft(next);
  }, [initialComment, editing]);

  async function save() {
    setSaving(true);
    setErr(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not signed in");
      setSaving(false);
      return;
    }
    const value = draft.trim() || null;
    const { error } = await supabase.from("athlete_section_comments").upsert(
      {
        athlete_id: athleteId,
        section,
        comment: value,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "athlete_id,section" }
    );
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setText(value ?? "");
    setEditing(false);
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">
        Section note
      </p>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-lime-400 focus:outline-none"
            placeholder="Add a clinical note…"
          />
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(text);
                setErr(null);
              }}
              className="rounded-full border border-slate-300 px-4 py-1.5 text-xs text-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="group relative mt-2">
          <button
            type="button"
            onClick={() => {
              setDraft(text);
              setEditing(true);
              setErr(null);
            }}
            className="w-full rounded-lg border border-transparent px-2 py-2 text-left text-sm text-slate-700 hover:border-slate-200 hover:bg-white"
          >
            {text.trim() ? (
              <span className="whitespace-pre-wrap">{text}</span>
            ) : (
              <span className="text-slate-400">Add a clinical note…</span>
            )}
          </button>
          <button
            type="button"
            aria-label="Edit note"
            title="Edit note"
            onClick={() => {
              setDraft(text);
              setEditing(true);
              setErr(null);
            }}
            className="absolute right-2 top-2 rounded p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-lime-600 group-hover:opacity-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
