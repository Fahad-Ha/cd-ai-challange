-- ---------------------------------------------------------------------------
-- 0011  AI usage quota: protects the OpenRouter key from being burned.
--
-- Two counters, per user per day and global per day, kept in the database so
-- every server instance shares them. Clients have NO grants on these tables;
-- the only way in is consume_ai_credit(), which the describe-photo route calls
-- before contacting OpenRouter. Limits are fixed inside the function on
-- purpose: a parameter would be settable by the caller over REST.
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null default current_date,
  calls   integer not null default 0,
  primary key (user_id, day)
);

create table public.ai_usage_global (
  day   date primary key default current_date,
  calls integer not null default 0
);

alter table public.ai_usage enable row level security;
alter table public.ai_usage_global enable row level security;
-- No grants to authenticated or anon: nobody reads or writes these directly.

create or replace function public.consume_ai_credit()
returns table (remaining_today integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_user_limit   constant integer := 15;   -- descriptions per user per day
  c_global_limit constant integer := 200;  -- descriptions across everyone per day
  v_uid    uuid := auth.uid();
  v_user   integer;
  v_global integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.ai_usage_global (day, calls) values (current_date, 1)
  on conflict (day) do update set calls = public.ai_usage_global.calls + 1
  returning calls into v_global;
  if v_global > c_global_limit then
    raise exception 'The AI description service has reached its daily limit. Please write the description yourself today.' using errcode = 'P0001';
  end if;

  insert into public.ai_usage (user_id, day, calls) values (v_uid, current_date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls into v_user;
  if v_user > c_user_limit then
    raise exception 'You have used your % AI descriptions for today. You can still write the description yourself.', c_user_limit using errcode = 'P0001';
  end if;

  return query select c_user_limit - v_user;
end;
$$;

revoke execute on function public.consume_ai_credit() from public, anon;
grant execute on function public.consume_ai_credit() to authenticated;
