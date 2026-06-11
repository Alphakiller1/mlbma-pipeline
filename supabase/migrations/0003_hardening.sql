-- Phase 2 hardening — pin a fixed search_path on the trigger function.
--
-- Supabase's database linter flags `public.set_updated_at()` with "Function Search Path
-- Mutable": a function with no fixed `search_path` resolves unqualified names against
-- whatever search_path the caller has, which is a (low) injection surface. Its sibling
-- `public.handle_new_user()` already pins its search_path in 0002 — this brings
-- set_updated_at() in line.
--
-- `create or replace function` updates the function in place; the existing
-- `profiles_set_updated_at` trigger keeps pointing at it, so nothing else changes. Safe to
-- re-run. `now()` lives in pg_catalog (always implicitly first in the search path), so it
-- still resolves under an empty search_path.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
