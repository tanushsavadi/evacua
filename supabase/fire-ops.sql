-- Evacua fire-operations schema.
-- Tables/views queried by src/lib/ops/supabase-fire-ops.ts via PostgREST:
--   incidents, firestations, responders, responder_stats (view),
--   route_updates, evacuation_zones.
-- Run this in the Supabase SQL editor before pointing the app at a live
-- project (EVACUA_DEMO_MODE unset or false).

create table if not exists incidents (
  id text primary key,
  name text,
  status text check (status in ('active', 'contained', 'extinguished')),
  risk text check (risk in ('low', 'medium', 'high', 'critical')),
  lat double precision,
  lon double precision,
  containment numeric default 0,
  start_time timestamptz,
  last_update timestamptz default now(),
  description text
);

create table if not exists firestations (
  id integer primary key,
  name text not null,
  city text,
  county text,
  lat double precision not null,
  lon double precision not null,
  total_teams integer default 3
);

create table if not exists responders (
  id text primary key,
  firestation_id integer not null references firestations (id),
  incident_id text references incidents (id),
  team_number integer not null,
  status text not null default 'available'
    check (status in ('available', 'dispatched', 'en_route', 'on_scene', 'returning')),
  current_lat double precision,
  current_lon double precision,
  dispatched_at timestamptz,
  arrived_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists route_updates (
  id uuid primary key default gen_random_uuid(),
  station_id integer not null,
  station_name text,
  fire_id text,
  fire_name text,
  original_route jsonb,
  new_route jsonb not null,
  reason text,
  risk_score numeric,
  created_at timestamptz not null default now()
);

create table if not exists evacuation_zones (
  id uuid primary key default gen_random_uuid(),
  fire_id text not null,
  zone_name text,
  polygon jsonb not null,
  recommended_at timestamptz not null default now()
);

-- Aggregated per-station team counts consumed by getResponderStats().
create or replace view responder_stats as
select
  s.id as firestation_id,
  s.name as firestation_name,
  count(*) filter (where r.status = 'available') as available_teams,
  count(*) filter (where r.status in ('dispatched', 'en_route')) as dispatched_teams,
  count(*) filter (where r.status = 'on_scene') as active_teams,
  count(r.id) as total_teams_runtime,
  s.total_teams as total_teams_configured,
  greatest(count(r.id), s.total_teams) as total_teams
from firestations s
left join responders r on r.firestation_id = s.id
group by s.id, s.name, s.total_teams;

create index if not exists responders_status_idx on responders (status);
create index if not exists responders_station_idx on responders (firestation_id);
create index if not exists route_updates_created_idx on route_updates (created_at desc);
create index if not exists evacuation_zones_recommended_idx on evacuation_zones (recommended_at desc);
create index if not exists incidents_status_idx on incidents (status);

-- Seed data mirroring the bundled demo scenario so a fresh live project
-- behaves like the curated demo.
insert into firestations (id, name, city, county, lat, lon, total_teams) values
  (1, 'Madera County Station 8', 'Oakhurst', 'Madera', 37.3282, -119.6493, 3),
  (2, 'Redwood Valley Station 54', 'Redwood Valley', 'Mendocino', 39.2864, -123.2028, 3),
  (3, 'Fresno-Kings Staging', 'Fresno', 'Fresno', 36.7477, -119.7724, 3)
on conflict (id) do nothing;

insert into incidents (id, name, status, risk, lat, lon, containment, start_time, last_update, description) values
  (
    'pine-ridge-fire', 'Pine Ridge Fire', 'active', 'critical',
    37.2897, -119.5272, 14, now() - interval '95 minutes', now(),
    'Fast-moving timber and brush fire with wind-driven spread toward ridge communities.'
  ),
  (
    'redwood-valley-fire', 'Redwood Valley Fire', 'active', 'high',
    39.2594, -123.2047, 31, now() - interval '160 minutes', now(),
    'Active perimeter expansion near mixed woodland and rural road corridors.'
  )
on conflict (id) do nothing;

insert into responders (id, firestation_id, incident_id, team_number, status, current_lat, current_lon) values
  ('responder-1-1', 1, null, 1, 'available', 37.3282, -119.6493),
  ('responder-1-2', 1, null, 2, 'available', 37.3282, -119.6493),
  ('responder-1-3', 1, null, 3, 'available', 37.3282, -119.6493),
  ('responder-2-1', 2, 'redwood-valley-fire', 1, 'on_scene', 39.2594, -123.2047),
  ('responder-2-2', 2, null, 2, 'available', 39.2864, -123.2028),
  ('responder-2-3', 2, null, 3, 'available', 39.2864, -123.2028),
  ('responder-3-1', 3, null, 1, 'available', 36.7477, -119.7724),
  ('responder-3-2', 3, null, 2, 'available', 36.7477, -119.7724),
  ('responder-3-3', 3, null, 3, 'available', 36.7477, -119.7724)
on conflict (id) do nothing;

update responders
set arrived_at = now() - interval '18 minutes',
    dispatched_at = now() - interval '42 minutes'
where id = 'responder-2-1' and arrived_at is null;
