/**
 * Minimal CSV writer (RFC 4180). Strings that a spreadsheet would treat as a
 * formula (= + - @ at the start) are prefixed with ' so opening the file in
 * Excel or Numbers cannot run anything. Numbers are written as numbers.
 */

type Cell = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

function cell(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, Cell>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map((c) => cell(c)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
