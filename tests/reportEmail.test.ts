import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPORT_BODY,
  REPORT_TEMPLATES,
  REPORT_TESTS,
  fillReportTemplate,
  fillSendPlaceholders,
  reportBodyToHtml,
  reportGreeting,
  testsToLines,
  unresolvedPlaceholders,
} from "@/lib/email/reportEmail";

const generic = REPORT_TEMPLATES.find((t) => t.key === "generic")!;
const junior = REPORT_TEMPLATES.find((t) => t.key === "junior_female")!;
const send = { squad: "Perth Glory U15 Girls", date: "14 November", tests: testsToLines(["cmj", "sprint40"]) };
const forAva = (text: string) =>
  fillReportTemplate(fillSendPlaceholders(text, send), { athlete: "Ava", greeting: "Dear parent/guardian of Ava" });

describe("templates", () => {
  it("generic is the default", () => {
    expect(DEFAULT_REPORT_BODY).toBe(generic.body);
  });
  it("generic fills completely from the send fields and athlete", () => {
    const body = forAva(generic.body);
    expect(unresolvedPlaceholders(body)).toEqual([]);
    expect(body).not.toMatch(/\{athlete\}|\{greeting\}/);
    expect(body).toContain("Ava's individual report from the Perth Glory U15 Girls testing session on 14 November");
    expect(forAva(generic.subject)).toBe("Ava's Perth Glory U15 Girls testing report");
  });
  it("neither template makes an age or sport benchmark claim", () => {
    for (const t of REPORT_TEMPLATES) expect(t.body).not.toMatch(/benchmark/i);
  });
  it("junior female template fills from the send fields, name only in the greeting", () => {
    const body = forAva(junior.body);
    expect(unresolvedPlaceholders(body)).toEqual([]);
    expect(body.match(/Ava/g)).toHaveLength(1);
    expect(body).toContain("Thanks for having her take part in the Perth Glory U15 Girls testing session on 14 November.");
    expect(body).not.toMatch(/SSWA|1 October/);
    expect(forAva(junior.subject)).toBe("Ava's Perth Glory U15 Girls testing report");
  });
});

describe("send placeholders", () => {
  it("lists ticked tests as bullets in catalogue order", () => {
    expect(testsToLines(["sprint40", "cmj"])).toBe(
      `- ${REPORT_TESTS.find((t) => t.key === "cmj")!.line}\n- ${REPORT_TESTS.find((t) => t.key === "sprint40")!.line}`
    );
  });
  it("reports blank or unknown placeholders but not the per-athlete ones", () => {
    expect(unresolvedPlaceholders(generic.body).sort()).toEqual(["{date}", "{squad}", "{tests}"]);
    expect(unresolvedPlaceholders("Hi {greeting} {athlete} {venue}")).toEqual(["{venue}"]);
  });
});

describe("reportGreeting", () => {
  it("uses the parent's first name when on file", () => {
    expect(reportGreeting({ athleteFirstName: "Ava", guardianName: "Sarah Morrow", recipientType: "guardian" })).toBe("Hi Sarah");
  });
  it("falls back to 'Dear parent/guardian of' when no parent name", () => {
    expect(reportGreeting({ athleteFirstName: "Ava", guardianName: null, recipientType: "guardian" })).toBe(
      "Dear parent/guardian of Ava"
    );
  });
  it("greets adults directly when the email goes to the athlete", () => {
    expect(reportGreeting({ athleteFirstName: "Ava", guardianName: "Sarah", recipientType: "athlete" })).toBe("Hi Ava");
  });
});

describe("reportBodyToHtml", () => {
  const html = reportBodyToHtml(forAva(generic.body));
  it("turns section titles (with colons) into headings", () => {
    for (const h of ["Why we test:", "What we tested:", "Reading the report:", "Ongoing testing:"]) {
      expect(html).toContain(`font-weight:700;color:#0f172a;">${h}</p>`);
    }
  });
  it("turns '- ' lines into list items, including the ticked tests", () => {
    expect((html.match(/<li /g) ?? []).length).toBe(5 + 2);
  });
  it("escapes HTML and links the website", () => {
    expect(html).toContain("Sports &amp; Exercise");
    expect(html).toContain('href="https://www.fit2perform.com.au"');
    expect(reportBodyToHtml("<script>x</script>")).not.toContain("<script>");
  });
  it("does not treat the greeting, sign-off or a long lead-in line as a heading", () => {
    expect(html).not.toContain('font-weight:700;color:#0f172a;">Dear parent');
    expect(html).not.toContain('font-weight:700;color:#0f172a;">Kind regards,</p>');
    expect(html).not.toContain('font-weight:700;color:#0f172a;">Our testing program');
  });
});
