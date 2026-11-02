import { pdf } from "@react-pdf/renderer";
import TeamPdfDocument, { formatDay } from "@/components/teams/TeamPdfDocument";
import { supabase } from "@/lib/supabaseClient";
import { normalizePerformanceBandRow, type NormalizedPerformanceBand } from "@/lib/performanceBands";
import { latestLsiReadings, type MetricRowWithSide } from "@/lib/pdfReportChartData";
import type { ReportHopTestRow, ReportSessionRow } from "@/lib/athleteReportData";
import { perthToday } from "@/lib/retestDue";
import type { TestKey } from "@/lib/testCatalogue";
import {
  buildTeamReport,
  defaultRound,
  type ColourMode,
  type LsiReading,
  type TeamResultRow,
} from "@/lib/teamReport";

/**
 * Loads everything the team summary PDF needs for one squad. Client-side,
 * runs with the signed-in staff member's session (RLS applies).
 */

const PAGE = 1000;
const CHUNK = 150;

export type TeamPdfData = {
  teamName: string;
  level: string | null;
  intervalWeeks: number | null;
  athletes: { id: string; name: string }[];
  results: TeamResultRow[];
  lsi: Map<string, LsiReading[]>;
  testDates: Map<string, string[]>;
  protocolTests: TestKey[] | null;
  bands: NormalizedPerformanceBand[];
  round: { from: string; to: string } | null;
};

async function pagedIn<T>(
  table: string,
  columns: string,
  column: string,
  ids: string[]
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in(column, chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

export async function loadTeamPdfData(teamId: string): Promise<TeamPdfData> {
  const { data: team, error: tErr } = await supabase
    .from("teams")
    .select("id, name, level, protocol_id, retest_interval_weeks")
    .eq("id", teamId)
    .maybeSingle();
  if (tErr || !team) throw new Error(tErr?.message ?? "Team not found");

  const { data: members, error: mErr } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, status)")
    .eq("team_id", teamId);
  if (mErr) throw new Error(mErr.message);

  type A = { id: string; first_name: string | null; last_name: string | null; status: string | null };
  const athletes = ((members ?? []) as unknown as { athletes: A | A[] | null }[])
    .map((m) => (Array.isArray(m.athletes) ? m.athletes[0] : m.athletes))
    .filter((a): a is A => !!a && a.status !== "archived")
    .map((a) => ({ id: a.id, name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Athlete" }));
  const ids = athletes.map((a) => a.id);

  const [resultsRes, bandsRes, protoRes] = await Promise.all([
    supabase.rpc("team_test_results", { p_team_id: teamId }),
    supabase.from("performance_bands").select("*"),
    team.protocol_id
      ? supabase.from("protocol_tests").select("test_key").eq("protocol_id", team.protocol_id)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (resultsRes.error) throw new Error(resultsRes.error.message);

  const bands = ((bandsRes.data ?? []) as Record<string, unknown>[])
    .map(normalizePerformanceBandRow)
    .filter((b): b is NormalizedPerformanceBand => !!b);
  const protocolTests = protoRes.data
    ? (protoRes.data as { test_key: TestKey }[]).map((t) => t.test_key)
    : null;

  const sessions = ids.length
    ? await pagedIn<ReportSessionRow & { athlete_id: string }>(
        "sessions",
        "id, athlete_id, session_date, test_type, test_sub_type, source",
        "athlete_id",
        ids
      )
    : [];
  const hopTests = ids.length
    ? await pagedIn<ReportHopTestRow & { athlete_id: string }>(
        "hop_tests",
        "id, athlete_id, session_date, test_type, side, best_cm",
        "athlete_id",
        ids
      )
    : [];

  // Metrics only for isometric sessions (the only ones LSI needs).
  const isoIds = sessions.filter((x) => x.test_type === "force_plate_isometric").map((x) => x.id);
  const isoMetrics = isoIds.length
    ? await pagedIn<MetricRowWithSide & { session_id: string }>(
        "metrics",
        "id, session_id, key, value, rep_index, side",
        "session_id",
        isoIds
      )
    : [];
  const metricsBySession = new Map<string, MetricRowWithSide[]>();
  for (const m of isoMetrics) {
    const list = metricsBySession.get(m.session_id) ?? [];
    list.push(m);
    metricsBySession.set(m.session_id, list);
  }

  const testDates = new Map<string, string[]>();
  const addDate = (athleteId: string, iso: string | null) => {
    if (!iso) return;
    const d = perthToday(new Date(iso));
    const list = testDates.get(athleteId) ?? [];
    list.push(d);
    testDates.set(athleteId, list);
  };
  for (const x of sessions) addDate(x.athlete_id, x.session_date);
  for (const h of hopTests) addDate(h.athlete_id, h.session_date);

  const lsi = new Map<string, LsiReading[]>();
  for (const a of athletes) {
    const mine = sessions.filter((x) => x.athlete_id === a.id);
    const hops = hopTests.filter((h) => h.athlete_id === a.id);
    lsi.set(a.id, latestLsiReadings(mine, metricsBySession, hops));
  }

  return {
    teamName: team.name as string,
    level: (team.level as string | null) ?? null,
    intervalWeeks: (team.retest_interval_weeks as number | null) ?? null,
    athletes,
    results: (resultsRes.data ?? []) as TeamResultRow[],
    lsi,
    testDates,
    protocolTests,
    bands,
    round: defaultRound(testDates),
  };
}

export async function generateTeamPdfBlob(
  data: TeamPdfData,
  opts: { from: string; to: string; colourMode: ColourMode; comment: string }
): Promise<Blob> {
  const today = perthToday();
  const report = buildTeamReport({
    teamName: data.teamName,
    intervalWeeks: data.intervalWeeks,
    athletes: data.athletes,
    results: data.results,
    lsi: data.lsi,
    testDates: data.testDates,
    from: opts.from,
    to: opts.to,
    today,
    protocolTests: data.protocolTests,
    colourMode: opts.colourMode,
    bands: data.bands,
  });
  return pdf(
    <TeamPdfDocument report={report} comment={opts.comment.trim() || null} generatedLabel={formatDay(today)} />
  ).toBlob();
}

/** e.g. "SS_WA_under_13s_Female_team_report_2026-11-03.pdf" */
export function teamPdfFileName(teamName: string, today = perthToday()): string {
  const safe = teamName.replace(/['’]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${safe || "Team"}_team_report_${today}.pdf`;
}
