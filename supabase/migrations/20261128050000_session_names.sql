-- Session names: session_name is typed by staff (never touched by syncs);
-- external_name is the source system's name (e.g. PlayerData description), written by the sync.
alter table sessions add column if not exists session_name text;
alter table sessions add column if not exists external_name text;
