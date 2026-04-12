import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Body = {
  athleteId: string;
  fileName?: string | null;
  metrics: Record<string, number | null>;
  testSubType?: string | null;
  test_sub_type?: string | null;
};

export async function POST(req: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const body = (await req.json()) as Body;
    const { athleteId, fileName, metrics, testSubType, test_sub_type } =
      body || {};

    if (!athleteId) {
      return NextResponse.json({ error: "Missing athleteId" }, { status: 400 });
    }
    if (!metrics || typeof metrics !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid metrics" },
        { status: 400 }
      );
    }

    const rawSub =
      (typeof testSubType === "string" ? testSubType : "") ||
      (typeof test_sub_type === "string" ? test_sub_type : "") ||
      "";
    const sub = rawSub.trim() || null;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        test_type: "handheld_dynamometer",
        test_sub_type: sub,
        file_name: fileName ?? null,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: sessionError?.message || "Failed to create session" },
        { status: 500 }
      );
    }

    const sessionId = session.id as string;
    const metricRows = Object.entries(metrics)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ({
        session_id: sessionId,
        key,
        value: value as number,
        rep_index: null as number | null,
      }));

    if (metricRows.length === 0) {
      return NextResponse.json({
        sessionId,
        warning: "Session created, but no metrics were stored",
      });
    }

    const { error: metricsError } = await supabaseAdmin
      .from("metrics")
      .insert(metricRows);

    if (metricsError) {
      return NextResponse.json({ error: metricsError.message }, { status: 500 });
    }

    return NextResponse.json({
      sessionId,
      message: "Dynamometer session created successfully",
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
