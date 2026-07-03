import { Resend } from "resend";

/**
 * Shared email helpers. All outbound mail goes through Resend.
 * Sending domain: f2p.au (verified).
 * From address: info@f2p.au
 * Reply-to: info@f2p.au (patient replies land in your inbox)
 */

export const FROM = "Fit2Perform <info@f2p.au>";
export const REPLY_TO = "info@f2p.au";
export const SITE_URL = "https://fit2perform.com.au";

export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  return new Resend(key);
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function perthDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    timeZone: "Australia/Perth",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function perthTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", {
    timeZone: "Australia/Perth",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ---- base HTML shell ---------------------------------------------------------

function shell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { margin:0; padding:0; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; }
  .wrap { max-width:560px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 1px 8px rgba(0,0,0,0.08); }
  .header { background:#0f172a; padding:28px 32px; }
  .header-title { color:#a3e635; font-size:22px; font-weight:700; letter-spacing:-0.5px; margin:0; }
  .header-sub { color:#94a3b8; font-size:13px; margin:4px 0 0; }
  .body { padding:28px 32px; }
  .label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.6px; color:#94a3b8; margin:0 0 4px; }
  .value { font-size:15px; color:#0f172a; margin:0 0 20px; }
  .pill { display:inline-block; background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; border-radius:999px; padding:4px 12px; font-size:13px; font-weight:600; }
  .pill.pending { background:#fefce8; color:#854d0e; border-color:#fde68a; }
  .pill.paid { background:#f0fdf4; color:#166534; border-color:#bbf7d0; }
  .divider { border:none; border-top:1px solid #e2e8f0; margin:24px 0; }
  table.items { width:100%; border-collapse:collapse; font-size:14px; }
  table.items th { text-align:left; color:#64748b; font-size:11px; font-weight:600; text-transform:uppercase; padding:0 0 8px; border-bottom:1px solid #e2e8f0; }
  table.items td { padding:10px 0; border-bottom:1px solid #f1f5f9; color:#1e293b; }
  table.items td.right { text-align:right; }
  table.items tr.total td { font-weight:700; border-bottom:none; padding-top:14px; }
  .btn { display:inline-block; background:#0f172a; color:#a3e635 !important; text-decoration:none; padding:12px 24px; border-radius:999px; font-size:14px; font-weight:600; margin-top:8px; }
  .footer { background:#f8fafc; padding:20px 32px; font-size:12px; color:#94a3b8; text-align:center; }
  .footer a { color:#64748b; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <p class="header-title">Fit2Perform</p>
    <p class="header-sub">Sports Performance &amp; Physiotherapy</p>
  </div>
  <div class="body">${body}</div>
  <div class="footer">
    Fit2Perform · Perth, Western Australia<br/>
    <a href="${SITE_URL}">${SITE_URL}</a>
  </div>
</div>
</body>
</html>`;
}

// ---- booking confirmation ----------------------------------------------------

export type BookingConfirmationData = {
  clientName: string;
  clientEmail: string;
  serviceName: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  practitionerName: string;
  cancelToken: string | null;
};

export async function sendBookingConfirmation(data: BookingConfirmationData) {
  const resend = getResend();
  const date = perthDate(data.startAt);
  const start = perthTime(data.startAt);
  const end = perthTime(data.endAt);

  const html = shell(`
    <p style="font-size:18px;font-weight:700;margin:0 0 4px;">Appointment confirmed</p>
    <p style="color:#64748b;margin:0 0 24px;">Hi ${data.clientName}, your appointment request has been received.</p>

    <p class="label">Service</p>
    <p class="value">${data.serviceName}</p>

    <p class="label">Date &amp; time</p>
    <p class="value">${date}<br/><strong>${start} – ${end}</strong></p>

    <p class="label">Practitioner</p>
    <p class="value">${data.practitionerName}</p>

    <p class="label">Status</p>
    <p class="value"><span class="pill pending">Pending confirmation</span></p>

    <p style="color:#64748b;font-size:13px;margin-top:4px;">
      We'll be in touch shortly to confirm your appointment. If you need to cancel or have any questions,
      reply to this email or call us directly.
    </p>

    ${data.cancelToken ? `
    <hr class="divider" />
    <p style="font-size:13px;color:#94a3b8;">
      Need to cancel? <a href="${SITE_URL}/book/cancel?token=${data.cancelToken}" style="color:#0f172a;">Click here</a>
    </p>` : ""}
  `);

  return resend.emails.send({
    from: FROM,
    reply_to: REPLY_TO,
    to: data.clientEmail,
    subject: `Appointment request received — ${data.serviceName} on ${date}`,
    html,
  });
}

// ---- booking reminder --------------------------------------------------------

export type BookingReminderData = {
  clientName: string;
  clientEmail: string;
  serviceName: string;
  startAt: string;
  practitionerName: string;
  cancelToken: string | null;
};

export async function sendBookingReminder(data: BookingReminderData) {
  const resend = getResend();
  const date = perthDate(data.startAt);
  const time = perthTime(data.startAt);

  const html = shell(`
    <p style="font-size:18px;font-weight:700;margin:0 0 4px;">Appointment reminder</p>
    <p style="color:#64748b;margin:0 0 24px;">Hi ${data.clientName}, just a reminder about your appointment tomorrow.</p>

    <p class="label">Service</p>
    <p class="value">${data.serviceName}</p>

    <p class="label">Date &amp; time</p>
    <p class="value">${date}<br/><strong>${time}</strong></p>

    <p class="label">Practitioner</p>
    <p class="value">${data.practitionerName}</p>

    <p style="color:#64748b;font-size:13px;">
      If you need to reschedule or cancel, please reply to this email or call us as soon as possible.
    </p>

    ${data.cancelToken ? `
    <hr class="divider" />
    <p style="font-size:13px;color:#94a3b8;">
      Need to cancel? <a href="${SITE_URL}/book/cancel?token=${data.cancelToken}" style="color:#0f172a;">Click here</a>
    </p>` : ""}
  `);

  return resend.emails.send({
    from: FROM,
    reply_to: REPLY_TO,
    to: data.clientEmail,
    subject: `Reminder: ${data.serviceName} tomorrow at ${time}`,
    html,
  });
}

// ---- invoice email -----------------------------------------------------------

export type InvoiceEmailData = {
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;
  status: string; // 'draft'|'sent'|'part_paid'|'paid'
  issuedDate: string;
  dueDate: string | null;
  totalCents: number;
  paidCents: number;
  items: { description: string; quantity: number; unit_price_cents: number; amount_cents: number }[];
  practitionerName?: string;
};

export async function sendInvoiceEmail(data: InvoiceEmailData) {
  const resend = getResend();
  const isPaid = data.status === "paid";
  const owing = Math.max(0, data.totalCents - data.paidCents);

  const itemRows = data.items
    .map(
      (it) => `<tr>
        <td>${it.description}${it.quantity > 1 ? ` ×${it.quantity}` : ""}</td>
        <td class="right">${money(it.amount_cents)}</td>
      </tr>`
    )
    .join("");

  const html = shell(`
    <p style="font-size:18px;font-weight:700;margin:0 0 4px;">
      ${isPaid ? "Receipt — payment received" : `Invoice ${data.invoiceNumber}`}
    </p>
    <p style="color:#64748b;margin:0 0 24px;">Hi ${data.clientName},
      ${isPaid
        ? " thank you — your payment has been received."
        : ` please find your invoice from Fit2Perform below.`}
    </p>

    <p class="label">Invoice</p>
    <p class="value">${data.invoiceNumber} · Issued ${data.issuedDate}${data.dueDate ? ` · Due ${data.dueDate}` : ""}</p>

    ${data.practitionerName ? `
    <p class="label">Practitioner</p>
    <p class="value">${data.practitionerName}</p>` : ""}

    <p class="label">Status</p>
    <p class="value"><span class="pill ${isPaid ? "paid" : "pending"}">${isPaid ? "Paid" : data.status.replace("_", " ")}</span></p>

    <hr class="divider" />

    <table class="items">
      <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr class="total"><td>Total</td><td class="right">${money(data.totalCents)}</td></tr>
        ${data.paidCents > 0 && !isPaid ? `<tr><td style="color:#64748b;">Paid to date</td><td class="right" style="color:#64748b;">${money(data.paidCents)}</td></tr>` : ""}
        ${!isPaid && owing > 0 ? `<tr><td style="font-weight:700;">Amount owing</td><td class="right" style="font-weight:700;color:#dc2626;">${money(owing)}</td></tr>` : ""}
      </tfoot>
    </table>

    ${!isPaid ? `
    <hr class="divider" />
    <p style="font-size:13px;color:#64748b;">
      To pay, please contact us directly or reply to this email. We accept cash, EFTPOS, credit card, and health fund claims.
    </p>` : ""}
  `);

  const subject = isPaid
    ? `Receipt — ${data.invoiceNumber} · ${money(data.totalCents)} received`
    : `Invoice ${data.invoiceNumber} · ${money(owing > 0 ? owing : data.totalCents)} owing — Fit2Perform`;

  return resend.emails.send({
    from: FROM,
    reply_to: REPLY_TO,
    to: data.clientEmail,
    subject,
    html,
  });
}
