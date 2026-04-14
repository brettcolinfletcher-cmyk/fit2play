import type { SupabaseClient } from "@supabase/supabase-js";
import { insertSyncLog } from "./syncLog";

const MOTION_BASE = "https://publicapi.1080motion.com";

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

function asArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && "data" in payload) {
    const d = (payload as { data: unknown }).data;
    if (Array.isArray(d)) return d;
  }
  return [];
}

function workoutTimestamp(w: Record<string, unknown>): string {
  const t =
    w.timestamp ?? w.startTime ?? w.startedAt ?? w.date ?? w.createdAt;
  if (typeof t === "number") {
    const ms = t > 1e12 ? t : t * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof t === "string") {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

function exerciseLabel(w: Record<string, unknown>): string | null {
  if (typeof w.exerciseName === "string") return w.exerciseName;
  if (typeof w.name === "string") return w.name;
  const ex = w.exercise;
  if (ex && typeof ex === "object" && "name" in ex) {
    const n = (ex as { name: unknown }).name;
    return typeof n === "string" ? n : null;
  }
  return null;
}

function parseCreatedToIso(t: unknown): string | null {
  if (t == null || t === "") return null;
  if (typeof t === "number") {
    const ms = t > 1e12 ? t : t * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof t === "string") {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function sessionDateFromDetail(
  detail: Record<string, unknown>,
  summaryFallback: string
): string {
  const fromCreated = parseCreatedToIso(detail.created);
  if (fromCreated) return fromCreated;
  const exercises = detail.exercises;
  if (Array.isArray(exercises) && exercises[0] && typeof exercises[0] === "object") {
    const ex0 = exercises[0] as Record<string, unknown>;
    const fromExCreated = parseCreatedToIso(ex0.created);
    if (fromExCreated) return fromExCreated;
  }
  return summaryFallback;
}

function collectMetricsFrom1080Detail(
  sessionId: string,
  detail: Record<string, unknown>
): {
  session_id: string;
  key: string;
  value: number;
  rep_index: number | null;
  side: string | null;
  unit: string | null;
}[] {
  const rows: {
    session_id: string;
    key: string;
    value: number;
    rep_index: number | null;
    side: string | null;
    unit: string | null;
  }[] = [];

  const exercises = detail.exercises;
  if (!Array.isArray(exercises)) return rows;

  let setIndex = 0;
  for (const ex of exercises) {
    if (!ex || typeof ex !== "object") continue;
    const sets = (ex as Record<string, unknown>).sets;
    if (!Array.isArray(sets)) continue;
    for (const setRaw of sets) {
      if (!setRaw || typeof setRaw !== "object") continue;
      setIndex += 1;
      const rep_index = setIndex;
      const setObj = setRaw as Record<string, unknown>;
      for (const [key, value] of Object.entries(setObj)) {
        if (typeof value === "number" && !Number.isNaN(value) && value !== 0) {
          rows.push({
            session_id: sessionId,
            key,
            value,
            rep_index,
            side: null,
            unit: null,
          });
        }
      }
    }
  }

  return rows;
}

function isNumericArray(u: unknown): u is number[] {
  return (
    Array.isArray(u) &&
    u.length > 0 &&
    u.every((x) => typeof x === "number" && !Number.isNaN(x))
  );
}

function pickNumericArray(
  setObj: Record<string, unknown>,
  names: string[]
): number[] {
  for (const n of names) {
    const v = setObj[n];
    if (isNumericArray(v)) return v;
  }
  return [];
}

function collectSeriesFrom1080Detail(
  sessionId: string,
  detail: Record<string, unknown>
): { session_id: string; rep_index: number; series: Record<string, unknown> }[] {
  const out: { session_id: string; rep_index: number; series: Record<string, unknown> }[] =
    [];

  const exercises = detail.exercises;
  if (!Array.isArray(exercises)) return out;

  const pad = (arr: number[], n: number) => {
    const copy = [...arr];
    while (copy.length < n) copy.push(0);
    return copy.slice(0, n);
  };

  let setIndex = 0;
  for (const ex of exercises) {
    if (!ex || typeof ex !== "object") continue;
    const sets = (ex as Record<string, unknown>).sets;
    if (!Array.isArray(sets)) continue;
    for (const setRaw of sets) {
      if (!setRaw || typeof setRaw !== "object") continue;
      setIndex += 1;
      const setObj = setRaw as Record<string, unknown>;

      const numericArrays: number[][] = [];
      for (const v of Object.values(setObj)) {
        if (isNumericArray(v)) numericArrays.push(v);
      }
      if (numericArrays.length === 0) continue;

      let t = pickNumericArray(setObj, [
        "time_ms",
        "timeMs",
        "t",
        "time",
        "timestamp",
      ]);
      const v = pickNumericArray(setObj, ["velocity", "v"]);
      const f = pickNumericArray(setObj, ["force", "f"]);
      const p = pickNumericArray(setObj, ["power", "p"]);
      const x = pickNumericArray(setObj, ["position", "x"]);
      const a = pickNumericArray(setObj, ["acceleration", "a"]);

      const len = Math.max(
        t.length,
        v.length,
        f.length,
        p.length,
        x.length,
        a.length,
        ...numericArrays.map((arr) => arr.length)
      );
      if (len === 0) continue;

      if (t.length === 0 && numericArrays[0]) {
        t = numericArrays[0];
      }

      const n = len;
      const series = {
        t: pad(t, n),
        x: pad(x, n),
        v: pad(v, n),
        a: pad(a, n),
        f: pad(f, n),
        p: pad(p, n),
      };

      out.push({ session_id: sessionId, rep_index: setIndex, series });
    }
  }

  return out;
}

export type Motion1080SyncResult = {
  ok: boolean;
  sessionsProcessed: number;
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
    return { ok: false, sessionsProcessed: 0, error: msg };
  }

  const headers = {
    "X-1080-API-Key": apiKey,
    Accept: "application/json",
  };

  try {
    const athletesRes = await fetch(`${MOTION_BASE}/Client`, { headers });
    if (!athletesRes.ok) {
      const t = await athletesRes.text();
      throw new Error(`1080 /athletes ${athletesRes.status}: ${t.slice(0, 200)}`);
    }
    const athletesPayload = await athletesRes.json();
    const motionAthletes = asArray(athletesPayload);

    for (const raw of motionAthletes) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const extId = row.id != null ? String(row.id) : null;
      const nameStr =
        typeof row.displayName === "string"
          ? row.displayName
          : [row.firstName, row.lastName].filter(Boolean).join(" ") || "";
      if (!extId) continue;

      const { first_name, last_name } = nameStr
        ? splitAthleteName(nameStr)
        : { first_name: "", last_name: "" };

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
      .eq("source", "1080")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sinceMs = lastLog?.synced_at
      ? new Date(lastLog.synced_at as string).getTime()
      : Date.now() - 86400000 * 365;

    const athleteIdCache = new Map<string, string>();

    const listRes = await fetch(`${MOTION_BASE}/Session/Search?take=500`, {
      headers,
    });
    if (!listRes.ok) {
      const t = await listRes.text();
      throw new Error(`1080 Session/Search ${listRes.status}: ${t.slice(0, 200)}`);
    }
    const listPayload = await listRes.json();
    const summaries = asArray(listPayload);

    for (const sum of summaries) {
      if (!sum || typeof sum !== "object") continue;
      const s = sum as Record<string, unknown>;
      const wid = s.id != null ? String(s.id) : null;
      const clientId =
        s.clientId != null
          ? String(s.clientId)
          : s.client_id != null
            ? String(s.client_id)
            : null;
      if (!wid || !clientId) continue;

      let internalAthleteId = athleteIdCache.get(clientId);
      if (!internalAthleteId) {
        const { data: ath } = await supabase
          .from("athletes")
          .select("id")
          .eq("external_id", clientId)
          .maybeSingle();
        if (!ath?.id) {
          errors.push(`session ${wid}: no athlete for clientId ${clientId}`);
          continue;
        }
        internalAthleteId = ath.id as string;
        athleteIdCache.set(clientId, internalAthleteId);
      }

      const summarySessionDate = workoutTimestamp(s);

      const sub = exerciseLabel(s);
      const syncDedupeKey = `1080:${wid}`;

      const { data: sess, error: sErr } = await supabase
        .from("sessions")
        .upsert(
          {
            athlete_id: internalAthleteId,
            test_type: "1080_sprint",
            test_sub_type: sub,
            file_name: null,
            source: "1080",
            external_id: wid,
            session_date: summarySessionDate,
            device: "1080 Motion",
            sync_dedupe_key: syncDedupeKey,
          },
          { onConflict: "sync_dedupe_key" }
        )
        .select("id")
        .single();

      if (sErr || !sess?.id) {
        errors.push(`workout ${wid}: session ${sErr?.message ?? "no id"}`);
        continue;
      }

      const sessionId = sess.id as string;
      sessionsProcessed += 1;

      try {
        const detailRes = await fetch(`${MOTION_BASE}/Session/${wid}`, {
          headers,
          signal: AbortSignal.timeout(120_000),
        });
        if (!detailRes.ok) {
          const t = await detailRes.text();
          errors.push(
            `session ${wid} detail: ${detailRes.status} ${t.slice(0, 120)}`
          );
        } else {
          const detail = (await detailRes.json()) as Record<string, unknown>;
          const finalDate = sessionDateFromDetail(detail, summarySessionDate);
          const exArr = detail.exercises;
          const subFromDetail =
            Array.isArray(exArr) &&
            exArr[0] &&
            typeof exArr[0] === "object" &&
            typeof (exArr[0] as Record<string, unknown>).exerciseTypeName ===
              "string"
              ? ((exArr[0] as Record<string, unknown>).exerciseTypeName as string)
              : sub;

          await supabase
            .from("sessions")
            .update({
              session_date: finalDate,
              test_sub_type: subFromDetail,
            })
            .eq("id", sessionId);

          await supabase.from("metrics").delete().eq("session_id", sessionId);
          await supabase.from("sprint_time_series").delete().eq("session_id", sessionId);

          const metricRows = collectMetricsFrom1080Detail(sessionId, detail);
          const seriesRows = collectSeriesFrom1080Detail(sessionId, detail);

          if (metricRows.length > 0) {
            const { error: mErr } = await supabase.from("metrics").insert(metricRows);
            if (mErr) {
              errors.push(`session ${wid} metrics: ${mErr.message}`);
            }
          }

          if (seriesRows.length > 0) {
            const { error: tsErr } = await supabase
              .from("sprint_time_series")
              .insert(seriesRows);
            if (tsErr) {
              errors.push(`session ${wid} time series: ${tsErr.message}`);
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`session ${wid} detail: ${msg}`);
      }
    }

    const errStr = errors.length ? errors.join(" | ") : null;
    await insertSyncLog(supabase, "1080", sessionsProcessed, errStr);
    return {
      ok: errors.length === 0,
      sessionsProcessed,
      error: errStr ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await insertSyncLog(supabase, "1080", sessionsProcessed, msg);
    return { ok: false, sessionsProcessed, error: msg };
  }
}
