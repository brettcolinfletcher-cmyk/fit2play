import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const { supabase: authSupabase, user, profile } = await requireAuth()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (profile?.role === 'staff') {
    // allowed — any session id
  } else if (profile?.role === 'athlete') {
    const { data: sessionRow, error: sessionErr } = await authSupabase
      .from('sessions')
      .select('athlete_id')
      .eq('id', id)
      .maybeSingle()

    if (sessionErr || !sessionRow?.athlete_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: ownAthlete, error: athleteErr } = await authSupabase
      .from('athletes')
      .select('id')
      .eq('id', sessionRow.athlete_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (athleteErr || !ownAthlete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('sessions')
    .select('*, athletes(*), metrics(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
