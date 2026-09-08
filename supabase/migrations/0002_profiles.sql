-- MLBMA user profiles — Phase 1 of the auth-gated product.
--
-- Adds a 1:1 profile row for every Supabase Auth user. This file does NOT change the
-- existing hub_dataset table or its public read policy (see the TODO block at the end);
-- the dashboard keeps loading exactly as it does today.
--
-- Field ownership:
--   * id / created_at        — immutable (set on creation, never updatable by anyone).
--   * email / full_name /
--     avatar_url / discord_*  — user-editable via the column GRANT below.
--   * role / subscription_status — SERVER-controlled only. Authenticated users are NOT
--     granted UPDATE on these columns, so any attempt to change them fails at the
--     privilege level. They are mutated only by the service-role key (Stripe / Discord
--     webhooks in a later phase), which bypasses RLS.

create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text,
  full_name            text,
  avatar_url           text,
  role                 text not null default 'user',
  subscription_status  text not null default 'free',
  discord_user_id      text unique,
  discord_username     text,
  discord_avatar       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Each authenticated user can read ONLY their own profile row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Each authenticated user can update ONLY their own row. (RLS guards the *row*; the
-- column GRANT below guards *which fields* — role / subscription_status are excluded.)
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── Privileges ──────────────────────────────────────────────────────────────────────
-- Start from a clean slate so no inherited/default table-wide UPDATE lets a user touch
-- role / subscription_status, then grant exactly what's allowed. service_role is left
-- untouched (it bypasses RLS and needs full write access for webhooks).
revoke all on public.profiles from anon, authenticated;

grant select on public.profiles to authenticated;

-- Column-scoped UPDATE: everything a user may edit, but NOT role / subscription_status
-- (and not id / created_at / updated_at — updated_at is maintained by the trigger).
-- TODO(auth-phase): once Discord OAuth lands, move discord_* to server-controlled only
-- (set via the service key) so a user can't self-assign someone else's Discord identity.
grant update (email, full_name, avatar_url, discord_user_id, discord_username, discord_avatar)
  on public.profiles to authenticated;

-- ── Trigger: create a profile when a new auth user signs up ─────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Trigger: keep updated_at fresh on every change ──────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── TODO (later phase): hub_dataset reads ───────────────────────────────────────────
-- hub_dataset (migration 0001) is still PUBLIC read (anon + authenticated) so the
-- current dashboard keeps working with no login. Do NOT change it here. A later phase
-- should:
--   1. Drop the "hub_dataset_public_read" policy's `anon` grant.
--   2. Add a policy `for select to authenticated using (true)` (or gate on
--      profiles.subscription_status for paid tabs).
--   3. Revoke `select on public.hub_dataset from anon`.
-- Ship that only once the dashboard pages require a session, or anonymous visitors will
-- see empty data.
