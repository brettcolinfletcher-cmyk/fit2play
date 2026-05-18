import { createClient } from "@supabase/supabase-js";
import { formatDisplayDate } from "@/lib/dateDisplay";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function loadJumpHeightHistory(athleteId: string) {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, created_at, test_type")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: true });

  if (!sessions) return [];

  const ids = sessions.map((s) => s.id);

  const { data: metrics } = await supabase
    .from("metrics")
    .select("*")
    .in("session_id", ids)
    .eq("key", "fp_jump_height_cm_best");

  const map: Record<string, number | null> = {};
  metrics?.forEach((m) => (map[m.session_id] = m.value));

  return sessions.map((s) => ({
    date: formatDisplayDate(s.created_at),
    jumpHeight: map[s.id] ?? null,
  }));
}