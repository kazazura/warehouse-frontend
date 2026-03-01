-- User table migration for frontend-safe reads and edits.
-- Run in Supabase SQL editor as a privileged role.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  first_name text,
  last_name text,
  avatar_url text,
  role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists email text;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists first_name text;
alter table public.users add column if not exists last_name text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists role text;
alter table public.users add column if not exists created_at timestamptz;
alter table public.users add column if not exists updated_at timestamptz;

update public.users
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where created_at is null or updated_at is null;

alter table public.users alter column created_at set not null;
alter table public.users alter column updated_at set not null;
alter table public.users alter column created_at set default now();
alter table public.users alter column updated_at set default now();

alter table public.users enable row level security;

-- Backfill and keep existing role when auth metadata role is empty.
insert into public.users (id, name, email, first_name, last_name, role, created_at, updated_at)
select
  u.id,
  coalesce(
    nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), ''),
    u.raw_user_meta_data ->> 'name',
    u.email
  ),
  u.email,
  coalesce(u.raw_user_meta_data ->> 'first_name', ''),
  coalesce(u.raw_user_meta_data ->> 'last_name', ''),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'role', ''),
    nullif(u.raw_app_meta_data ->> 'role', ''),
    existing.role,
    'user'
  ),
  u.created_at,
  now()
from auth.users u
left join public.users existing on existing.id = u.id
on conflict (id) do update
set
  name = excluded.name,
  email = excluded.email,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  role = excluded.role,
  created_at = excluded.created_at,
  updated_at = now();

-- Sync user rows when auth user metadata changes.
create or replace function public.sync_user_from_auth_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, first_name, last_name, role, created_at, updated_at)
  values (
    new.id,
    coalesce(
      nullif(trim(concat_ws(' ', new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name')), ''),
      new.raw_user_meta_data ->> 'name',
      new.email
    ),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'role', ''),
      nullif(new.raw_app_meta_data ->> 'role', ''),
      'user'
    ),
    new.created_at,
    now()
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = coalesce(
      nullif(new.raw_user_meta_data ->> 'role', ''),
      nullif(new.raw_app_meta_data ->> 'role', ''),
      public.users.role,
      'user'
    ),
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_from_auth_users on auth.users;
drop trigger if exists trg_sync_user_from_auth_users on auth.users;
create trigger trg_sync_user_from_auth_users
after insert or update of email, raw_user_meta_data, raw_app_meta_data, role on auth.users
for each row
execute function public.sync_user_from_auth_users();

-- Admin-only hard delete for auth users.
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requester_role text;
begin
  select u.role
  into requester_role
  from public.users u
  where u.id = auth.uid();

  if requester_role is distinct from 'admin' then
    raise exception 'Only admins can delete users';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  delete from auth.users
  where id = target_user_id;

  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Policies for internal admin app usage.
drop policy if exists "users_select_authenticated" on public.users;
drop policy if exists "users_update_authenticated" on public.users;
drop policy if exists "users_delete_authenticated" on public.users;

create policy "users_select_authenticated"
on public.users
for select
to authenticated
using (true);

create policy "users_update_authenticated"
on public.users
for update
to authenticated
using (true)
with check (true);

create policy "users_delete_authenticated"
on public.users
for delete
to authenticated
using (true);

-- Storage bucket and policies for user avatars.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "user_avatars_public_read" on storage.objects;
drop policy if exists "user_avatars_admin_insert" on storage.objects;
drop policy if exists "user_avatars_admin_update" on storage.objects;
drop policy if exists "user_avatars_admin_delete" on storage.objects;

create policy "user_avatars_public_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'user-avatars');

create policy "user_avatars_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'user-avatars'
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, 'user')) = 'admin'
  )
);

create policy "user_avatars_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'user-avatars'
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, 'user')) = 'admin'
  )
)
with check (
  bucket_id = 'user-avatars'
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, 'user')) = 'admin'
  )
);

create policy "user_avatars_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'user-avatars'
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, 'user')) = 'admin'
  )
);

-- Cleanup redundant columns from old profiles-based approach.
alter table public.users drop column if exists full_name;
alter table public.users drop column if exists app_role;

-- Remove profiles table after users migration is in place.
drop table if exists public.profiles cascade;
