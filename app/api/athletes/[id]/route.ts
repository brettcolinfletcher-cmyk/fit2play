import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ALLOWED_PATCH = [
  "first_name",
  "last_name",
  "email",
  "organisation",
  "team",
  "primary_sport",
  "height_cm",
  "weight_kg",
  "dominant_leg",
  "dominant_hand",
  "notes",
  "status",
  "dashboard_mode",
] as const;

const VALID_STATUSES = new Set(["active", "monitoring", "archived"]);
const VALID_DASHBOARD_MODES = new Set(["rtp", "performance"]);

function pickAllowedPatch(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH) {
    if (k in body) out[k] = body[k];
  }
  // Validate status enum before it reaches the DB CHECK constraint
  if ("status" in out && out.status !== null && !VALID_STATUSES.has(String(out.status))) {
    throw new Error(
      `Invalid status: must be one of active, monitoring, archived`
    );
  }
  if (
    "dashboard_mode" in out &&
    out.dashboard_mode !== null &&
    !VALID_DASHBOARD_MODES.has(String(out.dashboard_mode))
  ) {
    throw new Error(`Invalid dashboard_mode: must be one of rtp, performance`);
  }
  return out;
}

function syncAuthorized(request: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-sync-secret");
  const q = new URL(request.url).searchParams.get("secret");
  return header === secret || q === secret;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { user, profile } = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile?.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("athletes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (!syncAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  let row: Record<string, unknown>;
  try {
    row = pickAllowedPatch(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("athletes")
    .update(row)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (!syncAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: sessions, error: sErr } = await supabase
    .from("sessions")
    .select("id")
    .eq("athlete_id", id);

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  const sessionIds = (sessions ?? []).map((s) => s.id as string);

  if (sessionIds.length > 0) {
    await supabase.from("metrics").delete().in("session_id", sessionIds);
    await supabase.from("sprint_time_series").delete().in("session_id", sessionIds);
    await supabase.from("asymmetry_results").delete().in("session_id", sessionIds);
    await supabase.from("sessions").delete().eq("athlete_id", id);
  }

  await supabase.from("injuries").delete().eq("athlete_id", id);

  const { error: delErr } = await supabase.from("athletes").delete().eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
