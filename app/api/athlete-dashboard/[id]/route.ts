import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeSessionRow } from "@/lib/athleteDashboardData";
import type { NormalizedSession } from "@/lib/athleteDashboardData";
import { computePerformanceSummary } from "@/lib/performanceSummary";
import { fetchTargetOverridesForAthlete } from "@/lib/performanceTargets";
import type { ReportMetricRow, ReportSessionRow } from "@/lib/athleteReportData";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing athlete id" }, { status: 400 });
  }

  // The browser client stores the session in localStorage, not cookies, so
  // server routes can't read it from the request. The client sends its access
  // token explicitly as a Bearer header; validate it here.
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "staff") {
    // allowed — any athlete id
  } else if (profile?.role === "athlete") {
    const { data: ownAthlete } = await supabase
      .from("athletes")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ownAthlete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (athleteError) {
    return NextResponse.json(
      { error: athleteError.message },
      { status: 500 }
    );
  }

  if (!athlete) {
    return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
  }

  const { data: rawRows, error: viewError } = await supabase
    .from("athlete_session_summary")
    .select("*")
    .eq("athlete_id", id)
    .order("created_at", { ascending: true });

  if (viewError) {
    return NextResponse.json(
      { error: viewError.message },
      { status: 500 }
    );
  }

  const sessions: NormalizedSession[] = [];
  for (const row of rawRows ?? []) {
    const n = normalizeSessionRow(row as Record<string, unknown>);
    if (n) sessions.push(n);
  }

  const { data: injuries, error: injError } = await supabase
    .from("injuries")
    .select("*")
    .eq("athlete_id", id)
    .order("date_injured", { ascending: false });

  if (injError) {
    return NextResponse.json({ error: injError.message }, { status: 500 });
  }

  const { data: commentRows } = await supabase
    .from("athlete_section_comments")
    .select("section, comment")
    .eq("athlete_id", id);

  const sectionComments: Record<string, string> = {};
  for (const row of commentRows ?? []) {
    const r = row as { section: string; comment: string | null };
    if (r.comment) sectionComments[r.section] = r.comment;
  }

  const { data: qmRows } = await supabase.rpc("athlete_quality_metrics", {
    p_athlete: id,
  });
  const metricLatest: Record<string, number> = {};
  const metricPrev: Record<string, number> = {};
  for (const row of (qmRows ?? []) as Array<{
    test_type: string;
    key: string;
    latest: number | string | null;
    prev: number | string | null;
  }>) {
    const k = `${row.test_type}:${row.key}`;
    if (row.latest != null) metricLatest[k] = Number(row.latest);
    if (row.prev != null) metricPrev[k] = Number(row.prev);
  }

  const { data: sideRows } = await supabase.rpc("athlete_test_sides", {
    p_athlete: id,
  });
  const metricSides: Record<string, number> = {};
  for (const row of (sideRows ?? []) as Array<{
    test_type: string;
    key: string;
    side: string;
    latest: number | string | null;
  }>) {
    if (row.latest != null) {
      metricSides[`${row.test_type}:${row.key}:${row.side}`] = Number(
        row.latest
      );
    }
  }

  const { data: fpRows } = await supabase.rpc("athlete_fp_trend_metrics", {
    p_athlete: id,
  });

  const { data: hopRows } = await supabase.rpc("athlete_hop_jump_metrics", {
    p_athlete: id,
  });

  // Performance Summary (CMJ/Power/Speed/Accel/Decel/COD/Strength) — computed
  // server-side here so the athlete-facing page can render it read-only
  // without needing raw sessions/metrics client-side.
  let performanceSummary: ReturnType<typeof computePerformanceSummary> = [];
  {
    const { data: rawSessions } = await supabase
      .from("sessions")
      .select("id, session_date, test_type, test_sub_type, source")
      .eq("athlete_id", id);
    const sessionRows = (rawSessions ?? []) as ReportSessionRow[];
    const sessionIds = sessionRows.map((s) => s.id);

    let metricsBySession = new Map<string, ReportMetricRow[]>();
    if (sessionIds.length > 0) {
      const { data: rawMetrics } = await supabase
        .from("metrics")
        .select("session_id, key, value, rep_index, side")
        .in("session_id", sessionIds);
      metricsBySession = new Map();
      for (const row of (rawMetrics ?? []) as ReportMetricRow[]) {
        const list = metricsBySession.get(row.session_id) ?? [];
        list.push(row);
        metricsBySession.set(row.session_id, list);
      }
    }

    const { targets } = await fetchTargetOverridesForAthlete(
      supabase,
      (athlete as { target_profile_id?: string | null }).target_profile_id ?? null
    );
    performanceSummary = computePerformanceSummary(sessionRows, metricsBySession, targets);
  }

  return NextResponse.json({
    athlete,
    sessions,
    injuries: injuries ?? [],
    metricLatest,
    metricPrev,
    metricSides,
    sectionComments,
    fpTrendMetrics: fpRows ?? [],
    hopJumpMetrics: hopRows ?? [],
    performanceSummary,
  });
}
