import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function load1080Sessions(athleteId: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, created_at, file_name")
    .eq("athlete_id", athleteId)
    .eq("test_type", "1080_sprint")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("load1080Sessions error:", error);
    return [];
  }

  return data;
}
export async function load1080Summary(sessionId: string) {
  const keys = [
    "peakSpeed",
    "peakForce",
    "peakPower",
    "split5m",
    "split10m",
    "split20m",
  ];

  const { data, error } = await supabase
    .from("metrics")
    .select("key, value")
    .eq("session_id", sessionId)
    .is("rep_index", null)
    .in("key", keys);

  if (error) {
    console.error("load1080Summary error:", error);
    return {};
  }

  const summary: Record<string, number> = {};
  for (const row of data ?? []) {
    summary[row.key] = row.value;
  }

  return summary;
}