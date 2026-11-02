import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { staffUserFromRequest } from "@/lib/routeAuth";

/**
 * Access log for actions taken through server routes (service role), where the
 * database trigger cannot see who the user is. Browser writes are logged by the
 * audit_row_change() trigger. Never throws: logging must not break the action.
 */

export type AuditEntry = {
  actor: string | null;
  action: "insert" | "update" | "delete" | "view";
  table: string;
  recordId?: string | null;
  athleteId?: string | null;
  detail?: Record<string, unknown> | null;
};

function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function logAudit(entry: AuditEntry, admin: SupabaseClient = adminClient()): Promise<void> {
  if (!entry.actor) return; // server scripts and cron: not a human action
  try {
    await admin.from("audit_log").insert({
      actor: entry.actor,
      action: entry.action,
      table_name: entry.table,
      record_id: entry.recordId ?? null,
      athlete_id: entry.athleteId ?? null,
      detail: entry.detail ?? null,
    });
  } catch {
    // ignore
  }
}

/** Views are logged at most once per actor and athlete in this window. */
const VIEW_DEDUPE_MINUTES = 30;

export async function logAthleteView(actor: string, athleteId: string, admin: SupabaseClient = adminClient()) {
  try {
    const since = new Date(Date.now() - VIEW_DEDUPE_MINUTES * 60_000).toISOString();
    const { data } = await admin
      .from("audit_log")
      .select("id")
      .eq("actor", actor)
      .eq("athlete_id", athleteId)
      .eq("action", "view")
      .gte("at", since)
      .limit(1);
    if (data && data.length) return;
    await logAudit({ actor, action: "view", table: "athletes", recordId: athleteId, athleteId }, admin);
  } catch {
    // ignore
  }
}

/**
 * Wraps an upload route handler: after a successful response that includes a
 * sessionId, records which staff member created which session.
 */
export function auditedUpload(handler: (req: Request) => Promise<Response>) {
  return async function POST(req: Request): Promise<Response> {
    const actor = await staffUserFromRequest(req);
    const res = await handler(req);
    if (!actor || !res.ok) return res;
    try {
      const json = (await res.clone().json()) as { sessionId?: string };
      if (json?.sessionId) {
        const admin = adminClient();
        const { data } = await admin.from("sessions").select("athlete_id, source, test_type").eq("id", json.sessionId).maybeSingle();
        await logAudit(
          {
            actor,
            action: "insert",
            table: "sessions",
            recordId: json.sessionId,
            athleteId: (data?.athlete_id as string) ?? null,
            detail: { via: new URL(req.url).pathname, source: data?.source ?? null, test_type: data?.test_type ?? null },
          },
          admin
        );
      }
    } catch {
      // ignore
    }
    return res;
  };
}
