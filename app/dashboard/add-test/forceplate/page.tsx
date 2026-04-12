"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

// ───────────────── Hawkin CSV parsing ─────────────────

type HawkinSubtype = "cmj" | "dj" | "imtp" | "calf" | "other" | null;

type ParsedHawkin = {
  metrics: Record<string, number | null>;
  subTestType: HawkinSubtype;
};

function parseHawkinCsv(text: string): ParsedHawkin {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV looks empty or has no data rows");
  }

  const headerRaw = lines[0].split(",");
  const header = headerRaw.map((h) => h.trim());
  const headerLower = header.map((h) => h.toLowerCase());

  const exactIdx = (name: string) =>
    header.findIndex((h) => h === name);

  const fuzzyIdx = (fragment: string) =>
    headerLower.findIndex((h) => h.includes(fragment.toLowerCase()));

  const num = (cols: string[], idx: number) =>
    idx >= 0 && idx < cols.length ? Number(cols[idx]) : NaN;

  // Core columns
  const idxJumpHeight =
    exactIdx("Jump Height (cm)") >= 0
      ? exactIdx("Jump Height (cm)")
      : fuzzyIdx("jump height");

  const idxPeakForce =
    exactIdx("Peak Force (N)") >= 0
      ? exactIdx("Peak Force (N)")
      : fuzzyIdx("peak force");

  const idxPeakPower =
    exactIdx("Peak Power (W)") >= 0
      ? exactIdx("Peak Power (W)")
      : fuzzyIdx("peak power");

  const idxContactTime =
    exactIdx("Contact Time (s)") >= 0
      ? exactIdx("Contact Time (s)")
      : fuzzyIdx("contact time");

  const idxFlightTime =
    exactIdx("Flight Time (s)") >= 0
      ? exactIdx("Flight Time (s)")
      : fuzzyIdx("flight time");

  const idxRsi =
    exactIdx("RSI") >= 0 ? exactIdx("RSI") : fuzzyIdx("rsi");

  const idxRsiMod =
    exactIdx("RSI Mod") >= 0
      ? exactIdx("RSI Mod")
      : fuzzyIdx("rsimod");

  const idxBrakingRfd =
    exactIdx("Braking RFD (N/s)") >= 0
      ? exactIdx("Braking RFD (N/s)")
      : fuzzyIdx("braking rfd");

  const idxPropulsiveRfd =
    exactIdx("Propulsive RFD (N/s)") >= 0
      ? exactIdx("Propulsive RFD (N/s)")
      : fuzzyIdx("propulsive rfd");

  const idxBrakingImp =
    exactIdx("Braking Impulse (N*s)") >= 0
      ? exactIdx("Braking Impulse (N*s)")
      : fuzzyIdx("braking impulse");

  const idxPropulsiveImp =
    exactIdx("Propulsive Impulse (N*s)") >= 0
      ? exactIdx("Propulsive Impulse (N*s)")
      : fuzzyIdx("propulsive impulse");

  const idxBodyMass =
    exactIdx("Body Mass (kg)") >= 0
      ? exactIdx("Body Mass (kg)")
      : fuzzyIdx("body mass");

  const idxBodyWeightN =
    exactIdx("Body Weight (N)") >= 0
      ? exactIdx("Body Weight (N)")
      : fuzzyIdx("body weight");

  const idxConcNs =
    exactIdx("Concentric Impulse (Ns)") >= 0
      ? exactIdx("Concentric Impulse (Ns)")
      : fuzzyIdx("concentric impulse");

  const idxEccNs =
    exactIdx("Eccentric Impulse (Ns)") >= 0
      ? exactIdx("Eccentric Impulse (Ns)")
      : fuzzyIdx("eccentric impulse");

  const idxPeakBraking =
    exactIdx("Peak Braking Force (N)") >= 0
      ? exactIdx("Peak Braking Force (N)")
      : fuzzyIdx("peak braking");

  const idxPeakPropulsive =
    exactIdx("Peak Propulsive Force (N)") >= 0
      ? exactIdx("Peak Propulsive Force (N)")
      : fuzzyIdx("peak propulsive");

  const idxLeg =
    exactIdx("Leg") >= 0 ? exactIdx("Leg") : fuzzyIdx("leg");

  // Left / Right columns (names are guesses based on typical Hawkin exports)
  const idxPeakForceL = fuzzyIdx("peak force left");
  const idxPeakForceR = fuzzyIdx("peak force right");

  const idxConcImpL = fuzzyIdx("propulsive impulse left");
  const idxConcImpR = fuzzyIdx("propulsive impulse right");

  const idxEccImpL = fuzzyIdx("braking impulse left");
  const idxEccImpR = fuzzyIdx("braking impulse right");

  const idxMeanForceL = fuzzyIdx("mean force left");
  const idxMeanForceR = fuzzyIdx("mean force right");

  // Test type column (CMJ / Drop Jump / IMTP etc.)
  const idxTestTypeCol =
    exactIdx("Test Type") >= 0
      ? exactIdx("Test Type")
      : fuzzyIdx("test type");

  type Row = {
    rawLabel?: string;
    jumpHeight?: number;
    peakForce?: number;
    peakPower?: number;
    contactTime?: number;
    flightTime?: number;
    rsi?: number;
    rsiMod?: number;
    brakingRfd?: number;
    propulsiveRfd?: number;
    brakingImpulse?: number;
    propulsiveImpulse?: number;
    bodyMass?: number;

    peakForceL?: number;
    peakForceR?: number;
    concImpL?: number;
    concImpR?: number;
    eccImpL?: number;
    eccImpR?: number;
    meanForceL?: number;
    meanForceR?: number;

    leg?: string;
    concNs?: number;
    eccNs?: number;
    peakBraking?: number;
    peakPropulsive?: number;
    bodyWeightN?: number;
  };

  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (!cols.length) continue;

    const row: Row = {};

    if (idxTestTypeCol >= 0 && idxTestTypeCol < cols.length) {
      row.rawLabel = cols[idxTestTypeCol];
    }

    if (idxJumpHeight >= 0) {
      const v = num(cols, idxJumpHeight);
      if (!Number.isNaN(v)) row.jumpHeight = v;
    }
    if (idxPeakForce >= 0) {
      const v = num(cols, idxPeakForce);
      if (!Number.isNaN(v)) row.peakForce = v;
    }
    if (idxPeakPower >= 0) {
      const v = num(cols, idxPeakPower);
      if (!Number.isNaN(v)) row.peakPower = v;
    }
    if (idxContactTime >= 0) {
      const v = num(cols, idxContactTime);
      if (!Number.isNaN(v)) row.contactTime = v;
    }
    if (idxFlightTime >= 0) {
      const v = num(cols, idxFlightTime);
      if (!Number.isNaN(v)) row.flightTime = v;
    }
    if (idxRsi >= 0) {
      const v = num(cols, idxRsi);
      if (!Number.isNaN(v)) row.rsi = v;
    }
    if (idxRsiMod >= 0) {
      const v = num(cols, idxRsiMod);
      if (!Number.isNaN(v)) row.rsiMod = v;
    }
    if (idxBrakingRfd >= 0) {
      const v = num(cols, idxBrakingRfd);
      if (!Number.isNaN(v)) row.brakingRfd = v;
    }
    if (idxPropulsiveRfd >= 0) {
      const v = num(cols, idxPropulsiveRfd);
      if (!Number.isNaN(v)) row.propulsiveRfd = v;
    }
    if (idxBrakingImp >= 0) {
      const v = num(cols, idxBrakingImp);
      if (!Number.isNaN(v)) row.brakingImpulse = v;
    }
    if (idxPropulsiveImp >= 0) {
      const v = num(cols, idxPropulsiveImp);
      if (!Number.isNaN(v)) row.propulsiveImpulse = v;
    }
    if (idxBodyMass >= 0) {
      const v = num(cols, idxBodyMass);
      if (!Number.isNaN(v)) row.bodyMass = v;
    }
    if (idxBodyWeightN >= 0) {
      const v = num(cols, idxBodyWeightN);
      if (!Number.isNaN(v)) row.bodyWeightN = v;
    }
    if (idxConcNs >= 0) {
      const v = num(cols, idxConcNs);
      if (!Number.isNaN(v)) row.concNs = v;
    }
    if (idxEccNs >= 0) {
      const v = num(cols, idxEccNs);
      if (!Number.isNaN(v)) row.eccNs = v;
    }
    if (idxPeakBraking >= 0) {
      const v = num(cols, idxPeakBraking);
      if (!Number.isNaN(v)) row.peakBraking = v;
    }
    if (idxPeakPropulsive >= 0) {
      const v = num(cols, idxPeakPropulsive);
      if (!Number.isNaN(v)) row.peakPropulsive = v;
    }
    if (idxLeg >= 0 && idxLeg < cols.length) {
      row.leg = cols[idxLeg];
    }

    // Left / right
    if (idxPeakForceL >= 0) {
      const v = num(cols, idxPeakForceL);
      if (!Number.isNaN(v)) row.peakForceL = v;
    }
    if (idxPeakForceR >= 0) {
      const v = num(cols, idxPeakForceR);
      if (!Number.isNaN(v)) row.peakForceR = v;
    }

    if (idxConcImpL >= 0) {
      const v = num(cols, idxConcImpL);
      if (!Number.isNaN(v)) row.concImpL = v;
    }
    if (idxConcImpR >= 0) {
      const v = num(cols, idxConcImpR);
      if (!Number.isNaN(v)) row.concImpR = v;
    }

    if (idxEccImpL >= 0) {
      const v = num(cols, idxEccImpL);
      if (!Number.isNaN(v)) row.eccImpL = v;
    }
    if (idxEccImpR >= 0) {
      const v = num(cols, idxEccImpR);
      if (!Number.isNaN(v)) row.eccImpR = v;
    }

    if (idxMeanForceL >= 0) {
      const v = num(cols, idxMeanForceL);
      if (!Number.isNaN(v)) row.meanForceL = v;
    }
    if (idxMeanForceR >= 0) {
      const v = num(cols, idxMeanForceR);
      if (!Number.isNaN(v)) row.meanForceR = v;
    }

    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error(
      "Could not find any recognised Hawkin columns. Check the export format."
    );
  }

  function normLegCell(s: string | undefined): "left" | "right" | "bilateral" {
    if (!s || !s.trim()) return "bilateral";
    const t = s.trim().toLowerCase();
    if (t === "left" || t === "l") return "left";
    if (t === "right" || t === "r") return "right";
    if (t === "bilateral" || t === "both" || t === "double") return "bilateral";
    return "bilateral";
  }

  function pickBestJump(bucket: Row[]): Row | null {
    const withJh = bucket.filter((r) => r.jumpHeight != null);
    if (!withJh.length) return null;
    return withJh.reduce((acc, r) =>
      r.jumpHeight != null &&
      (acc.jumpHeight == null || r.jumpHeight > acc.jumpHeight)
        ? r
        : acc
    );
  }

  function pickBestForce(bucket: Row[]): Row | null {
    const withPf = bucket.filter((r) => r.peakForce != null);
    if (!withPf.length) return null;
    return withPf.reduce((acc, r) =>
      r.peakForce != null &&
      (acc.peakForce == null || r.peakForce > acc.peakForce)
        ? r
        : acc
    );
  }

  function pickBestRow(bucket: Row[]): Row | null {
    if (!bucket.length) return null;
    const j = pickBestJump(bucket);
    if (j) return j;
    const f = pickBestForce(bucket);
    if (f) return f;
    return bucket[0];
  }

  function mergeRow(
    out: Record<string, number | null>,
    row: Row,
    side: "bilateral" | "left" | "right"
  ) {
    const jhKey =
      side === "bilateral"
        ? "fp_jump_height_cm_best"
        : side === "left"
          ? "fp_jump_height_cm_left"
          : "fp_jump_height_cm_right";
    const rsiKey =
      side === "bilateral"
        ? "fp_rsi_best"
        : side === "left"
          ? "fp_rsi_left"
          : "fp_rsi_right";
    const pfKey =
      side === "bilateral"
        ? "fp_peak_force_n_best"
        : side === "left"
          ? "fp_peak_force_n_left"
          : "fp_peak_force_n_right";
    const concKey =
      side === "bilateral"
        ? "fp_concentric_impulse"
        : side === "left"
          ? "fp_concentric_impulse_left"
          : "fp_concentric_impulse_right";
    const eccKey =
      side === "bilateral"
        ? "fp_eccentric_impulse"
        : side === "left"
          ? "fp_eccentric_impulse_left"
          : "fp_eccentric_impulse_right";

    if (row.jumpHeight != null) out[jhKey] = row.jumpHeight;
    const rsiVal = row.rsiMod ?? row.rsi;
    if (rsiVal != null) out[rsiKey] = rsiVal;
    if (row.peakForce != null) out[pfKey] = row.peakForce;
    if (row.concNs != null) out[concKey] = row.concNs;
    else if (
      row.propulsiveImpulse != null &&
      side === "bilateral" &&
      out.fp_concentric_impulse == null
    )
      out.fp_concentric_impulse = row.propulsiveImpulse;
    if (row.eccNs != null) out[eccKey] = row.eccNs;
    else if (
      row.brakingImpulse != null &&
      side === "bilateral" &&
      out.fp_eccentric_impulse == null
    )
      out.fp_eccentric_impulse = row.brakingImpulse;

    if (side === "bilateral") {
      if (row.peakPower != null) out.fp_peak_power_w_best = row.peakPower;
      if (row.contactTime != null) out.fp_contact_time_s_best = row.contactTime;
      if (row.flightTime != null) out.fp_flight_time_s_best = row.flightTime;
      if (row.rsiMod != null) out.fp_rsimod_best = row.rsiMod;
      if (row.brakingRfd != null) out.fp_braking_rfd_n_s_best = row.brakingRfd;
      if (row.propulsiveRfd != null)
        out.fp_propulsive_rfd_n_s_best = row.propulsiveRfd;
      if (row.brakingImpulse != null)
        out.fp_braking_impulse_n_s_best = row.brakingImpulse;
      if (row.propulsiveImpulse != null)
        out.fp_propulsive_impulse_n_s_best = row.propulsiveImpulse;
      if (row.bodyMass != null) out.fp_body_mass_kg = row.bodyMass;
      else if (row.bodyWeightN != null)
        out.fp_body_mass_kg = row.bodyWeightN / 9.80665;
      if (row.peakBraking != null)
        out.fp_peak_braking_force = row.peakBraking;
      if (row.peakPropulsive != null)
        out.fp_peak_propulsive_force = row.peakPropulsive;

      if (row.peakForceL != null) out.fp_peak_force_l_n_best = row.peakForceL;
      if (row.peakForceR != null) out.fp_peak_force_r_n_best = row.peakForceR;
      if (row.concImpL != null) out.fp_conc_impulse_l_n_s_best = row.concImpL;
      if (row.concImpR != null) out.fp_conc_impulse_r_n_s_best = row.concImpR;
      if (row.eccImpL != null) out.fp_ecc_impulse_l_n_s_best = row.eccImpL;
      if (row.eccImpR != null) out.fp_ecc_impulse_r_n_s_best = row.eccImpR;
      if (row.meanForceL != null) out.fp_mean_force_l_n_best = row.meanForceL;
      if (row.meanForceR != null) out.fp_mean_force_r_n_best = row.meanForceR;
    } else {
      if (row.peakBraking != null) {
        out[
          side === "left"
            ? "fp_peak_braking_force_left"
            : "fp_peak_braking_force_right"
        ] = row.peakBraking;
      }
      if (row.peakPropulsive != null) {
        out[
          side === "left"
            ? "fp_peak_propulsive_force_left"
            : "fp_peak_propulsive_force_right"
        ] = row.peakPropulsive;
      }
    }
  }

  const leftRows: Row[] = [];
  const rightRows: Row[] = [];
  const bilateralRows: Row[] = [];

  const hasLegCol = idxLeg >= 0;
  for (const r of rows) {
    if (!hasLegCol) {
      bilateralRows.push(r);
      continue;
    }
    const L = normLegCell(r.leg);
    if (L === "left") leftRows.push(r);
    else if (L === "right") rightRows.push(r);
    else bilateralRows.push(r);
  }

  const bestBilateral = pickBestRow(bilateralRows);
  const bestLeft = pickBestRow(leftRows);
  const bestRight = pickBestRow(rightRows);
  const bestForLabel =
    bestBilateral ?? bestLeft ?? bestRight ?? rows[0];

  const label = bestForLabel.rawLabel?.toLowerCase() || "";
  let subTestType: HawkinSubtype = null;

  if (label.includes("cmj")) subTestType = "cmj";
  else if (label.includes("drop") || label.includes("dj"))
    subTestType = "dj";
  else if (label.includes("calf")) subTestType = "calf";
  else if (label.includes("imtp") || label.includes("isometric"))
    subTestType = "imtp";
  else if (label) subTestType = "other";

  const asymPct = (left?: number, right?: number): number | null => {
    if (left == null || right == null) return null;
    const max = Math.max(left, right);
    if (!isFinite(max) || max === 0) return null;
    return (Math.abs(left - right) / max) * 100;
  };

  const metrics: Record<string, number | null> = {};

  if (bestBilateral) mergeRow(metrics, bestBilateral, "bilateral");
  if (bestLeft) mergeRow(metrics, bestLeft, "left");
  if (bestRight) mergeRow(metrics, bestRight, "right");

  const b = bestBilateral ?? bestForLabel;
  if (b) {
    metrics.fp_peak_force_lr_asym_pct_best = asymPct(
      b.peakForceL,
      b.peakForceR
    );
    metrics.fp_conc_impulse_lr_asym_pct_best = asymPct(
      b.concImpL,
      b.concImpR
    );
    metrics.fp_ecc_impulse_lr_asym_pct_best = asymPct(b.eccImpL, b.eccImpR);
    metrics.fp_mean_force_lr_asym_pct_best = asymPct(
      b.meanForceL,
      b.meanForceR
    );
  }

  return { metrics, subTestType };
}

export default function ForcePlateUploadPage() {
  const router = useRouter();

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [athleteId, setAthleteId] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [legProtocol, setLegProtocol] = useState<string>("double_leg");
  const [movementOverride, setMovementOverride] = useState<string>("auto");

  // load athletes
  useEffect(() => {
    async function load() {
      setLoadingAthletes(true);
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data, error } = await supabase
        .from("athletes")
        .select("id, first_name, last_name")
        .order("last_name", { ascending: true });

      if (error) {
        console.error(error);
        setError("Failed to load athletes");
      } else {
        setAthletes((data ?? []) as Athlete[]);
      }
      setLoadingAthletes(false);
    }
    load();
  }, []);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setStatus(null);
    setError(null);
  }

  async function handleUpload() {
    if (!athleteId) {
      setError("Please select an athlete");
      return;
    }
    if (!file) {
      setError("Please choose a CSV file");
      return;
    }

    setUploading(true);
    setError(null);
    setStatus(null);

    try {
        const text = await file.text();
      const { metrics, subTestType: detectedSubtype } = parseHawkinCsv(text);
      const subTestType =
        movementOverride === "auto"
          ? detectedSubtype
          : (movementOverride as "cmj" | "dj" | "imtp" | "calf" | "other");

      const res = await fetch("/api/upload-forceplate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          fileName: file.name,
          metrics,
          subTestType,
          testSubType: legProtocol,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[forceplate upload] API error:", data);
        throw new Error(data?.error || "Upload failed");
      }

      const data = await res.json();
      setStatus("Force plate session created");

      if (data.sessionId) {
        router.push(`/dashboard/session/${data.sessionId}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Unexpected upload error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardNav />

      <section className="mx-auto max-w-3xl px-6 pt-8 pb-20">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Add force plate test (Hawkin)
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Select an athlete and upload a Hawkin Dynamics CSV export. We’ll
              create a &quot;force_plate&quot; session and store key metrics.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard/add-test")}
              className="text-[0.7rem] text-slate-400 hover:text-lime-300"
            >
              ← All test types
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/staff")}
              className="text-[0.7rem] text-slate-400 hover:text-lime-300"
            >
              Staff dashboard
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        )}
        {status && (
          <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {status}
          </div>
        )}

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[0.7rem] text-slate-400">Movement</p>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[0.8rem]"
                value={movementOverride}
                onChange={(e) => setMovementOverride(e.target.value)}
              >
                <option value="auto">Auto (from CSV)</option>
                <option value="cmj">CMJ</option>
                <option value="dj">Drop jump</option>
                <option value="imtp">IMTP</option>
                <option value="calf">Isometric calf raise</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-[0.7rem] text-slate-400">Leg / protocol</p>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[0.8rem]"
                value={legProtocol}
                onChange={(e) => setLegProtocol(e.target.value)}
              >
                <option value="double_leg">Double leg</option>
                <option value="single_leg">Single leg</option>
                <option value="left_first">Left first</option>
                <option value="right_first">Right first</option>
                <option value="bilateral">Bilateral</option>
              </select>
            </div>
          </div>

          {/* Athlete selector */}
          <div>
            <p className="mb-1 text-[0.7rem] text-slate-400">Athlete</p>
            {loadingAthletes ? (
              <p className="text-[0.7rem] text-slate-500">
                Loading athletes…
              </p>
            ) : (
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[0.8rem]"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
              >
                <option value="">Select athlete…</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() ||
                      a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* File input */}
          <div>
            <p className="mb-1 text-[0.7rem] text-slate-400">
              Hawkin CSV file
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="w-full text-[0.75rem] text-slate-200 file:mr-3 file:rounded-full file:border-none file:bg-lime-400 file:px-3 file:py-1 file:text-[0.7rem] file:font-semibold file:text-slate-950 hover:file:brightness-110"
            />
            {file && (
              <p className="mt-1 text-[0.7rem] text-slate-500">
                Selected: {file.name}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Create force plate session"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-[0.7rem] text-slate-500">
          If the CSV headers from Hawkin don&apos;t match (e.g. different
          labels for &quot;Peak Force&quot; or &quot;Jump Height&quot;), we can
          tweak the parser in this file to align with your exact export format.
        </p>
      </section>
    </main>
  );
}