-- MLBMA dashboard data cache (added alongside the existing warehouse — does not touch it).
--
-- One JSONB document per Sheets dataset. `rows` is exactly what the dashboard's
-- parseCsvText() already produces: an array of row-objects keyed by the original CSV
-- headers, all string values. This lets the dashboard read everything a page needs in a
-- single request instead of N Google Sheets gviz round-trips.

create table if not exists public.hub_dataset (
  name        text primary key,
  rows        jsonb not null default '[]'::jsonb,
  row_count   integer generated always as (jsonb_array_length(rows)) stored,
  updated_at  timestamptz not null default now()
);

-- Read-only to the public (dashboard) key; writes happen only via the secret key,
-- which bypasses RLS.
alter table public.hub_dataset enable row level security;

drop policy if exists "hub_dataset_public_read" on public.hub_dataset;
create policy "hub_dataset_public_read"
  on public.hub_dataset
  for select
  to anon, authenticated
  using (true);

grant select on public.hub_dataset to anon, authenticated;
