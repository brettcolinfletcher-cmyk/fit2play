// app/api/session-report/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pdf } from "@react-pdf/renderer";
import { SessionReportPDF } from "@/components/reports/SessionReportPDF";

// ---------- Types ----------
type Session = {
  id: string;
  athlete_id: string | null;
  created_at: string;
  test_type: string | null;
  file_name: string | null;
};

type Metric = {
  id: string;
  session_id: string;
  key: string;
  value: number | null;
  rep_index: number | null;
};

type Athlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organisation: string | null;
  team: string | null;
  primary_sport: string | null;
} | null;

// ---------- Helper functions ----------
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function mean(values: number[]) {
  return values.length
    ? values.reduce((s, v) => s + v, 0) / values.length
    : 0;
}
function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) * (v - m), 0) /
    values.length;
  return Math.sqrt(variance);
}

function computeRTSFromMetrics(metrics: Metric[]) {
  const summary = metrics.filter((m) => m.rep_index == null);
  const reps = metrics.filter((m) => m.rep_index != null);

  const getSummary = (key: string) =>
    summary.find((m) => m.key === key)?.value ?? null;

  const peakSpeed = getSummary("peakSpeed");
  const split20 = getSummary("split20m");

  const repSpeeds = reps
    .filter((m) => m.key === "peakSpeed" && m.value != null)
    .map((m) => m.value as number);

  if (!peakSpeed || !split20 || repSpeeds.length < 2) return null;

  const speedScore = clamp((peakSpeed - 5) / 4, 0, 1);
  const splitScore = clamp((4.5 - split20) / 1.5, 0, 1);

  const sd = stdDev(repSpeeds);
  const m = mean(repSpeeds);
  const consistency = clamp(1 - sd / m, 0, 1);

  return Math.round(
    0.4 * speedScore + 0.3 * splitScore + 0.3 * consistency
  );
}

function buildForcePlateSummary(metrics: Metric[]) {
  const get = (key: string) =>
    metrics.find(
      (m) =>
        m.key === key &&
        (m.rep_index === null || m.rep_index === undefined)
    )?.value ?? null;

  return {
    jumpHeight: get("fp_jump_height_cm_best"),
    peakForce: get("fp_peak_force_n_best"),
    peakForceLeft: get("fp_peak_force_n_left"),
    peakForceRight: get("fp_peak_force_n_right"),
    peakForceAsym: get("fp_peak_force_n_asym_pct"),
    contactTime: get("fp_contact_time_s_best"),
    flightTime: get("fp_flight_time_s_best"),
    rsi: get("fp_rsi_best"),
    bodyMass: get("fp_body_mass_kg"),
  };
}

// ---------- MAIN GET HANDLER ----------
export async function GET(
  req: Request,
  context: { params?: { id?: string } } = {}
) {
  // 1) Try to read from context.params first
  let sessionId = context.params?.id;

  // 2) Fallback: parse from URL path /api/session-report/:id
  if (!sessionId || sessionId === "undefined") {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // [..., 'api', 'session-report', '<id>']
    sessionId = segments[segments.length - 1] ?? "";
  }

  if (!sessionId || sessionId === "undefined") {
    return NextResponse.json(
      { error: "Missing or invalid session id" },
      { status: 400 }
    );
  }

  try {
    // 1) Fetch session row
    const { data: sess, error: sessError } = await supabaseAdmin
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessError) {
      return NextResponse.json(
        {
          error: "Session query failed",
          details: sessError.message,
          sessionId,
        },
        { status: 500 }
      );
    }

    if (!sess) {
      return NextResponse.json(
        { error: "Session not found", sessionId },
        { status: 404 }
      );
    }

    const session = sess as Session;

    // 2) Fetch metrics
    const { data: mets, error: metsError } = await supabaseAdmin
      .from("metrics")
      .select("*")
      .eq("session_id", sessionId);

    if (metsError) {
      return NextResponse.json(
        {
          error: "Failed to load metrics",
          details: metsError.message,
          sessionId,
        },
        { status: 500 }
      );
    }

    const metrics = (mets ?? []) as Metric[];

    // 3) Fetch athlete
    let athlete: Athlete = null;
    if (session.athlete_id) {
      const { data: ath } = await supabaseAdmin
        .from("athletes")
        .select(
          "id, first_name, last_name, organisation, team, primary_sport"
        )
        .eq("id", session.athlete_id)
        .maybeSingle();

      if (ath) athlete = ath as Athlete;
    }

    // 4) Determine test type
    const isForcePlate =
      (session.test_type ?? "").toLowerCase().includes("force_plate") ||
      metrics.some((m) => m.key.startsWith("fp_"));

    const is1080 = session.test_type === "1080_sprint";

    // 5) Build summary metrics
    const getSummary = (key: string) =>
      metrics.find(
        (m) => m.key === key && m.rep_index == null
      )?.value ?? null;

    const summary = {
      peakSpeed: getSummary("peakSpeed"),
      peakForce: getSummary("peakForce"),
      peakPower: getSummary("peakPower"),
      split5m: getSummary("split5m"),
      split10m: getSummary("split10m"),
      split20m: getSummary("split20m"),
    };

    const rtsScore = is1080 ? computeRTSFromMetrics(metrics) : null;

    // 6) Build rep list
    const repByIndex: Record<number, any> = metrics
      .filter((m) => m.rep_index != null)
      .reduce((acc, m) => {
        const idx = m.rep_index as number;
        acc[idx] ??= { rep: idx };
        acc[idx][m.key] = m.value;
        return acc;
      }, {} as Record<number, any>);

    const repList = Object.values(repByIndex).sort(
      (a: any, b: any) => a.rep - b.rep
    );

    const forcePlateSummary = isForcePlate
      ? buildForcePlateSummary(metrics)
      : null;

    // 7) Generate PDF
    const doc = SessionReportPDF({
      session,
      athlete,
      summary,
      rtsScore,
      forcePlateSummary,
      repList,
    });

    const pdfBuffer = await pdf(doc).toBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="session-report-${sessionId}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("[session-report] Unexpected error:", err);
    return NextResponse.json(
      {
        error: "Unexpected server error",
        details: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}