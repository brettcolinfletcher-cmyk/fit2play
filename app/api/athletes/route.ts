import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ALLOWED_INSERT = [
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
] as const;

function pickAllowed(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_INSERT) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

export async function GET() {
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
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { user, profile } = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile?.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const fn = typeof body.first_name === "string" ? body.first_name.trim() : "";
  const ln = typeof body.last_name === "string" ? body.last_name.trim() : "";
  if (!fn && !ln) {
    return NextResponse.json(
      { error: "first_name or last_name required" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const row = pickAllowed(body);
  if (fn) row.first_name = fn;
  if (ln) row.last_name = ln;

  const { data, error } = await supabase
    .from("athletes")
    .insert(row)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
