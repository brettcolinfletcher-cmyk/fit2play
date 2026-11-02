import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { staffUserFromRequest } from "@/lib/routeAuth";
import { FROM, REPLY_TO, getResend } from "@/lib/email/mailer";
import {
  fillReportTemplate,
  reportBodyToHtml,
  reportGreeting,
  type RecipientType,
} from "@/lib/email/reportEmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/reports/email   (staff only)
 * Emails one athlete's PDF report. The recipient is looked up here, never
 * taken from the browser:
 *   guardian_email if set, else the athlete's own email if they are 18+
 *   (or age unknown). Under-18s with no guardian email are skipped.
 * test: true sends to the clinic inbox instead, for checking before a batch.
 */

type Attachment = { fileName: string; base64: string };
type Body = {
  athleteId?: string;
  subject?: string;
  body?: string;
  report?: Attachment;
  extra?: Attachment | null;
  test?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BASE64_CHARS = 4_000_000; // Vercel request bodies cap at ~4.5 MB

function ageYears(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function validAttachment(a: unknown): a is Attachment {
  return (
    !!a &&
    typeof (a as Attachment).fileName === "string" &&
    typeof (a as Attachment).base64 === "string" &&
    /\.pdf$/i.test((a as Attachment).fileName)
  );
}

export async function POST(req: Request) {
  const staffId = await staffUserFromRequest(req);
  if (!staffId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b?.athleteId || !b.subject?.trim() || !b.body?.trim() || !validAttachment(b.report)) {
    return NextResponse.json({ error: "Missing athlete, subject, message or report." }, { status: 400 });
  }
  if (b.extra && !validAttachment(b.extra)) {
    return NextResponse.json({ error: "Extra attachment must be a PDF." }, { status: 400 });
  }
  const size = b.report.base64.length + (b.extra?.base64.length ?? 0);
  if (size > MAX_BASE64_CHARS) {
    return NextResponse.json({ error: "Attachments are too large (max about 3 MB in total)." }, { status: 413 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: a, error } = await admin
    .from("athletes")
    .select("id, first_name, last_name, email, guardian_name, guardian_email, date_of_birth")
    .eq("id", b.athleteId)
    .maybeSingle();
  if (error || !a) return NextResponse.json({ error: "Athlete not found." }, { status: 404 });

  const firstName = String(a.first_name ?? "").trim() || "your athlete";
  const guardianEmail = String(a.guardian_email ?? "").trim();
  const athleteEmail = String(a.email ?? "").trim();
  const age = ageYears(a.date_of_birth as string | null);

  let recipient: string;
  let recipientType: RecipientType;
  if (b.test) {
    recipient = REPLY_TO;
    recipientType = "test";
  } else if (EMAIL_RE.test(guardianEmail)) {
    recipient = guardianEmail;
    recipientType = "guardian";
  } else if (age != null && age < 18) {
    return NextResponse.json({ skipped: true, reason: "Under 18 with no parent/guardian email" });
  } else if (EMAIL_RE.test(athleteEmail)) {
    recipient = athleteEmail;
    recipientType = "athlete";
  } else {
    return NextResponse.json({ skipped: true, reason: "No email on file" });
  }

  const greeting = reportGreeting({
    athleteFirstName: firstName,
    guardianName: a.guardian_name as string | null,
    // A test shows the parent version of the message.
    recipientType: recipientType === "athlete" ? "athlete" : "guardian",
  });
  const values = { athlete: firstName, greeting };
  const subject = (b.test ? "[TEST] " : "") + fillReportTemplate(b.subject.trim(), values);
  const html = reportBodyToHtml(fillReportTemplate(b.body, values));
  const text = fillReportTemplate(b.body, values);

  const attachments = [
    { filename: b.report.fileName, content: Buffer.from(b.report.base64, "base64") },
    ...(b.extra ? [{ filename: b.extra.fileName, content: Buffer.from(b.extra.base64, "base64") }] : []),
  ];

  let providerId: string | null = null;
  let sendError: string | null = null;
  try {
    const res = await getResend().emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to: recipient,
      subject,
      html,
      text,
      attachments,
    });
    if (res.error) sendError = res.error.message;
    providerId = res.data?.id ?? null;
  } catch (e) {
    sendError = e instanceof Error ? e.message : "Send failed";
  }

  await admin.from("report_emails").insert({
    athlete_id: a.id,
    recipient,
    recipient_type: recipientType,
    subject,
    status: sendError ? "failed" : "sent",
    error: sendError,
    provider_id: providerId,
    sent_by: staffId,
  });

  if (sendError) return NextResponse.json({ error: sendError }, { status: 502 });
  return NextResponse.json({ sent: true, recipient, recipientType });
}
