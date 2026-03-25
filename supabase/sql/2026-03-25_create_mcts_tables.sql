create table if not exists public.mcts (
    id uuid primary key default gen_random_uuid(),
    district text,
    department text,
    request_number text,
    request_date text,
    requisitioner text,
    release_date text,
    mct_rel_number text,
    wo_number text,
    jo_number text,
    so_number text,
    purpose text,
    notes text,
    created_by uuid,
    created_at timestamptz not null default now()
);

create table if not exists public.mct_items (
    id uuid primary key default gen_random_uuid(),
    mct_id uuid not null references public.mcts(id) on delete cascade,
    item_id uuid references public.items(id),
    item_code text,
    particulars text,
    unit text,
    unit_cost numeric,
    qty numeric,
    total_cost numeric,
    remarks text,
    created_at timestamptz not null default now()
);

create index if not exists mct_items_mct_id_idx on public.mct_items(mct_id);
create index if not exists mct_items_item_id_idx on public.mct_items(item_id);
create unique index if not exists mcts_mct_rel_number_uniq
    on public.mcts (mct_rel_number)
    where mct_rel_number is not null and mct_rel_number <> '';

alter table public.mcts enable row level security;
alter table public.mct_items enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'mcts' and policyname = 'mcts_select'
    ) then
        create policy mcts_select on public.mcts
            for select
            using (auth.role() = 'authenticated');
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'mcts' and policyname = 'mcts_insert'
    ) then
        create policy mcts_insert on public.mcts
            for insert
            with check (auth.role() = 'authenticated');
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'mct_items' and policyname = 'mct_items_select'
    ) then
        create policy mct_items_select on public.mct_items
            for select
            using (auth.role() = 'authenticated');
    end if;

    if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'mct_items' and policyname = 'mct_items_insert'
    ) then
        create policy mct_items_insert on public.mct_items
            for insert
            with check (auth.role() = 'authenticated');
    end if;
end $$;

create or replace function public.get_server_timestamp()
returns timestamptz
language sql
stable
as $$
    select now();
$$;

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
        created_by
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
        p_created_by
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
            value->>'remarks' as remarks
        from jsonb_array_elements(p_items) as value
    )
    insert into public.mct_items (
        mct_id, item_id, item_code, particulars, unit, unit_cost, qty, total_cost, remarks
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
        ii.remarks
    from items_input ii
    join public.items i on upper(i.item_code) = ii.item_code
    where ii.item_code <> '';

    with items_input as (
        select
            upper(trim(coalesce(value->>'item_code',''))) as item_code,
            coalesce(nullif(value->>'qty','')::numeric, 0) as qty
        from jsonb_array_elements(p_items) as value
    ),
    items_agg as (
        select i.id as item_id, sum(ii.qty) as total_qty
        from items_input ii
        join public.items i on upper(i.item_code) = ii.item_code
        where ii.item_code <> ''
        group by i.id
    )
    update public.inventory_records ir
    set ending_qty = coalesce(ir.ending_qty, 0) - items_agg.total_qty
    from items_agg
    where ir.item_id = items_agg.item_id
      and ir.month = v_month
      and ir.year = v_year;

    return v_mct_id;
end;
$$;

grant execute on function public.create_mct_transaction(jsonb, jsonb, boolean, uuid) to authenticated;
