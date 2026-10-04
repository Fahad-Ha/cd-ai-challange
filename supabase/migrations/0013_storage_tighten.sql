-- ---------------------------------------------------------------------------
-- 0013  Tighter photo access for tailors.
--
-- Before: any tailor could read any file in the bucket. Now a tailor can read
-- a photo only if it is attached to a request they are entitled to see: an
-- open request (any tailor may bid) or a request whose order is theirs.
-- Unattached uploads and other tailors' closed requests are no longer
-- readable. Customers are unchanged: their own folder only.
-- ---------------------------------------------------------------------------
drop policy "photos: owner or any tailor may read" on storage.objects;

create policy "photos: owner, or a tailor on a request that lists it"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'reference-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        (select public.my_role()) = 'tailor'
        and exists (
          select 1
          from public.requests r
          where objects.name = any (r.photo_paths)
            and (
              r.status = 'open'
              or exists (
                select 1 from public.orders o
                where o.request_id = r.id and o.tailor_id = (select auth.uid())
              )
            )
        )
      )
    )
  );

-- The policy looks photos up by path; keep that cheap.
create index requests_photo_paths_gin on public.requests using gin (photo_paths);
