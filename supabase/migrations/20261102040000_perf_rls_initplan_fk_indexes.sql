-- Audit 31 Oct 2026: database performance advisor fixes. No change to who can see what.

-- 1. RLS policies: evaluate auth.uid() once per query instead of once per row.
--    Rewrites every public policy that calls auth.uid() bare. Safe to re-run.
do $$
declare
  r record;
  u text;
  c text;
begin
  for r in
    select policyname, tablename, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
      and coalesce(qual, '') || coalesce(with_check, '') not ilike '%select auth.uid()%'
  loop
    u := case when r.qual is not null
              then ' using (' || replace(r.qual, 'auth.uid()', '(select auth.uid())') || ')' else '' end;
    c := case when r.with_check is not null
              then ' with check (' || replace(r.with_check, 'auth.uid()', '(select auth.uid())') || ')' else '' end;
    execute format('alter policy %I on public.%I', r.policyname, r.tablename) || u || c;
  end loop;
end $$;

-- 2. Indexes for foreign keys that had none (36).
create index if not exists appointment_types_organisation_id_fk_idx on public.appointment_types (organisation_id);
create index if not exists asymmetry_results_athlete_id_fk_idx on public.asymmetry_results (athlete_id);
create index if not exists asymmetry_results_session_id_fk_idx on public.asymmetry_results (session_id);
create index if not exists athlete_section_comments_updated_by_fk_idx on public.athlete_section_comments (updated_by);
create index if not exists athlete_teams_team_id_fk_idx on public.athlete_teams (team_id);
create index if not exists athletes_protocol_id_fk_idx on public.athletes (protocol_id);
create index if not exists athletes_target_profile_id_fk_idx on public.athletes (target_profile_id);
create index if not exists athletes_user_id_fk_idx on public.athletes (user_id);
create index if not exists availability_organisation_id_fk_idx on public.availability (organisation_id);
create index if not exists availability_practitioner_id_fk_idx on public.availability (practitioner_id);
create index if not exists availability_exceptions_organisation_id_fk_idx on public.availability_exceptions (organisation_id);
create index if not exists availability_exceptions_practitioner_id_fk_idx on public.availability_exceptions (practitioner_id);
create index if not exists bookings_appointment_type_id_fk_idx on public.bookings (appointment_type_id);
create index if not exists bookings_created_by_fk_idx on public.bookings (created_by);
create index if not exists diary_events_created_by_fk_idx on public.diary_events (created_by);
create index if not exists diary_events_organisation_id_fk_idx on public.diary_events (organisation_id);
create index if not exists hop_tests_athlete_id_fk_idx on public.hop_tests (athlete_id);
create index if not exists hop_tests_created_by_fk_idx on public.hop_tests (created_by);
create index if not exists hop_tests_session_id_fk_idx on public.hop_tests (session_id);
create index if not exists injuries_athlete_id_fk_idx on public.injuries (athlete_id);
create index if not exists invoice_items_appointment_type_id_fk_idx on public.invoice_items (appointment_type_id);
create index if not exists invoice_items_organisation_id_fk_idx on public.invoice_items (organisation_id);
create index if not exists invoices_athlete_id_fk_idx on public.invoices (athlete_id);
create index if not exists invoices_booking_id_fk_idx on public.invoices (booking_id);
create index if not exists invoices_created_by_fk_idx on public.invoices (created_by);
create index if not exists invoices_practitioner_id_fk_idx on public.invoices (practitioner_id);
create index if not exists payments_created_by_fk_idx on public.payments (created_by);
create index if not exists payments_organisation_id_fk_idx on public.payments (organisation_id);
create index if not exists pdf_reports_athlete_id_fk_idx on public.pdf_reports (athlete_id);
create index if not exists pdf_reports_created_by_fk_idx on public.pdf_reports (created_by);
create index if not exists practitioners_organisation_id_fk_idx on public.practitioners (organisation_id);
create index if not exists practitioners_profile_id_fk_idx on public.practitioners (profile_id);
create index if not exists sessions_organisation_id_fk_idx on public.sessions (organisation_id);
create index if not exists teams_created_by_fk_idx on public.teams (created_by);
create index if not exists teams_organisation_id_fk_idx on public.teams (organisation_id);
create index if not exists teams_protocol_id_fk_idx on public.teams (protocol_id);

-- 3. Fixed search_path on the bookings trigger function.
alter function public.bookings_set_updated_at() set search_path = public;
