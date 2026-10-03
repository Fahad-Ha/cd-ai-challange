-- ---------------------------------------------------------------------------
-- 0004  bids + bid_revisions: blind bidding.
--
-- Visibility: a tailor sees exactly one bid per request — their own. The
-- customer who owns the request sees all of them. Nobody else sees anything.
-- Mutability: the UPDATE policy asks request_is_open() every time, so the
-- request closing freezes every bid without touching the bid rows first.
-- History: a trigger appends to bid_revisions; clients can only read it.
-- ---------------------------------------------------------------------------
create table public.bids (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.requests (id) on delete cascade,
  tailor_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  price           numeric(10, 2) not null check (price > 0),
  turnaround_days integer not null check (turnaround_days > 0),
  note            text not null default '' check (char_length(note) <= 1000),
  status          text not null default 'pending' check (status in ('pending', 'declined', 'accepted', 'closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (request_id, tailor_id)
);

create index bids_tailor_id_idx on public.bids (tailor_id);

create table public.bid_revisions (
  id              uuid primary key default gen_random_uuid(),
  bid_id          uuid not null references public.bids (id) on delete cascade,
  revision_no     integer not null,
  price           numeric(10, 2) not null,
  turnaround_days integer not null,
  note            text not null,
  status          text not null,
  created_at      timestamptz not null default now(),
  unique (bid_id, revision_no)
);

alter table public.bids enable row level security;
alter table public.bid_revisions enable row level security;

grant select on public.bids to authenticated;
grant insert (request_id, price, turnaround_days, note) on public.bids to authenticated;
grant update (price, turnaround_days, note, status) on public.bids to authenticated;
grant select on public.bid_revisions to authenticated;

create policy "bids: tailor sees own, customer sees all on own request"
  on public.bids for select to authenticated
  using (
    tailor_id = (select auth.uid())
    or exists (select 1 from public.requests r where r.id = bids.request_id and r.customer_id = (select auth.uid()))
  );

create policy "bids: tailors bid on open requests"
  on public.bids for insert to authenticated
  with check (
    (select public.my_role()) = 'tailor'
    and tailor_id = (select auth.uid())
    and status = 'pending'
    and public.request_is_open(request_id)
  );

create policy "bids: tailors revise while the request is open"
  on public.bids for update to authenticated
  using (
    tailor_id = (select auth.uid())
    and status in ('pending', 'declined')
    and public.request_is_open(request_id)
  )
  with check (
    tailor_id = (select auth.uid())
    and status = 'pending'
    and public.request_is_open(request_id)
  );

create policy "bid_revisions: visible when the parent bid is"
  on public.bid_revisions for select to authenticated
  using (exists (select 1 from public.bids b where b.id = bid_revisions.bid_id));

-- Race guard: an INSERT that passed RLS a millisecond before accept_bid()
-- committed would otherwise land on a closed request. FOR KEY SHARE waits for
-- accept_bid's FOR UPDATE and re-checks status afterwards.
create or replace function public.assert_request_open_for_bid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.requests where id = new.request_id and status = 'open' for key share;
  if not found then
    raise exception 'request is closed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger bids_assert_request_open
  before insert on public.bids
  for each row execute function public.assert_request_open_for_bid();

-- State machine from the brief, enforced for every writer.
create or replace function public.enforce_bid_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if (old.status, new.status) in (
    ('pending', 'declined'),   -- customer declines
    ('declined', 'pending'),   -- tailor revises
    ('pending', 'accepted'),   -- customer accepts
    ('pending', 'closed'),     -- parent request closes
    ('declined', 'closed')     -- parent request closes
  ) then
    return new;
  end if;
  raise exception 'invalid bid transition % -> %', old.status, new.status using errcode = 'P0001';
end;
$$;

create trigger bids_transition
  before update on public.bids
  for each row execute function public.enforce_bid_transition();

create trigger bids_set_updated_at
  before update on public.bids
  for each row execute function public.set_updated_at();

-- Every revision logged. Runs as owner: clients have no INSERT on bid_revisions.
create or replace function public.log_bid_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or (new.price, new.turnaround_days, new.note) is distinct from (old.price, old.turnaround_days, old.note)
     or (old.status = 'declined' and new.status = 'pending')
  then
    insert into public.bid_revisions (bid_id, revision_no, price, turnaround_days, note, status)
    select new.id, coalesce(max(revision_no), 0) + 1, new.price, new.turnaround_days, new.note, new.status
    from public.bid_revisions where bid_id = new.id;
  end if;
  return new;
end;
$$;

create trigger bids_log_revision
  after insert or update on public.bids
  for each row execute function public.log_bid_revision();

-- The ONLY cross-tailor view of a request's bids: an aggregate.
-- Count is always shown. Averages appear only once three bids exist, because
-- with two bids "average" is just the other tailor's number in disguise.
-- Min/max are never returned: each one IS a single competitor's bid.
create or replace function public.request_bid_stats(p_request_id uuid)
returns table (bid_count integer, avg_price numeric, avg_turnaround numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_uid and p.role = 'tailor'
    union all
    select 1 from public.requests r where r.id = p_request_id and r.customer_id = v_uid
  ) then
    raise exception 'not allowed to view bid statistics for this request' using errcode = '42501';
  end if;

  return query
    select count(*)::integer,
           case when count(*) >= 3 then round(avg(b.price), 2) end,
           case when count(*) >= 3 then round(avg(b.turnaround_days), 1) end
    from public.bids b
    where b.request_id = p_request_id;
end;
$$;

revoke execute on function public.request_bid_stats(uuid) from public, anon;
grant execute on function public.request_bid_stats(uuid) to authenticated;
