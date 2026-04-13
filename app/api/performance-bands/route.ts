import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import {
  normalizePerformanceBandRow,
  type NormalizedPerformanceBand,
} from "@/lib/performanceBands";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.from("performance_bands").select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bands: NormalizedPerformanceBand[] = [];
  for (const row of data ?? []) {
    const n = normalizePerformanceBandRow(row as Record<string, unknown>);
    if (n) bands.push(n);
  }

  return NextResponse.json({ bands });
}
