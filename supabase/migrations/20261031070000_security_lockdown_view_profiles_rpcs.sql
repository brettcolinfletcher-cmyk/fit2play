-- Audit 31 Oct 2026, items 1, 2 and 4.
-- Safe for the app: no app code writes to profiles, the four metric RPCs are
-- only called by /api/athlete-dashboard/[id] with the service role (bypasses RLS),
-- and athlete_cohort_ranks stays callable by signed-in users.

-- 1. athlete_session_summary: obey the caller's RLS; no anon access; read-only for signed-in users
alter view public.athlete_session_summary set (security_invoker = true);
revoke all on public.athlete_session_summary from anon;
revoke insert, update, delete, truncate, references, trigger on public.athlete_session_summary from authenticated;

-- 2. profiles: users can no longer create profiles or change their role or organisation
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- 4a. Unguarded metric RPCs run as the caller, so RLS applies (staff = all, athlete = own)
alter function public.athlete_quality_metrics(uuid) security invoker;
alter function public.athlete_test_sides(uuid) security invoker;
alter function public.athlete_fp_trend_metrics(uuid) security invoker;
alter function public.athlete_hop_jump_metrics(uuid) security invoker;

-- 4b. No anon or public execute on any of the six
revoke execute on function public.athlete_quality_metrics(uuid) from public, anon;
revoke execute on function public.athlete_test_sides(uuid) from public, anon;
revoke execute on function public.athlete_fp_trend_metrics(uuid) from public, anon;
revoke execute on function public.athlete_hop_jump_metrics(uuid) from public, anon;
revoke execute on function public.athlete_cohort_ranks(uuid, jsonb) from public, anon;
revoke execute on function public.athlete_cohort_ranks_prev(uuid, jsonb) from public, anon;
