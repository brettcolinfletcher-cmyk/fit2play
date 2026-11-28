import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { sessionDisplayName } from "@/lib/gpsMetrics";
import type { MetricRow, TeamSession } from "@/lib/gpsTeam";
import type { SeasonPhase } from "@/lib/seasonPhases";
import { SPEED_BUCKET_KEY } from "@/lib/speedBands";

export type TeamAthlete = { id: string; name: string; setMaxVelocity: number | null };

export type TeamGpsData = {
  team: { id: string; name: string };
  athletes: TeamAthlete[];
  sessions: TeamSession[];
  metrics: Map<string, MetricRow[]>;
  best1080: Map<string, number>;
  phases: SeasonPhase[];
};

const GPS_KEYS = [
  "gps_total_distance_m",
  "gps_high_speed_run_distance_m",
  "gps_total_sprint_distance_m",
  "gps_max_speed_kph",
  SPEED_BUCKET_KEY,
];

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Everything the team GPS page needs, in a few paged queries. */
export async function loadTeamGps(teamId: string): Promise<TeamGpsData> {
  const { data: team, error: tErr } = await supabase.from("teams").select("id, name").eq("id", teamId).maybeSingle();
  if (tErr || !team) throw new Error(tErr?.message ?? "Team not found");

  const { data: links, error: lErr } = await supabase.from("athlete_teams").select("athlete_id").eq("team_id", teamId);
  if (lErr) throw new Error(lErr.message);
  const ids = [...new Set((links ?? []).map((l) => String(l.athlete_id)))];

  const athletes: TeamAthlete[] = [];
  for (const c of chunks(ids, 100)) {
    const { data, error } = await supabase
      .from("athletes")
      .select("id, first_name, last_name, max_velocity_kph, status")
      .in("id", c);
    if (error) throw new Error(error.message);
    for (const a of data ?? []) {
      if (a.status === "archived") continue;
      athletes.push({
        id: String(a.id),
        name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Athlete",
        setMaxVelocity: a.max_velocity_kph != null ? Number(a.max_velocity_kph) : null,
      });
    }
  }
  athletes.sort((a, b) => a.name.localeCompare(b.name));
  const liveIds = athletes.map((a) => a.id);

  type SRow = {
    id: string;
    athlete_id: string;
    session_date: string | null;
    source: string | null;
    test_sub_type: string | null;
    session_name: string | null;
    external_name: string | null;
  };
  const sessRows: SRow[] = [];
  for (const c of chunks(liveIds, 100)) {
    const { data, error } = await fetchAllRows<SRow>((from, to) =>
      supabase
        .from("sessions")
        .select("id, athlete_id, session_date, source, test_sub_type, session_name, external_name")
        .in("athlete_id", c)
        .in("source", ["playerdata", "1080"])
        .order("id")
        .range(from, to)
    );
    if (error) throw new Error(error.message);
    sessRows.push(...data);
  }

  const gps = sessRows.filter((s) => s.source === "playerdata" && s.session_date);
  const sprint = sessRows.filter((s) => s.source === "1080");
  const sessions: TeamSession[] = gps.map((s) => ({
    id: s.id,
    athleteId: s.athlete_id,
    date: s.session_date!.slice(0, 10),
    type: s.test_sub_type ?? "",
    name: sessionDisplayName(s),
  }));

  const metrics = new Map<string, MetricRow[]>();
  for (const c of chunks(gps.map((s) => s.id), 50)) {
    const { data, error } = await fetchAllRows<{ session_id: string } & MetricRow>((from, to) =>
      supabase
        .from("metrics")
        .select("session_id, key, value, rep_index")
        .in("session_id", c)
        .in("key", GPS_KEYS)
        .order("id")
        .range(from, to)
    );
    if (error) throw new Error(error.message);
    for (const r of data) {
      const arr = metrics.get(r.session_id) ?? [];
      arr.push({ key: r.key, value: r.value == null ? null : Number(r.value), rep_index: r.rep_index });
      metrics.set(r.session_id, arr);
    }
  }

  // Fastest 1080 top speed per athlete (m/s -> km/h), a max velocity source
  const best1080 = new Map<string, number>();
  const athleteBySprint = new Map(sprint.map((s) => [s.id, s.athlete_id]));
  for (const c of chunks(sprint.map((s) => s.id), 100)) {
    const { data, error } = await fetchAllRows<{ session_id: string; value: number | null }>((from, to) =>
      supabase.from("metrics").select("session_id, value").in("session_id", c).eq("key", "top_speed").order("id").range(from, to)
    );
    if (error) throw new Error(error.message);
    for (const r of data) {
      const kph = Number(r.value) * 3.6;
      const a = athleteBySprint.get(r.session_id);
      if (!a || !Number.isFinite(kph) || kph <= 0 || kph >= 50) continue;
      if (kph > (best1080.get(a) ?? 0)) best1080.set(a, kph);
    }
  }

  const { data: ph } = await supabase
    .from("season_phases")
    .select("id, name, phase_type, start_date, end_date, team_id, athlete_id, notes")
    .or(`team_id.eq.${teamId},and(team_id.is.null,athlete_id.is.null)`)
    .order("start_date");

  return {
    team: { id: String(team.id), name: String(team.name) },
    athletes,
    sessions,
    metrics,
    best1080,
    phases: (ph ?? []) as SeasonPhase[],
  };
}
