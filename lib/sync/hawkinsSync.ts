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
  if (n.includes("sprint")) return "1080_sprint";
  if (n.includes("calf")) return "force_plate_calf";
  return "force_plate";
}

function flattenMetrics(
  obj: unknown,
  prefix = ""
): { key: string; value: number }[] {
  const out: { key: string; value: number }[] = [];
  if (obj == null) return out;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (
        item &&
        typeof item === "object" &&
        "name" in item &&
        typeof (item as { name: unknown }).name === "string" &&
        "value" in item &&
        typeof (item as { value: unknown }).value === "number"
      ) {
        const v = (item as { value: number }).value;
        if (!Number.isNaN(v)) {
          out.push({ key: (item as { name: string }).name, value: v });
        }
      }
    }
    return out;
  }
  if (typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "number" && !Number.isNaN(v)) {
      out.push({ key, value: v });
    } else if (v && typeof v === "object") {
      out.push(...flattenMetrics(v, key));
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
  const a = test.athlete;
  if (a && typeof a === "object" && "side" in a) {
    const s = (a as { side: unknown }).side;
    return s != null ? String(s) : null;
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

export async function runHawkinsSync(
  supabase: SupabaseClient
): Promise<HawkinsSyncResult> {
  const errors: string[] = [];
  let sessionsProcessed = 0;

  const tokenUrl = process.env.HAWKINS_TOKEN_URL;
  const refreshToken = process.env.HAWKINS_REFRESH_TOKEN;
  const apiBase = process.env.HAWKINS_API_BASE?.replace(/\/$/, "");

  if (!tokenUrl || !refreshToken || !apiBase) {
    const msg =
      "Missing HAWKINS_TOKEN_URL, HAWKINS_REFRESH_TOKEN, or HAWKINS_API_BASE " +
      "(set HAWKINS_TOKEN_URL to https://cloud.hawkindynamics.com/api/token)";
    await insertSyncLog(supabase, "hawkins", 0, msg);
    return { ok: false, sessionsProcessed: 0, error: msg };
  }

  try {
    const athletesUrl = `${apiBase}/athletes`;

    const tokenRes = await fetch(tokenUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        Accept: "application/json",
      },
    });
    const bodyText = await tokenRes.text();
    if (!tokenRes.ok) {
      throw new Error(`Hawkins token ${tokenRes.status}: ${bodyText}`);
    }

    let tokenJson: { access_token?: string };
    try {
      tokenJson = JSON.parse(bodyText) as { access_token?: string };
    } catch {
      throw new Error(`Hawkins token: invalid JSON: ${bodyText}`);
    }
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      throw new Error(`Hawkins token: missing access_token in body: ${bodyText}`);
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
          external_id: extId,
          first_name: first_name || null,
          last_name: last_name || null,
        },
        { onConflict: "external_id" }
      );
      if (upErr) {
        errors.push(`athlete ${extId}: ${upErr.message}`);
      }
    }

    const { data: lastLog } = await supabase
      .from("sync_log")
      .select("synced_at")
      .eq("source", "hawkins")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fromUnix = lastLog?.synced_at
      ? Math.floor(new Date(lastLog.synced_at as string).getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 86400 * 365;

    const testsUrl = `${apiBase}/tests?from=${fromUnix}`;
    const testsRes = await fetch(testsUrl, { headers: authHeaders });
    if (!testsRes.ok) {
      const t = await testsRes.text();
      throw new Error(`Hawkins /tests ${testsRes.status}: ${t.slice(0, 200)}`);
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
          .eq("external_id", extAthleteId)
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

      const metricsPayload = test.metrics ?? test.results ?? test.values;
      const flat = flattenMetrics(metricsPayload);

      const syncDedupeKey = `hawkins:${hawkinsTestId}`;

      const { data: sess, error: sErr } = await supabase
        .from("sessions")
        .upsert(
          {
            athlete_id: internalAthleteId,
            test_type: testType,
            test_sub_type: null,
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
