-- ---------------------------------------------------------------------------
-- 0003  requests: a customer's job posting.
--
-- Customers insert; everyone signed in can read what they are allowed to see;
-- NOBODY updates through the API. The only way a request changes state is the
-- accept_bid() function (0008), which runs as the owner. That is what makes
-- "a bid becomes uneditable the instant its request closes" a single fact
-- stored in one place (requests.status) instead of a flag copied onto bids.
-- ---------------------------------------------------------------------------
create table public.requests (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 4000),
  photo_path  text check (photo_path is null or char_length(photo_path) <= 512),
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  constraint requests_status_consistent check (
    (status = 'open'   and closed_at is null) or
    (status = 'closed' and closed_at is not null)
  )
);

create index requests_customer_id_idx on public.requests (customer_id);
create index requests_open_idx on public.requests (created_at desc) where status = 'open';

alter table public.requests enable row level security;

grant select on public.requests to authenticated;
grant insert (title, description, photo_path) on public.requests to authenticated;
-- No UPDATE / DELETE grant on purpose.

create policy "requests: owner reads own, tailors read all"
  on public.requests for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.my_role()) = 'tailor');

create policy "requests: customers post their own"
  on public.requests for insert to authenticated
  with check (
    (select public.my_role()) = 'customer'
    and customer_id = (select auth.uid())
    and status = 'open'
    and (photo_path is null or photo_path like (select auth.uid())::text || '/%')
  );

-- "Is this request still open?" — the single question every bid write asks.
create or replace function public.request_is_open(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.requests where id = p_request_id and status = 'open');
$$;

revoke execute on function public.request_is_open(uuid) from public, anon;
grant execute on function public.request_is_open(uuid) to authenticated;

-- State machine: open -> closed, nothing else, for every writer (even service_role).
create or replace function public.enforce_request_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if old.status = 'open' and new.status = 'closed' then
    return new;
  end if;
  raise exception 'invalid request transition % -> %', old.status, new.status using errcode = 'P0001';
end;
$$;

create trigger requests_transition
  before update on public.requests
  for each row execute function public.enforce_request_transition();
