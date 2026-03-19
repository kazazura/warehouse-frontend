-- Patch migration for environments that already ran an earlier item_movements migration.
-- Aligns schema with Branch 2-only inbound inventory rules.

-- 1) Ensure item_id is uuid.
do $$
declare
  item_id_type text;
begin
  select c.data_type
  into item_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'item_movements'
    and c.column_name = 'item_id';

  if item_id_type is null then
    raise exception 'public.item_movements.item_id does not exist';
  end if;

  if item_id_type <> 'uuid' then
    alter table public.item_movements
      alter column item_id type uuid using item_id::uuid;
  end if;
end;
$$;

-- 2) Ensure FK exists to public.items(id).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'item_movements_item_id_fkey'
      and conrelid = 'public.item_movements'::regclass
  ) then
    alter table public.item_movements
      add constraint item_movements_item_id_fkey
      foreign key (item_id) references public.items(id) on delete cascade;
  end if;
end;
$$;

-- 3) Add detail columns if missing.
alter table public.item_movements
  add column if not exists supplier text,
  add column if not exists return_reason text,
  add column if not exists reference_number text;

-- 4) Normalize delivery/return rows to Branch 2 destination.
update public.item_movements
set
  from_warehouse = null,
  to_warehouse = 'branch_2'
where movement_type in ('delivery', 'return');

-- 5) Block migration if existing transfer rows violate Branch 2-only model.
do $$
begin
  if exists (
    select 1
    from public.item_movements
    where movement_type = 'transfer'
      and (
        from_warehouse not in ('branch_1', 'branch_3')
        or to_warehouse is distinct from 'branch_2'
      )
  ) then
    raise exception 'Invalid transfer data found. Fix existing transfer rows before applying Branch 2-only constraints.';
  end if;
end;
$$;

-- 6) Replace direction rule constraint.
alter table public.item_movements
  drop constraint if exists item_movements_direction_rules;

alter table public.item_movements
  add constraint item_movements_direction_rules check (
    (
      movement_type in ('delivery', 'return')
      and from_warehouse is null
      and to_warehouse = 'branch_2'
    )
    or
    (
      movement_type = 'transfer'
      and from_warehouse in ('branch_1', 'branch_3')
      and to_warehouse = 'branch_2'
    )
  );

-- 7) Backfill detail fields to satisfy movement-type rules.
update public.item_movements
set
  supplier = coalesce(nullif(trim(supplier), ''), 'Unknown Supplier'),
  return_reason = null
where movement_type = 'delivery';

update public.item_movements
set
  return_reason = coalesce(nullif(trim(return_reason), ''), 'No reason provided'),
  supplier = null
where movement_type = 'return';

update public.item_movements
set
  supplier = null,
  return_reason = null
where movement_type = 'transfer';

-- 8) Replace details rule constraint.
alter table public.item_movements
  drop constraint if exists item_movements_type_details_rules;

alter table public.item_movements
  add constraint item_movements_type_details_rules check (
    (
      movement_type = 'delivery'
      and supplier is not null
      and nullif(trim(supplier), '') is not null
      and return_reason is null
    )
    or
    (
      movement_type = 'return'
      and return_reason is not null
      and nullif(trim(return_reason), '') is not null
      and supplier is null
    )
    or
    (
      movement_type = 'transfer'
      and supplier is null
      and return_reason is null
    )
  );

create index if not exists idx_item_movements_type_created_at
  on public.item_movements (movement_type, created_at desc);

create or replace view public.item_movements_with_user as
select
  m.*,
  coalesce(
    nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
    nullif(trim(u.name), ''),
    u.email,
    m.created_by::text
  ) as created_by_name
from public.item_movements m
left join public.users u on u.id = m.created_by;

alter view public.item_movements_with_user set (security_invoker = true);

grant select on public.item_movements_with_user to authenticated;
