-- ---------------------------------------------------------------------------
-- 0008  State transitions that touch several rows at once.
--
-- These run as the function owner (SECURITY DEFINER) because the caller has no
-- UPDATE on requests/orders and must not: the function is the only door.
-- Every one of them (1) refuses anonymous callers, (2) locks the parent row,
-- (3) checks WHO is calling against the row itself, (4) re-reads state after
-- the lock, and (5) predicates every UPDATE on the state it expects.
-- Authorization failures use SQLSTATE 42501 (-> HTTP 403); state failures use
-- P0001 (-> HTTP 400) so the client can tell "you can't" from "not any more".
-- ---------------------------------------------------------------------------

create or replace function public.accept_bid(
  p_bid_id uuid,
  p_expected_price numeric,
  p_expected_turnaround integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_bid      public.bids%rowtype;
  v_req      public.requests%rowtype;
  v_order_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_expected_price is null or p_expected_turnaround is null then
    raise exception 'expected price and turnaround are required' using errcode = 'P0001';
  end if;

  select * into v_bid from public.bids where id = p_bid_id;
  if not found then
    raise exception 'bid not found' using errcode = '42501';
  end if;

  -- Serialise every decision about this request behind one row lock.
  select * into v_req from public.requests where id = v_bid.request_id for update;

  if v_req.customer_id <> v_uid then
    raise exception 'Only the request''s customer can accept a bid' using errcode = '42501';
  end if;
  if v_req.status <> 'open' then
    raise exception 'request is already closed' using errcode = 'P0001';
  end if;

  -- Re-read WITH a lock: a revise in flight holds this row (it never touches the
  -- request, so the request lock above does not serialise it). FOR UPDATE waits
  -- for that revise to commit and then reads the revised values.
  select * into v_bid from public.bids where id = p_bid_id for update;
  if v_bid.status <> 'pending' then
    raise exception 'bid is not pending (it is %)', v_bid.status using errcode = 'P0001';
  end if;
  if v_bid.price is distinct from p_expected_price or v_bid.turnaround_days is distinct from p_expected_turnaround then
    raise exception 'bid was revised since you last saw it — please review the new terms' using errcode = 'P0001';
  end if;

  update public.bids set status = 'accepted'
   where id = p_bid_id and status = 'pending';
  if not found then
    raise exception 'bid is no longer pending' using errcode = 'P0001';
  end if;

  update public.bids set status = 'closed'
   where request_id = v_req.id and id <> p_bid_id and status in ('pending', 'declined');

  update public.requests set status = 'closed', closed_at = now()
   where id = v_req.id and status = 'open';
  if not found then
    raise exception 'request is already closed' using errcode = 'P0001';
  end if;

  insert into public.orders (request_id, bid_id, customer_id, tailor_id, price, turnaround_days)
  values (v_req.id, v_bid.id, v_req.customer_id, v_bid.tailor_id, v_bid.price, v_bid.turnaround_days)
  returning id into v_order_id;

  return v_order_id;
end;
$$;

create or replace function public.decline_bid(p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_bid public.bids%rowtype;
  v_req public.requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_bid from public.bids where id = p_bid_id;
  if not found then
    raise exception 'bid not found' using errcode = '42501';
  end if;

  select * into v_req from public.requests where id = v_bid.request_id for update;
  if v_req.customer_id <> v_uid then
    raise exception 'Only the request''s customer can decline a bid' using errcode = '42501';
  end if;
  if v_req.status <> 'open' then
    raise exception 'request is already closed' using errcode = 'P0001';
  end if;

  update public.bids set status = 'declined'
   where id = p_bid_id and status = 'pending';
  if not found then
    raise exception 'only a pending bid can be declined' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.advance_order(p_order_id uuid, p_expected_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders%rowtype;
  v_next  text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = '42501';
  end if;
  if v_order.tailor_id <> v_uid then
    raise exception 'Only the tailor can advance an order' using errcode = '42501';
  end if;
  if p_expected_status is null then
    raise exception 'expected status is required' using errcode = 'P0001';
  end if;
  if v_order.status is distinct from p_expected_status then
    raise exception 'order is "%", not "%" — refresh and try again', v_order.status, p_expected_status using errcode = 'P0001';
  end if;

  v_next := case v_order.status
              when 'accepted'    then 'in_progress'
              when 'in_progress' then 'ready'
              when 'ready'       then 'completed'
            end;
  if v_next is null then
    raise exception 'order is already completed' using errcode = 'P0001';
  end if;

  update public.orders
     set status = v_next,
         completed_at = case when v_next = 'completed' then now() end
   where id = p_order_id;

  return v_next;
end;
$$;

revoke execute on function public.accept_bid(uuid, numeric, integer) from public, anon;
revoke execute on function public.decline_bid(uuid) from public, anon;
revoke execute on function public.advance_order(uuid, text) from public, anon;
grant execute on function public.accept_bid(uuid, numeric, integer) to authenticated;
grant execute on function public.decline_bid(uuid) to authenticated;
grant execute on function public.advance_order(uuid, text) to authenticated;
