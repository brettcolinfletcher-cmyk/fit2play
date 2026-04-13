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

  const apiKey = process.env.MOTION_API_KEY;
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
    const athletesRes = await fetch(`${MOTION_BASE}/clients`, { headers });
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

    for (const raw of motionAthletes) {
      if (!raw || typeof raw !== "object") continue;
      const arow = raw as Record<string, unknown>;
      const motionAthleteId = arow.id != null ? String(arow.id) : null;
      if (!motionAthleteId) continue;

      let internalAthleteId = athleteIdCache.get(motionAthleteId);
      if (!internalAthleteId) {
        const { data: ath } = await supabase
          .from("athletes")
          .select("id")
          .eq("external_id", motionAthleteId)
          .maybeSingle();
        if (!ath?.id) continue;
        internalAthleteId = ath.id as string;
        athleteIdCache.set(motionAthleteId, internalAthleteId);
      }

      const listUrl = `${MOTION_BASE}/Session/Search?clientId=${encodeURIComponent(motionAthleteId)}`;
      const listRes = await fetch(listUrl, { headers });
      if (!listRes.ok) {
        const t = await listRes.text();
        errors.push(`workouts list ${motionAthleteId}: ${listRes.status} ${t.slice(0, 120)}`);
        continue;
      }
      const listPayload = await listRes.json();
      const summaries = asArray(listPayload);

      for (const sum of summaries) {
        if (!sum || typeof sum !== "object") continue;
        const s = sum as Record<string, unknown>;
        const wid = s.id != null ? String(s.id) : null;
        if (!wid) continue;

        const detailRes = await fetch(`${MOTION_BASE}/Session/${wid}`, {
          headers,
        });
        if (!detailRes.ok) {
          const t = await detailRes.text();
          errors.push(`workout ${wid}: ${detailRes.status} ${t.slice(0, 120)}`);
          continue;
        }
        const workout = (await detailRes.json()) as Record<string, unknown>;
        const sessionDate = workoutTimestamp(workout);
        if (new Date(sessionDate).getTime() < sinceMs) {
          continue;
        }

        const trainingRes = await fetch(
          `${MOTION_BASE}/TrainingData/Session/${wid}`,
          { headers }
        );
        if (!trainingRes.ok) {
          const t = await trainingRes.text();
          errors.push(
            `training data ${wid}: ${trainingRes.status} ${t.slice(0, 120)}`
          );
          continue;
        }
        const trainingPayload = await trainingRes.json();
        const trainingData =
          trainingPayload && typeof trainingPayload === "object"
            ? (trainingPayload as Record<string, unknown>)
            : {};

        const sub = exerciseLabel(workout);
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

        const repsRaw =
          trainingData.reps ??
          trainingData.Reps ??
          trainingData.trials ??
          (Array.isArray(trainingPayload) ? trainingPayload : null);
        const reps = Array.isArray(repsRaw)
          ? repsRaw
          : repsRaw == null
            ? asArray(trainingPayload)
            : [];

        const metricRows: {
          session_id: string;
          key: string;
          value: number;
          rep_index: number | null;
          side: null;
          unit: null;
        }[] = [];

        const seriesRows: {
          session_id: string;
          rep_index: number;
          series: Record<string, unknown>;
        }[] = [];

        reps.forEach((repRaw, idx) => {
          if (!repRaw || typeof repRaw !== "object") return;
          const rep = repRaw as Record<string, unknown>;
          const repIndex =
            typeof rep.repIndex === "number"
              ? rep.repIndex
              : typeof rep.rep_index === "number"
                ? rep.rep_index
                : idx + 1;

          for (const key of ["peakVelocity", "peakForce", "peakPower"] as const) {
            const v = rep[key];
            if (typeof v === "number" && !Number.isNaN(v)) {
              metricRows.push({
                session_id: sessionId,
                key,
                value: v,
                rep_index: repIndex,
                side: null,
                unit: null,
              });
            }
          }

          const velocity = Array.isArray(rep.velocity)
            ? rep.velocity
            : Array.isArray(rep.v)
              ? rep.v
              : [];
          const force = Array.isArray(rep.force)
            ? rep.force
            : Array.isArray(rep.f)
              ? rep.f
              : [];
          const position = Array.isArray(rep.position)
            ? rep.position
            : Array.isArray(rep.x)
              ? rep.x
              : [];

          if (velocity.length || force.length || position.length) {
            seriesRows.push({
              session_id: sessionId,
              rep_index: repIndex,
              series: {
                velocity,
                force,
                position,
              },
            });
          }
        });

        if (metricRows.length > 0) {
          const { error: mErr } = await supabase.from("metrics").insert(metricRows);
          if (mErr) {
            errors.push(`workout ${wid} metrics: ${mErr.message}`);
          }
        }

        if (seriesRows.length > 0) {
          const { error: tsErr } = await supabase
            .from("sprint_time_series")
            .insert(seriesRows);
          if (tsErr) {
            errors.push(`workout ${wid} time series: ${tsErr.message}`);
          }
        }
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
