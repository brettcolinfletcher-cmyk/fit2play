import type { SupabaseClient } from "@supabase/supabase-js";
import { insertSyncLog } from "./syncLog";

function splitAthleteName(name: string): { first_name: string; last_name: string } {
  const n = name.trim();
  const comma = n.indexOf(",");
  if (comma > 0) {
    return {
      last_name: n.slice(0, comma).trim(),
      first_name: n.slice(comma + 1).trim(),
    };
  }
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function mapHawkinsTestType(name: string | undefined): string {
  const n = (name || "").toLowerCase();
  if (n.includes("countermovement") || n === "cmj") return "force_plate_cmj";
  if (n.includes("drop jump")) return "force_plate_dj";
  if (n.includes("mid-thigh") || n.includes("imtp")) return "force_plate_imtp";
  if (n.includes("isometric")) return "force_plate_isometric";
  if (n.includes("sprint")) return "1080_sprint";
  if (n.includes("calf")) return "force_plate_calf";
  return "force_plate";
}

// Keys that are NOT metrics — skip these when extracting top-level numeric fields
const HAWKINS_NON_METRIC_KEYS = new Set([
  "id", "timestamp", "segment", "testType", "athlete", "active",
]);

// Jump-type tests ("fpPanelKind" === "jump" in SessionTestSummaryPanels.tsx) are read
// everywhere downstream — ForcePlateCMJSection, ForcePlateDJSection, athleteSnapshot,
// compareMetrics, qualityModel, pdfReportChartData — via keys prefixed "fp_" (e.g.
// "fp_jump_height", "fp_left_avg_propulsive_force"). That convention comes from the
// manual CSV-upload path (lib/uploadForceplateNormalize.ts). Isometric/IMTP/calf tests
// are read as bare canonical keys by DynamometrySection instead — do NOT prefix those.
const HAWKINS_JUMP_TEST_TYPES = new Set([
  "force_plate_cmj",
  "force_plate_dj",
  "force_plate",
]);

function flattenMetrics(
  test: Record<string, unknown>,
  testType: string
): { key: string; value: number }[] {
  const out: { key: string; value: number }[] = [];
  const prefix = HAWKINS_JUMP_TEST_TYPES.has(testType) ? "fp_" : "";
  for (const [k, v] of Object.entries(test)) {
    if (HAWKINS_NON_METRIC_KEYS.has(k)) continue;
    if (typeof v === "number" && !Number.isNaN(v)) {
      // Convert to snake_case canonical key
      const canonicalKey = k
        .replace(/\(.*?\)/g, "")   // strip units in parens e.g. "Peak Force(N)" -> "Peak Force"
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      out.push({ key: `${prefix}${canonicalKey}`, value: v });
    }
  }
  return out;
}

function hawkinsAthleteId(test: Record<string, unknown>): string | null {
  const a = test.athlete;
  if (a && typeof a === "object" && "id" in a) {
    const id = (a as { id: unknown }).id;
    return id != null ? String(id) : null;
  }
  return null;
}

function hawkinsAthleteSide(test: Record<string, unknown>): string | null {
  // Side comes from testType.tags, not athlete.side
  const tt = test.testType;
  if (tt && typeof tt === "object") {
    const tags = (tt as { tags?: { name?: string }[] }).tags ?? [];
    for (const tag of tags) {
      const n = (tag.name ?? "").toLowerCase();
      if (n === "left") return "left";
      if (n === "right") return "right";
    }
  }
  return null;
}

function normalizeHawkinsAthleteList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: unknown[] }).data;
  }
  return [];
}

export type HawkinsSyncResult = {
  ok: boolean;
  sessionsProcessed: number;
  error?: string;
};

// Optional explicit window, in unix seconds — used for manual backfill runs.
// When provided, the automatic watermark lookup below is skipped entirely.
export type HawkinsSyncRange = { fromUnix: number; toUnix: number };

export async function runHawkinsSync(
  supabase: SupabaseClient,
  range?: HawkinsSyncRange
): Promise<HawkinsSyncResult> {
  const errors: string[] = [];
  let sessionsProcessed = 0;

  const refreshToken = process.env.HAWKINS_REFRESH_TOKEN;
  const apiBase = process.env.HAWKINS_API_BASE;
  const tokenUrl = process.env.HAWKINS_TOKEN_URL;

  if (!refreshToken || !apiBase || !tokenUrl) {
    const msg =
      "Missing HAWKINS_REFRESH_TOKEN, HAWKINS_API_BASE, or HAWKINS_TOKEN_URL";
    await insertSyncLog(supabase, "hawkins", 0, msg);
    return { ok: false, sessionsProcessed: 0, error: msg };
  }

  try {
    const athletesUrl = `${apiBase}/athletes`;

    const tokenRes = await fetch(tokenUrl, {
      method: "GET",
      headers: {
       "Authorization": `Bearer ${refreshToken}`,
        "Accept": "application/json",
      },
    });
    const bodyText = await tokenRes.text();
    if (!tokenRes.ok) {
      throw new Error(`Hawkins token failed [url=${process.env.HAWKINS_TOKEN_URL}]: status ${tokenRes.status}, body: ${bodyText}`);
    }
    let tokenJson: { access_token?: string };
    try {
      tokenJson = JSON.parse(bodyText) as { access_token?: string };
    } catch {
      throw new Error(`Hawkins token invalid JSON: ${bodyText}`);
    }
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      throw new Error(`Hawkins token missing access_token: ${bodyText}`);
    }

    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    const athletesRes = await fetch(athletesUrl, {
      headers: authHeaders,
    });
    if (!athletesRes.ok) {
      const t = await athletesRes.text();
      throw new Error(`Hawkins /athletes ${athletesRes.status}: ${t.slice(0, 200)}`);
    }
    const hawkinsAthletes = (await athletesRes.json()) as unknown;
    const athleteList = normalizeHawkinsAthleteList(hawkinsAthletes);

    for (const raw of athleteList) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as { id?: unknown; name?: unknown };
      const extId = row.id != null ? String(row.id) : null;
      const nameStr = typeof row.name === "string" ? row.name : "";
      if (!extId || !nameStr) continue;

      const { first_name, last_name } = splitAthleteName(nameStr);
      const { error: upErr } = await supabase.from("athletes").upsert(
        {
          hawkins_external_id: extId,
          first_name: first_name || null,
          last_name: last_name || null,
        },
        { onConflict: "hawkins_external_id" }
      );
      if (upErr) {
        errors.push(`athlete ${extId}: ${upErr.message}`);
      }
    }

    let fromUnix: number;
    let nowUnix: number;

    if (range) {
      // Manual backfill call — use the caller's explicit window verbatim.
      fromUnix = range.fromUnix;
      nowUnix = range.toUnix;
    } else {
      // Watermark = last SUCCESSFUL sync only (errors IS NULL). A failed run must
      // never advance the window: otherwise one failure stamps sync_log with "now"
      // and every subsequent run asks Hawkins for a near-empty recent window.
      const { data: lastLog } = await supabase
        .from("sync_log")
        .select("synced_at")
        .eq("source", "hawkins")
        .is("errors", null)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Re-sync a small overlap so boundary tests are never missed; duplicates are
      // idempotent via sync_dedupe_key (upsert onConflict).
      const OVERLAP_SECONDS = 3600;
      nowUnix = Math.floor(Date.now() / 1000);
      // IMPORTANT: this fallback only fires when there has NEVER been a
      // successful sync yet, so it must stay small. Hawkins' /tests endpoint
      // 500s (empty body) once the requested window's response gets too large
      // — a full year (the old value here) reliably triggers that, which meant
      // this fallback ran on *every* cron tick forever and could never
      // succeed once, so the watermark could never advance either. 7 days is
      // safe for normal daily testing volume. Anything older than 7 days at
      // the time this ships needs an explicit backfill call with `range`.
      fromUnix = lastLog?.synced_at
        ? Math.floor(new Date(lastLog.synced_at as string).getTime() / 1000) -
          OVERLAP_SECONDS
        : nowUnix - 86400 * 7;
    }

    // CORRECTED (per Hawkin Dynamics' public API reference at
    // connect.hawkindynamics.com/api): incremental sync uses `syncFrom` /
    // `syncTo` as a bounded pair — NOT `from`/`to`/`sync=true`, which is what
    // this used to send. `from`/`to` alone is documented for month-granularity
    // historical bulk export, and `syncFrom` without a paired `syncTo` fetches
    // unbounded-to-now, which is almost certainly why every previous attempt
    // — including small windows and the "full export" probe — 500'd with an
    // empty body: none of the old param combinations match a real API mode.
    const testsUrl = `${apiBase}?syncFrom=${fromUnix}&syncTo=${nowUnix}`;
    const testsRes = await fetch(testsUrl, { headers: authHeaders });
    if (!testsRes.ok) {
      const t = await testsRes.text();
      throw new Error(`Hawkins tests ${testsRes.status}: ${t.slice(0, 200)}`);
    }
    const testsPayload = (await testsRes.json()) as unknown;
    const tests = Array.isArray(testsPayload)
      ? testsPayload
      : Array.isArray((testsPayload as { data?: unknown })?.data)
        ? (testsPayload as { data: unknown[] }).data
        : [];

    const athleteIdCache = new Map<string, string>();

    for (const raw of tests) {
      if (!raw || typeof raw !== "object") continue;
      const test = raw as Record<string, unknown>;
      const hawkinsTestId =
        test.id != null ? String(test.id) : JSON.stringify(test).slice(0, 64);
      const extAthleteId = hawkinsAthleteId(test);
      if (!extAthleteId) {
        errors.push(`test ${hawkinsTestId}: missing athlete id`);
        continue;
      }

      let internalAthleteId = athleteIdCache.get(extAthleteId);
      if (!internalAthleteId) {
        const { data: ath, error: aErr } = await supabase
          .from("athletes")
          .select("id")
          .eq("hawkins_external_id", extAthleteId)
          .maybeSingle();
        if (aErr || !ath?.id) {
          errors.push(`test ${hawkinsTestId}: no local athlete for ${extAthleteId}`);
          continue;
        }
        internalAthleteId = ath.id as string;
        athleteIdCache.set(extAthleteId, internalAthleteId);
      }

      const tsRaw = test.timestamp;
      const tsMs =
        typeof tsRaw === "number"
          ? tsRaw > 1e12
            ? tsRaw
            : tsRaw * 1000
          : Date.now();
      const sessionDate = new Date(tsMs).toISOString();

      const typeName =
        test.testType && typeof test.testType === "object" && "name" in test.testType
          ? String((test.testType as { name: unknown }).name)
          : undefined;
      const testType = mapHawkinsTestType(typeName);
      const side = hawkinsAthleteSide(test);
      // Store segment as test_sub_type (e.g. "TS Isometric Test-Abduction-Right-Supine:1")
      const segment = typeof test.segment === "string" ? test.segment : null;

      const flat = flattenMetrics(test, testType);

      const syncDedupeKey = `hawkins:${hawkinsTestId}`;

      const { data: sess, error: sErr } = await supabase
        .from("sessions")
        .upsert(
          {
            athlete_id: internalAthleteId,
            test_type: testType,
            test_sub_type: segment,
            file_name: null,
            source: "hawkins",
            external_id: hawkinsTestId,
            session_date: sessionDate,
            device: "Hawkins",
            sync_dedupe_key: syncDedupeKey,
          },
          { onConflict: "sync_dedupe_key" }
        )
        .select("id")
        .single();

      if (sErr || !sess?.id) {
        errors.push(`test ${hawkinsTestId}: session ${sErr?.message ?? "no id"}`);
        continue;
      }

      const sessionId = sess.id as string;
      sessionsProcessed += 1;

      await supabase.from("metrics").delete().eq("session_id", sessionId);

      if (flat.length > 0) {
        const rows = flat.map(({ key, value }) => ({
          session_id: sessionId,
          key,
          value,
          rep_index: null as number | null,
          side,
          unit: null as string | null,
        }));
        const { error: mErr } = await supabase.from("metrics").insert(rows);
        if (mErr) {
          errors.push(`test ${hawkinsTestId} metrics: ${mErr.message}`);
        }
      }
    }

    const errStr = errors.length ? errors.join(" | ") : null;
    await insertSyncLog(supabase, "hawkins", sessionsProcessed, errStr);
    return {
      ok: errors.length === 0,
      sessionsProcessed,
      error: errStr ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await insertSyncLog(supabase, "hawkins", sessionsProcessed, msg);
    return { ok: false, sessionsProcessed, error: msg };
  }
}
// Tue 14 Apr 2026 09:26:42 AWST
