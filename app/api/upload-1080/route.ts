import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const body = await req.json()
    const { athleteId, fileName, metrics } = body || {}

    if (!athleteId) return NextResponse.json({ error: "Missing athleteId" }, { status: 400 })
    if (!metrics || typeof metrics !== "object") return NextResponse.json({ error: "Missing or invalid metrics" }, { status: 400 })

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .insert({ athlete_id: athleteId, test_type: "1080_sprint", file_name: fileName ?? null })
      .select("id")
      .single()

    if (sessionError || !session) return NextResponse.json({ error: sessionError?.message || "Failed to create session" }, { status: 500 })

    const sessionId = session.id as string
    const metricRows = Object.entries(metrics)
      .filter(([, value]) => value !== null && value !== undefined && value !== 0)
      .map(([key, value]) => ({ session_id: sessionId, key, value, rep_index: null as number | null }))

    if (metricRows.length === 0) return NextResponse.json({ sessionId, warning: "Session created but no metrics stored" }, { status: 200 })

    const { error: metricsError } = await supabaseAdmin.from("metrics").insert(metricRows)
    if (metricsError) return NextResponse.json({ error: metricsError.message }, { status: 500 })

    return NextResponse.json({ sessionId, message: "Sprint session created successfully" }, { status: 200 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unexpected server error" }, { status: 500 })
  }
}
