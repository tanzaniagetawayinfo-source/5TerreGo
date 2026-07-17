create table if not exists public.atc_bus_stops (
  stop_id text primary key,
  stop_name text not null,
  stop_lat double precision not null check (stop_lat between -90 and 90),
  stop_lon double precision not null check (stop_lon between -180 and 180),
  zone_id text,
  wheelchair_boarding smallint,
  routes jsonb not null default '[]'::jsonb,
  service_ids text[] not null default '{}',
  feed_start_date date not null,
  feed_end_date date not null,
  source_url text not null,
  imported_at timestamptz not null default now()
);

comment on table public.atc_bus_stops is
  'Fermate ATC ufficiali, filtrate tramite GTFS trips, stop_times e calendari del periodo corrente.';
comment on column public.atc_bus_stops.stop_id is
  'Identificatore ufficiale GTFS. Fermate vicine o sui lati opposti della strada restano separate.';

create index if not exists atc_bus_stops_coordinates_idx
  on public.atc_bus_stops (stop_lat, stop_lon);
create index if not exists atc_bus_stops_feed_end_date_idx
  on public.atc_bus_stops (feed_end_date);

alter table public.atc_bus_stops enable row level security;

drop policy if exists "Public read ATC bus stops" on public.atc_bus_stops;
create policy "Public read ATC bus stops"
  on public.atc_bus_stops
  for select
  to anon, authenticated
  using (true);

grant select on public.atc_bus_stops to anon, authenticated;
grant select, insert, update, delete on public.atc_bus_stops to service_role;
