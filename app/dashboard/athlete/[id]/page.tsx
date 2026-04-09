"use client";

import {
  useEffect,
  useState,
  ChangeEvent,
  FormEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import JumpHeightGraph from "@/components/graphs/JumpHeightGraph";
import { loadJumpHeightHistory } from "@/lib/loadForceplate";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// ---------- Supabase client ----------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Helpers ----------
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function mean(v: number[]) {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length
  );
}

function computeRTS(
  peakSpeed: number | null,
  split20: number | null,
  repSpeeds: number[]
) {
  if (!peakSpeed || !split20 || repSpeeds.length < 2) return null;

  const sd = stdDev(repSpeeds);
  const m = mean(repSpeeds);

  const consistency = clamp(1 - sd / m, 0, 1);
  const speedScore = clamp((peakSpeed - 5) / 4, 0, 1);
  const splitScore = clamp((4.5 - split20) / 1.5, 0, 1);

  const combined =
    0.4 * speedScore + 0.3 * splitScore + 0.3 * consistency;

  return Math.round(combined * 100);
}

// ---------- Component ----------
export default function AthleteProfilePage() {
  const { id: athleteId } = useParams<{ id: string }>();
  const router = useRouter();

  const [athlete, setAthlete] = useState<any | null>(null);
  const [injuries, setInjuries] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Jump-height history for this athlete (force plate)
  const [jumpHistory, setJumpHistory] = useState<
    { date: string; jumpHeight: number | null }[]
  >([]);

  // Anthropometrics edit state
  const [anthroForm, setAnthroForm] = useState({
    height_cm: "",
    weight_kg: "",
    dominant_leg: "",
    dominant_hand: "",
  });
  const [savingAnthro, setSavingAnthro] = useState(false);
  const [anthroStatus, setAnthroStatus] = useState<string | null>(
    null
  );

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(
    null
  );

  // Tags
  const [newTag, setNewTag] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  // Injury form
  const [injuryForm, setInjuryForm] = useState({
    diagnosis: "",
    body_region: "",
    side: "",
    date_injured: "",
    date_rtp: "",
    status: "",
    notes: "",
  });
  const [injurySaving, setInjurySaving] = useState(false);
  const [injuryError, setInjuryError] = useState<string | null>(
    null
  );

  // ---------- Load athlete + related data ----------
  useEffect(() => {
    if (!athleteId) return;

    async function load() {
      setLoading(true);

      // Athlete
      const { data: athleteData } = await supabase
        .from("athletes")
        .select("*")
        .eq("id", athleteId)
        .maybeSingle();

      setAthlete(athleteData);

      if (athleteData) {
        setAnthroForm({
          height_cm: athleteData.height_cm?.toString() ?? "",
          weight_kg: athleteData.weight_kg?.toString() ?? "",
          dominant_leg: athleteData.dominant_leg ?? "",
          dominant_hand: athleteData.dominant_hand ?? "",
        });
      }

      // Injuries
      const { data: inj } = await supabase
        .from("injuries")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("date_injured", { ascending: false });

      setInjuries(inj || []);

      // Sessions (now also grabbing test_type + file_name)
      const { data: sess } = await supabase
        .from("sessions")
        .select("id, created_at, test_type, file_name")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: true });

      setSessions(sess || []);

      // Metrics for all sessions
      if (sess?.length) {
        const ids = sess.map((s) => s.id);
        const { data: mets } = await supabase
          .from("metrics")
          .select("*")
          .in("session_id", ids);

        setMetrics(mets || []);
      }

      // Jump-height history (force plate sessions)
      const jh = await loadJumpHeightHistory(athleteId);
      setJumpHistory(jh);

      setLoading(false);
    }

    load();
  }, [athleteId]);

  // ---------- Build session summaries (for RTS, PBs, timeline, chart) ----------
  // Only use 1080_sprint sessions for RTS / sprint metrics
  const sessionSummaries = sessions
    .filter((s) => s.test_type === "1080_sprint")
    .map((s) => {
      const m = metrics.filter((x) => x.session_id === s.id);

      const peak = m.find(
        (x) => x.key === "peakSpeed" && x.rep_index == null
      )?.value;

      const split20 = m.find(
        (x) => x.key === "split20m" && x.rep_index == null
      )?.value;

      const repSpeeds = m
        .filter(
          (x) => x.key === "peakSpeed" && x.rep_index != null
        )
        .map((x) => x.value as number);

      const rtsScore = computeRTS(
        peak ?? null,
        split20 ?? null,
        repSpeeds
      );

      return {
        id: s.id,
        created_at: s.created_at,
        file_name: s.file_name as string | null,
        dateLabel: new Date(s.created_at).toLocaleDateString(
          "en-AU",
          {
            day: "2-digit",
            month: "short",
          }
        ),
        longDate: new Date(s.created_at).toLocaleDateString(
          "en-AU",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }
        ),
        peakSpeed: peak ?? null,
        split20m: split20 ?? null,
        rtsScore,
      };
    });

  const sessionTrend = sessionSummaries.map((s) => ({
    date: s.dateLabel,
    peakSpeed: s.peakSpeed,
    rtsScore: s.rtsScore,
  }));

  const latestSummary =
    sessionSummaries.length > 0
      ? sessionSummaries[sessionSummaries.length - 1]
      : null;

  const latestRTS = latestSummary?.rtsScore ?? null;

  const rtsStatus =
    latestRTS == null
      ? { label: "Not enough data", class: "text-slate-400" }
      : latestRTS >= 80
      ? { label: "RTS-ready", class: "text-emerald-300" }
      : latestRTS >= 60
      ? { label: "Progressing", class: "text-amber-300" }
      : { label: "Not ready", class: "text-rose-300" };

  // ---------- PBs (from all metrics) ----------
  const allPeakSpeeds = metrics
    .filter((m) => m.key === "peakSpeed" && m.value != null)
    .map((m) => m.value as number);

  const allPeakForces = metrics
    .filter((m) => m.key === "peakForce" && m.value != null)
    .map((m) => m.value as number);

  const allPeakPowers = metrics
    .filter((m) => m.key === "peakPower" && m.value != null)
    .map((m) => m.value as number);

  const allSplit20 = metrics
    .filter((m) => m.key === "split20m" && m.value != null)
    .map((m) => m.value as number);

  const pbPeakSpeed =
    allPeakSpeeds.length > 0 ? Math.max(...allPeakSpeeds) : null;
  const pbPeakForce =
    allPeakForces.length > 0 ? Math.max(...allPeakForces) : null;
  const pbPeakPower =
    allPeakPowers.length > 0 ? Math.max(...allPeakPowers) : null;
  const pbSplit20Best =
    allSplit20.length > 0 ? Math.min(...allSplit20) : null;

  // ---------- Anthropometrics derived ----------
  const heightM =
    athlete?.height_cm != null
      ? Number(athlete.height_cm) / 100
      : null;
  const bmi =
    heightM && athlete?.weight_kg != null
      ? Number(athlete.weight_kg) / (heightM * heightM)
      : null;

  // ---------- Save anthropometrics ----------
  async function handleSaveAnthro(e: FormEvent) {
    e.preventDefault();
    if (!athleteId) return;

    setSavingAnthro(true);
    setAnthroStatus(null);

    const payload: any = {
      height_cm: anthroForm.height_cm
        ? Number(anthroForm.height_cm)
        : null,
      weight_kg: anthroForm.weight_kg
        ? Number(anthroForm.weight_kg)
        : null,
      dominant_leg: anthroForm.dominant_leg || null,
      dominant_hand: anthroForm.dominant_hand || null,
    };

    const { error } = await supabase
      .from("athletes")
      .update(payload)
      .eq("id", athleteId);

    if (error) {
      console.error(error);
      setAnthroStatus("Failed to save");
    } else {
      setAnthroStatus("Saved");
      setAthlete((prev: any) =>
        prev ? { ...prev, ...payload } : prev
      );
    }

    setSavingAnthro(false);
  }

  // ---------- Avatar upload ----------
  async function handleAvatarChange(
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file || !athleteId) return;

    setUploadingAvatar(true);
    setAvatarError(null);

    try {
      const ext = file.name.split(".").pop();
      const path = `${athleteId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("athlete-avatars")
        .upload(path, file);

      if (uploadError) {
        console.error(uploadError);
        setAvatarError("Upload failed");
        setUploadingAvatar(false);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage
        .from("athlete-avatars")
        .getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("athletes")
        .update({ profile_image_url: publicUrl })
        .eq("id", athleteId);

      if (updateError) {
        console.error(updateError);
        setAvatarError("Failed to save image");
      } else {
        setAthlete((prev: any) =>
          prev ? { ...prev, profile_image_url: publicUrl } : prev
        );
      }
    } catch (err) {
      console.error(err);
      setAvatarError("Unexpected upload error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // ---------- Tags: add ----------
  async function handleAddTag(e: FormEvent) {
    e.preventDefault();
    if (!athleteId) return;
    const tag = newTag.trim();
    if (!tag) return;

    setSavingTag(true);
    setTagError(null);

    try {
      const currentTags = (athlete?.tags ?? []) as string[];
      if (currentTags.includes(tag)) {
        setTagError("Tag already added");
        setSavingTag(false);
        return;
      }

      const updatedTags = [...currentTags, tag];

      const { error } = await supabase
        .from("athletes")
        .update({ tags: updatedTags })
        .eq("id", athleteId);

      if (error) {
        console.error(error);
        setTagError("Failed to save tag");
      } else {
        setAthlete((prev: any) =>
          prev ? { ...prev, tags: updatedTags } : prev
        );
        setNewTag("");
      }
    } finally {
      setSavingTag(false);
    }
  }

  // ---------- Tags: remove ----------
  async function handleRemoveTag(tagToRemove: string) {
    if (!athleteId) return;

    setSavingTag(true);
    setTagError(null);

    try {
      const currentTags = (athlete?.tags ?? []) as string[];
      const updatedTags = currentTags.filter(
        (t) => t !== tagToRemove
      );

      const { error } = await supabase
        .from("athletes")
        .update({ tags: updatedTags })
        .eq("id", athleteId);

      if (error) {
        console.error(error);
        setTagError("Failed to remove tag");
      } else {
        setAthlete((prev: any) =>
          prev ? { ...prev, tags: updatedTags } : prev
        );
      }
    } finally {
      setSavingTag(false);
    }
  }

  // ---------- Add injury ----------
  async function handleAddInjury(e: FormEvent) {
    e.preventDefault();
    if (!athleteId) return;

    setInjurySaving(true);
    setInjuryError(null);

    const { error } = await supabase.from("injuries").insert({
      athlete_id: athleteId,
      ...injuryForm,
    });

    if (error) {
      console.error(error);
      setInjuryError("Failed to save injury");
      setInjurySaving(false);
      return;
    }

    // reload injuries
    const { data } = await supabase
      .from("injuries")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("date_injured", { ascending: false });

    setInjuries(data || []);

    setInjuryForm({
      diagnosis: "",
      body_region: "",
      side: "",
      date_injured: "",
      date_rtp: "",
      status: "",
      notes: "",
    });

    setInjurySaving(false);
  }

  const initials = `${athlete?.first_name?.[0] ?? ""}${
    athlete?.last_name?.[0] ?? ""
  }`.toUpperCase();

  const tags = ((athlete?.tags ?? []) as string[]) || [];

  // ---------- UI ----------
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-6xl px-6 pt-8 pb-20">
        {/* Back button */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs text-slate-400 hover:text-lime-300"
          >
            ← Back to dashboard
          </button>

          <Link
            href="/dashboard"
            className="hidden text-[0.7rem] text-slate-500 hover:text-lime-300 md:inline-flex"
          >
            Dashboard overview →
          </Link>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm">Loading athlete…</p>
        ) : !athlete ? (
          <p className="text-rose-400 text-sm">Athlete not found.</p>
        ) : (
          <>
            {/* HEADER */}
            <header className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="relative h-14 w-14 rounded-full bg-slate-800 flex items-center justify-center text-sm font-semibold text-slate-100 overflow-hidden">
                    {athlete.profile_image_url ? (
                      <Image
                        src={athlete.profile_image_url}
                        alt={`${athlete.first_name} ${athlete.last_name}`}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <span>{initials || "A"}</span>
                    )}
                  </div>

                  <div>
                    <h1 className="text-xl font-semibold tracking-tight">
                      {athlete.first_name} {athlete.last_name}
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                      {athlete.organisation &&
                        `${athlete.organisation} • `}
                      {athlete.team && `${athlete.team} • `}
                      {athlete.primary_sport}
                    </p>
                  </div>
                </div>

                {/* Tags row */}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {tags.length === 0 ? (
                    <p className="text-[0.7rem] text-slate-500">
                      No tags yet – add things like{" "}
                      <span className="text-slate-300">
                        “ACL rehab”, “High performance”, “Junior”
                      </span>
                      .
                    </p>
                  ) : (
                    tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-900 border border-lime-400/40 px-2 py-1 text-[0.7rem] text-lime-300"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-[0.65rem] text-slate-400 hover:text-rose-300"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Add tag form */}
                <form
                  onSubmit={handleAddTag}
                  className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem]"
                >
                  <input
                    className="w-40 bg-slate-950 border border-slate-700 rounded-full px-3 py-1"
                    placeholder="Add tag…"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={savingTag}
                    className="rounded-full bg-slate-900 border border-lime-400/60 px-3 py-1 font-semibold text-[0.7rem] text-lime-300 hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingTag ? "Saving…" : "Add tag"}
                  </button>
                  {tagError && (
                    <span className="text-[0.7rem] text-rose-400">
                      {tagError}
                    </span>
                  )}
                </form>
              </div>

              <div className="flex flex-col items-end gap-3">
                <label className="relative inline-flex items-center rounded-full border border-slate-700 px-3 py-1.5 text-[0.7rem] text-slate-200 hover:border-lime-400 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  {uploadingAvatar ? "Uploading…" : "Change photo"}
                </label>

                <Link
                  href={`/dashboard/athlete/${athleteId}/compare`}
                  className="rounded-full bg-slate-900 px-4 py-1.5 text-xs text-lime-300 border border-lime-400/40 hover:bg-slate-800"
                >
                  Compare pre / post
                </Link>
              </div>
            </header>

            {avatarError && (
              <p className="mb-4 text-xs text-rose-400">
                {avatarError}
              </p>
            )}

            {/* TOP GRID: Profile / RTS / PBs */}
            <div className="mb-8 grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)]">
              {/* Profile & anthropometrics */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                <h2 className="text-sm font-semibold text-lime-300 mb-3">
                  Profile & anthropometrics
                </h2>

                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Height
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {athlete.height_cm != null
                        ? `${athlete.height_cm} cm`
                        : "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Weight
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {athlete.weight_kg != null
                        ? `${athlete.weight_kg} kg`
                        : "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Dominant leg
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {athlete.dominant_leg ?? "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      Dominant hand
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {athlete.dominant_hand ?? "Not set"}
                    </p>
                  </div>
                </div>

                {bmi != null && (
                  <p className="mb-3 text-[0.7rem] text-slate-400">
                    Estimated BMI:{" "}
                    <span className="font-semibold text-slate-100">
                      {bmi.toFixed(1)}
                    </span>
                  </p>
                )}

                <form
                  onSubmit={handleSaveAnthro}
                  className="mt-4 grid grid-cols-2 gap-3"
                >
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-[0.7rem]"
                    placeholder="Height (cm)"
                    value={anthroForm.height_cm}
                    onChange={(e) =>
                      setAnthroForm((f) => ({
                        ...f,
                        height_cm: e.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-[0.7rem]"
                    placeholder="Weight (kg)"
                    value={anthroForm.weight_kg}
                    onChange={(e) =>
                      setAnthroForm((f) => ({
                        ...f,
                        weight_kg: e.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-[0.7rem]"
                    placeholder="Dominant leg"
                    value={anthroForm.dominant_leg}
                    onChange={(e) =>
                      setAnthroForm((f) => ({
                        ...f,
                        dominant_leg: e.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-[0.7rem]"
                    placeholder="Dominant hand"
                    value={anthroForm.dominant_hand}
                    onChange={(e) =>
                      setAnthroForm((f) => ({
                        ...f,
                        dominant_hand: e.target.value,
                      }))
                    }
                  />

                  <div className="col-span-2 flex items-center justify-between mt-1">
                    <button
                      type="submit"
                      disabled={savingAnthro}
                      className="rounded-full bg-lime-400 px-4 py-1.5 text-[0.7rem] font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
                    >
                      {savingAnthro
                        ? "Saving…"
                        : "Save anthropometrics"}
                    </button>
                    {anthroStatus && (
                      <p className="text-[0.7rem] text-slate-400">
                        {anthroStatus}
                      </p>
                    )}
                  </div>
                </form>
              </div>

              {/* RTS + PBs */}
              <div className="flex flex-col gap-4">
                {/* RTS card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex items-center justify-between">
                  <div>
                    <p className="text-[0.7rem] text-slate-400">
                      RTS readiness (latest 1080 sprint)
                    </p>
                    <p
                      className={`text-3xl font-bold ${rtsStatus.class}`}
                    >
                      {latestRTS ?? "--"}
                    </p>
                    <p
                      className={`text-xs mt-1 ${rtsStatus.class}`}
                    >
                      {rtsStatus.label}
                    </p>
                  </div>
                  <div className="text-[0.7rem] text-slate-400 text-right">
                    {latestSummary && (
                      <>
                        <p>Last test: {latestSummary.longDate}</p>
                        {latestSummary.peakSpeed != null && (
                          <p>
                            Peak speed:{" "}
                            <span className="text-slate-100">
                              {latestSummary.peakSpeed.toFixed(2)} m/s
                            </span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* PBs card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                  <h2 className="text-sm font-semibold text-lime-300 mb-3">
                    Performance bests
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[0.7rem] text-slate-400">
                        PB peak speed
                      </p>
                      <p className="text-sm font-semibold text-slate-50">
                        {pbPeakSpeed != null
                          ? `${pbPeakSpeed.toFixed(2)} m/s`
                          : "--"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.7rem] text-slate-400">
                        PB peak force
                      </p>
                      <p className="text-sm font-semibold text-slate-50">
                        {pbPeakForce != null
                          ? `${pbPeakForce.toFixed(0)} N`
                          : "--"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.7rem] text-slate-400">
                        PB peak power
                      </p>
                      <p className="text-sm font-semibold text-slate-50">
                        {pbPeakPower != null
                          ? `${pbPeakPower.toFixed(0)} W`
                          : "--"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.7rem] text-slate-400">
                        Best 20m split
                      </p>
                      <p className="text-sm font-semibold text-slate-50">
                        {pbSplit20Best != null
                          ? `${pbSplit20Best.toFixed(2)} s`
                          : "--"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* JUMP HEIGHT TREND (FORCE PLATE) */}
            <div className="mb-8">
              <JumpHeightGraph data={jumpHistory} />
            </div>

            {/* TREND CHART (1080) */}
            <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-sm font-semibold text-lime-300 mb-3">
                Peak speed & RTS trend (1080 sprint)
              </h2>

              {sessionTrend.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No 1080 sprint sessions for this athlete yet.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sessionTrend}>
                      <CartesianGrid
                        stroke="#1f2937"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "#4b5563",
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="peakSpeed"
                        name="Peak speed"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="rtsScore"
                        name="RTS score"
                        stroke="#a3e635"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* SESSION TIMELINE + INJURIES */}
            <div className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)] gap-6">
              {/* Session timeline */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
                <h2 className="text-sm font-semibold text-lime-300 mb-3">
                  1080 sprint session timeline
                </h2>

                {sessionSummaries.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No 1080 sprint tests recorded for this athlete.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sessionSummaries.map((s) => (
                      <button
                        key={s.id}
                        onClick={() =>
                          router.push(`/dashboard/session/${s.id}`)
                        }
                        className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 hover:border-lime-400/60 hover:bg-slate-900"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[0.8rem] text-slate-100">
                              {s.longDate}
                            </p>
                            {s.peakSpeed != null && (
                              <p className="text-[0.7rem] text-slate-400">
                                Peak speed:{" "}
                                {s.peakSpeed.toFixed(2)} m/s
                              </p>
                            )}
                            {s.file_name && (
                              <p className="text-[0.65rem] text-slate-500">
                                File: {s.file_name}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-[0.65rem] text-slate-400">
                              RTS
                            </p>
                            <p
                              className={`text-sm font-semibold ${
                                s.rtsScore == null
                                  ? "text-slate-400"
                                  : s.rtsScore >= 80
                                  ? "text-emerald-300"
                                  : s.rtsScore >= 60
                                  ? "text-amber-300"
                                  : "text-rose-300"
                              }`}
                            >
                              {s.rtsScore ?? "—"}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Injury history + form */}
              <div className="space-y-4">
                {/* Injury history */}
                <div>
                  <h2 className="text-sm font-semibold text-lime-300 mb-2">
                    Injury history
                  </h2>

                  <div className="space-y-3">
                    {injuries.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No injuries recorded.
                      </p>
                    ) : (
                      injuries.map((inj) => (
                        <div
                          key={inj.id}
                          className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-xs"
                        >
                          <p className="font-semibold text-slate-100">
                            {inj.diagnosis}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {inj.body_region}{" "}
                            {inj.side && `(${inj.side})`}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Injured:{" "}
                            {inj.date_injured &&
                              new Date(
                                inj.date_injured
                              ).toLocaleDateString("en-AU")}
                          </p>
                          {inj.date_rtp && (
                            <p className="text-xs text-slate-500">
                              RTP:{" "}
                              {new Date(
                                inj.date_rtp
                              ).toLocaleDateString("en-AU")}
                            </p>
                          )}
                          {inj.status && (
                            <p className="text-xs text-lime-300 mt-1">
                              Status: {inj.status}
                            </p>
                          )}
                          {inj.notes && (
                            <p className="mt-1 text-xs text-slate-400">
                              {inj.notes}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add injury form */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs">
                  <h2 className="text-sm font-semibold text-lime-300 mb-2">
                    Add injury
                  </h2>

                  <form
                    onSubmit={handleAddInjury}
                    className="space-y-3"
                  >
                    <input
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                      placeholder="Diagnosis"
                      value={injuryForm.diagnosis}
                      onChange={(e) =>
                        setInjuryForm((f) => ({
                          ...f,
                          diagnosis: e.target.value,
                        }))
                      }
                      required
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                        placeholder="Body region"
                        value={injuryForm.body_region}
                        onChange={(e) =>
                          setInjuryForm((f) => ({
                            ...f,
                            body_region: e.target.value,
                          }))
                        }
                      />
                      <input
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                        placeholder="Side"
                        value={injuryForm.side}
                        onChange={(e) =>
                          setInjuryForm((f) => ({
                            ...f,
                            side: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[0.7rem] text-slate-400 mb-1">
                          Date injured
                        </p>
                        <input
                          type="date"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                          value={injuryForm.date_injured}
                          onChange={(e) =>
                            setInjuryForm((f) => ({
                              ...f,
                              date_injured: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div>
                        <p className="text-[0.7rem] text-slate-400 mb-1">
                          RTP date
                        </p>
                        <input
                          type="date"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                          value={injuryForm.date_rtp}
                          onChange={(e) =>
                            setInjuryForm((f) => ({
                              ...f,
                              date_rtp: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <input
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                      placeholder="Status"
                      value={injuryForm.status}
                      onChange={(e) =>
                        setInjuryForm((f) => ({
                          ...f,
                          status: e.target.value,
                        }))
                      }
                    />

                    <textarea
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 min-h-[60px]"
                      placeholder="Notes"
                      value={injuryForm.notes}
                      onChange={(e) =>
                        setInjuryForm((f) => ({
                          ...f,
                          notes: e.target.value,
                        }))
                      }
                    />

                    {injuryError && (
                      <p className="text-[0.7rem] text-rose-400">
                        {injuryError}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <button
                        type="submit"
                        disabled={injurySaving}
                        className="rounded-full bg-lime-400 text-slate-900 font-semibold px-4 py-2 hover:brightness-110 disabled:opacity-60"
                      >
                        {injurySaving ? "Saving…" : "Add injury"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}