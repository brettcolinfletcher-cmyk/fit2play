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

function sessionDateFromDetail(
  detail: Record<string, unknown>,
  summaryFallback: string
): string {
  const t = detail.startTime ?? detail.timestamp;
  if (t == null || t === "") return summaryFallback;
  if (typeof t === "number") {
    const ms = t > 1e12 ? t : t * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof t === "string") {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? summaryFallback : d.toISOString();
  }
  return summaryFallback;
}

const METRIC_KEYS = [
  "peakSpeed",
  "peakForce",
  "peakPower",
  "split5m",
  "split10m",
  "split20m",
] as const;

function numArray(u: unknown): number[] {
  if (!Array.isArray(u)) return [];
  return u.map((x) => (typeof x === "number" && !Number.isNaN(x) ? x : 0));
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

  for (const k of METRIC_KEYS) {
    const v = detail[k];
    if (typeof v === "number" && !Number.isNaN(v) && v !== 0) {
      rows.push({
        session_id: sessionId,
        key: k,
        value: v,
        rep_index: null,
        side: null,
        unit: null,
      });
    }
  }
  if (
    typeof detail.peakVelocity === "number" &&
    !Number.isNaN(detail.peakVelocity) &&
    detail.peakVelocity !== 0 &&
    typeof detail.peakSpeed !== "number"
  ) {
    rows.push({
      session_id: sessionId,
      key: "peakSpeed",
      value: detail.peakVelocity,
      rep_index: null,
      side: null,
      unit: null,
    });
  }

  const repsRaw = detail.reps ?? detail.Reps ?? detail.trials;
  const reps = Array.isArray(repsRaw) ? repsRaw : [];

  for (const repRaw of reps) {
    if (!repRaw || typeof repRaw !== "object") continue;
    const r = repRaw as Record<string, unknown>;
    const ri =
      typeof r.repIndex === "number"
        ? r.repIndex
        : typeof r.rep_index === "number"
          ? r.rep_index
          : null;
    if (ri == null) continue;
    const side = r.side != null ? String(r.side) : null;

    for (const k of METRIC_KEYS) {
      const v = r[k];
      if (typeof v === "number" && !Number.isNaN(v) && v !== 0) {
        rows.push({
          session_id: sessionId,
          key: k,
          value: v,
          rep_index: ri,
          side,
          unit: null,
        });
      }
    }
    if (
      typeof r.peakVelocity === "number" &&
      !Number.isNaN(r.peakVelocity) &&
      r.peakVelocity !== 0 &&
      typeof r.peakSpeed !== "number"
    ) {
      rows.push({
        session_id: sessionId,
        key: "peakSpeed",
        value: r.peakVelocity,
        rep_index: ri,
        side,
        unit: null,
      });
    }
  }

  return rows;
}

function collectSeriesFrom1080Detail(
  sessionId: string,
  detail: Record<string, unknown>
): { session_id: string; rep_index: number; series: Record<string, unknown> }[] {
  const out: { session_id: string; rep_index: number; series: Record<string, unknown> }[] =
    [];
  const repsRaw = detail.reps ?? detail.Reps ?? detail.trials;
  const reps = Array.isArray(repsRaw) ? repsRaw : [];

  const pad = (arr: number[], n: number) => {
    const copy = [...arr];
    while (copy.length < n) copy.push(0);
    return copy.slice(0, n);
  };

  for (let idx = 0; idx < reps.length; idx++) {
    const repRaw = reps[idx];
    if (!repRaw || typeof repRaw !== "object") continue;
    const rep = repRaw as Record<string, unknown>;
    const repIndex =
      typeof rep.repIndex === "number"
        ? rep.repIndex
        : typeof rep.rep_index === "number"
          ? rep.rep_index
          : idx + 1;

    const t = numArray(
      rep.time_ms ?? rep.timeMs ?? rep.t ?? rep.time
    );
    const v = numArray(rep.velocity ?? rep.v);
    const f = numArray(rep.force ?? rep.f);
    const p = numArray(rep.power ?? rep.p);
    const x = numArray(rep.position ?? rep.x);
    const a = numArray(rep.acceleration ?? rep.a);

    const len = Math.max(t.length, v.length, f.length, p.length, x.length, a.length);
    if (len === 0) continue;

    const n = len;
    const series = {
      t: pad(t, n),
      x: pad(x, n),
      v: pad(v, n),
      a: pad(a, n),
      f: pad(f, n),
      p: pad(p, n),
    };

    out.push({ session_id: sessionId, rep_index: repIndex, series });
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
          const subFromDetail = exerciseLabel(detail) ?? sub;

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
