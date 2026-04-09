// app/api/sprint-series/[sessionId]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SprintSeriesRow = {
  rep_index: number | null;
  series: {
    t: number[];
    x: number[];
    v: number[];
    a: number[];
    f: number[];
    p: number[];
  } | null;
};

export async function GET(
  _req: Request,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;

  try {
    const { data, error } = await supabaseAdmin
      .from("sprint_time_series")
      .select("rep_index, series")
      .eq("session_id", sessionId)
      .order("rep_index", { ascending: true });

    if (error) {
      console.error("[sprint-series] DB error:", error);
      return NextResponse.json(
        { error: "Failed to load sprint time-series" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: (data ?? []) as SprintSeriesRow[] },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[sprint-series] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}