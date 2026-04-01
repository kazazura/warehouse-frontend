-- Add rollback metadata for MCTs and provide a rollback RPC.
-- Run in Supabase SQL editor as a privileged role.

alter table public.mcts
  add column if not exists mct_month int,
  add column if not exists mct_year int,
  add column if not exists status text default 'active',
  add column if not exists rolled_back_at timestamptz,
  add column if not exists rolled_back_by uuid;

update public.mcts
set status = 'active'
where status is null;

update public.mcts
set
  mct_month = extract(month from created_at)::int,
  mct_year = extract(year from created_at)::int
where mct_month is null or mct_year is null;

alter table public.mcts
  drop constraint if exists mcts_status_check;
alter table public.mcts
  add constraint mcts_status_check
  check (status in ('active', 'rolled_back'));

create index if not exists mcts_status_idx on public.mcts (status);

create or replace function public.create_mct_transaction(
    p_header jsonb,
    p_items jsonb,
    p_create_missing_inventory boolean default false,
    p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_month int := extract(month from now())::int;
    v_year int := extract(year from now())::int;
    v_mct_id uuid;
    missing_item_codes text[];
    missing_inventory_codes text[];
    insufficient_inventory_codes text[];
begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'no_items';
    end if;

    if coalesce(p_header->>'mct_rel_number','') <> '' then
        if exists (
            select 1
            from public.mcts
            where mct_rel_number = p_header->>'mct_rel_number'
        ) then
            raise exception 'duplicate_mct:%', p_header->>'mct_rel_number';
        end if;
    end if;

    with items_input as (
        select
            (value->>'item_code')::text as item_code_raw,
            upper(trim(coalesce(value->>'item_code',''))) as item_code,
            value->>'particulars' as particulars,
            value->>'unit' as unit,
            nullif(value->>'unit_cost','')::numeric as unit_cost,
            nullif(value->>'qty','')::numeric as qty,
            nullif(value->>'total_cost','')::numeric as total_cost,
            value->>'remarks' as remarks
        from jsonb_array_elements(p_items) as value
    ),
    distinct_items as (
        select distinct item_code
        from items_input
        where item_code <> ''
    )
    select array_agg(di.item_code)
    into missing_item_codes
    from distinct_items di
    left join public.items i on upper(i.item_code) = di.item_code
    where i.id is null;

    if missing_item_codes is not null then
        raise exception 'missing_item_codes:%', array_to_string(missing_item_codes, ',');
    end if;

    with items_input as (
        select
            upper(trim(coalesce(value->>'item_code',''))) as item_code
        from jsonb_array_elements(p_items) as value
    ),
    items_join as (
        select i.id as item_id, ii.item_code
        from items_input ii
        join public.items i on upper(i.item_code) = ii.item_code
        where ii.item_code <> ''
        group by i.id, ii.item_code
    )
    select array_agg(distinct ij.item_code)
    into missing_inventory_codes
    from items_join ij
    left join public.inventory_records ir
        on ir.item_id = ij.item_id
        and ir.month = v_month
        and ir.year = v_year
    where ir.id is null;

    if missing_inventory_codes is not null and not p_create_missing_inventory then
        raise exception 'missing_inventory:%', array_to_string(missing_inventory_codes, ',');
    end if;

    if missing_inventory_codes is not null and p_create_missing_inventory then
        with items_input as (
            select
                upper(trim(coalesce(value->>'item_code',''))) as item_code,
                nullif(value->>'unit_cost','')::numeric as unit_cost
            from jsonb_array_elements(p_items) as value
        ),
        items_join as (
            select i.id as item_id, max(ii.unit_cost) as unit_cost
            from items_input ii
            join public.items i on upper(i.item_code) = ii.item_code
            left join public.inventory_records ir
                on ir.item_id = i.id
                and ir.month = v_month
                and ir.year = v_year
            where ii.item_code <> '' and ir.id is null
            group by i.id
        )
        insert into public.inventory_records (
            item_id, month, year, starting_qty, ending_qty, buffer_stock, unit_cost, created_by
        )
        select
            item_id, v_month, v_year, 0, 0, 0, unit_cost, p_created_by
        from items_join;
    end if;

    with items_input as (
        select
            upper(trim(coalesce(value->>'item_code',''))) as item_code,
            coalesce(nullif(value->>'qty','')::numeric, 0) as qty,
            coalesce(nullif(value->>'deduct_from',''), 'ending_qty') as deduct_from
        from jsonb_array_elements(p_items) as value
    ),
    items_agg as (
        select i.id as item_id, ii.item_code, ii.deduct_from, sum(ii.qty) as total_qty
        from items_input ii
        join public.items i on upper(i.item_code) = ii.item_code
        where ii.item_code <> ''
        group by i.id, ii.item_code, ii.deduct_from
    ),
    inventory_join as (
        select
            items_agg.item_code,
            items_agg.deduct_from,
            coalesce(ir.ending_qty, 0) as ending_qty,
            coalesce(ir.buffer_stock, 0) as buffer_stock,
            items_agg.total_qty
        from items_agg
        join public.inventory_records ir
            on ir.item_id = items_agg.item_id
            and ir.month = v_month
            and ir.year = v_year
    )
    select array_agg(item_code)
    into insufficient_inventory_codes
    from inventory_join
    where (case when deduct_from = 'buffer_stock' then buffer_stock else ending_qty end) - total_qty < 0;

    if insufficient_inventory_codes is not null then
        raise exception 'insufficient_inventory:%', array_to_string(insufficient_inventory_codes, ',');
    end if;

    insert into public.mcts (
        district,
        department,
        request_number,
        request_date,
        requisitioner,
        release_date,
        mct_rel_number,
        wo_number,
        jo_number,
        so_number,
        purpose,
        notes,
        created_by,
        mct_month,
        mct_year,
        status
    )
    values (
        p_header->>'district',
        p_header->>'department',
        p_header->>'request_number',
        p_header->>'request_date',
        p_header->>'requisitioner',
        p_header->>'release_date',
        p_header->>'mct_rel_number',
        p_header->>'wo_number',
        p_header->>'jo_number',
        p_header->>'so_number',
        p_header->>'purpose',
        p_header->>'notes',
        p_created_by,
        v_month,
        v_year,
        'active'
    )
    returning id into v_mct_id;

    with items_input as (
        select
            (value->>'item_code')::text as item_code_raw,
            upper(trim(coalesce(value->>'item_code',''))) as item_code,
            value->>'particulars' as particulars,
            value->>'unit' as unit,
            nullif(value->>'unit_cost','')::numeric as unit_cost,
            nullif(value->>'qty','')::numeric as qty,
            nullif(value->>'total_cost','')::numeric as total_cost,
            nullif(value->>'c2','')::numeric as c2,
            coalesce(nullif(value->>'deduct_from',''), 'ending_qty') as deduct_from,
            value->>'remarks' as remarks
        from jsonb_array_elements(p_items) as value
    )
    insert into public.mct_items (
        mct_id, item_id, item_code, particulars, unit, unit_cost, qty, total_cost, c2, deduct_from, remarks
    )
    select
        v_mct_id,
        i.id,
        ii.item_code_raw,
        ii.particulars,
        ii.unit,
        ii.unit_cost,
        ii.qty,
        ii.total_cost,
        ii.c2,
        ii.deduct_from,
        ii.remarks
    from items_input ii
    join public.items i on upper(i.item_code) = ii.item_code
    where ii.item_code <> '';

    with items_input as (
        select
            upper(trim(coalesce(value->>'item_code',''))) as item_code,
            coalesce(nullif(value->>'qty','')::numeric, 0) as qty,
            coalesce(nullif(value->>'deduct_from',''), 'ending_qty') as deduct_from
        from jsonb_array_elements(p_items) as value
    ),
    items_agg as (
        select i.id as item_id, ii.deduct_from, sum(ii.qty) as total_qty
        from items_input ii
        join public.items i on upper(i.item_code) = ii.item_code
        where ii.item_code <> ''
        group by i.id, ii.deduct_from
    )
    update public.inventory_records ir
    set ending_qty = case
        when items_agg.deduct_from = 'ending_qty' then coalesce(ir.ending_qty, 0) - items_agg.total_qty
        else ir.ending_qty
    end,
        buffer_stock = case
            when items_agg.deduct_from = 'buffer_stock' then coalesce(ir.buffer_stock, 0) - items_agg.total_qty
            else ir.buffer_stock
        end
    from items_agg
    where ir.item_id = items_agg.item_id
      and ir.month = v_month
      and ir.year = v_year;

    return v_mct_id;
end;
$$;

create or replace function public.rollback_mct_transaction(p_mct_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_role text;
    v_mct public.mcts%rowtype;
    v_month int;
    v_year int;
    missing_inventory_codes text[];
begin
    if v_actor is null then
        raise exception 'unauthenticated';
    end if;

    select * into v_mct
    from public.mcts
    where id = p_mct_id
    for update;

    if not found then
        raise exception 'mct_not_found';
    end if;

    if coalesce(v_mct.status, 'active') <> 'active' then
        raise exception 'mct_not_active';
    end if;

    select role into v_role from public.users where id = v_actor;
    v_role := coalesce(v_role, 'user');

    if v_role <> 'admin' and v_mct.created_by is distinct from v_actor then
        raise exception 'forbidden';
    end if;

    v_month := coalesce(v_mct.mct_month, extract(month from v_mct.created_at)::int);
    v_year := coalesce(v_mct.mct_year, extract(year from v_mct.created_at)::int);

    with items_input as (
        select
            mi.item_id,
            mi.item_code,
            coalesce(mi.qty, 0) as qty,
            coalesce(nullif(mi.deduct_from, ''), 'ending_qty') as deduct_from
        from public.mct_items mi
        where mi.mct_id = p_mct_id
    ),
    items_agg as (
        select item_id, item_code, deduct_from, sum(qty) as total_qty
        from items_input
        where item_id is not null
        group by item_id, item_code, deduct_from
    )
    select array_agg(distinct item_code)
    into missing_inventory_codes
    from items_agg ia
    left join public.inventory_records ir
        on ir.item_id = ia.item_id
        and ir.month = v_month
        and ir.year = v_year
    where ir.id is null;

    if missing_inventory_codes is not null then
        raise exception 'missing_inventory:%', array_to_string(missing_inventory_codes, ',');
    end if;

    with items_input as (
        select
            mi.item_id,
            coalesce(mi.qty, 0) as qty,
            coalesce(nullif(mi.deduct_from, ''), 'ending_qty') as deduct_from
        from public.mct_items mi
        where mi.mct_id = p_mct_id
    ),
    items_agg as (
        select item_id, deduct_from, sum(qty) as total_qty
        from items_input
        where item_id is not null
        group by item_id, deduct_from
    )
    update public.inventory_records ir
    set ending_qty = case
        when items_agg.deduct_from = 'ending_qty' then coalesce(ir.ending_qty, 0) + items_agg.total_qty
        else ir.ending_qty
    end,
        buffer_stock = case
            when items_agg.deduct_from = 'buffer_stock' then coalesce(ir.buffer_stock, 0) + items_agg.total_qty
            else ir.buffer_stock
        end
    from items_agg
    where ir.item_id = items_agg.item_id
      and ir.month = v_month
      and ir.year = v_year;

    update public.mcts
    set status = 'rolled_back',
        rolled_back_at = now(),
        rolled_back_by = v_actor
    where id = p_mct_id;

    return p_mct_id;
end;
$$;

grant execute on function public.rollback_mct_transaction(uuid) to authenticated;
