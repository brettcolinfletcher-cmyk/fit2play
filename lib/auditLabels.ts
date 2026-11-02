/** Plain-language descriptions for access log rows. Pure, shared by page and tests. */

export type AuditRow = {
  action: string;
  table_name: string;
  detail: Record<string, unknown> | null;
};

const FIELD_LABELS: Record<string, string> = {
  first_name: "first name",
  last_name: "last name",
  date_of_birth: "date of birth",
  guardian_name: "parent name",
  guardian_email: "parent email",
  primary_sport: "sport",
  dashboard_mode: "report mode",
  card_theme: "card theme",
  top_view: "top panel",
  height_cm: "height",
  weight_kg: "weight",
  dominant_leg: "dominant leg",
  dominant_hand: "dominant hand",
  protocol_id: "protocol",
  target_profile_id: "targets",
};

function fields(detail: AuditRow["detail"]): string {
  const f = Array.isArray(detail?.fields) ? (detail!.fields as string[]) : [];
  if (!f.length) return "";
  const names = f.map((k) => FIELD_LABELS[k] ?? k.replace(/_/g, " "));
  return names.length > 4 ? `${names.slice(0, 4).join(", ")} +${names.length - 4} more` : names.join(", ");
}

export function describeAudit(row: AuditRow): string {
  const { action, table_name: t, detail } = row;
  if (action === "view") return "Viewed athlete dashboard";
  if (action === "export") return "Downloaded all athlete data (CSV)";
  switch (t) {
    case "athletes":
      if (action === "insert") return "Created athlete";
      if (action === "delete") return `Deleted athlete${detail?.name ? ` (${String(detail.name)})` : ""}`;
      return `Edited athlete${fields(detail) ? `: ${fields(detail)}` : ""}`;
    case "sessions":
      if (action === "insert") {
        const tt = detail?.test_type ? String(detail.test_type).replace(/_/g, " ") : "test";
        return `Added ${tt} session`;
      }
      if (action === "delete") return "Deleted test session";
      return `Edited test session${fields(detail) ? `: ${fields(detail)}` : ""}`;
    case "hop_tests":
      return action === "delete" ? "Deleted hop test" : "Saved hop test";
    case "injuries":
      return action === "delete" ? "Deleted injury" : action === "insert" ? "Added injury" : "Edited injury";
    case "athlete_section_comments":
      return `${action === "delete" ? "Deleted" : "Saved"} clinical comment${detail?.section ? ` (${String(detail.section)})` : ""}`;
    case "athlete_report_sections":
      return "Changed report sections";
    case "athlete_teams":
      return action === "delete" ? "Removed from team" : "Added to team";
    case "pdf_reports":
      return "Exported PDF report";
    case "report_emails":
      return `Emailed report${detail?.recipient ? ` to ${String(detail.recipient)}` : ""}${
        detail?.status === "failed" ? " (failed)" : ""
      }`;
    default:
      return `${action} ${t.replace(/_/g, " ")}`;
  }
}
