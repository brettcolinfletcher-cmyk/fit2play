import { describe, expect, it } from "vitest";
import { describeAudit } from "@/lib/auditLabels";

const d = (action: string, table_name: string, detail: Record<string, unknown> | null = null) =>
  describeAudit({ action, table_name, detail });

describe("describeAudit", () => {
  it("describes views", () => {
    expect(d("view", "athletes")).toBe("Viewed athlete dashboard");
  });
  it("describes data exports", () => {
    expect(d("export", "athletes")).toBe("Downloaded all athlete data (CSV)");
  });
  it("lists edited athlete fields in plain words", () => {
    expect(d("update", "athletes", { fields: ["date_of_birth", "guardian_email"] })).toBe(
      "Edited athlete: date of birth, parent email"
    );
  });
  it("shortens long field lists", () => {
    expect(d("update", "athletes", { fields: ["a", "b", "c", "d", "e", "f"] })).toBe("Edited athlete: a, b, c, d +2 more");
  });
  it("keeps the name of a deleted athlete", () => {
    expect(d("delete", "athletes", { name: "Ava Morrow" })).toBe("Deleted athlete (Ava Morrow)");
  });
  it("names the test type for uploaded sessions", () => {
    expect(d("insert", "sessions", { test_type: "force_plate_cmj" })).toBe("Added force plate cmj session");
    expect(d("insert", "sessions")).toBe("Added test session");
  });
  it("shows email recipient and failures", () => {
    expect(d("insert", "report_emails", { recipient: "parent@example.com", status: "sent" })).toBe(
      "Emailed report to parent@example.com"
    );
    expect(d("insert", "report_emails", { recipient: "x@y.z", status: "failed" })).toBe("Emailed report to x@y.z (failed)");
  });
  it("covers the other logged tables", () => {
    expect(d("insert", "pdf_reports")).toBe("Exported PDF report");
    expect(d("insert", "athlete_teams")).toBe("Added to team");
    expect(d("delete", "athlete_teams")).toBe("Removed from team");
    expect(d("update", "athlete_section_comments", { section: "strength" })).toBe("Saved clinical comment (strength)");
    expect(d("insert", "injuries")).toBe("Added injury");
    expect(d("insert", "hop_tests")).toBe("Saved hop test");
  });
});
