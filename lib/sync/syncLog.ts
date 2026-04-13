import type { SupabaseClient } from "@supabase/supabase-js";

export async function insertSyncLog(
  supabase: SupabaseClient,
  source: string,
  sessionsCreated: number,
  errors: string | null
) {
  await supabase.from("sync_log").insert({
    source,
    sessions_created: sessionsCreated,
    errors: errors && errors.length > 8000 ? errors.slice(0, 8000) + "…" : errors,
  });
}
