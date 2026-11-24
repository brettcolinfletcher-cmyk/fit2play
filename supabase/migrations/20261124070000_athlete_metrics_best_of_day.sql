-- Athlete "Latest results" and score rings: use the BEST value of each test
-- day, not the highest number.
--  * Times (keys ending _time, except flight time) take the lowest value.
--  * 1080 split_5m_time rows are per-5m segments, so the old max() returned the
--    slowest segment. The 0-5 m split now comes from split_0_5m_time, falling
--    back to the first (slowest) segment of each rep, best rep of the day.
--  * Failed trials store 0; values <= 0 are ignored.
--  * Hawkins API drop jumps store RSI as fp_rsi; it now also feeds fp_rsi_best,
--    the key the athlete cards and rings read.

create or replace function public.athlete_quality_metrics(p_athlete uuid)
returns table(test_type text, key text, latest numeric, prev numeric)
language sql
stable
set search_path to 'public'
as $function$
  with base as (
    select s.test_type,
           m.key,
           m.value,
           s.id as sid,
           m.rep_index,
           coalesce(m.side, '') as side,
           coalesce(s.session_date, s.created_at::date) as d
    from metrics m
    join sessions s on s.id = m.session_id
    where s.athlete_id = p_athlete
      and m.value is not null
      and m.value > 0
      -- Exclude COD-labelled 1080 sessions from sprint metrics unless the
      -- session shows a real linear sprint rep (unchanged from before).
      and not (
        s.test_type = '1080_sprint'
        and (
          lower(coalesce(s.test_sub_type, '')) like '%5-10-5%'
          or lower(coalesce(s.test_sub_type, '')) like '%5-0-5%'
          or lower(coalesce(s.test_sub_type, '')) like '%shuttle%'
        )
        and not exists (
          select 1
          from metrics md
          join metrics mt on mt.session_id = md.session_id
            and coalesce(mt.rep_index, -1) = coalesce(md.rep_index, -1)
            and coalesce(mt.side, '') = coalesce(md.side, '')
            and mt.key = 'total_time'
          where md.session_id = s.id
            and md.key = 'total_distance'
            and md.value is not null
            and mt.value is not null
            and (
              abs(md.value - 10) <= 3
              or abs(md.value - 20) <= 3
              or abs(md.value - 40) <= 3
            )
        )
      )
  ),
  keyed as (
    select test_type, key, value, sid, rep_index, side, d from base
    union all
    select test_type, 'fp_rsi_best', value, sid, rep_index, side, d
    from base
    where test_type in ('force_plate_dj', 'force_plate_dj_single') and key = 'fp_rsi'
  ),
  vals as (
    select test_type, key, d,
           case
             when key like '%\_time' escape '\' and key not like '%flight%' then min(value)
             else max(value)
           end as v
    from keyed
    where not (test_type = '1080_sprint' and key in ('split_5m_time', 'split_0_5m_time'))
    group by test_type, key, d
  ),
  split05_direct as (
    select test_type, d, min(value) as v
    from keyed
    where test_type = '1080_sprint' and key = 'split_0_5m_time'
    group by test_type, d
  ),
  split05_segments as (
    select test_type, d, min(rep_first) as v
    from (
      select test_type, d, sid, rep_index, side, max(value) as rep_first
      from keyed
      where test_type = '1080_sprint' and key = 'split_5m_time'
      group by test_type, d, sid, rep_index, side
    ) r
    group by test_type, d
  ),
  split05 as (
    select coalesce(a.test_type, b.test_type) as test_type,
           'split_5m_time'::text as key,
           coalesce(a.d, b.d) as d,
           coalesce(a.v, b.v) as v
    from split05_direct a
    full join split05_segments b on b.test_type = a.test_type and b.d = a.d
  ),
  all_vals as (
    select test_type, key, d, v from vals
    union all
    select test_type, key, d, v from split05
  ),
  ranked as (
    select test_type, key, d, v,
           row_number() over (partition by test_type, key order by d desc) as rn
    from all_vals
  )
  select test_type,
         key,
         max(v) filter (where rn = 1) as latest,
         max(v) filter (where rn = 2) as prev
  from ranked
  where rn <= 2
  group by test_type, key;
$function$;

create or replace function public.athlete_test_sides(p_athlete uuid)
returns table(test_type text, key text, side text, latest numeric)
language sql
stable
set search_path to 'public'
as $function$
  with base as (
    select s.test_type, m.key, m.side, m.value,
           coalesce(s.session_date, s.created_at::date) as d
    from metrics m
    join sessions s on s.id = m.session_id
    where s.athlete_id = p_athlete
      and m.value is not null
      and m.value > 0
      and m.side is not null
  ),
  keyed as (
    select test_type, key, side, value, d from base
    union all
    select test_type, 'fp_rsi_best', side, value, d
    from base
    where test_type in ('force_plate_dj', 'force_plate_dj_single') and key = 'fp_rsi'
  ),
  vals as (
    select test_type, key, side, d,
           case
             when key like '%\_time' escape '\' and key not like '%flight%' then min(value)
             else max(value)
           end as v
    from keyed
    group by test_type, key, side, d
  ),
  ranked as (
    select test_type, key, side, d, v,
           row_number() over (partition by test_type, key, side order by d desc) as rn
    from vals
  )
  select test_type, key, side, v as latest
  from ranked
  where rn = 1;
$function$;

-- Match the project's RPC lockdown: no anonymous access to the session delete.
revoke execute on function public.delete_session_and_exclude(uuid, text) from public, anon;
grant execute on function public.delete_session_and_exclude(uuid, text) to authenticated;
