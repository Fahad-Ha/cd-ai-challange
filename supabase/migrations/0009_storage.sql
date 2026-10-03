-- ---------------------------------------------------------------------------
-- 0009  Storage: reference photos.
--
-- Private bucket. Objects live at {auth.uid()}/{file}. A customer may write
-- only inside their own folder and read only their own folder; tailors may
-- read every folder because they need the photo to bid. Nobody can list or
-- read another customer's photos. The app renders photos through short-lived
-- signed URLs created with the viewer's own session, so the same policy gates
-- the URL as gates the download.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reference-photos',
  'reference-photos',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "photos: upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reference-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "photos: owner or any tailor may read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'reference-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.my_role()) = 'tailor'
    )
  );
