-- ---------------------------------------------------------------------------
-- 0001  Privilege baseline: deny by default, grant explicitly.
--
-- Supabase ships with "ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO
-- anon, authenticated" and Postgres grants EXECUTE on every new function to
-- PUBLIC. Both are convenient for prototypes and dangerous here: a SECURITY
-- DEFINER function callable by anon is an open door. From this point on every
-- table and every function lists its grants next to its policies.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Shared trigger: keep updated_at honest (clients cannot set it; see column grants).
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
