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

function combineDateTime(dateStr: string, timeStr: string): string {
  const d = dateStr.trim();
  const t = timeStr.trim() || "12:00:00";
  const isoLocal = `${d}T${t}`;
  const dt = new Date(isoLocal);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  const fallback = new Date(`${d}T12:00:00`);
  return Number.isNaN(fallback.getTime())
    ? new Date().toISOString()
    : fallback.toISOString();
}

type HawkinsBody = {
  testId: string;
  date: string;
  time: string;
  athleteName: string;
  testType: string;
  tags?: string;
  metrics: Record<string, number>;
  force?: boolean;
};

export async function POST(request: Request) {
  if (!syncAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();

  try {
    const body = (await request.json()) as HawkinsBody;
    const {
      testId,
      date,
      time,
      athleteName,
      testType,
      metrics,
      force,
    } = body ?? {};

    if (
      typeof testId !== "string" ||
      !testId.trim() ||
      typeof date !== "string" ||
      typeof time !== "string" ||
      typeof athleteName !== "string" ||
      !athleteName.trim() ||
      typeof testType !== "string" ||
      !testType.trim() ||
      !metrics ||
      typeof metrics !== "object"
    ) {
      return NextResponse.json(
        { error: "Missing testId, date, time, athleteName, testType, or metrics" },
        { status: 400 }
      );
    }

    const { data: athletes, error: athErr } = await supabase
      .from("athletes")
      .select("id, first_name, last_name");

    if (athErr) {
      return NextResponse.json(
        { error: athErr.message },
        { status: 500 }
      );
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

    const dedupe = `hawkins_csv:${testId.trim()}`;

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

    const sessionDate = combineDateTime(date, time);
    const athleteId = athlete.id as string;

    if (existing?.id && force) {
      const sessionId = existing.id as string;
      await supabase.from("metrics").delete().eq("session_id", sessionId);
      const { error: upErr } = await supabase
        .from("sessions")
        .update({
          athlete_id: athleteId,
          test_type: testType.trim(),
          session_date: sessionDate,
          source: "hawkins_csv",
          external_id: testId.trim(),
          sync_dedupe_key: dedupe,
        })
        .eq("id", sessionId);

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }

      const metricRows = Object.entries(metrics).map(([key, value]) => ({
        session_id: sessionId,
        key,
        value,
        rep_index: null as number | null,
        side: null as string | null,
        unit: null as string | null,
      }));

      if (metricRows.length > 0) {
        const { error: mErr } = await supabase.from("metrics").insert(metricRows);
        if (mErr) {
          return NextResponse.json({ error: mErr.message }, { status: 500 });
        }
      }

      return NextResponse.json({ status: "ok", sessionId });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        test_type: testType.trim(),
        test_sub_type: null,
        file_name: null,
        source: "hawkins_csv",
        external_id: testId.trim(),
        session_date: sessionDate,
        device: "Hawkins",
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

    const sessionId = inserted.id as string;

    const metricRows = Object.entries(metrics).map(([key, value]) => ({
      session_id: sessionId,
      key,
      value,
      rep_index: null as number | null,
      side: null as string | null,
      unit: null as string | null,
    }));

    if (metricRows.length > 0) {
      const { error: mErr } = await supabase.from("metrics").insert(metricRows);
      if (mErr) {
        return NextResponse.json({ error: mErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ status: "ok", sessionId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
