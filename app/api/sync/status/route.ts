import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type SyncLogRow = {
  source: string;
  synced_at: string;
  sessions_created: number;
  errors: string | null;
};

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: rows, error } = await supabase
    .from("sync_log")
    .select("source, synced_at, sessions_created, errors")
    .order("synced_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as SyncLogRow[];
  const latest: Record<
    string,
    { synced_at: string; sessions_created: number; errors: string | null }
  > = {};

  for (const r of list) {
    if (!latest[r.source]) {
      latest[r.source] = {
        synced_at: r.synced_at,
        sessions_created: r.sessions_created,
        errors: r.errors,
      };
    }
  }

  return NextResponse.json({
    hawkins: latest["hawkins"] ?? null,
    "1080": latest["1080"] ?? null,
  });
}
