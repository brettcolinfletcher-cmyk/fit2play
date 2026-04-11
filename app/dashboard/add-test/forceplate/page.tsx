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

type HawkinSubtype = "cmj" | "dj" | "imtp" | "other" | null;

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

  // Decide which row is "best"
  let best = rows[0];

  if (rows.some((r) => r.jumpHeight != null)) {
    // CMJ / DJ style → best jump height
    best = rows.reduce((acc, r) => {
      if (
        r.jumpHeight != null &&
        (acc.jumpHeight == null || r.jumpHeight > acc.jumpHeight)
      ) {
        return r;
      }
      return acc;
    }, rows[0]);
  } else if (rows.some((r) => r.peakForce != null)) {
    // IMTP style → best peak force
    best = rows.reduce((acc, r) => {
      if (
        r.peakForce != null &&
        (acc.peakForce == null || r.peakForce > acc.peakForce)
      ) {
        return r;
      }
      return acc;
    }, rows[0]);
  }

  // Detect subtype based on label text
  const label = best.rawLabel?.toLowerCase() || "";
  let subTestType: HawkinSubtype = null;

  if (label.includes("cmj")) subTestType = "cmj";
  else if (label.includes("drop") || label.includes("dj"))
    subTestType = "dj";
  else if (label.includes("imtp") || label.includes("isometric"))
    subTestType = "imtp";
  else if (label) subTestType = "other";

  // Helper for asymmetry (stronger − weaker / stronger * 100)
  const asymPct = (left?: number, right?: number): number | null => {
    if (left == null || right == null) return null;
    const max = Math.max(left, right);
    const min = Math.min(left, right);
    if (!isFinite(max) || max === 0) return null;
    return ((max - min) / max) * 100;
  };

  const metrics: Record<string, number | null> = {
    // Global "best" metrics
    fp_jump_height_cm_best: best.jumpHeight ?? null,
    fp_peak_force_n_best: best.peakForce ?? null,
    fp_peak_power_w_best: best.peakPower ?? null,
    fp_contact_time_s_best: best.contactTime ?? null,
    fp_flight_time_s_best: best.flightTime ?? null,
    fp_rsi_best: best.rsi ?? null,
    fp_rsimod_best: best.rsiMod ?? null,
    fp_braking_rfd_n_s_best: best.brakingRfd ?? null,
    fp_propulsive_rfd_n_s_best: best.propulsiveRfd ?? null,
    fp_braking_impulse_n_s_best: best.brakingImpulse ?? null,
    fp_propulsive_impulse_n_s_best: best.propulsiveImpulse ?? null,
    fp_body_mass_kg: best.bodyMass ?? null,

    // Left / right raw values
    fp_peak_force_l_n_best: best.peakForceL ?? null,
    fp_peak_force_r_n_best: best.peakForceR ?? null,
    fp_conc_impulse_l_n_s_best: best.concImpL ?? null,
    fp_conc_impulse_r_n_s_best: best.concImpR ?? null,
    fp_ecc_impulse_l_n_s_best: best.eccImpL ?? null,
    fp_ecc_impulse_r_n_s_best: best.eccImpR ?? null,
    fp_mean_force_l_n_best: best.meanForceL ?? null,
    fp_mean_force_r_n_best: best.meanForceR ?? null,

    // Asymmetries (%)
    fp_peak_force_lr_asym_pct_best: asymPct(
      best.peakForceL,
      best.peakForceR
    ),
    fp_conc_impulse_lr_asym_pct_best: asymPct(
      best.concImpL,
      best.concImpR
    ),
    fp_ecc_impulse_lr_asym_pct_best: asymPct(
      best.eccImpL,
      best.eccImpR
    ),
    fp_mean_force_lr_asym_pct_best: asymPct(
      best.meanForceL,
      best.meanForceR
    ),
  };

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