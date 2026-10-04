-- ---------------------------------------------------------------------------
-- 0001  Privilege baseline: deny by default, grant explicitly.
--
-- Two separate defaults need undoing, and they live in two places:
--   1. Supabase adds schema-scoped defaults: "ALTER DEFAULT PRIVILEGES IN SCHEMA
--      public GRANT ALL ON TABLES/FUNCTIONS TO anon, authenticated". The three
--      schema-scoped REVOKEs below remove those.
--   2. Postgres itself grants EXECUTE on every new function to PUBLIC. That is a
--      built-in default, and a schema-scoped entry is only a delta on top of it,
--      so it must be revoked with a *global* entry (no IN SCHEMA). Without this,
--      every trigger function and any future function is callable by anyone
--      holding the publishable key at /rest/v1/rpc/<name>. A SECURITY DEFINER
--      function callable by anon is an open door.
-- From this point on every table and every function lists its grants next to
-- its policies.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

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
