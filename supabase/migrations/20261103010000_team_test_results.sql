-- Team summary PDF: each squad member's latest test-day value per ranking
-- metric, plus their previous test-day value (for "drop since last test").
-- Metric definitions match athlete_cohort_ranks exactly (same rep
-- classification, same per-day best, same unit conversions), so the team
-- report and the athlete report dials always agree.
create or replace function public.team_test_results(p_team_id uuid)
returns table(athlete_id uuid, metric text, d date, v numeric, prev_d date, prev_v numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
with authz as (
  select 1 ok where auth.role() = 'service_role'
    or exists (select 1 from profiles where id = auth.uid() and role = 'staff')
),
cohort as (
  select a.id from athletes a
  join athlete_teams at on at.athlete_id = a.id
  where at.team_id = p_team_id
    and coalesce(a.status, 'active') <> 'archived'
    and exists (select 1 from authz)
),
rep_ev as (
  select m.session_id, m.rep_index,
    max(m.value) filter (where m.key = 'total_distance') as dist,
    max(m.value) filter (where m.key = 'decel_max') as decel,
    max(m.value) filter (where m.key = 'total_time') as t
  from metrics m
  where m.session_id in (select s.id from sessions s where s.source = '1080' and s.athlete_id in (select id from cohort))
  group by m.session_id, m.rep_index
),
rep_kind as (
  select s.id as session_id, r.rep_index,
    case
      when coalesce(r.dist, 0) >= 25 then 'sprint'
      when coalesce(s.test_sub_type, '') ~* '5-0-5' then 'cod'
      when coalesce(s.test_sub_type, '') ~* '(linear|running)' and coalesce(s.test_sub_type, '') !~* 'resist'
           and r.dist between 3 and 9 and coalesce(r.decel, 0) >= 4 and r.t between 1.2 and 4 then 'cod'
      when coalesce(s.test_sub_type, '') ~* '(linear|running|40)' and coalesce(s.test_sub_type, '') !~* 'resist' then 'sprint'
    end as kind
  from sessions s
  join rep_ev r on r.session_id = s.id
  where s.source = '1080' and s.athlete_id in (select id from cohort)
),
rows as (
  select s.athlete_id, (s.session_date at time zone 'Australia/Perth')::date d, m.side, m.value::numeric v,
    case
      when s.source = '1080' and m.key = 'top_speed' and rk.kind = 'sprint' then 'max_speed'
      when s.source = '1080' and m.key = 'accel_max' and rk.kind = 'sprint' then 'acceleration'
      when s.source = '1080' and m.key = 'decel_max' and rk.kind = 'cod' then 'deceleration'
      when s.source = '1080' and m.key = 'total_time' and rk.kind = 'cod' then 'cod'
      when s.test_type = 'force_plate_cmj' and m.key = 'fp_jump_height' and coalesce(s.test_sub_type, '') !~* '(left|right|single|plyo)' then 'jump_height'
      when s.test_type = 'force_plate_isometric' and m.key = 'peak_force' and s.test_sub_type ~* '(adduct|squeeze)' then 'adductor'
    end metric
  from sessions s join metrics m on m.session_id = s.id
  left join rep_kind rk on rk.session_id = s.id and rk.rep_index is not distinct from m.rep_index
  where s.athlete_id in (select id from cohort) and m.value is not null
),
per_side as (
  select r.athlete_id, r.metric, r.d, r.side,
    case when r.metric = 'cod' then min(r.v) else max(r.v) end sv
  from rows r
  where r.metric is not null
    and not (r.metric = 'cod' and r.side is null and exists (
      select 1 from rows r2 where r2.athlete_id = r.athlete_id and r2.metric = 'cod' and r2.d = r.d and r2.side is not null))
  group by 1, 2, 3, 4
),
per_day as (
  select athlete_id, metric, d,
    case metric
      when 'cod' then max(sv)
      when 'max_speed' then max(sv) * 3.6
      when 'jump_height' then max(sv) * 100
      else max(sv)
    end v
  from per_side group by 1, 2, 3
),
ordered as (
  select p.*, row_number() over (partition by p.athlete_id, p.metric order by p.d desc) rn from per_day p
)
select o1.athlete_id, o1.metric, o1.d, o1.v, o2.d, o2.v
from ordered o1
left join ordered o2 on o2.athlete_id = o1.athlete_id and o2.metric = o1.metric and o2.rn = 2
where o1.rn = 1;
$function$;

revoke execute on function public.team_test_results(uuid) from public, anon;
grant execute on function public.team_test_results(uuid) to authenticated, service_role;
