-- Create dedicated emergency transaction tables and RPCs.
-- Run in Supabase SQL editor as a privileged role.

create table if not exists public.emergencies (
    id uuid primary key default gen_random_uuid(),
    emergency_date text,
    requisitioner text,
    rel_number text,
    purpose text,
    notes text,
    created_by uuid,
    created_at timestamptz not null default now(),
    emergency_month int,
    emergency_year int,
    status text not null default 'active',
    rolled_back_at timestamptz,
    rolled_back_by uuid
);

create table if not exists public.emergency_items (
    id uuid primary key default gen_random_uuid(),
    emergency_id uuid not null references public.emergencies(id) on delete cascade,
    item_id uuid references public.items(id),
    item_code text,
    particulars text,
    unit text,
    unit_cost numeric,
    qty numeric,
    total_cost numeric,
    c2 numeric,
    deduct_from text not null default 'ending_qty',
    remarks text,
    created_at timestamptz not null default now()
);

create index if not exists emergency_items_emergency_id_idx on public.emergency_items(emergency_id);
create index if not exists emergency_items_item_id_idx on public.emergency_items(item_id);
create index if not exists emergencies_status_idx on public.emergencies(status);
create unique index if not exists emergencies_rel_number_uniq
    on public.emergencies (rel_number)
    where rel_number is not null and rel_number <> '';

alter table public.emergencies
    drop constraint if exists emergencies_status_check;
alter table public.emergencies
    add constraint emergencies_status_check
    check (status in ('active', 'rolled_back'));

update public.emergencies
set emergency_month = extract(month from created_at)::int,
    emergency_year = extract(year from created_at)::int
where emergency_month is null or emergency_year is null;

alter table public.emergencies enable row level security;
alter table public.emergency_items enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'emergencies' and policyname = 'emergencies_select'
    ) then
        create policy emergencies_select on public.emergencies
            for select
            using (auth.role() = 'authenticated');
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'emergencies' and policyname = 'emergencies_insert'
    ) then
        create policy emergencies_insert on public.emergencies
            for insert
            with check (auth.role() = 'authenticated');
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'emergency_items' and policyname = 'emergency_items_select'
    ) then
        create policy emergency_items_select on public.emergency_items
            for select
            using (auth.role() = 'authenticated');
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'emergency_items' and policyname = 'emergency_items_insert'
    ) then
        create policy emergency_items_insert on public.emergency_items
            for insert
            with check (auth.role() = 'authenticated');
    end if;
end $$;

create or replace function public.create_emergency_transaction(
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
    v_emergency_id uuid;
    missing_item_codes text[];
    missing_inventory_codes text[];
    insufficient_inventory_codes text[];
begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'no_items';
    end if;

    if coalesce(p_header->>'rel_number','') <> '' then
        if exists (
            select 1
            from public.emergencies
            where rel_number = p_header->>'rel_number'
        ) then
            raise exception 'duplicate_emergency:%', p_header->>'rel_number';
        end if;
    end if;

    with items_input as (
        select
            (value->>'item_code')::text as item_code_raw,
            upper(trim(coalesce(value->>'item_code',''))) as item_code,
            nullif(value->>'unit_cost','')::numeric as unit_cost
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
        select upper(trim(coalesce(value->>'item_code',''))) as item_code
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

    insert into public.emergencies (
        emergency_date,
        requisitioner,
        rel_number,
        purpose,
        notes,
        created_by,
        emergency_month,
        emergency_year,
        status
    )
    values (
        p_header->>'emergency_date',
        p_header->>'requisitioner',
        p_header->>'rel_number',
        p_header->>'purpose',
        p_header->>'notes',
        p_created_by,
        v_month,
        v_year,
        'active'
    )
    returning id into v_emergency_id;

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
    insert into public.emergency_items (
        emergency_id, item_id, item_code, particulars, unit, unit_cost, qty, total_cost, c2, deduct_from, remarks
    )
    select
        v_emergency_id,
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

    return v_emergency_id;
end;
$$;

grant execute on function public.create_emergency_transaction(jsonb, jsonb, boolean, uuid) to authenticated;

create or replace function public.rollback_emergency_transaction(p_emergency_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_role text;
    v_emergency public.emergencies%rowtype;
    v_month int;
    v_year int;
    v_iter_date date;
    v_end_date date;
    missing_inventory_codes text[];
    missing_downstream_codes text[];
begin
    if v_actor is null then
        raise exception 'unauthenticated';
    end if;

    select * into v_emergency
    from public.emergencies
    where id = p_emergency_id
    for update;

    if not found then
        raise exception 'emergency_not_found';
    end if;

    if coalesce(v_emergency.status, 'active') <> 'active' then
        raise exception 'emergency_not_active';
    end if;

    select role into v_role from public.users where id = v_actor;
    v_role := coalesce(v_role, 'user');

    if v_role <> 'admin' and v_emergency.created_by is distinct from v_actor then
        raise exception 'forbidden';
    end if;

    v_month := coalesce(v_emergency.emergency_month, extract(month from v_emergency.created_at)::int);
    v_year := coalesce(v_emergency.emergency_year, extract(year from v_emergency.created_at)::int);
    v_iter_date := (make_date(v_year, v_month, 1) + interval '1 month')::date;
    v_end_date := date_trunc('month', now())::date;

    with items_input as (
        select
            ei.item_id,
            ei.item_code,
            coalesce(ei.qty, 0) as qty,
            coalesce(nullif(ei.deduct_from, ''), 'ending_qty') as deduct_from
        from public.emergency_items ei
        where ei.emergency_id = p_emergency_id
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
            ei.item_id,
            coalesce(ei.qty, 0) as qty,
            coalesce(nullif(ei.deduct_from, ''), 'ending_qty') as deduct_from
        from public.emergency_items ei
        where ei.emergency_id = p_emergency_id
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

    while v_iter_date <= v_end_date loop
        with items_input as (
            select
                ei.item_id,
                ei.item_code,
                coalesce(ei.qty, 0) as qty,
                coalesce(nullif(ei.deduct_from, ''), 'ending_qty') as deduct_from
            from public.emergency_items ei
            where ei.emergency_id = p_emergency_id
        ),
        items_agg as (
            select item_id, item_code, deduct_from, sum(qty) as total_qty
            from items_input
            where item_id is not null
            group by item_id, item_code, deduct_from
        ),
        end_qty_adjustments as (
            select item_id, item_code, total_qty
            from items_agg
            where deduct_from = 'ending_qty'
        )
        select array_agg(distinct eqa.item_code)
        into missing_downstream_codes
        from end_qty_adjustments eqa
        left join public.inventory_records ir
            on ir.item_id = eqa.item_id
           and ir.month = extract(month from v_iter_date)::int
           and ir.year = extract(year from v_iter_date)::int
        where ir.id is null;

        if missing_downstream_codes is not null then
            raise exception 'missing_downstream_inventory:%', array_to_string(missing_downstream_codes, ',');
        end if;

        with items_input as (
            select
                ei.item_id,
                coalesce(ei.qty, 0) as qty,
                coalesce(nullif(ei.deduct_from, ''), 'ending_qty') as deduct_from
            from public.emergency_items ei
            where ei.emergency_id = p_emergency_id
        ),
        items_agg as (
            select item_id, deduct_from, sum(qty) as total_qty
            from items_input
            where item_id is not null
            group by item_id, deduct_from
        ),
        end_qty_adjustments as (
            select item_id, total_qty
            from items_agg
            where deduct_from = 'ending_qty'
        )
        update public.inventory_records ir
        set starting_qty = coalesce(ir.starting_qty, 0) + end_qty_adjustments.total_qty,
            ending_qty = coalesce(ir.ending_qty, 0) + end_qty_adjustments.total_qty
        from end_qty_adjustments
        where ir.item_id = end_qty_adjustments.item_id
          and ir.month = extract(month from v_iter_date)::int
          and ir.year = extract(year from v_iter_date)::int;

        v_iter_date := (v_iter_date + interval '1 month')::date;
    end loop;

    update public.emergencies
    set status = 'rolled_back',
        rolled_back_at = now(),
        rolled_back_by = v_actor
    where id = p_emergency_id;

    return p_emergency_id;
end;
$$;

grant execute on function public.rollback_emergency_transaction(uuid) to authenticated;
