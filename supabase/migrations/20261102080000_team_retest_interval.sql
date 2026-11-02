-- Per-team retest interval for the Monday staff retest list and Needs Attention.
alter table public.teams
  add column if not exists retest_interval_weeks smallint
  check (retest_interval_weeks is null or retest_interval_weeks between 1 and 52);
