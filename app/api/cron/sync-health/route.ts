import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isServerSecretRequest, staffUserFromRequest } from "@/lib/routeAuth";
import { FROM, REPLY_TO, SITE_URL, getResend } from "@/lib/email/mailer";
import { evaluateSyncHealth, hasSyncProblem, type SyncLogRow } from "@/lib/sync/syncHealth";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/sync-health
 * Vercel cron, 23:00 UTC (7am Perth), after the 10pm syncs.
 * Emails the clinic inbox only when a sync is overdue or logged errors.
 * Staff can also call it to see the result; only the cron call sends email.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function perth(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Perth",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function GET(req: Request) {
  const fromCron = isServerSecretRequest(req);
  if (!fromCron && !(await staffUserFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await supabase
    .from("sync_log")
    .select("source, synced_at, errors")
    .order("synced_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const health = evaluateSyncHealth((data ?? []) as SyncLogRow[]);
  const problem = hasSyncProblem(health);

  let emailed = false;
  if (fromCron && problem) {
    const rows = health
      .map(
        (h) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;"><strong>${escapeHtml(h.label)}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:${h.status === "ok" ? "#166534" : "#b91c1c"};">${
          h.status === "ok" ? "OK" : h.status === "overdue" ? "Overdue" : "Errors"
        }</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(h.message)}<br/>
          <span style="color:#64748b;font-size:12px;">Last success: ${perth(h.lastSuccessAt)} · Last run: ${perth(h.lastRunAt)}</span>
          ${h.latestError ? `<br/><span style="color:#64748b;font-size:12px;">${escapeHtml(h.latestError.slice(0, 300))}</span>` : ""}
        </td>
      </tr>`
      )
      .join("");
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;max-width:640px;">
      <p style="font-size:16px;font-weight:700;margin:0 0 8px;">Data sync needs attention</p>
      <p style="color:#475569;margin:0 0 16px;">The nightly sync check found a problem. New test results may be missing from the dashboard.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${rows}</table>
      <p style="margin:16px 0 0;"><a href="${SITE_URL}/dashboard/sync" style="color:#0f172a;">Open the Sync page</a> to run it manually.</p>
    </div>`;
    try {
      const res = await getResend().emails.send({
        from: FROM,
        to: REPLY_TO,
        subject: `Fit2Perform: sync ${health.filter((h) => h.status !== "ok").map((h) => h.label).join(" and ")} needs attention`,
        html,
      });
      emailed = !res.error;
    } catch {
      emailed = false;
    }
  }

  return NextResponse.json({ ok: !problem, emailed, health });
}
