// What a practitioner has chosen an athlete sees. One source of truth for the
// athlete's own dashboard (app/dashboard/athlete/[id]) and the practitioner's
// page (app/dashboard/athletes/[id]), so the two can't drift apart.
//
// Dependency-free on purpose: no Supabase browser client, no React. Only type
// imports from lib/reportSections (erased at build) so the server route can use it.

import { protocolIncludes, type ResolvedProtocol } from "@/lib/protocols";
import type { ReportVisibility } from "@/lib/reportSections";
import type { TestKey } from "@/lib/testCatalogue";
import { normaliseSubType } from "@/lib/reportCore";

// Which protocol tests each dashboard section belongs to. An empty list means
// the section isn't part of any protocol, so it hides when a protocol is set.
// Sections not listed here (e.g. lr_settings) always show.
export const SECTION_TESTS: Record<string, TestKey[]> = {
  linear: ["sprint_40m"],
  cod: ["cod_505"],
  cmj: ["cmj"],
  drop_jump: [],
  drop_jump_single: [],
  hop_tests: ["broad_jump", "sl_hop_distance"],
  dynamometry: ["adductor_squeeze", "abductor_squeeze", "iso_hamstring"],
};

// ── Report builder visibility ────────────────────────────────────────────────

export type ReportVisibilityRow = {
  section: string;
  sub_key: string | null;
  visible: boolean | null;
};

/** Builds the same resolver fetchReportVisibility() returns, from raw athlete_report_sections rows. */
export function visibilityFromRows(rows: ReportVisibilityRow[]): ReportVisibility {
  const raw = new Map<string, boolean>();
  for (const row of rows) {
    raw.set(`${row.section}|${row.sub_key ?? ""}`, row.visible as boolean);
  }
  return {
    raw,
    isSectionVisible(section: string) {
      return raw.get(`${section}|`) ?? true;
    },
    isSubtestVisible(section: string, subKey: string) {
      return raw.get(`${section}|${normaliseSubType(subKey)}`) ?? true;
    },
  };
}

// ── Protocol ─────────────────────────────────────────────────────────────────

export function protocolIsActive(p: ResolvedProtocol | null): boolean {
  return !!p && (!!p.protocolId || p.tests.length > 0);
}

export function sectionInProtocol(
  section: string,
  protocol: ResolvedProtocol | null,
  showAllTests = false
): boolean {
  if (!protocol || !protocolIsActive(protocol) || showAllTests) return true;
  const keys = SECTION_TESTS[section];
  if (!keys) return true;
  return keys.some((k) => protocolIncludes(protocol, k));
}

export type AthleteViewSettings = {
  visibility: ReportVisibility;
  protocol: ResolvedProtocol | null;
  /** Practitioner-only override: ignore the protocol filter. Athletes never set this. */
  showAllTests?: boolean;
};

/** True when a section is both switched on in the report builder and part of the athlete's protocol. */
export function sectionShown(section: string, s: AthleteViewSettings): boolean {
  return s.visibility.isSectionVisible(section) && sectionInProtocol(section, s.protocol, s.showAllTests);
}

// ── Top panel (score rings vs team ranking dials) ───────────────────────────

export type TopView = "rings" | "dials";

export function parseTopView(v: unknown): TopView | null {
  return v === "rings" || v === "dials" ? v : null;
}

/** A saved choice wins; otherwise athletes on a protocol open on the dials. */
export function resolveTopView(saved: unknown, protocol: ResolvedProtocol | null): TopView {
  return parseTopView(saved) ?? (protocolIsActive(protocol) ? "dials" : "rings");
}
