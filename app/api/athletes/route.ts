// app/api/athletes/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      fullName,
      dateOfBirth, // "YYYY-MM-DD"
      gender,
      organisationId,
    } = body;

    if (!fullName) {
      return NextResponse.json(
        { error: "fullName is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("athletes")
      .insert({
        full_name: fullName,
        date_of_birth: dateOfBirth ?? null,
        gender: gender ?? null,
        organisation_id: organisationId ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[POST /api/athletes] Insert error:", error);
      return NextResponse.json(
        { error: "Failed to create athlete", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, athleteId: data.id });
  } catch (err: any) {
    console.error("[POST /api/athletes] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

// (optional) list athletes for staff dash
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("athletes")
    .select("id, full_name, date_of_birth, gender, organisation_id")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[GET /api/athletes] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch athletes", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ athletes: data });
}