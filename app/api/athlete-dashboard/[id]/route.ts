import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeSessionRow } from "@/lib/athleteDashboardData";
import type { NormalizedSession } from "@/lib/athleteDashboardData";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing athlete id" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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

  return NextResponse.json({
    athlete,
    sessions,
    injuries: injuries ?? [],
  });
}
