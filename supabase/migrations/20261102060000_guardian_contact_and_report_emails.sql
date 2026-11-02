-- Squad report emails: parent/guardian contact on athletes, and a send log.

alter table public.athletes
  add column if not exists guardian_name text,
  add column if not exists guardian_email text;

create table if not exists public.report_emails (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.athletes(id) on delete set null,
  recipient text not null,
  recipient_type text not null check (recipient_type in ('guardian', 'athlete', 'test')),
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  provider_id text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists report_emails_athlete_id_idx on public.report_emails (athlete_id);
create index if not exists report_emails_sent_by_idx on public.report_emails (sent_by);

alter table public.report_emails enable row level security;
revoke all on public.report_emails from anon;

create policy "staff read report_emails" on public.report_emails
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'));
-- Inserts happen server-side with the service role only.
