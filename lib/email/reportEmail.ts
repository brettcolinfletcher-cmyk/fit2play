/**
 * Squad report emails: wording templates and plain-text -> HTML rendering.
 * Pure functions only (used by the browser modal and by the server route).
 *
 * Placeholders:
 *   {greeting}  filled per email: "Hi <guardian first name>", "Dear parent/guardian
 *               of <athlete>", or "Hi <athlete>" when it goes to the athlete
 *   {athlete}   filled per email: athlete first name
 *   {squad}     filled once per send from the modal (squad or event name)
 *   {date}      filled once per send from the modal (session date, as typed)
 *   {tests}     filled once per send from the ticked tests (one bullet each)
 */

export type ReportTest = { key: string; label: string; line: string };

/** Standard one-line test descriptions for the "What we tested" list. */
export const REPORT_TESTS: ReportTest[] = [
  { key: "cmj", label: "Countermovement jump", line: "Countermovement jump (force plates): a standing vertical jump that measures lower body power." },
  { key: "drop_jump", label: "Drop jump", line: "Drop jump (force plates): a jump straight after landing from a box. Measures reactive strength, or how quickly the legs absorb and reuse force." },
  { key: "imtp", label: "Isometric mid-thigh pull", line: "Isometric mid-thigh pull (force plates): a maximal pull against a fixed bar that measures whole-body strength." },
  { key: "calf", label: "Isometric calf raise", line: "Isometric calf raise (force plates): a held calf push that measures calf strength on each side." },
  { key: "adductor", label: "Adductor squeeze", line: "Adductor (groin) squeeze: a held squeeze that measures groin strength, which matters for running and change of direction." },
  { key: "knee_dyno", label: "Knee strength (dynamometer)", line: "Knee extension and flexion (dynamometer): quadriceps and hamstring strength on each side." },
  { key: "hop", label: "Single-leg hop tests", line: "Single-leg hop tests: hops for distance on each leg, comparing left and right." },
  { key: "accel10", label: "10m acceleration", line: "10m acceleration: measures how quickly an athlete gets up to speed." },
  { key: "sprint40", label: "40m sprint", line: "40m sprint: measures acceleration and top speed." },
  { key: "cod505", label: "5-0-5 change of direction", line: "5-0-5 change of direction: a sprint, 180 degree turn and sprint back. Measures braking and re-acceleration." },
];

export function testsToLines(keys: string[]): string {
  return REPORT_TESTS.filter((t) => keys.includes(t.key))
    .map((t) => `- ${t.line}`)
    .join("\n");
}

const SIGN_OFF = `If you have any questions about the report, I'm happy to go through it.

Kind regards,
Brett Fletcher
APA Titled Sports & Exercise Physiotherapist
Fit2Perform
www.fit2perform.com.au`;

const GENERIC_BODY = `{greeting},

{athlete}'s individual report from the {squad} testing session on {date} is attached, along with a document outlining our tiered testing services.

Why we test:
Our testing program gives athletes the data to perform, develop and stay healthy. Depending on the package, it allows us to:
- Know where they stand: measure strength, power, speed and symmetry.
- Spot problems early: identify weaknesses, asymmetries and capacity gaps so they can be addressed early.
- Track their development: see how they are progressing over time, whether they are returning from injury or working towards their next performance goal.
- Take the guesswork out of training: objective testing gives athletes, parents and coaches clear information to make smarter decisions about training and recovery.
- See the bigger picture: combine physical testing with GPS data such as running distance, speed and training load to understand how an athlete is performing in training and games.

What we tested:
{tests}

Any test not completed on the day will not appear in the report.

Reading the report:
Treat these results as a starting point. Athletes grow, develop and respond to training at different rates, so the most useful comparison is against their own results over time rather than against teammates.

Ongoing testing:
A single test is a snapshot. The real value comes from repeating it and tracking change over time. The attached document outlines our tiered testing services and what each tier includes. There is no obligation, but if you'd like to know more, visit www.fit2perform.com.au or reply to this email.

${SIGN_OFF}`;

// Junior female squads. Based on the SSWA Under 13s parent email sent in Oct 2026
// (name only in the greeting, she/her in the body), made reusable.
const JUNIOR_FEMALE_BODY = `{greeting},

Thanks for having her take part in the {squad} testing session on {date}. Her individual report is attached, along with a document outlining our tiered testing services.

Why we test:
Our testing program gives young athletes the data to perform, develop and stay healthy. Depending on the package, it allows us to:
- Know where they stand: measure strength, power, speed and symmetry.
- Spot problems early: identify weaknesses, asymmetries and capacity gaps so they can be addressed early.
- Track their development: see how they are progressing over time, whether they are returning from injury or working towards their next performance goal.
- Take the guesswork out of training: objective testing gives athletes, parents and coaches clear information to make smarter decisions about training and recovery.
- See the bigger picture: combine physical testing with GPS data such as running distance, speed and training load to understand how an athlete is performing in training and games.

The tests in this report are the same types used in talent pathway and professional programs to build an athlete's physical profile. Starting now means she becomes familiar with the testing early and builds a record of results that can follow her as she progresses in her sport. For athletes who go on to higher levels, this kind of profile becomes a standard part of selection and development.

The goal is not just to perform better today. It is to help young athletes build the strength, capacity and confidence to perform for years to come.

What we tested:
{tests}

Any test not completed on the day will not appear in the report.

Reading the report:
This is a first set of results, so treat it as a starting point. Female athletes at this age grow and mature at very different rates, and that has a big effect on speed, jump and strength numbers. The most useful comparison is against her own results over time, not against her teammates.

Ongoing testing:
A single test is a snapshot. The real value comes from repeating it, so you can see how she is tracking. We run testing packages four times a year, at the end of each school term. The attached document outlines our tiered services and what each tier includes. There is no obligation, but if you'd like to know more, visit www.fit2perform.com.au or reply to this email.

${SIGN_OFF}`;

export type ReportTemplate = { key: string; name: string; subject: string; body: string };

export const REPORT_TEMPLATES: ReportTemplate[] = [
  { key: "generic", name: "Generic squad testing", subject: "{athlete}'s {squad} testing report", body: GENERIC_BODY },
  { key: "junior_female", name: "Junior female squad", subject: "{athlete}'s {squad} testing report", body: JUNIOR_FEMALE_BODY },
];

export const DEFAULT_REPORT_SUBJECT = REPORT_TEMPLATES[0]!.subject;
export const DEFAULT_REPORT_BODY = REPORT_TEMPLATES[0]!.body;

/** Fills the once-per-send placeholders ({squad}, {date}, {tests}); per-athlete ones stay. */
export function fillSendPlaceholders(
  text: string,
  values: { squad: string; date: string; tests: string }
): string {
  return text
    .replace(/\{squad\}/g, values.squad.trim())
    .replace(/\{date\}/g, values.date.trim())
    .replace(/\{tests\}/g, values.tests);
}

/** Placeholders other than {athlete}/{greeting} still present (blank or misspelt). */
export function unresolvedPlaceholders(text: string): string[] {
  const found = text.match(/\{[a-z_]+\}/gi) ?? [];
  return [...new Set(found)].filter((p) => p !== "{athlete}" && p !== "{greeting}");
}

export type RecipientType = "guardian" | "athlete" | "test";

export function reportGreeting(opts: {
  athleteFirstName: string;
  guardianName?: string | null;
  recipientType: RecipientType;
}): string {
  const guardian = opts.guardianName?.trim();
  if (opts.recipientType === "athlete") return `Hi ${opts.athleteFirstName}`;
  if (guardian) return `Hi ${guardian.split(/\s+/)[0]}`;
  return `Dear parent/guardian of ${opts.athleteFirstName}`;
}

export function fillReportTemplate(
  template: string,
  values: { athlete: string; greeting: string }
): string {
  return template.replace(/\{athlete\}/g, values.athlete).replace(/\{greeting\}/g, values.greeting);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkify(escaped: string): string {
  return escaped.replace(
    /\b((?:https?:\/\/)?www\.[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<]*)?)/gi,
    (m) => `<a href="${m.startsWith("http") ? m : `https://${m}`}" style="color:#0f172a;">${m}</a>`
  );
}

/**
 * Plain text -> simple HTML:
 *  - blank lines separate blocks
 *  - lines starting "- " become a bullet list
 *  - a short first line (no end punctuation other than a colon), followed by more lines, is a heading
 */
export function reportBodyToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    let i = 0;
    const first = lines[0]!.trim();
    if (lines.length > 1 && first.length <= 40 && !/[.,;!?]$/.test(first) && !first.startsWith("- ")) {
      out.push(`<p style="margin:20px 0 6px;font-weight:700;color:#0f172a;">${escapeHtml(first)}</p>`);
      i = 1;
    }
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
      if (para.length) out.push(`<p style="margin:0 0 12px;">${para.map((l) => linkify(escapeHtml(l))).join("<br/>")}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list.length)
        out.push(
          `<ul style="margin:0 0 12px;padding-left:20px;">${list
            .map((l) => `<li style="margin:0 0 6px;">${linkify(escapeHtml(l))}</li>`)
            .join("")}</ul>`
        );
      list = [];
    };
    for (; i < lines.length; i++) {
      const l = lines[i]!.trim();
      if (l.startsWith("- ")) {
        flushPara();
        list.push(l.slice(2));
      } else {
        flushList();
        para.push(l);
      }
    }
    flushPara();
    flushList();
  }
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#334155;max-width:620px;">${out.join("\n")}</div>`;
}
