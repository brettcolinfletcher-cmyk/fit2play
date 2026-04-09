// app/api/upload-1080/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ---------- Types coming from the client ----------
type MetricsSummary = {
  peakSpeed: number | null;
  peakForce: number | null;
  peakPower: number | null;
  split5m: number | null;
  split10m: number | null;
  split20m: number | null;
};

type RepMetrics = {
  repIndex: number;
  peakSpeed: number | null;
  peakForce: number | null;
  peakPower: number | null;
  split5m: number | null;
  split10m: number | null;
  split20m: number | null;
};

type TimeSeriesPerRep = {
  repIndex: number;
  t: number[];
  x: number[];
  v: number[];
  a: number[];
  f: number[];
  p: number[];
};

type Upload1080Body = {
  athleteId: string;
  fileName?: string | null;
  testType?: string;
  // 👇 allow both names, old and new
  summary?: MetricsSummary;
  metrics?: MetricsSummary;
  reps?: RepMetrics[];
  timeSeries?: TimeSeriesPerRep[];
};

// ---------- Helpers ----------

// Only keep real finite numbers; anything else becomes null
function toFiniteOrNull(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

type MetricRow = {
  session_id: string;
  key: string;
  value: number;
  rep_index: number | null;
};

function pushMetric(
  rows: MetricRow[],
  sessionId: string,
  key: string,
  value: unknown,
  repIndex: number | null
) {
  const v = toFiniteOrNull(value);
  if (v == null) return;
  rows.push({
    session_id: sessionId,
    key,
    value: v,
    rep_index: repIndex,
  });
}

// ---------- Handler ----------
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Upload1080Body;

    const {
      athleteId,
      fileName,
      reps = [],
      timeSeries = [],
    } = body;

    // support both body.summary and body.metrics
    const summary: MetricsSummary =
      body.summary ??
      body.metrics ?? {
        peakSpeed: null,
        peakForce: null,
        peakPower: null,
        split5m: null,
        split10m: null,
        split20m: null,
      };

    if (!athleteId) {
      return NextResponse.json(
        { error: "Missing athleteId" },
        { status: 400 }
      );
    }

    console.log(
      "[upload-1080] Incoming body:",
      JSON.stringify(body).slice(0, 1000)
    );

    // 1️⃣ Create session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        test_type: "1080_sprint",
        file_name: fileName ?? null,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("[upload-1080] Session insert error:", sessionError);
      return NextResponse.json(
        {
          error: "Failed to create session",
          details: sessionError?.message ?? null,
        },
        { status: 500 }
      );
    }

    const sessionId = session.id as string;
    console.log("[upload-1080] Created session:", sessionId);

    // 2️⃣ Build metric rows (summary + reps)
    const metricRows: MetricRow[] = [];

    // summary (rep_index = null)
    pushMetric(metricRows, sessionId, "peakSpeed", summary.peakSpeed, null);
    pushMetric(metricRows, sessionId, "peakForce", summary.peakForce, null);
    pushMetric(metricRows, sessionId, "peakPower", summary.peakPower, null);
    pushMetric(metricRows, sessionId, "split5m", summary.split5m, null);
    pushMetric(metricRows, sessionId, "split10m", summary.split10m, null);
    pushMetric(metricRows, sessionId, "split20m", summary.split20m, null);

    // reps (rep_index = 1,2,3…)
    reps.forEach((rep) => {
      const idx = rep.repIndex;
      pushMetric(metricRows, sessionId, "peakSpeed", rep.peakSpeed, idx);
      pushMetric(metricRows, sessionId, "peakForce", rep.peakForce, idx);
      pushMetric(metricRows, sessionId, "peakPower", rep.peakPower, idx);
      pushMetric(metricRows, sessionId, "split5m", rep.split5m, idx);
      pushMetric(metricRows, sessionId, "split10m", rep.split10m, idx);
      pushMetric(metricRows, sessionId, "split20m", rep.split20m, idx);
    });

    console.log(
      "[upload-1080] Metric rows to insert:",
      metricRows.length
    );

    // 3️⃣ Insert metrics
    if (metricRows.length > 0) {
      const { error: metricsError } = await supabaseAdmin
        .from("metrics")
        .insert(metricRows);

      if (metricsError) {
        console.error("[upload-1080] Metrics insert error:", metricsError);
        return NextResponse.json(
          {
            error: "Failed to store metrics",
            details: metricsError.message,
          },
          { status: 500 }
        );
      }
    }

    // 4️⃣ Optionally store time-series per rep
   if (timeSeries && timeSeries.length > 0) {
      const seriesRows = timeSeries.map((rep) => ({
        session_id: sessionId,
        rep_index: rep.repIndex,
        series: {
          t: rep.t,
          x: rep.x,
          v: rep.v,
          a: rep.a,
          f: rep.f,
          p: rep.p,
        },
      }));

      console.log(
        "[upload-1080] Time-series rows to insert:",
        seriesRows.length
      );

      const { error: seriesError } = await supabaseAdmin
        .from("sprint_time_series")
        .insert(seriesRows);

      if (seriesError) {
        console.error(
          "[upload-1080] Time series insert error (non-fatal):",
          seriesError
        );
        // don’t fail whole request – metrics are already saved
      }
    }

    console.log("[upload-1080] Success");
    return NextResponse.json({ success: true, sessionId }, { status: 200 });
  } catch (err: any) {
    console.error("[upload-1080] Unexpected API error:", err);
    return NextResponse.json(
      {
        error: "Unexpected server error",
        details: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}