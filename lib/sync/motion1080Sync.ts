import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertSyncLog } from "./syncLog";

const MOTION_BASE = "https://publicapi.1080motion.com";
const MAX_TIME_SERIES_SAMPLES = 2000;

// ─── Helpers ────────────────────────────────────────────────────────────────

// 1080's own Client record field name for height hasn't been confirmed
// against a live payload (this sandbox can't reach publicapi.1080motion.com
// to check) — try the plausible field-name variants and normalise
// meters-vs-centimeters heuristically. Logged once via console.log (not
// pushed into `errors`, which would incorrectly flip sync `ok` to false)
// so the real field name is visible in Vercel function logs if none of
// these guesses match.
const HEIGHT_FIELD_CANDIDATES = [
  "height",
  "heightCm",
  "height_cm",
  "Height",
  "HeightCm",
  "athleteHeight",
  "stature",
  "heightInCentimeters",
  "heightInMeters",
];

function extractHeightCm(row: Record<string, unknown>): number | null {
  for (const key of HEIGHT_FIELD_CANDIDATES) {
    const raw = row[key];
    if (raw == null) continue;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n > 1 && n < 2.5) return n * 100; // meters -> cm
    if (n >= 50 && n <= 250) return n; // already cm
  }
  return null;
}

function splitAthleteName(name: string): { first_name: string; last_name: string } {
  const n = name.trim();
  const comma = n.indexOf(",");
  if (comma > 0) {
    return { last_name: n.slice(0, comma).trim(), first_name: n.slice(comma + 1).trim() };
  }
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function asArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && "data" in payload) {
    const d = (payload as { data: unknown }).data;
    if (Array.isArray(d)) return d;
  }
  return [];
}

function normalizeSide(side: unknown): string | null {
  // API may return integer (0=Unknown, 1=Left, 2=Right) or string
  if (typeof side === "number") {
    if (side === 1) return "left";
    if (side === 2) return "right";
    return null;
  }
  if (typeof side === "string") {
    const s = side.toLowerCase();
    if (s === "left") return "left";
    if (s === "right") return "right";
  }
  return null;
}

function tsToDate(ts: unknown): string {
  if (typeof ts === "number") {
    const ms = ts > 1e12 ? ts : ts * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof ts === "string") {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MetricRow = {
  session_id: string;
  key: string;
  value: number;
  rep_index: number | null;
  side: string | null;
  unit: string | null;
};

// ─── Metric extraction ────────────────────────────────────────────────────────

function extractMetricsFromTrainingData(
  sessionId: string,
  trainingData: unknown[]
): MetricRow[] {
  const rows: MetricRow[] = [];

  for (const setData of trainingData) {
    if (!setData || typeof setData !== "object") continue;
    const sd = setData as Record<string, unknown>;
    const motionGroups = sd.motionGroups;
    if (!Array.isArray(motionGroups)) continue;

    let repIndex = 0;
    for (const mg of motionGroups) {
      if (!mg || typeof mg !== "object") continue;
      const mgObj = mg as Record<string, unknown>;
      repIndex++;
      const side = normalizeSide(mgObj.side);

      const motions = mgObj.motions;
      if (!Array.isArray(motions)) continue;

      for (const motion of motions) {
        if (!motion || typeof motion !== "object") continue;
        const m = motion as Record<string, unknown>;

        const push = (key: string, value: unknown, unit: string | null = null) => {
          if (typeof value === "number" && !Number.isNaN(value) && isFinite(value) && value !== 0) {
            rows.push({ session_id: sessionId, key, value, rep_index: repIndex, side, unit });
          }
        };

        // Peak values
        const peaks = m.peakValues as Record<string, unknown> | undefined;
        if (peaks) {
          push("peak_speed", peaks.speed, "m/s");
          push("peak_force", peaks.force, "N");
          push("peak_power", peaks.power, "W");
          push("peak_acceleration", peaks.acceleration, "m/s2");
        }

        // Average values
        const avgs = m.averageValues as Record<string, unknown> | undefined;
        if (avgs) {
          push("avg_speed", avgs.speed, "m/s");
          push("avg_force", avgs.force, "N");
          push("avg_power", avgs.power, "W");
          push("avg_acceleration", avgs.acceleration, "m/s2");
        }

        // Top-level motion values
        push("top_speed", m.topSpeed, "m/s");
        push("total_distance", m.totalDistance, "m");
        push("total_time", m.totalTime, "s");

        // Accel/decel stats (sprint only)
        const stats = m.accelDecelStats as Record<string, unknown> | undefined;
        if (stats) {
          push("accel_max", stats.accelerationMax, "m/s2");
          push("decel_max", stats.decelerationMax, "m/s2");
          push("decel_time", stats.decelerationTime, "s");
          push("top_speed_position", stats.topSpeedPosition, "m");
        }

        // Load settings
        const res = m.resistanceValues as Record<string, unknown> | undefined;
        if (res) {
          push("external_load", res.concentricLoad, "kg");
        }
      }
    }
  }

  return rows;
}

function extractSplitMetrics(
  sessionId: string,
  splitData: unknown
): MetricRow[] {
  const rows: MetricRow[] = [];
  if (!splitData || typeof splitData !== "object") return rows;

  const sd = splitData as Record<string, unknown>;
  const reports = sd.reports;
  if (!Array.isArray(reports)) return rows;

  let repIndex = 0;
  for (const report of reports) {
    if (!report || typeof report !== "object") continue;
    repIndex++;
    const r = report as Record<string, unknown>;
    const splits = r.splits;
    if (!Array.isArray(splits)) continue;

    for (const split of splits) {
      if (!split || typeof split !== "object") continue;
      const s = split as Record<string, unknown>;
      const start = typeof s.start === "number" ? s.start : null;
      const end = typeof s.end === "number" ? s.end : null;
      if (start === null || end === null) continue;

      const distance = Math.round(end - start);
      if (distance <= 0) continue;

      if (typeof s.time === "number" && s.time > 0) {
        rows.push({
          session_id: sessionId,
          key: `split_${distance}m_time`,
          value: s.time,
          rep_index: repIndex,
          side: null,
          unit: "s",
        });
      }
      // topSpeed from split is derived from smooth filtered curve — preferred over raw peaks
      if (typeof s.topSpeed === "number" && s.topSpeed > 0) {
        rows.push({
          session_id: sessionId,
          key: `split_${distance}m_top_speed`,
          value: s.topSpeed,
          rep_index: repIndex,
          side: null,
          unit: "m/s",
        });
      }
      if (typeof s.maxForce === "number" && s.maxForce > 0) {
        rows.push({
          session_id: sessionId,
          key: `split_${distance}m_max_force`,
          value: s.maxForce,
          rep_index: repIndex,
          side: null,
          unit: "N",
        });
      }
    }
  }

  return rows;
}

// ─── In-rep time series (sampleData) ──────────────────────────────────────────

type DecodedMotionSample = {
  t: number;
  position: number;
  speed: number;
  acceleration: number;
  force: number;
};

type SprintSeriesPayload = {
  t: number[];
  x: number[];
  v: number[];
  a: number[];
  f: number[];
  p: number[];
};

function decodeSampleDataBinary(sampleData: unknown): DecodedMotionSample[] {
  if (typeof sampleData !== "string" || sampleData.trim() === "") return [];
  let buf: Buffer;
  try {
    buf = Buffer.from(sampleData, "base64");
  } catch {
    return [];
  }
  const samples: DecodedMotionSample[] = [];
  for (let i = 0; i + 20 <= buf.length; i += 20) {
    samples.push({
      t: buf.readFloatLE(i),
      position: buf.readFloatLE(i + 4),
      speed: buf.readFloatLE(i + 8),
      acceleration: buf.readFloatLE(i + 12),
      force: buf.readFloatLE(i + 16),
    });
  }
  return samples;
}

function downsampleSamples<T>(samples: T[], max: number): T[] {
  if (samples.length <= max) return samples;
  const step = Math.max(1, Math.ceil(samples.length / max));
  const out: T[] = [];
  for (let i = 0; i < samples.length; i += step) {
    out.push(samples[i]);
    if (out.length >= max) break;
  }
  return out;
}

function samplesToSeriesPayload(samples: DecodedMotionSample[]): SprintSeriesPayload {
  const t = samples.map((s) => s.t);
  const x = samples.map((s) => s.position);
  const v = samples.map((s) => s.speed);
  const a = samples.map((s) => s.acceleration);
  const f = samples.map((s) => s.force);
  const p = v.map((vi, i) => {
    const fi = f[i];
    if (Number.isFinite(vi) && Number.isFinite(fi)) return vi * fi;
    return 0;
  });
  return { t, x, v, a, f, p };
}

async function fetchTrainingDataWithSamples(
  externalId: string,
  headers: HeadersInit,
  errors: string[]
): Promise<unknown[]> {
  const url = `${MOTION_BASE}/TrainingData/Session/${encodeURIComponent(externalId)}?includeSamples=true`;
  const tdRes = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  if (!tdRes.ok) {
    errors.push(`time series ${externalId}: TrainingData HTTP ${tdRes.status}`);
    return [];
  }
  const tdRaw = await tdRes.json();
  if (Array.isArray(tdRaw)) return tdRaw;
  return asArray(tdRaw);
}

/**
 * After metrics sync: pull raw per-rep samples into sprint_time_series.
 * Skips sessions that already have any time-series rows.
 */
async function sync1080SprintTimeSeries(
  supabase: SupabaseClient,
  headers: HeadersInit,
  errors: string[]
): Promise<number> {
  let inserted = 0;

  const { data: sessions, error: listErr } = await supabase
    .from("sessions")
    .select("id, external_id")
    .eq("source", "1080")
    .eq("test_type", "1080_sprint")
    .not("external_id", "is", null);

  if (listErr) {
    errors.push(`time series: list sessions — ${listErr.message}`);
    return 0;
  }

  for (const srow of sessions ?? []) {
    const sessionId = srow.id as string;
    const externalId = srow.external_id as string;
    if (!externalId) continue;

    const { count, error: cntErr } = await supabase
      .from("sprint_time_series")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (cntErr) {
      errors.push(`time series count ${sessionId}: ${cntErr.message}`);
      continue;
    }
    if ((count ?? 0) > 0) continue;

    let trainingData: unknown[];
    try {
      trainingData = await fetchTrainingDataWithSamples(
        externalId,
        headers,
        errors
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`time series session ${externalId}: fetch ${msg}`);
      continue;
    }

    const rowsToInsert: {
      session_id: string;
      rep_index: number;
      series: SprintSeriesPayload;
    }[] = [];

    let repCounter = 0;
    for (const setData of trainingData) {
      if (!setData || typeof setData !== "object") continue;
      const sd = setData as Record<string, unknown>;
      const motionGroups = sd.motionGroups;
      if (!Array.isArray(motionGroups)) continue;

      for (const mg of motionGroups) {
        if (!mg || typeof mg !== "object") continue;
        const mgObj = mg as Record<string, unknown>;
        repCounter++;
        const motions = mgObj.motions;
        if (!Array.isArray(motions)) continue;

        const combined: DecodedMotionSample[] = [];
        for (const motion of motions) {
          if (!motion || typeof motion !== "object") continue;
          const m = motion as Record<string, unknown>;
          combined.push(...decodeSampleDataBinary(m.sampleData));
        }

        if (combined.length === 0) continue;

        const down = downsampleSamples(combined, MAX_TIME_SERIES_SAMPLES);
        const series = samplesToSeriesPayload(down);
        if (series.t.length === 0) continue;

        rowsToInsert.push({
          session_id: sessionId,
          rep_index: repCounter,
          series,
        });
      }
    }

    if (rowsToInsert.length === 0) continue;

    const { data: insData, error: insErr } = await supabase
      .from("sprint_time_series")
      .insert(rowsToInsert)
      .select("id");

    if (insErr) {
      errors.push(`time series insert ${externalId}: ${insErr.message}`);
    } else {
      inserted += insData?.length ?? 0;
    }
  }

  return inserted;
}

// ─── Main sync ────────────────────────────────────────────────────────────────

export type Motion1080SyncResult = {
  ok: boolean;
  sessionsProcessed: number;
  timeSeriesRowsInserted: number;
  error?: string;
};

export async function runMotion1080Sync(
  supabase: SupabaseClient
): Promise<Motion1080SyncResult> {
  const errors: string[] = [];
  let sessionsProcessed = 0;

  const apiKey = process.env.MOTION_API_KEY ?? "";
  if (!apiKey) {
    const msg = "Missing MOTION_API_KEY";
    await insertSyncLog(supabase, "1080", 0, msg);
    return { ok: false, sessionsProcessed: 0, timeSeriesRowsInserted: 0, error: msg };
  }

  const headers = { "X-1080-API-Key": apiKey, Accept: "application/json" };

  try {
    // ── 1. Sync athletes ──────────────────────────────────────────────────────
    const athletesRes = await fetch(`${MOTION_BASE}/Client`, { headers });
    if (!athletesRes.ok) {
      throw new Error(`1080 /Client ${athletesRes.status}: ${(await athletesRes.text()).slice(0, 200)}`);
    }
    const motionAthletes = asArray(await athletesRes.json());

    let loggedSampleClient = false;
    for (const raw of motionAthletes) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const extId = row.id != null ? String(row.id) : null;
      if (!extId) continue;

      if (!loggedSampleClient) {
        // One-time diagnostic — not pushed into `errors` (would flip sync
        // `ok` to false for a non-error). Check Vercel function logs for
        // this line if height still isn't coming across after a sync.
        console.log("[1080 sync] sample Client record keys:", Object.keys(row).join(", "));
        loggedSampleClient = true;
      }

      const nameStr =
        typeof row.displayName === "string"
          ? row.displayName
          : [row.firstName, row.lastName].filter(Boolean).join(" ") || "";
      const { first_name, last_name } = nameStr
        ? splitAthleteName(nameStr)
        : { first_name: "", last_name: "" };

      const heightCm = extractHeightCm(row);

      const { error: upErr } = await supabase.from("athletes").upsert(
        {
          motion1080_external_id: extId,
          first_name: first_name || null,
          last_name: last_name || null,
          // 1080 is treated as the authoritative source for height (per
          // Brett) — only included when found, so a sync with no match
          // doesn't null out anything already on file.
          ...(heightCm != null ? { height_cm: heightCm } : {}),
        },
        { onConflict: "motion1080_external_id" }
      );
      if (upErr) errors.push(`athlete ${extId}: ${upErr.message}`);
    }

    // ── 2. List sessions ──────────────────────────────────────────────────────
    const listRes = await fetch(`${MOTION_BASE}/Session/Search?take=500`, { headers });
    if (!listRes.ok) {
      throw new Error(`1080 Session/Search ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
    }
    const summaries = asArray(await listRes.json());

    const athleteIdCache = new Map<string, string>();

    // ── 3. Process each session ───────────────────────────────────────────────
    for (const sum of summaries) {
      if (!sum || typeof sum !== "object") continue;
      const s = sum as Record<string, unknown>;
      const wid = s.id != null ? String(s.id) : null;
      const clientId =
        s.clientId != null ? String(s.clientId)
        : s.client_id != null ? String(s.client_id)
        : null;
      if (!wid || !clientId) continue;

      // Resolve internal athlete ID
      let internalAthleteId = athleteIdCache.get(clientId);
      if (!internalAthleteId) {
        const { data: ath } = await supabase
          .from("athletes")
          .select("id")
          .eq("motion1080_external_id", clientId)
          .maybeSingle();
        if (!ath?.id) {
          errors.push(`session ${wid}: no athlete for clientId ${clientId}`);
          continue;
        }
        internalAthleteId = ath.id as string;
        athleteIdCache.set(clientId, internalAthleteId);
      }

      const sessionDate = tsToDate(s.timestamp);
      const syncDedupeKey = `1080:${wid}`;

      // ── 3a. Upsert session ────────────────────────────────────────────────
      const { data: sess, error: sErr } = await supabase
        .from("sessions")
        .upsert(
          {
            athlete_id: internalAthleteId,
            test_type: "1080_sprint",
            test_sub_type: null,
            file_name: null,
            source: "1080",
            external_id: wid,
            session_date: sessionDate,
            device: "1080 Motion",
            sync_dedupe_key: syncDedupeKey,
          },
          { onConflict: "sync_dedupe_key" }
        )
        .select("id")
        .single();

      if (sErr || !sess?.id) {
        errors.push(`session ${wid}: upsert failed — ${sErr?.message ?? "no id"}`);
        continue;
      }

      const sessionId = sess.id as string;
      sessionsProcessed++;

      try {
        // ── 3b. Fetch TrainingData (actual metrics) ───────────────────────────
        const tdRes = await fetch(`${MOTION_BASE}/TrainingData/Session/${wid}`, {
          headers,
          signal: AbortSignal.timeout(60_000),
        });

        if (!tdRes.ok) {
          errors.push(`session ${wid} TrainingData: HTTP ${tdRes.status}`);
        } else {
          const tdRaw = await tdRes.json();
          const trainingData = Array.isArray(tdRaw) ? tdRaw : [];

          // Derive exercise name from first set
          let exerciseName: string | null = null;
          if (trainingData.length > 0) {
            const first = trainingData[0] as Record<string, unknown>;
            if (typeof first.exerciseName === "string") exerciseName = first.exerciseName;
          }

          // Update session with exercise name
          await supabase
            .from("sessions")
            .update({ test_sub_type: exerciseName })
            .eq("id", sessionId);

          // Clear old metrics and insert new
          await supabase.from("metrics").delete().eq("session_id", sessionId);

          const metricRows = extractMetricsFromTrainingData(sessionId, trainingData);
          if (metricRows.length > 0) {
            const { error: mErr } = await supabase.from("metrics").insert(metricRows);
            if (mErr) errors.push(`session ${wid} metrics insert: ${mErr.message}`);
          }
        }

        // ── 3c. Fetch Split data ──────────────────────────────────────────────
        const splitRes = await fetch(
          `${MOTION_BASE}/Split/Session/${wid}?splitLength=5&includeRawPeaksAndAverages=false`,
          { headers, signal: AbortSignal.timeout(30_000) }
        );

        if (splitRes.ok) {
          const splitRaw = await splitRes.json();
          const splitRows = extractSplitMetrics(sessionId, splitRaw);
          if (splitRows.length > 0) {
            await supabase.from("metrics").insert(splitRows);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`session ${wid}: ${msg}`);
      }
    }

    const timeSeriesRowsInserted = await sync1080SprintTimeSeries(
      supabase,
      headers,
      errors
    );

    const errStr = errors.length ? errors.join(" | ") : null;
    await insertSyncLog(supabase, "1080", sessionsProcessed, errStr);
    return {
      ok: errors.length === 0,
      sessionsProcessed,
      timeSeriesRowsInserted,
      error: errStr ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await insertSyncLog(supabase, "1080", sessionsProcessed, msg);
    return {
      ok: false,
      sessionsProcessed,
      timeSeriesRowsInserted: 0,
      error: msg,
    };
  }
}
