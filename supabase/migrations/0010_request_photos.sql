-- ---------------------------------------------------------------------------
-- 0010  requests.photo_paths: several reference photos per request.
--
-- Replaces the single photo_path. The rule is unchanged, applied per element:
-- every path must sit under the customer's own storage folder. At most six.
-- ---------------------------------------------------------------------------

-- The insert policy references photo_path, so it goes first.
drop policy "requests: customers post their own" on public.requests;

alter table public.requests add column photo_paths text[] not null default '{}';
update public.requests set photo_paths = array[photo_path] where photo_path is not null;
alter table public.requests drop column photo_path;

alter table public.requests
  add constraint requests_photo_paths_max check (cardinality(photo_paths) <= 6);

-- Dropping the column dropped its column grant; grant the replacement.
grant insert (photo_paths) on public.requests to authenticated;

create policy "requests: customers post their own"
  on public.requests for insert to authenticated
  with check (
    (select public.my_role()) = 'customer'
    and customer_id = (select auth.uid())
    and status = 'open'
    and not exists (
      select 1 from unnest(photo_paths) as p
      where p not like (select auth.uid())::text || '/%'
    )
  );
