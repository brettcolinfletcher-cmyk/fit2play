import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MOTION_BASE = "https://publicapi.1080motion.com";
const MAX_SAMPLES_PER_REP = 500;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}



type MotionSample = {
  t: number;
  position: number;
  speed: number;
  acceleration: number;
  force: number;
};

function decodeSampleDataBinary(sampleData: unknown): MotionSample[] {
  if (typeof sampleData !== "string" || sampleData.trim() === "") return [];
  let buf: Buffer;
  try {
    buf = Buffer.from(sampleData, "base64");
  } catch {
    return [];
  }
  const samples: MotionSample[] = [];
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

function asArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && "data" in payload) {
    const d = (payload as { data: unknown }).data;
    if (Array.isArray(d)) return d;
  }
  return [];
}

/** Normalize DB `series` (array-of-samples or legacy parallel arrays) to API sample list. */
function seriesToSamples(series: unknown): MotionSample[] {
  if (!series) return [];
  if (Array.isArray(series)) {
    const out: MotionSample[] = [];
    for (const row of series) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const t = Number(r.t);
      const position = Number(r.position ?? r.x);
      const speed = Number(r.speed ?? r.v);
      const acceleration = Number(r.acceleration ?? r.a);
      const force = Number(r.force ?? r.f);
      if (!Number.isFinite(t)) continue;
      out.push({ t, position, speed, acceleration, force });
    }
    return out;
  }
  const o = series as Record<string, unknown>;
  const t = o.t;
  if (!Array.isArray(t)) return [];
  const x = (Array.isArray(o.x) ? o.x : []) as number[];
  const v = (Array.isArray(o.v) ? o.v : []) as number[];
  const a = (Array.isArray(o.a) ? o.a : []) as number[];
  const f = (Array.isArray(o.f) ? o.f : []) as number[];
  const len = Math.min(t.length, x.length, v.length, a.length, f.length);
  const out: MotionSample[] = [];
  for (let i = 0; i < len; i++) {
    out.push({
      t: Number(t[i]),
      position: Number(x[i]),
      speed: Number(v[i]),
      acceleration: Number(a[i]),
      force: Number(f[i]),
    });
  }
  return out;
}

async function authorized(_request: Request): Promise<boolean> {
  return true;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json({ reps: [] });
  }

  const supabase = serviceClient();

  const { data: cached, error: cacheErr } = await supabase
    .from("sprint_time_series")
    .select("rep_index, series")
    .eq("session_id", sessionId)
    .order("rep_index", { ascending: true });

  if (cacheErr) {
    return NextResponse.json(
      { error: cacheErr.message },
      { status: 500 }
    );
  }

  if (cached && cached.length > 0) {
    return NextResponse.json({
      reps: cached.map((row) => ({
        rep_index: row.rep_index as number,
        samples: seriesToSamples(row.series),
      })),
    });
  }

  const { data: sess, error: sessErr } = await supabase
    .from("sessions")
    .select("external_id, source")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessErr || !sess) {
    return NextResponse.json({ reps: [] });
  }

  const sourceLc = String(sess.source ?? "").toLowerCase();
  if (sourceLc !== "1080" && sourceLc !== "1080_csv") {
    return NextResponse.json({ reps: [] });
  }

  const externalId =
    sess.external_id != null ? String(sess.external_id) : null;
  if (!externalId || externalId.trim() === "") {
    return NextResponse.json({ reps: [] });
  }

  const apiKey =
    process.env.API_KEY_1080 ?? process.env.MOTION_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ reps: [] });
  }

  const url = `${MOTION_BASE}/TrainingData/Session/${encodeURIComponent(externalId)}?includeSamples=true`;
  const tdRes = await fetch(url, {
    headers: {
      "X-1080-API-Key": apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!tdRes.ok) {
    return NextResponse.json({ reps: [] });
  }

  let tdRaw: unknown;
  try {
    tdRaw = await tdRes.json();
  } catch {
    return NextResponse.json({ reps: [] });
  }

  const trainingData = Array.isArray(tdRaw) ? tdRaw : asArray(tdRaw);

  const rowsToInsert: {
    session_id: string;
    rep_index: number;
    series: MotionSample[];
  }[] = [];

  let repCounter = 0;
  for (const setData of trainingData) {
    if (!setData || typeof setData !== "object") continue;
    const sd = setData as Record<string, unknown>;
    const motionGroups = sd.motionGroups;
    if (!Array.isArray(motionGroups)) continue;

    for (const mg of motionGroups) {
      if (!mg || typeof mg !== "object") continue;
      repCounter++;
      const mgObj = mg as Record<string, unknown>;
      const motions = mgObj.motions;
      if (!Array.isArray(motions)) continue;

      const combined: MotionSample[] = [];
      for (const motion of motions) {
        if (!motion || typeof motion !== "object") continue;
        const m = motion as Record<string, unknown>;
        combined.push(...decodeSampleDataBinary(m.sampleData));
      }

      if (combined.length === 0) continue;

      const samples = downsampleSamples(combined, MAX_SAMPLES_PER_REP);
      rowsToInsert.push({
        session_id: sessionId,
        rep_index: repCounter,
        series: samples,
      });
    }
  }

  if (rowsToInsert.length === 0) {
    return NextResponse.json({ reps: [] });
  }

  const { error: insErr } = await supabase
    .from("sprint_time_series")
    .insert(rowsToInsert);

  if (insErr) {
    return NextResponse.json(
      { error: insErr.message, reps: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({
    reps: rowsToInsert.map((r) => ({
      rep_index: r.rep_index,
      samples: r.series,
    })),
  });
}
