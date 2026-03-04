-- Prevent non-admin users from changing roles directly in public.users.
-- This runs at DB level so frontend bypass attempts are still blocked.

create or replace function public.block_non_admin_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requester_id uuid;
  requester_role text;
begin
  -- No role change means nothing to enforce.
  if new.role is not distinct from old.role then
    return new;
  end if;

  requester_id := auth.uid();

  -- Allow backend/service updates where there is no authenticated requester.
  if requester_id is null then
    return new;
  end if;

  select lower(coalesce(u.role, 'user'))
  into requester_role
  from public.users u
  where u.id = requester_id;

  if coalesce(requester_role, 'user') <> 'admin' then
    raise exception 'Only admins can change user roles';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_non_admin_role_change on public.users;

create trigger trg_block_non_admin_role_change
before update on public.users
for each row
execute function public.block_non_admin_role_change();
