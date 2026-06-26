-- Pitcher projection snapshots + outcome reconciliation for sharp-money tracker.
-- Run in Supabase SQL editor or: psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_projection_tracking.sql

create table if not exists public.projection_snapshots (
  id              bigint generated always as identity primary key,
  slate_date      date not null,
  pitcher_id      bigint,
  pitcher_name    text not null,
  team            text,
  opp             text,
  hand            text,
  model_version   text not null default 'v1',
  generated_at    timestamptz not null default now(),
  proj_k          numeric,
  proj_bb         numeric,
  proj_er         numeric,
  proj_outs       numeric,
  proj_f5_er      numeric,
  lean_k          text,
  lean_bb         text,
  lean_er         text,
  lean_outs       text,
  lean_f5         text,
  conviction_k    numeric,
  conviction_bb   numeric,
  luck            numeric,
  skill_era       numeric,
  verdict         text,
  factors_json    jsonb not null default '[]'::jsonb,
  props_json      jsonb not null default '{}'::jsonb,
  unique (slate_date, pitcher_name, team, model_version)
);

create index if not exists idx_proj_snap_date on public.projection_snapshots(slate_date desc);
create index if not exists idx_proj_snap_pitcher on public.projection_snapshots(pitcher_id);

create table if not exists public.projection_outcomes (
  id              bigint generated always as identity primary key,
  snapshot_id     bigint not null references public.projection_snapshots(id) on delete cascade,
  game_date       date,
  actual_k        int,
  actual_bb       int,
  actual_er       int,
  actual_outs     numeric,
  actual_ip       numeric,
  actual_f5_er    numeric,
  source          text default 'sp_gamelog',
  reconciled_at   timestamptz not null default now(),
  unique (snapshot_id)
);

create table if not exists public.projection_accuracy (
  id              bigint generated always as identity primary key,
  snapshot_id     bigint not null references public.projection_snapshots(id) on delete cascade,
  prop_type       text not null,
  projected       numeric,
  actual          numeric,
  delta           numeric,
  abs_error       numeric,
  lean            text,
  lean_hit        boolean,
  brier           numeric,
  computed_at     timestamptz not null default now(),
  unique (snapshot_id, prop_type)
);

create or replace view public.v_projection_accuracy_summary as
select
  s.model_version,
  a.prop_type,
  count(*) as n,
  round(avg(a.abs_error)::numeric, 3) as mae,
  round(avg(case when a.lean_hit then 1.0 else 0.0 end)
    filter (where a.lean is not null and a.lean not in ('—', '')), 4) as lean_hit_rate,
  round(avg(a.brier)::numeric, 4) as avg_brier
from public.projection_accuracy a
join public.projection_snapshots s on s.id = a.snapshot_id
group by 1, 2
order by 1, 2;

create or replace view public.v_projection_factor_layers as
select
  s.slate_date,
  s.pitcher_name,
  f->>'key' as factor_key,
  f->>'label' as factor_label,
  (f->>'value')::numeric as factor_value
from public.projection_snapshots s,
     jsonb_array_elements(s.factors_json) f
where s.slate_date >= current_date - interval '30 days';

alter table public.projection_snapshots enable row level security;
alter table public.projection_outcomes enable row level security;
alter table public.projection_accuracy enable row level security;

drop policy if exists "projection_snapshots_read" on public.projection_snapshots;
create policy "projection_snapshots_read"
  on public.projection_snapshots for select to anon, authenticated using (true);

drop policy if exists "projection_outcomes_read" on public.projection_outcomes;
create policy "projection_outcomes_read"
  on public.projection_outcomes for select to anon, authenticated using (true);

drop policy if exists "projection_accuracy_read" on public.projection_accuracy;
create policy "projection_accuracy_read"
  on public.projection_accuracy for select to anon, authenticated using (true);

grant select on public.projection_snapshots to anon, authenticated;
grant select on public.projection_outcomes to anon, authenticated;
grant select on public.projection_accuracy to anon, authenticated;
grant select on public.v_projection_accuracy_summary to anon, authenticated;
grant select on public.v_projection_factor_layers to anon, authenticated;
