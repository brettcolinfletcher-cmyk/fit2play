-- Season phases (blocks): shaded behind the GPS workload charts.
-- Scope: one team, one athlete, or everyone (both null).
create table if not exists season_phases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phase_type text not null default 'other'
    check (phase_type in ('preseason', 'competition', 'tournament', 'deload', 'off_season', 'rehab', 'other')),
  start_date date not null,
  end_date date not null,
  team_id uuid references teams(id) on delete cascade,
  athlete_id uuid references athletes(id) on delete cascade,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint season_phases_dates check (end_date >= start_date),
  constraint season_phases_scope check (team_id is null or athlete_id is null)
);
create index if not exists season_phases_team_idx on season_phases (team_id);
create index if not exists season_phases_athlete_idx on season_phases (athlete_id);

alter table season_phases enable row level security;
drop policy if exists "staff full access season_phases" on season_phases;
create policy "staff full access season_phases" on season_phases
  for all
  using (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'staff'))
  with check (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'staff'));
