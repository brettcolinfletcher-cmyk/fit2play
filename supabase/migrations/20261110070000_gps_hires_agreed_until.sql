-- Agreed hire term: follow-up flags hires approaching or past this date.
alter table public.gps_hires add column if not exists agreed_until date;
