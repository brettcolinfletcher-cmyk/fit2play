import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { staffOrServerAuthorized } from "@/lib/routeAuth";

export const dynamic = "force-dynamic";

/**
 * PlayerData athletes the sync could not match by name.
 * GET  -> { unmatched: [...] }
 * POST { externalId, action: "link", athleteId } | { externalId, action: "create" }
 *      | { externalId, action: "ignore" } | { externalId, action: "unignore" }
 * After linking or creating, run /api/sync/playerdata?days=365 to pull their history.
 */
function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function splitName(name: string): { first_name: string | null; last_name: string | null } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { first_name: parts[0] || null, last_name: null };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
}

export async function GET(request: Request) {
  if (!(await staffOrServerAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await serviceClient()
    .from("playerdata_unmatched_athletes")
    .select("external_id, name, date_of_birth, club_name, reason, ignored, last_seen")
    .order("ignored")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ unmatched: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await staffOrServerAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    externalId?: string;
    action?: string;
    athleteId?: string;
  };
  const externalId = body.externalId?.trim();
  if (!externalId) return NextResponse.json({ error: "externalId required" }, { status: 400 });

  const supabase = serviceClient();
  const { data: row, error: rowErr } = await supabase
    .from("playerdata_unmatched_athletes")
    .select("external_id, name, date_of_birth")
    .eq("external_id", externalId)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not in the unmatched list" }, { status: 404 });

  if (body.action === "ignore" || body.action === "unignore") {
    const { error } = await supabase
      .from("playerdata_unmatched_athletes")
      .update({ ignored: body.action === "ignore" })
      .eq("external_id", externalId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  let athleteId: string;
  if (body.action === "link") {
    if (!body.athleteId) return NextResponse.json({ error: "athleteId required" }, { status: 400 });
    const { data: ath, error: aErr } = await supabase
      .from("athletes")
      .select("id, playerdata_external_id")
      .eq("id", body.athleteId)
      .maybeSingle();
    if (aErr || !ath) return NextResponse.json({ error: aErr?.message ?? "Athlete not found" }, { status: 404 });
    athleteId = ath.id as string;
    if (!ath.playerdata_external_id) {
      const { error } = await supabase.from("athletes").update({ playerdata_external_id: externalId }).eq("id", athleteId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (ath.playerdata_external_id !== externalId) {
      // Athlete already has a PlayerData profile: keep this one as an extra alias.
      const { error } = await supabase
        .from("athlete_external_aliases")
        .upsert({ source: "playerdata", external_id: externalId, athlete_id: athleteId }, { onConflict: "source,external_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (body.action === "create") {
    const { first_name, last_name } = splitName(row.name as string);
    const { data: created, error } = await supabase
      .from("athletes")
      .insert({
        first_name,
        last_name,
        date_of_birth: row.date_of_birth ?? null,
        playerdata_external_id: externalId,
      })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Create failed" }, { status: 500 });
    athleteId = created.id as string;
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await supabase.from("playerdata_unmatched_athletes").delete().eq("external_id", externalId);
  return NextResponse.json({ ok: true, athleteId });
}
