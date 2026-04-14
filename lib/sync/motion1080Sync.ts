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
        typeof row.name === "string"
          ? row.name
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

      const sessionDate = workoutTimestamp(s);

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
            session_date: sessionDate,
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

      await supabase.from("metrics").delete().eq("session_id", sessionId);
      await supabase.from("sprint_time_series").delete().eq("session_id", sessionId);
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
