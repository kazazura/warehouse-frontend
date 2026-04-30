-- Allow REL numbers from rolled back MCT and Emergency transactions to be reused.
-- Run in Supabase SQL editor as a privileged role.

drop index if exists public.mcts_mct_rel_number_uniq;
create unique index if not exists mcts_mct_rel_number_uniq
  on public.mcts (mct_rel_number)
  where mct_rel_number is not null and mct_rel_number <> '' and status = 'active';

drop index if exists public.emergencies_rel_number_uniq;
create unique index if not exists emergencies_rel_number_uniq
  on public.emergencies (rel_number)
  where rel_number is not null and rel_number <> '' and status = 'active';

do $$
declare
  v_sql text;
  v_old text := 'where mct_rel_number = p_header->>''mct_rel_number''';
  v_new text := 'where mct_rel_number = p_header->>''mct_rel_number''
              and status = ''active''';
begin
  if to_regprocedure('public.create_mct_transaction(jsonb,jsonb,boolean,uuid)') is not null then
    select pg_get_functiondef('public.create_mct_transaction(jsonb,jsonb,boolean,uuid)'::regprocedure)
    into v_sql;

    if position(v_new in v_sql) = 0 then
      execute replace(v_sql, v_old, v_new);
    end if;
  end if;
end $$;

do $$
declare
  v_sql text;
  v_old text := 'where rel_number = p_header->>''rel_number''';
  v_new text := 'where rel_number = p_header->>''rel_number''
              and status = ''active''';
begin
  if to_regprocedure('public.create_emergency_transaction(jsonb,jsonb,boolean,uuid)') is not null then
    select pg_get_functiondef('public.create_emergency_transaction(jsonb,jsonb,boolean,uuid)'::regprocedure)
    into v_sql;

    if position(v_new in v_sql) = 0 then
      execute replace(v_sql, v_old, v_new);
    end if;
  end if;
end $$;
