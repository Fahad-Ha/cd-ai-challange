-- ---------------------------------------------------------------------------
-- 0006  messages: the order chat.
--
-- One policy function answers both "may I read this?" and "may I post here?":
-- is_order_participant(order_id). Supabase Realtime re-evaluates the SELECT
-- policy for every subscriber on every row, so a non-participant who guesses
-- an order id gets neither history nor live events.
-- ---------------------------------------------------------------------------
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_order_id_created_at_idx on public.messages (order_id, created_at);

alter table public.messages enable row level security;

grant select on public.messages to authenticated;
grant insert (order_id, body) on public.messages to authenticated;

create policy "messages: participants read"
  on public.messages for select to authenticated
  using (public.is_order_participant(order_id));

create policy "messages: participants write as themselves"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_order_participant(order_id));

-- Only this table is broadcast. Bids never are.
alter publication supabase_realtime add table public.messages;
