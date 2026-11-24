-- Sessions deleted in Fit2Play that the device APIs still return.
-- 1080's public API keeps listing sessions deleted in the 1080 app, so a plain
-- delete would come straight back on the next sync. The syncs skip any
-- (source, external_id) listed here.
create table if not exists public.sync_excluded_sessions (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('1080', 'hawkins')),
  external_id text not null,
  athlete_id uuid references public.athletes(id) on delete set null,
  session_date date,
  test_sub_type text,
  reason text,
  excluded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

alter table public.sync_excluded_sessions enable row level security;

drop policy if exists "staff full access sync_excluded_sessions" on public.sync_excluded_sessions;
create policy "staff full access sync_excluded_sessions" on public.sync_excluded_sessions
  for all
  using (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role = 'staff'))
  with check (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role = 'staff'));

-- Delete one session (metrics, time series, asymmetry rows go with it) and, for
-- synced sessions, record its device id so the sync never re-creates it.
-- SECURITY INVOKER: staff RLS on every table still applies.
create or replace function public.delete_session_and_exclude(p_session_id uuid, p_reason text default null)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_s sessions%rowtype;
  v_source text;
  v_metrics integer;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'staff')
     and auth.role() <> 'service_role' then
    raise exception 'only staff can delete sessions';
  end if;

  select * into v_s from sessions where id = p_session_id for update;
  if not found then
    raise exception 'session % not found', p_session_id;
  end if;

  v_source := case
    when v_s.source = '1080' then '1080'
    when v_s.source = 'hawkins' then 'hawkins'
    else null
  end;

  if v_source is not null and v_s.external_id is not null then
    insert into sync_excluded_sessions (source, external_id, athlete_id, session_date, test_sub_type, reason)
    values (v_source, v_s.external_id, v_s.athlete_id, v_s.session_date::date, v_s.test_sub_type, p_reason)
    on conflict (source, external_id) do nothing;
  end if;

  delete from metrics where session_id = p_session_id;
  get diagnostics v_metrics = row_count;
  delete from sessions where id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'metrics_deleted', v_metrics,
    'excluded', v_source is not null and v_s.external_id is not null
  );
end;
$function$;

grant execute on function public.delete_session_and_exclude(uuid, text) to authenticated;
