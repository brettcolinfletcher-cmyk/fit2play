-- GPS unit register: each physical unit, who has it now, and full assignment history.
create table if not exists public.gps_units (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  unit_code text not null,
  size text,
  status text not null default 'available' check (status in ('available','hired','maintenance','lost','retired')),
  current_hire_id uuid references public.gps_hires(id) on delete set null,
  current_athlete_id uuid references public.athletes(id) on delete set null,
  current_holder_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gps_units_org_code_uq on public.gps_units(organisation_id, upper(unit_code));
create index if not exists gps_units_hire_idx on public.gps_units(current_hire_id);
create index if not exists gps_units_athlete_idx on public.gps_units(current_athlete_id);

alter table public.gps_units enable row level security;
drop policy if exists "staff manage gps_units" on public.gps_units;
create policy "staff manage gps_units" on public.gps_units
  for all to authenticated
  using (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'))
  with check (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'));

create table if not exists public.gps_unit_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  unit_id uuid not null references public.gps_units(id) on delete cascade,
  gps_hire_id uuid references public.gps_hires(id) on delete set null,
  athlete_id uuid references public.athletes(id) on delete set null,
  holder_name text,
  started_on date not null default ((now() at time zone 'Australia/Perth')::date),
  ended_on date,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists gps_unit_assignments_unit_idx on public.gps_unit_assignments(unit_id, started_on desc);
create index if not exists gps_unit_assignments_hire_idx on public.gps_unit_assignments(gps_hire_id);
create index if not exists gps_unit_assignments_athlete_idx on public.gps_unit_assignments(athlete_id);
create index if not exists gps_unit_assignments_org_idx on public.gps_unit_assignments(organisation_id);
create index if not exists gps_unit_assignments_created_by_idx on public.gps_unit_assignments(created_by);

alter table public.gps_unit_assignments enable row level security;
drop policy if exists "staff manage gps_unit_assignments" on public.gps_unit_assignments;
create policy "staff manage gps_unit_assignments" on public.gps_unit_assignments
  for all to authenticated
  using (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'))
  with check (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'));
