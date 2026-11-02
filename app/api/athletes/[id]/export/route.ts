import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { staffUserFromRequest } from "@/lib/routeAuth";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/athletes/[id]/export  (staff only)
 * Zip of CSV files with everything held about one athlete: profile, sessions,
 * every metric, asymmetry, hop tests, injuries, clinical comments, bookings,
 * invoices. For privacy access requests and clubs that want raw data.
 */

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

async function inChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...(await run(ids.slice(i, i + 200))));
  return out;
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await staffUserFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  try {
    const { data: athlete, error: aErr } = await db.from("athletes").select("*").eq("id", id).maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });

    const { data: teamRows } = await db.from("athlete_teams").select("joined_at, teams(name)").eq("athlete_id", id);
    const teamNames = (teamRows ?? [])
      .map((r) => (r as unknown as { teams: { name: string } | null }).teams?.name)
      .filter(Boolean)
      .join("; ");

    const sessions = await fetchAll<Record<string, unknown>>((f, t) =>
      db
        .from("sessions")
        .select("id, session_date, test_type, test_sub_type, source, device, file_name, clinician_notes, created_at")
        .eq("athlete_id", id)
        .order("session_date", { ascending: true })
        .range(f, t)
    );
    const sessionById = new Map(sessions.map((s) => [s.id as string, s]));
    const sessionIds = [...sessionById.keys()];

    const metrics = await inChunks(sessionIds, (chunk) =>
      fetchAll<Record<string, unknown>>((f, t) =>
        db
          .from("metrics")
          .select("session_id, key, value, unit, side, rep_index")
          .in("session_id", chunk)
          .order("session_id")
          .order("key")
          .range(f, t)
      )
    );
    const [asym, hops, injuries, comments, bookings, invoices] = await Promise.all([
      fetchAll<Record<string, unknown>>((f, t) =>
        db.from("asymmetry_results").select("session_id, metric_key, left_value, right_value, asymmetry_pct, stronger_side, rep_index").eq("athlete_id", id).range(f, t)
      ),
      fetchAll<Record<string, unknown>>((f, t) =>
        db.from("hop_tests").select("session_date, test_type, side, trial_1_cm, trial_2_cm, trial_3_cm, best_cm, clinician_notes, created_at").eq("athlete_id", id).order("session_date").range(f, t)
      ),
      fetchAll<Record<string, unknown>>((f, t) =>
        db.from("injuries").select("diagnosis, body_region, side, date_injured, date_rtp, status, notes, created_at").eq("athlete_id", id).range(f, t)
      ),
      fetchAll<Record<string, unknown>>((f, t) =>
        db.from("athlete_section_comments").select("section, comment, updated_at").eq("athlete_id", id).range(f, t)
      ),
      fetchAll<Record<string, unknown>>((f, t) =>
        db.from("bookings").select("start_at, end_at, status, client_name, client_email, client_phone, notes, source, created_at").eq("athlete_id", id).range(f, t)
      ),
      fetchAll<Record<string, unknown>>((f, t) =>
        db.from("invoices").select("invoice_number, issued_date, due_date, status, total_cents, client_name, client_email, notes").eq("athlete_id", id).range(f, t)
      ),
    ]);

    const withSession = (rows: Record<string, unknown>[]) =>
      rows.map((r) => {
        const s = sessionById.get(r.session_id as string);
        const { session_id: _sid, ...rest } = r;
        void _sid;
        return {
          session_date: s?.session_date ?? null,
          test_type: s?.test_type ?? null,
          test_sub_type: s?.test_sub_type ?? null,
          ...rest,
        } as Record<string, string | number | null>;
      });

    const name = [athlete.first_name, athlete.last_name].filter(Boolean).join(" ") || "athlete";
    const today = new Date().toISOString().slice(0, 10);
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(
      "README.txt",
      [
        `Fit2Perform data export for ${name}`,
        `Exported ${today}. All data held about this athlete in the Fit2Perform platform.`,
        "",
        "profile.csv            athlete details and team",
        "sessions.csv           one row per test session",
        "metrics.csv            every measured value (one row per metric, side and rep)",
        "asymmetry.csv          left/right comparisons",
        "hop_tests.csv          hop test trials",
        "injuries.csv           injury records",
        "clinical_comments.csv  clinician comments by report section",
        "bookings.csv           appointments",
        "invoices.csv           invoices (amounts in cents)",
        "",
        "Contains health information. Store and send securely.",
      ].join("\r\n")
    );
    zip.file("profile.csv", toCsv([{ ...athlete, teams: teamNames }]));
    zip.file("sessions.csv", toCsv(sessions.map(({ id: _i, ...rest }) => (void _i, rest)) as Record<string, string | null>[]));
    zip.file("metrics.csv", toCsv(withSession(metrics)));
    zip.file("asymmetry.csv", toCsv(withSession(asym)));
    zip.file("hop_tests.csv", toCsv(hops as Record<string, string | number | null>[]));
    zip.file("injuries.csv", toCsv(injuries as Record<string, string | number | null>[]));
    zip.file("clinical_comments.csv", toCsv(comments as Record<string, string | number | null>[]));
    zip.file("bookings.csv", toCsv(bookings as Record<string, string | number | null>[]));
    zip.file("invoices.csv", toCsv(invoices as Record<string, string | number | null>[]));
    const body = await zip.generateAsync({ type: "uint8array" });

    await logAudit(
      { actor, action: "export", table: "athletes", recordId: id, athleteId: id, detail: { sessions: sessions.length, metrics: metrics.length } },
      db
    );

    const file = `${name.replace(/[^A-Za-z0-9]+/g, "_")}_data_${today}.zip`;
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
