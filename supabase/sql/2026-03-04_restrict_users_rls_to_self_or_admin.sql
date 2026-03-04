-- Restrict users table access:
-- - Admins can view/update/delete all users.
-- - Non-admin authenticated users can only view/update their own row.

create or replace function public.is_admin_user(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = user_id
      and lower(coalesce(u.role, 'user')) = 'admin'
  );
$$;

revoke all on function public.is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to authenticated;

drop policy if exists "users_select_authenticated" on public.users;
drop policy if exists "users_update_authenticated" on public.users;
drop policy if exists "users_delete_authenticated" on public.users;

create policy "users_select_self_or_admin"
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin_user(auth.uid())
);

create policy "users_update_self_or_admin"
on public.users
for update
to authenticated
using (
  id = auth.uid()
  or public.is_admin_user(auth.uid())
)
with check (
  id = auth.uid()
  or public.is_admin_user(auth.uid())
);

create policy "users_delete_admin_only"
on public.users
for delete
to authenticated
using (public.is_admin_user(auth.uid()));
