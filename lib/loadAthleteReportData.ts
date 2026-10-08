import type {
  ReportHopTestRow,
  ReportMetricRow,
  ReportSessionRow,
} from "@/lib/athleteReportData";
import type { AthleteForPdf } from "@/lib/generateAthletePdf";
import {
  fetchReportCriteria,
  fetchReportVisibility,
  type CriteriaResolver,
  type ReportVisibility,
} from "@/lib/reportSections";
import { supabase } from "@/lib/supabaseClient";

/**
 * Loads everything the PDF report needs for one athlete, using the same
 * queries as app/dashboard/athletes/[id]/page.tsx. Used by the bulk export.
 * Throws on a failed required query so the caller can mark that athlete failed.
 */

export type AthleteReportBundle = {
  athlete: AthleteForPdf;
  sessions: ReportSessionRow[];
  metricsBySession: Map<string, ReportMetricRow[]>;
  hopTests: ReportHopTestRow[];
  sectionComments: Record<string, string | null>;
  visibility: ReportVisibility;
  criteria: CriteriaResolver;
};

// Stay under PostgREST URL limits and the 1000-row response cap.
const SESSION_ID_CHUNK = 100;
const PAGE_SIZE = 1000;

export async function loadAthleteReportData(
  athleteId: string
): Promise<AthleteReportBundle> {
  const { data: a, error: aErr } = await supabase
    .from("athletes")
    .select("*")
    .eq("id", athleteId)
    .maybeSingle();
  if (aErr || !a) throw new Error(aErr?.message ?? "Athlete not found");

  const { data: s, error: sErr } = await supabase
    .from("sessions")
    .select(
      "id, session_date, test_type, test_sub_type, source, clinician_notes, lr_starting_leg, lr_side_swap"
    )
    .eq("athlete_id", athleteId)
    .order("session_date", { ascending: false });
  if (sErr) throw new Error(sErr.message);
  const sessions = (s ?? []) as ReportSessionRow[];

  const metricsBySession = new Map<string, ReportMetricRow[]>();
  const ids = sessions.map((x) => x.id);
  for (let i = 0; i < ids.length; i += SESSION_ID_CHUNK) {
    const chunk = ids.slice(i, i + SESSION_ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("metrics")
        .select("session_id, key, value, rep_index, side")
        .in("session_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ReportMetricRow[];
      for (const row of rows) {
        const list = metricsBySession.get(row.session_id) ?? [];
        list.push(row);
        metricsBySession.set(row.session_id, list);
      }
      if (rows.length < PAGE_SIZE) break;
    }
  }

  const [visibility, criteria, hRes, cRes] = await Promise.all([
    fetchReportVisibility(athleteId),
    fetchReportCriteria(athleteId),
    supabase
      .from("hop_tests")
      .select("session_date, test_type, side, best_cm")
      .eq("athlete_id", athleteId)
      .order("session_date", { ascending: true }),
    supabase
      .from("athlete_section_comments")
      .select("section, comment")
      .eq("athlete_id", athleteId),
  ]);

  const hopTests = hRes.error ? [] : ((hRes.data ?? []) as ReportHopTestRow[]);
  const sectionComments: Record<string, string | null> = {};
  if (!cRes.error) {
    for (const row of cRes.data ?? []) {
      const r = row as { section: string; comment: string | null };
      sectionComments[r.section] = r.comment;
    }
  }

  return {
    athlete: a as AthleteForPdf,
    sessions,
    metricsBySession,
    hopTests,
    sectionComments,
    visibility,
    criteria,
  };
}
