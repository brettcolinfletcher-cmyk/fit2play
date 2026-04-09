import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type UploadForceplateBody = {
  athleteId: string;
  fileName?: string | null;
  metrics: Record<string, number | null>;
  subTestType?: "cmj" | "dj" | "imtp" | "other" | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as UploadForceplateBody;

    const { athleteId, fileName, metrics, subTestType } = body || {};

    if (!athleteId) {
      return NextResponse.json(
        { error: "Missing athleteId" },
        { status: 400 }
      );
    }

    if (!metrics || typeof metrics !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid metrics" },
        { status: 400 }
      );
    }

    // Build a nicer test_type label for the session
    let testType = "force_plate";
    if (subTestType === "cmj") testType = "force_plate_cmj";
    else if (subTestType === "dj") testType = "force_plate_dj";
    else if (subTestType === "imtp") testType = "force_plate_imtp";

    // 1) Create a new session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        test_type: testType,
        file_name: fileName ?? null,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("[upload-forceplate] session insert error:", sessionError);
      return NextResponse.json(
        { error: sessionError?.message || "Failed to create session" },
        { status: 500 }
      );
    }

    const sessionId = session.id as string;

    // 2) Build metric rows
    const metricRows = Object.entries(metrics)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ({
        session_id: sessionId,
        key,
        value,
        rep_index: null as number | null,
      }));

    if (metricRows.length === 0) {
      console.warn(
        "[upload-forceplate] No non-null metrics provided, session created without metrics"
      );
      return NextResponse.json(
        {
          sessionId,
          warning: "Session created, but no metrics were stored",
        },
        { status: 200 }
      );
    }

    // 3) Insert metrics
    const { error: metricsError } = await supabaseAdmin
      .from("metrics")
      .insert(metricRows);

    if (metricsError) {
      console.error("[upload-forceplate] metrics insert error:", metricsError);
      return NextResponse.json(
        { error: metricsError.message || "Failed to save metrics" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        sessionId,
        message: "Force plate session created successfully",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[upload-forceplate] Uncaught error:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}