-- Access log: who viewed or changed athlete records.
-- Human actions only: browser writes are captured by triggers (auth.uid());
-- server routes insert rows themselves; nightly syncs are not logged.

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references public.profiles(id) on delete set null,
  action text not null,           -- insert | update | delete | view
  table_name text not null,
  record_id text,
  athlete_id uuid,                -- no FK: history survives athlete deletion
  detail jsonb
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_athlete_idx on public.audit_log (athlete_id, at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
create policy "staff read audit_log" on public.audit_log
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'staff'));

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  who uuid := coalesce(auth.uid(), nullif(rec->>'sent_by', '')::uuid);
  aid uuid;
  changed text[];
  det jsonb := '{}'::jsonb;
begin
  if who is null then
    return null; -- service role / sync: not a human action
  end if;

  aid := case when tg_table_name = 'athletes' then (rec->>'id')::uuid
              else nullif(rec->>'athlete_id', '')::uuid end;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from to_jsonb(old)->n.key
      and n.key not in ('updated_at', 'created_at');
    if changed is null then
      return null;
    end if;
    det := det || jsonb_build_object('fields', changed);
  end if;

  if rec ? 'team_id' then det := det || jsonb_build_object('team_id', rec->>'team_id'); end if;
  if rec ? 'section' then det := det || jsonb_build_object('section', rec->>'section'); end if;
  if rec ? 'recipient' then det := det || jsonb_build_object('recipient', rec->>'recipient', 'status', rec->>'status'); end if;
  if tg_table_name = 'athletes' and tg_op = 'DELETE' then
    det := det || jsonb_build_object('name', concat_ws(' ', rec->>'first_name', rec->>'last_name'));
  end if;

  insert into public.audit_log (actor, action, table_name, record_id, athlete_id, detail)
  values (who, lower(tg_op), tg_table_name, rec->>'id', aid, nullif(det, '{}'::jsonb));
  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'athletes', 'sessions', 'hop_tests', 'injuries', 'athlete_section_comments',
    'athlete_teams', 'athlete_report_sections', 'pdf_reports', 'report_emails'
  ] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end $$;
