-- ---------------------------------------------------------------------------
-- 0007  reviews: customer-only, once per order, only after completion.
--
-- Kept as a plain INSERT under RLS on purpose: the policy reads like the rule
-- in the brief. The subquery on orders runs as the caller, so it can only ever
-- find orders the caller is on.
-- ---------------------------------------------------------------------------
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tailor_id   uuid not null references public.profiles (id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text not null default '' check (char_length(comment) <= 2000),
  created_at  timestamptz not null default now()
);

create index reviews_tailor_id_idx on public.reviews (tailor_id);

alter table public.reviews enable row level security;

grant select on public.reviews to authenticated;
grant insert (order_id, tailor_id, rating, comment) on public.reviews to authenticated;

create policy "reviews: public to signed-in users"
  on public.reviews for select to authenticated
  using (true);

create policy "reviews: the customer, once the order is completed"
  on public.reviews for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (
      select 1 from public.orders o
      where o.id = reviews.order_id
        and o.customer_id = (select auth.uid())
        and o.tailor_id = reviews.tailor_id
        and o.status = 'completed'
    )
  );

-- Stretch goal: derived tailor reputation. Never stored, never client-supplied.
create or replace function public.tailor_stats(p_tailor_id uuid)
returns table (avg_rating numeric, review_count integer, completed_orders integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
    select round(avg(r.rating), 2),
           count(r.id)::integer,
           (select count(*)::integer from public.orders o where o.tailor_id = p_tailor_id and o.status = 'completed')
    from public.reviews r
    where r.tailor_id = p_tailor_id;
end;
$$;

revoke execute on function public.tailor_stats(uuid) from public, anon;
grant execute on function public.tailor_stats(uuid) to authenticated;
