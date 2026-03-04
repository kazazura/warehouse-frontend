-- Avatar storage policies:
-- - Admins can manage all avatar files in the user-avatars bucket.
-- - Non-admin users can manage files only inside their own folder:
--   avatars/<auth.uid()>/...

drop policy if exists "user_avatars_admin_insert" on storage.objects;
drop policy if exists "user_avatars_admin_update" on storage.objects;
drop policy if exists "user_avatars_admin_delete" on storage.objects;
drop policy if exists "user_avatars_insert_self_or_admin" on storage.objects;
drop policy if exists "user_avatars_update_self_or_admin" on storage.objects;
drop policy if exists "user_avatars_delete_self_or_admin" on storage.objects;

create policy "user_avatars_insert_self_or_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'user-avatars'
  and (
    public.is_admin_user(auth.uid())
    or name like ('avatars/' || auth.uid()::text || '/%')
  )
);

create policy "user_avatars_update_self_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'user-avatars'
  and (
    public.is_admin_user(auth.uid())
    or name like ('avatars/' || auth.uid()::text || '/%')
  )
)
with check (
  bucket_id = 'user-avatars'
  and (
    public.is_admin_user(auth.uid())
    or name like ('avatars/' || auth.uid()::text || '/%')
  )
);

create policy "user_avatars_delete_self_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'user-avatars'
  and (
    public.is_admin_user(auth.uid())
    or name like ('avatars/' || auth.uid()::text || '/%')
  )
);
