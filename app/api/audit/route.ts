import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { staffUserFromRequest } from "@/lib/routeAuth";

export const dynamic = "force-dynamic";

/** GET /api/audit?athleteId=&limit=  (staff only): access log with names resolved. */
export async function GET(req: Request) {
  if (!(await staffUserFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const athleteId = url.searchParams.get("athleteId");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 1000);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let q = admin
    .from("audit_log")
    .select("id, at, actor, action, table_name, record_id, athlete_id, detail")
    .order("at", { ascending: false })
    .limit(limit);
  if (athleteId) q = q.eq("athlete_id", athleteId);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorIds = [...new Set((rows ?? []).map((r) => r.actor).filter(Boolean))] as string[];
  const athleteIds = [...new Set((rows ?? []).map((r) => r.athlete_id).filter(Boolean))] as string[];

  const [{ data: profiles }, { data: athletes }] = await Promise.all([
    actorIds.length
      ? admin.from("profiles").select("id, full_name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    athleteIds.length
      ? admin.from("athletes").select("id, first_name, last_name").in("id", athleteIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
  ]);

  const actorName = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "Staff member"]));
  const athleteName = new Map(
    (athletes ?? []).map((a) => [a.id, [a.first_name, a.last_name].filter(Boolean).join(" ") || "Unnamed athlete"])
  );

  return NextResponse.json({
    rows: (rows ?? []).map((r) => ({
      ...r,
      actor_name: r.actor ? actorName.get(r.actor) ?? "Former staff member" : "System",
      athlete_name: r.athlete_id
        ? athleteName.get(r.athlete_id) ?? (r.detail as { name?: string } | null)?.name ?? "Deleted athlete"
        : null,
    })),
  });
}
