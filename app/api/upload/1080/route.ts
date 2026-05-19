import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function syncAuthorized(request: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-sync-secret");
  const q = new URL(request.url).searchParams.get("secret");
  return header === secret || q === secret;
}

function normalizeFullName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseSessionDate(dateStr: string): string {
  const d = dateStr.trim();
  const dt = new Date(d);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  return new Date().toISOString();
}

// CSV/set payload field names → canonical DB metric keys. See docs/metrics.md.
const CSV_TO_CANONICAL: Record<string, string> = {
  peakSpeed: "top_speed",
  peakForce: "peak_force",
  peakPower: "peak_power",
  split5m: "split_5m_time",
  split10m: "split_10m_time",
  split20m: "split_20m_time",
};

function canonicalDbKey(key: string): string {
  return CSV_TO_CANONICAL[key] ?? key;
}

type Upload1080Body = {
  sessionId: string;
  date: string;
  athleteName: string;
  exerciseName: string;
  sets: Array<Record<string, number>>;
  force?: boolean;
};

export async function POST(request: Request) {
  if (!syncAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();

  try {
    const body = (await request.json()) as Upload1080Body;
    const { sessionId, date, athleteName, exerciseName, sets, force } =
      body ?? {};

    if (
      typeof sessionId !== "string" ||
      !sessionId.trim() ||
      typeof date !== "string" ||
      typeof athleteName !== "string" ||
      !athleteName.trim() ||
      typeof exerciseName !== "string" ||
      !Array.isArray(sets) ||
      sets.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Missing sessionId, date, athleteName, exerciseName, or non-empty sets",
        },
        { status: 400 }
      );
    }

    const { data: athletes, error: athErr } = await supabase
      .from("athletes")
      .select("id, first_name, last_name");

    if (athErr) {
      return NextResponse.json({ error: athErr.message }, { status: 500 });
    }

    const target = normalizeFullName(athleteName);
    const athlete = (athletes ?? []).find((a) => {
      const full = normalizeFullName(
        `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim()
      );
      return full === target;
    });

    if (!athlete?.id) {
      return NextResponse.json({
        status: "athlete_not_found",
        name: athleteName.trim(),
      });
    }

    const dedupe = `1080_csv:${sessionId.trim()}`;

    const { data: existing } = await supabase
      .from("sessions")
      .select("id, session_date, test_type")
      .eq("sync_dedupe_key", dedupe)
      .maybeSingle();

    if (existing?.id && !force) {
      return NextResponse.json({
        status: "duplicate",
        session: {
          id: existing.id as string,
          session_date: existing.session_date as string,
          test_type: existing.test_type as string,
        },
      });
    }

    const sessionDate = parseSessionDate(date);
    const athleteId = athlete.id as string;
    const sub = exerciseName.trim();

    if (existing?.id && force) {
      const sid = existing.id as string;
      await supabase.from("metrics").delete().eq("session_id", sid);
      const { error: upErr } = await supabase
        .from("sessions")
        .update({
          athlete_id: athleteId,
          test_type: "1080_sprint",
          test_sub_type: sub,
          session_date: sessionDate,
          source: "1080_csv",
          external_id: sessionId.trim(),
          sync_dedupe_key: dedupe,
        })
        .eq("id", sid);

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }

      const metricRows: {
        session_id: string;
        key: string;
        value: number;
        rep_index: number;
        side: null;
        unit: null;
      }[] = [];

      sets.forEach((setObj, idx) => {
        const rep_index = idx + 1;
        for (const [key, value] of Object.entries(setObj)) {
          if (typeof value === "number" && !Number.isNaN(value)) {
            metricRows.push({
              session_id: sid,
              key: canonicalDbKey(key),
              value,
              rep_index,
              side: null,
              unit: null,
            });
          }
        }
      });

      if (metricRows.length > 0) {
        const { error: mErr } = await supabase.from("metrics").insert(metricRows);
        if (mErr) {
          return NextResponse.json({ error: mErr.message }, { status: 500 });
        }
      }

      return NextResponse.json({ status: "ok", sessionId: sid });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        test_type: "1080_sprint",
        test_sub_type: sub,
        file_name: null,
        source: "1080_csv",
        external_id: sessionId.trim(),
        session_date: sessionDate,
        device: "1080 Motion",
        sync_dedupe_key: dedupe,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      return NextResponse.json(
        { error: insErr?.message ?? "Failed to create session" },
        { status: 500 }
      );
    }

    const sid = inserted.id as string;

    const metricRows: {
      session_id: string;
      key: string;
      value: number;
      rep_index: number;
      side: null;
      unit: null;
    }[] = [];

    sets.forEach((setObj, idx) => {
      const rep_index = idx + 1;
      for (const [key, value] of Object.entries(setObj)) {
        if (typeof value === "number" && !Number.isNaN(value)) {
          metricRows.push({
            session_id: sid,
            key: canonicalDbKey(key),
            value,
            rep_index,
            side: null,
            unit: null,
          });
        }
      }
    });

    if (metricRows.length > 0) {
      const { error: mErr } = await supabase.from("metrics").insert(metricRows);
      if (mErr) {
        return NextResponse.json({ error: mErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ status: "ok", sessionId: sid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
