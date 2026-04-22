import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const METRIC_KEYS = [
  "peakSpeed",
  "peakForce",
  "peakPower",
  "split5m",
  "split10m",
  "split20m",
] as const;

type MetricInsert = {
  session_id: string;
  key: string;
  value: number;
  rep_index: number | null;
};

function collectMetricRows(
  sessionId: string,
  summary: Record<string, unknown> | undefined,
  reps: unknown[] | undefined
): MetricInsert[] {
  const rows: MetricInsert[] = [];

  if (summary && typeof summary === "object") {
    for (const k of METRIC_KEYS) {
      const v = summary[k];
      if (typeof v === "number" && !Number.isNaN(v) && v !== 0) {
        rows.push({
          session_id: sessionId,
          key: k,
          value: v,
          rep_index: null,
        });
      }
    }
  }

  if (Array.isArray(reps)) {
    for (const rep of reps) {
      if (!rep || typeof rep !== "object") continue;
      const r = rep as Record<string, unknown>;
      const ri =
        typeof r.repIndex === "number"
          ? r.repIndex
          : typeof r.rep_index === "number"
            ? r.rep_index
            : null;
      if (ri == null) continue;
      for (const k of METRIC_KEYS) {
        const v = r[k];
        if (typeof v === "number" && !Number.isNaN(v) && v !== 0) {
          rows.push({
            session_id: sessionId,
            key: k,
            value: v,
            rep_index: ri,
          });
        }
      }
    }
  }

  return rows;
}

export async function POST(req: Request) {
  const { user, profile } = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile?.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const body = await req.json();
    const {
      athleteId,
      fileName,
      metrics,
      summary,
      reps,
      timeSeries,
      testType,
      testSubType,
      test_sub_type,
    } = body || {};

    if (!athleteId) {
      return NextResponse.json({ error: "Missing athleteId" }, { status: 400 });
    }

    // ── Full 1080 parsed payload (samples CSV) ─────────────────
    if (summary && Array.isArray(timeSeries)) {
      const repList = Array.isArray(reps) ? reps : [];
      let resolvedType =
        typeof testType === "string" && testType.length > 0
          ? testType
          : "1080_sprint";
      if (resolvedType === "other") resolvedType = "1080_sprint";

      const sub =
        (typeof testSubType === "string" && testSubType) ||
        (typeof test_sub_type === "string" && test_sub_type) ||
        null;

      const { data: session, error: sessionError } = await supabaseAdmin
        .from("sessions")
        .insert({
          athlete_id: athleteId,
          test_type: resolvedType,
          test_sub_type: sub,
          file_name: fileName ?? null,
          source: "1080_csv",
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

      const metricRows = collectMetricRows(sessionId, summary, repList);

      if (metricRows.length > 0) {
        const { error: metricsError } = await supabaseAdmin
          .from("metrics")
          .insert(metricRows);
        if (metricsError) {
          return NextResponse.json(
            { error: metricsError.message },
            { status: 500 }
          );
        }
      }

      const seriesRows = timeSeries
        .map((ts: Record<string, unknown>) => {
          const ri =
            typeof ts.repIndex === "number"
              ? ts.repIndex
              : typeof ts.rep_index === "number"
                ? ts.rep_index
                : null;
          if (ri == null) return null;
          return {
            session_id: sessionId,
            rep_index: ri,
            series: {
              t: Array.isArray(ts.t) ? ts.t : [],
              x: Array.isArray(ts.x) ? ts.x : [],
              v: Array.isArray(ts.v) ? ts.v : [],
              a: Array.isArray(ts.a) ? ts.a : [],
              f: Array.isArray(ts.f) ? ts.f : [],
              p: Array.isArray(ts.p) ? ts.p : [],
            },
          };
        })
        .filter(Boolean);

      if (seriesRows.length > 0) {
        const { error: seriesError } = await supabaseAdmin
          .from("sprint_time_series")
          .insert(seriesRows);
        if (seriesError) {
          return NextResponse.json(
            { error: seriesError.message },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        sessionId,
        message: "Sprint session created successfully",
      });
    }

    // ── Legacy: flat metrics object ───────────────────────────
    if (!metrics || typeof metrics !== "object") {
      return NextResponse.json(
        { error: "Missing metrics or full summary/reps/timeSeries payload" },
        { status: 400 }
      );
    }

    const legacyType =
      typeof testType === "string" && testType.length > 0
        ? testType
        : "1080_sprint";
    const legacySub =
      (typeof testSubType === "string" && testSubType) ||
      (typeof test_sub_type === "string" && test_sub_type) ||
      null;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        test_type: legacyType,
        test_sub_type: legacySub,
        file_name: fileName ?? null,
        source: "1080_csv",
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
      .filter(
        ([, value]) =>
          value !== null && value !== undefined && value !== 0
      )
      .map(([key, value]) => ({
        session_id: sessionId,
        key,
        value: value as number,
        rep_index: null as number | null,
      }));

    if (metricRows.length === 0) {
      return NextResponse.json({
        sessionId,
        warning: "Session created but no metrics stored",
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
      message: "Sprint session created successfully",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
