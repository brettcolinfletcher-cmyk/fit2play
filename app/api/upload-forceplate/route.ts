import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

type UploadForceplateBody = {
  athleteId: string
  fileName?: string | null
  metrics: Record<string, number | null>
  subTestType?: "cmj" | "dj" | "imtp" | "calf" | "other" | null
  testSubType?: string | null
  test_sub_type?: string | null
}

export async function POST(req: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const body = (await req.json()) as UploadForceplateBody
    const { athleteId, fileName, metrics, subTestType, testSubType, test_sub_type } = body || {}

    if (!athleteId) return NextResponse.json({ error: "Missing athleteId" }, { status: 400 })
    if (!metrics || typeof metrics !== "object") return NextResponse.json({ error: "Missing or invalid metrics" }, { status: 400 })

    let testType = "force_plate"
    if (subTestType === "cmj") testType = "force_plate_cmj"
    else if (subTestType === "dj") testType = "force_plate_dj"
    else if (subTestType === "imtp") testType = "force_plate_imtp"
    else if (subTestType === "calf") testType = "force_plate_calf"

    const legOrProtocol =
      (typeof testSubType === "string" && testSubType) ||
      (typeof test_sub_type === "string" && test_sub_type) ||
      null

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        test_type: testType,
        test_sub_type: legOrProtocol,
        file_name: fileName ?? null,
      })
      .select("id")
      .single()

    if (sessionError || !session) return NextResponse.json({ error: sessionError?.message || "Failed to create session" }, { status: 500 })

    const sessionId = session.id as string
    const metricRows = Object.entries(metrics)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ({ session_id: sessionId, key, value, rep_index: null as number | null }))

    if (metricRows.length === 0) return NextResponse.json({ sessionId, warning: "Session created, but no metrics were stored" }, { status: 200 })

    const { error: metricsError } = await supabaseAdmin.from("metrics").insert(metricRows)
    if (metricsError) return NextResponse.json({ error: metricsError.message }, { status: 500 })

    return NextResponse.json({ sessionId, message: "Force plate session created successfully" }, { status: 200 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unexpected server error" }, { status: 500 })
  }
}
