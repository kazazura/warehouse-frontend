-- Add per-month buffer stock to inventory records.
-- Run in Supabase SQL editor as a privileged role.

alter table public.inventory_records
  add column if not exists buffer_stock integer;

update public.inventory_records r
set buffer_stock = 0
where r.buffer_stock is null;

alter table public.inventory_records
  alter column buffer_stock set default 0;

alter table public.inventory_records
  drop constraint if exists inventory_records_buffer_stock_nonnegative;
alter table public.inventory_records
  add constraint inventory_records_buffer_stock_nonnegative
  check (buffer_stock is null or buffer_stock >= 0);

drop view if exists public.items_inventory_all;
create view public.items_inventory_all as
select
  r.id,
  r.item_id,
  i.item_code,
  i.description,
  i.type,
  r.unit_cost,
  r.month,
  r.year,
  r.starting_qty,
  r.buffer_stock,
  r.ending_qty
from public.inventory_records r
join public.items i on i.id = r.item_id;

-- Update rollover functions to carry over buffer stock.
drop function if exists public.rollover_inventory_month(uuid);
create or replace function public.rollover_inventory_month(p_recorded_by uuid)
returns integer
language plpgsql
as $$
declare
    current_month int := extract(month from (now() at time zone 'Asia/Manila'))::int;
    current_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
    prev_month int := extract(month from (date_trunc('month', now() at time zone 'Asia/Manila') - interval '1 day'))::int;
    prev_year int := extract(year from (date_trunc('month', now() at time zone 'Asia/Manila') - interval '1 day'))::int;
    inserted_count int;
begin
    insert into public.inventory_records (
        item_id,
        month,
        year,
        starting_qty,
        ending_qty,
        buffer_stock,
        unit_cost,
        created_by
    )
    select
        i.id as item_id,
        current_month as month,
        current_year as year,
        coalesce(prev.ending_qty, 0) as starting_qty,
        coalesce(prev.ending_qty, 0) as ending_qty,
        coalesce(prev.buffer_stock, 0) as buffer_stock,
        prev.unit_cost as unit_cost,
        p_recorded_by as created_by
    from public.items i
    left join public.inventory_records prev
        on prev.item_id = i.id
       and prev.month = prev_month
       and prev.year = prev_year
    where not exists (
        select 1
        from public.inventory_records curr
        where curr.item_id = i.id
          and curr.month = current_month
          and curr.year = current_year
    );

    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

drop function if exists public.rollover_inventory_month();
create or replace function public.rollover_inventory_month()
returns integer
language plpgsql
as $$
begin
    return public.rollover_inventory_month(auth.uid());
end;
$$;
