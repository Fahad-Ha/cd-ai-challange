-- ---------------------------------------------------------------------------
-- 0005  orders: created only by accept_bid(), advanced only by advance_order().
--
-- Clients get SELECT and nothing else. The price and turnaround are snapshotted
-- at acceptance so the order page never has to trust a bid row that could, in
-- theory, be edited (it can't — but belt and braces).
-- ---------------------------------------------------------------------------
create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null unique references public.requests (id) on delete cascade,
  bid_id          uuid not null unique references public.bids (id) on delete cascade,
  customer_id     uuid not null references public.profiles (id) on delete cascade,
  tailor_id       uuid not null references public.profiles (id) on delete cascade,
  price           numeric(10, 2) not null,
  turnaround_days integer not null,
  status          text not null default 'accepted'
                  check (status in ('accepted', 'in_progress', 'ready', 'completed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  constraint orders_completed_consistent check ((status = 'completed') = (completed_at is not null))
);

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_tailor_id_idx on public.orders (tailor_id);

alter table public.orders enable row level security;

grant select on public.orders to authenticated;
-- No INSERT / UPDATE / DELETE grants: see 0008_rpcs.sql.

create policy "orders: visible to its two participants"
  on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or tailor_id = (select auth.uid()));

-- "Am I one of the two people on this order?" — used by messages.
create or replace function public.is_order_participant(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (o.customer_id = auth.uid() or o.tailor_id = auth.uid())
  );
$$;

revoke execute on function public.is_order_participant(uuid) from public, anon;
grant execute on function public.is_order_participant(uuid) to authenticated;

-- Linear pipeline, no skipping, for every writer.
create or replace function public.enforce_order_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if (old.status, new.status) in (
    ('accepted', 'in_progress'),
    ('in_progress', 'ready'),
    ('ready', 'completed')
  ) then
    return new;
  end if;
  raise exception 'invalid order transition % -> %', old.status, new.status using errcode = 'P0001';
end;
$$;

create trigger orders_transition
  before update on public.orders
  for each row execute function public.enforce_order_transition();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();
