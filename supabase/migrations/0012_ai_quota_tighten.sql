-- ---------------------------------------------------------------------------
-- 0012  Tighter AI quota: 3 descriptions per user per day, 30 per day overall.
-- Same function as 0011, lower constants.
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_credit()
returns table (remaining_today integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_user_limit   constant integer := 3;   -- descriptions per user per day
  c_global_limit constant integer := 30;  -- descriptions across everyone per day
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
