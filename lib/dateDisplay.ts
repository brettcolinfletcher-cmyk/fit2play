/** Date-only display: DD/MM/YYYY in Australia/Sydney (e.g. 13/05/2026). */
export const DISPLAY_DATE_ONLY: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Australia/Sydney",
};

/** Date + time display in Australia/Sydney (e.g. 13/05/2026, 2:49 pm). */
export const DISPLAY_DATE_TIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
};

export function formatDisplayDate(iso: string | Date | null | undefined): string {
  if (iso == null || iso === "") return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", DISPLAY_DATE_ONLY);
  } catch {
    return "—";
  }
}

export function formatDisplayDateTime(iso: string | Date | null | undefined): string {
  if (iso == null || iso === "") return "—";
  try {
    return new Date(iso).toLocaleString("en-AU", DISPLAY_DATE_TIME);
  } catch {
    return typeof iso === "string" ? iso : "—";
  }
}
