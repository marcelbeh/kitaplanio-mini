-- P8a/P8b/P8c installed; synthetic identities only, all changes rolled back.
begin;
select set_config('caro.test.a',gen_random_uuid()::text,true);
select set_config('caro.test.b',gen_random_uuid()::text,true);
select set_config('caro.test.c',gen_random_uuid()::text,true);
select set_config('caro.test.d',gen_random_uuid()::text,true);
select set_config('caro.test.e',gen_random_uuid()::text,true);
select set_config('caro.test.token',gen_random_uuid()::text,true);
select set_config('caro.test.payload','{"kitaplanio-lite:kita:v1":{"version":1,"completed":true,"groups":[]},"kitaplanio-lite:interview:v1":null,"kitaplanio-lite:employees:v1":{"version":1,"employees":[]},"kitaplanio-lite:shifts:v1":null,"kitaplanio-lite:absences:v1":null,"kitaplanio-lite:events:v1":null,"caro:published-weeks:v1":{"version":1,"plans":[{"from":"2027-01-04","version":1,"snapshot":"immutable"}]}}',true);
insert into auth.users(id) select current_setting('caro.test.'||key)::uuid from unnest(array['a','b','c','d','e']) key;
insert into public.caro_members(user_id,enabled) select current_setting('caro.test.'||key)::uuid,true from unnest(array['a','b','c','e']) key;
insert into public.caro_app_data(owner_id,payload) values
 (current_setting('caro.test.b')::uuid,'{}'),
 (current_setting('caro.test.c')::uuid,'{"already":"present"}');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('caro.test.a'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('caro.test.a'),'role','authenticated','is_anonymous',false)::text,true);
do $$
declare written integer;
begin
  select count(*) into written from public.caro_initialize(current_setting('caro.test.payload')::jsonb,current_setting('caro.test.token')::uuid);
  if written <> 1 then raise exception 'First initialization failed'; end if;
  if (select count(*) from public.caro_app_data) <> 1 then raise exception 'Foreign rows exposed'; end if;
  if not exists (select 1 from public.caro_app_data where sync_initialized and revision=1 and initialization_id=current_setting('caro.test.token')::uuid and payload=current_setting('caro.test.payload')::jsonb) then raise exception 'Incomplete initialization'; end if;
  -- Competing and repeated attempts cannot replace the winning owner row/token.
  if exists (select 1 from public.caro_initialize(current_setting('caro.test.payload')::jsonb,gen_random_uuid())) then raise exception 'Second initialization succeeded'; end if;
  if exists (select 1 from public.caro_initialize(current_setting('caro.test.payload')::jsonb,current_setting('caro.test.token')::uuid)) then raise exception 'Duplicate initialization succeeded'; end if;
  if (select revision from public.caro_app_data) <> 1 then raise exception 'Duplicate changed revision'; end if;
  begin
    perform public.caro_sync_cas(1,jsonb_set(current_setting('caro.test.payload')::jsonb,'{caro:published-weeks:v1}','null'));
    raise exception 'Published version removed';
  exception when check_violation then null; end;
  begin
    update public.caro_app_data set sync_initialized=false where owner_id=auth.uid();
    raise exception 'Direct write bypassed RPC';
  exception when insufficient_privilege then null; end;
end $$;
-- An administratively precreated pristine row is also supported.
select set_config('request.jwt.claim.sub',current_setting('caro.test.b'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('caro.test.b'),'role','authenticated')::text,true);
do $$ begin
  if (select count(*) from public.caro_initialize(current_setting('caro.test.payload')::jsonb,gen_random_uuid())) <> 1 then raise exception 'Pristine row failed'; end if;
end $$;
-- An uninitialized row with ANY payload is occupied, never merged or overwritten.
select set_config('request.jwt.claim.sub',current_setting('caro.test.c'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('caro.test.c'),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.caro_initialize(current_setting('caro.test.payload')::jsonb,gen_random_uuid())) then raise exception 'Occupied row overwritten'; end if;
  if (select payload from public.caro_app_data) <> '{"already":"present"}'::jsonb then raise exception 'Occupied data changed'; end if;
end $$;
-- Invalid data must roll back the temporary insert AND initialized flag.
select set_config('request.jwt.claim.sub',current_setting('caro.test.e'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('caro.test.e'),'role','authenticated')::text,true);
do $$ begin
  begin
    perform public.caro_initialize(current_setting('caro.test.payload')::jsonb - 'kitaplanio-lite:interview:v1',gen_random_uuid());
    raise exception 'Missing area accepted';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.caro_app_data) then raise exception 'Partial initialization survived'; end if;
  begin
    perform public.caro_initialize(jsonb_set(current_setting('caro.test.payload')::jsonb,'{kitaplanio-lite:employees:v1,employees}','"invalid"'),gen_random_uuid());
    raise exception 'Invalid collection accepted';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.caro_app_data) then raise exception 'Invalid payload inserted'; end if;
end $$;
-- Unapproved user cannot initialize itself or target a foreign owner (there is no owner argument).
select set_config('request.jwt.claim.sub',current_setting('caro.test.d'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('caro.test.d'),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.caro_app_data) then raise exception 'Unapproved read permitted'; end if;
  begin
    perform public.caro_initialize(current_setting('caro.test.payload')::jsonb,gen_random_uuid());
    raise exception 'Unapproved initialization permitted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('caro.test.a'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('caro.test.a'),'role','authenticated','is_anonymous',true)::text,true);
do $$ begin
  begin
    perform public.caro_initialize(current_setting('caro.test.payload')::jsonb,gen_random_uuid());
    raise exception 'Anonymous authenticated initialization permitted';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform public.caro_initialize(current_setting('caro.test.payload')::jsonb,gen_random_uuid());
    raise exception 'Anon RPC permitted';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
