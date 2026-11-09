-- Scheduling flexibility: per-booking fee, group bookings (athletes + teams),
-- invoices billed to teams / linked to GPS hire, GPS hire register with renewals.

-- 1. Bookings: per-appointment fee override and a title for group sessions
alter table public.bookings
  add column if not exists price_cents integer check (price_cents is null or price_cents >= 0),
  add column if not exists title text;

-- 2. Group booking attendees (any mix of athletes, teams and manual clients)
create table if not exists public.booking_attendees (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  client_name text,
  client_email text,
  price_cents integer check (price_cents is null or price_cents >= 0),
  attendance text not null default 'booked' check (attendance in ('booked','attended','no_show','cancelled')),
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  check (athlete_id is not null or team_id is not null or client_name is not null)
);
create unique index if not exists booking_attendees_athlete_uq on public.booking_attendees(booking_id, athlete_id) where athlete_id is not null;
create unique index if not exists booking_attendees_team_uq on public.booking_attendees(booking_id, team_id) where team_id is not null;
create index if not exists booking_attendees_booking_idx on public.booking_attendees(booking_id);
create index if not exists booking_attendees_athlete_idx on public.booking_attendees(athlete_id);
create index if not exists booking_attendees_team_idx on public.booking_attendees(team_id);
create index if not exists booking_attendees_invoice_idx on public.booking_attendees(invoice_id);
create index if not exists booking_attendees_org_idx on public.booking_attendees(organisation_id);

alter table public.booking_attendees enable row level security;
drop policy if exists "staff manage booking_attendees" on public.booking_attendees;
create policy "staff manage booking_attendees" on public.booking_attendees
  for all to authenticated
  using (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'))
  with check (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'));

-- 3. GPS hire register
create table if not exists public.gps_hires (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  athlete_id uuid references public.athletes(id) on delete set null,
  client_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  units_count integer not null default 1 check (units_count >= 0),
  unit_refs text,
  start_date date not null default ((now() at time zone 'Australia/Perth')::date),
  end_date date,
  units_returned_date date,
  status text not null default 'active' check (status in ('active','paused','ended')),
  one_off_fee_cents integer check (one_off_fee_cents is null or one_off_fee_cents >= 0),
  subscription_cents integer check (subscription_cents is null or subscription_cents >= 0),
  price_per_unit boolean not null default false,
  interval_months smallint not null default 1 check (interval_months between 1 and 24),
  next_renewal_date date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gps_hires_org_idx on public.gps_hires(organisation_id);
create index if not exists gps_hires_team_idx on public.gps_hires(team_id);
create index if not exists gps_hires_athlete_idx on public.gps_hires(athlete_id);
create index if not exists gps_hires_created_by_idx on public.gps_hires(created_by);
create index if not exists gps_hires_renewal_idx on public.gps_hires(next_renewal_date) where status = 'active';

alter table public.gps_hires enable row level security;
drop policy if exists "staff manage gps_hires" on public.gps_hires;
create policy "staff manage gps_hires" on public.gps_hires
  for all to authenticated
  using (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'))
  with check (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'));

-- Follow-up log (calls, emails, reminders about renewals / unpaid invoices)
create table if not exists public.gps_hire_followups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  gps_hire_id uuid not null references public.gps_hires(id) on delete cascade,
  note text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists gps_hire_followups_hire_idx on public.gps_hire_followups(gps_hire_id, created_at desc);
create index if not exists gps_hire_followups_org_idx on public.gps_hire_followups(organisation_id);
create index if not exists gps_hire_followups_created_by_idx on public.gps_hire_followups(created_by);

alter table public.gps_hire_followups enable row level security;
drop policy if exists "staff manage gps_hire_followups" on public.gps_hire_followups;
create policy "staff manage gps_hire_followups" on public.gps_hire_followups
  for all to authenticated
  using (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'))
  with check (organisation_id in (select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'));

-- 4. Invoices: bill to a team, link to GPS hire, record the billing period
alter table public.invoices
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists gps_hire_id uuid references public.gps_hires(id) on delete set null,
  add column if not exists period_start date,
  add column if not exists period_end date;
create index if not exists invoices_team_idx on public.invoices(team_id);
create index if not exists invoices_gps_hire_idx on public.invoices(gps_hire_id);

-- 5. Payments: allow direct debit (common for subscriptions)
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('health_fund','medicare','hicaps','eftpos','credit_card','cash','bank_transfer','direct_debit','other'));
