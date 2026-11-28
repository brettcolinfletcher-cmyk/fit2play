-- Athlete max velocity (km/h) set by staff, used for % of max velocity per GPS session.
-- When null the app uses the best recorded speed (GPS max speed or 1080 top speed).
alter table athletes add column if not exists max_velocity_kph numeric;
alter table athletes add column if not exists max_velocity_set_at timestamptz;
