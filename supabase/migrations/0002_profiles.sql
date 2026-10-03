-- ---------------------------------------------------------------------------
-- 0002  profiles: one row per auth user, role fixed at signup.
--
-- The role is copied ONCE from the signup metadata by a trigger. After that
-- nothing can change it: the UPDATE grant covers display_name only, so even
-- the row owner gets "permission denied" on role. The app must never read the
-- role from user_metadata (users can rewrite that at will) — only from here.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null check (role in ('customer', 'tailor')),
  display_name text not null default 'Member' check (char_length(display_name) between 1 and 80),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "profiles: readable by signed-in users"
  on public.profiles for select to authenticated
  using (true);

create policy "profiles: edit own display name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Signup → profile. Runs as the function owner (postgres) because auth's
-- internal role has no rights on public.profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', '');
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  if v_role not in ('customer', 'tailor') then
    v_role := 'customer';
  end if;
  insert into public.profiles (id, role, display_name)
  values (new.id, v_role, coalesce(v_name, 'Member'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by other tables' policies: "what is the caller's role?"
-- SECURITY DEFINER so policies never depend on profiles' own RLS (no recursion).
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;
