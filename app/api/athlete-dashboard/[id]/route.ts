import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeSessionRow } from "@/lib/athleteDashboardData";
import type { NormalizedSession } from "@/lib/athleteDashboardData";
import {
  normalizePerformanceBandRow,
  type NormalizedPerformanceBand,
} from "@/lib/performanceBands";

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

  const { data: bandRows, error: bandError } = await supabase
    .from("performance_bands")
    .select("*");

  const performanceBands: NormalizedPerformanceBand[] = [];
  if (!bandError && bandRows) {
    for (const row of bandRows) {
      const n = normalizePerformanceBandRow(row as Record<string, unknown>);
      if (n) performanceBands.push(n);
    }
  }

  return NextResponse.json({
    athlete,
    sessions,
    injuries: injuries ?? [],
    performanceBands,
  });
}
