import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isServerSecretRequest, staffUserFromRequest } from "@/lib/routeAuth";
import { FROM, REPLY_TO, SITE_URL, getResend } from "@/lib/email/mailer";
import { computeRetestDue, latestTestByAthlete, perthToday, type RetestRow } from "@/lib/retestDue";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/retest-digest
 * Vercel cron, Sunday 23:00 UTC (Monday 7am Perth). Emails the clinic inbox a
 * list of active athletes who are overdue, due this week, or never tested,
 * grouped by team. No email when the list is empty.
 * Staff can call it to preview (JSON only); only the cron call sends.
 */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmt(d: string | null): string {
  if (!d) return "never";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function statusText(r: RetestRow): string {
  if (r.status === "never") return "Never tested";
  if (r.status === "overdue") return `Overdue ${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"}`;
  const d = -(r.daysOverdue ?? 0);
  return d === 0 ? "Due today" : `Due in ${d} day${d === 1 ? "" : "s"}`;
}

export async function GET(req: Request) {
  const fromCron = isServerSecretRequest(req);
  if (!fromCron && !(await staffUserFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const [aRes, sRes, atRes, tRes] = await Promise.all([
    db.from("athletes").select("id, first_name, last_name, status").neq("status", "archived"),
    db.from("sessions").select("athlete_id, session_date"),
    db.from("athlete_teams").select("athlete_id, team_id"),
    db.from("teams").select("id, name, retest_interval_weeks"),
  ]);
  const err = aRes.error ?? sRes.error ?? atRes.error ?? tRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const teams = new Map((tRes.data ?? []).map((t) => [t.id as string, t]));
  const teamOf = new Map<string, { name: string; weeks: number | null }>();
  for (const r of atRes.data ?? []) {
    const t = teams.get(r.team_id as string);
    if (t) teamOf.set(r.athlete_id as string, { name: t.name as string, weeks: (t.retest_interval_weeks as number | null) ?? null });
  }

  const rows = computeRetestDue(
    (aRes.data ?? []).map((a) => ({
      id: a.id as string,
      name: [a.first_name, a.last_name].filter(Boolean).join(" ") || "Unnamed athlete",
      status: a.status as string,
      teamName: teamOf.get(a.id as string)?.name ?? null,
      intervalWeeks: teamOf.get(a.id as string)?.weeks ?? null,
    })),
    latestTestByAthlete((sRes.data ?? []) as { athlete_id: string | null; session_date: string | null }[]),
    perthToday()
  ).filter((r) => r.status !== "ok");

  let emailed = false;
  if (fromCron && rows.length) {
    const groups = new Map<string, RetestRow[]>();
    for (const r of rows) {
      const k = r.teamName ?? "No team";
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const sections = [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([team, list]) => {
        const items = list
          .map(
            (r) => `<tr>
              <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;"><a href="${SITE_URL}/dashboard/athletes/${r.athleteId}" style="color:#0f172a;">${esc(r.name)}</a></td>
              <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:${r.status === "overdue" ? "#b91c1c" : r.status === "due_soon" ? "#b45309" : "#475569"};">${statusText(r)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">Last tested ${fmt(r.lastTest)}</td>
            </tr>`
          )
          .join("");
        const weeks = list[0]!.intervalWeeks;
        return `<p style="margin:20px 0 6px;font-weight:700;">${esc(team)} <span style="font-weight:400;color:#64748b;font-size:13px;">· retest every ${weeks} weeks</span></p>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">${items}</table>`;
      })
      .join("");
    const counts = {
      overdue: rows.filter((r) => r.status === "overdue").length,
      soon: rows.filter((r) => r.status === "due_soon").length,
      never: rows.filter((r) => r.status === "never").length,
    };
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;max-width:680px;">
      <p style="font-size:16px;font-weight:700;margin:0 0 6px;">Retests due this week</p>
      <p style="color:#475569;margin:0;">${counts.overdue} overdue · ${counts.soon} due in the next 7 days · ${counts.never} never tested</p>
      ${sections}
      <p style="margin:20px 0 0;color:#64748b;font-size:13px;">Intervals are set per team on the <a href="${SITE_URL}/dashboard/teams" style="color:#0f172a;">Teams page</a>.</p>
    </div>`;
    try {
      const res = await getResend().emails.send({
        from: FROM,
        to: REPLY_TO,
        subject: `Retests: ${counts.overdue} overdue, ${counts.soon} due this week`,
        html,
      });
      emailed = !res.error;
    } catch {
      emailed = false;
    }
  }

  return NextResponse.json({ count: rows.length, emailed, rows });
}
