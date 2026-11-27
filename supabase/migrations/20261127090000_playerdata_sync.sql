-- PlayerData GPS sync (27 Nov 2026)
-- 1. Athlete link: athletes.playerdata_external_id (PlayerData athlete id)
-- 2. 'playerdata' allowed as a source for aliases and excluded sessions
-- 3. playerdata_unmatched_athletes: PlayerData athletes the sync could not match by name
-- 4. merge_athletes carries the PlayerData id across a merge
-- 5. delete_session_and_exclude excludes deleted PlayerData sessions from future syncs

alter table athletes add column if not exists playerdata_external_id text;
create unique index if not exists athletes_playerdata_external_id_key
  on athletes (playerdata_external_id) where playerdata_external_id is not null;

alter table athlete_external_aliases drop constraint if exists athlete_external_aliases_source_check;
alter table athlete_external_aliases add constraint athlete_external_aliases_source_check
  check (source = any (array['hawkins'::text, '1080'::text, 'playerdata'::text]));

alter table sync_excluded_sessions drop constraint if exists sync_excluded_sessions_source_check;
alter table sync_excluded_sessions add constraint sync_excluded_sessions_source_check
  check (source = any (array['1080'::text, 'hawkins'::text, 'playerdata'::text]));

create table if not exists playerdata_unmatched_athletes (
  external_id text primary key,
  name text not null,
  date_of_birth date,
  club_name text,
  reason text,
  ignored boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table playerdata_unmatched_athletes enable row level security;
drop policy if exists "staff full access playerdata_unmatched_athletes" on playerdata_unmatched_athletes;
create policy "staff full access playerdata_unmatched_athletes" on playerdata_unmatched_athletes
  for all
  using (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'staff'))
  with check (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'staff'));

create or replace function public.delete_session_and_exclude(p_session_id uuid, p_reason text default null::text)
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
    when v_s.source = 'playerdata' then 'playerdata'
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

create or replace function public.merge_athletes(p_keep uuid, p_drop uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_keep athletes%rowtype;
  v_drop athletes%rowtype;
  v_moved jsonb := '{}'::jsonb;
  v_session_ids uuid[];
  t text;
  n integer;
  r record;
begin
  if p_keep = p_drop then
    raise exception 'keep and drop must be different athletes';
  end if;
  select * into v_keep from athletes where id = p_keep for update;
  if not found then raise exception 'keep athlete % not found', p_keep; end if;
  select * into v_drop from athletes where id = p_drop for update;
  if not found then raise exception 'drop athlete % not found', p_drop; end if;

  -- sessions (metrics and time series hang off these)
  select coalesce(array_agg(id), '{}') into v_session_ids from sessions where athlete_id = p_drop;
  update sessions set athlete_id = p_keep where athlete_id = p_drop;
  get diagnostics n = row_count;
  v_moved := v_moved || jsonb_build_object('sessions', n);

  -- simple child tables
  foreach t in array array['asymmetry_results','hop_tests','injuries','pdf_reports','bookings','invoices'] loop
    execute format('update %I set athlete_id = $1 where athlete_id = $2', t) using p_keep, p_drop;
    get diagnostics n = row_count;
    v_moved := v_moved || jsonb_build_object(t, n);
  end loop;

  -- child tables with a unique key that includes athlete_id: move row by row,
  -- anything that would collide with the keeper's own row stays behind and is deleted with the dropped athlete
  foreach t in array array['athlete_teams','athlete_protocol_overrides','athlete_report_sections','athlete_section_comments'] loop
    n := 0;
    for r in execute format('select ctid::text as c from %I where athlete_id = $1', t) using p_drop loop
      begin
        execute format('update %I set athlete_id = $1 where ctid = $2::tid', t) using p_keep, r.c;
        n := n + 1;
      exception when unique_violation then
        null;
      end;
    end loop;
    v_moved := v_moved || jsonb_build_object(t, n);
  end loop;

  insert into athlete_merge_log (kept_id, dropped_id, dropped_row, moved, moved_session_ids)
  values (p_keep, p_drop, to_jsonb(v_drop), v_moved, v_session_ids);

  -- aliases that pointed at the dropped athlete now point at the keeper
  update athlete_external_aliases set athlete_id = p_keep where athlete_id = p_drop;

  -- delete first so unique indexes (external ids, user_id) are free
  delete from athletes where id = p_drop;

  -- external ids: keeper adopts the dropped id if it has none, otherwise it becomes an alias
  if v_drop.hawkins_external_id is not null then
    if v_keep.hawkins_external_id is null then
      update athletes set hawkins_external_id = v_drop.hawkins_external_id where id = p_keep;
    else
      insert into athlete_external_aliases (source, external_id, athlete_id, merged_from_athlete_id)
      values ('hawkins', v_drop.hawkins_external_id, p_keep, p_drop)
      on conflict (source, external_id) do update set athlete_id = excluded.athlete_id;
    end if;
  end if;
  if v_drop.motion1080_external_id is not null then
    if v_keep.motion1080_external_id is null then
      update athletes set motion1080_external_id = v_drop.motion1080_external_id where id = p_keep;
    else
      insert into athlete_external_aliases (source, external_id, athlete_id, merged_from_athlete_id)
      values ('1080', v_drop.motion1080_external_id, p_keep, p_drop)
      on conflict (source, external_id) do update set athlete_id = excluded.athlete_id;
    end if;
  end if;
  if v_drop.playerdata_external_id is not null then
    if v_keep.playerdata_external_id is null then
      update athletes set playerdata_external_id = v_drop.playerdata_external_id where id = p_keep;
    else
      insert into athlete_external_aliases (source, external_id, athlete_id, merged_from_athlete_id)
      values ('playerdata', v_drop.playerdata_external_id, p_keep, p_drop)
      on conflict (source, external_id) do update set athlete_id = excluded.athlete_id;
    end if;
  end if;

  -- fill any blank profile fields on the keeper from the dropped record
  update athletes a set
    organisation = coalesce(a.organisation, v_drop.organisation),
    team = coalesce(a.team, v_drop.team),
    primary_sport = coalesce(a.primary_sport, v_drop.primary_sport),
    email = coalesce(a.email, v_drop.email),
    notes = coalesce(a.notes, v_drop.notes),
    height_cm = coalesce(a.height_cm, v_drop.height_cm),
    weight_kg = coalesce(a.weight_kg, v_drop.weight_kg),
    dominant_leg = coalesce(a.dominant_leg, v_drop.dominant_leg),
    dominant_hand = coalesce(a.dominant_hand, v_drop.dominant_hand),
    profile_image_url = coalesce(a.profile_image_url, v_drop.profile_image_url),
    tags = coalesce(a.tags, v_drop.tags),
    user_id = coalesce(a.user_id, v_drop.user_id),
    organisation_id = coalesce(a.organisation_id, v_drop.organisation_id),
    external_id = coalesce(a.external_id, v_drop.external_id),
    target_profile_id = coalesce(a.target_profile_id, v_drop.target_profile_id),
    protocol_id = coalesce(a.protocol_id, v_drop.protocol_id),
    sex = coalesce(a.sex, v_drop.sex),
    date_of_birth = coalesce(a.date_of_birth, v_drop.date_of_birth),
    comparison = coalesce(a.comparison, v_drop.comparison),
    level = coalesce(a.level, v_drop.level),
    top_view = coalesce(a.top_view, v_drop.top_view),
    card_theme = coalesce(a.card_theme, v_drop.card_theme),
    status = case when a.status = 'archived' and v_drop.status <> 'archived' then v_drop.status else a.status end
  where a.id = p_keep;

  return jsonb_build_object('kept', p_keep, 'dropped', p_drop, 'moved', v_moved);
end;
$function$;
