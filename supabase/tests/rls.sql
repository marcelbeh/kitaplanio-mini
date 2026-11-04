-- P8b migration must be installed first. Run with ON_ERROR_STOP; all fixtures roll back.
begin;
select set_config('caro.test.a', gen_random_uuid()::text, true);
select set_config('caro.test.b', gen_random_uuid()::text, true);
select set_config('caro.test.c', gen_random_uuid()::text, true);
select set_config('caro.test.payload', '{"kitaplanio-lite:kita:v1":null,"kitaplanio-lite:interview:v1":null,"kitaplanio-lite:employees:v1":null,"kitaplanio-lite:shifts:v1":{"version":1,"shifts":[]},"kitaplanio-lite:absences:v1":null,"kitaplanio-lite:events:v1":null,"caro:published-weeks:v1":{"version":1,"plans":[{"from":"2027-01-04","version":1,"snapshot":"immutable"}]}}', true);
insert into auth.users(id) values (current_setting('caro.test.a')::uuid), (current_setting('caro.test.b')::uuid), (current_setting('caro.test.c')::uuid);
insert into public.caro_members(user_id, enabled) values (current_setting('caro.test.a')::uuid, true), (current_setting('caro.test.b')::uuid, true);
-- Administrative provisioning of test fixtures only. Never initialize real accounts in this test.
insert into public.caro_app_data(owner_id,payload,sync_initialized) values
 (current_setting('caro.test.a')::uuid,current_setting('caro.test.payload')::jsonb,true),
 (current_setting('caro.test.b')::uuid,current_setting('caro.test.payload')::jsonb,true);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('caro.test.a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
do $$
declare changed integer; original jsonb := current_setting('caro.test.payload')::jsonb; replacement jsonb;
begin
  if (select count(*) from public.caro_members) <> 1 then raise exception 'Approval isolation failed'; end if;
  if (select count(*) from public.caro_app_data) <> 1 then raise exception 'RLS owner isolation failed'; end if;
  if exists (select 1 from public.caro_app_data where owner_id = current_setting('caro.test.b')::uuid) then raise exception 'Foreign SELECT permitted'; end if;
  select count(*) into changed from public.caro_sync_cas(0,original);
  if changed <> 1 then raise exception 'First CAS failed'; end if;
  select count(*) into changed from public.caro_sync_cas(0,original);
  if changed <> 0 then raise exception 'Stale competing CAS succeeded'; end if;
  if (select revision from public.caro_app_data) <> 1 then raise exception 'CAS revision incorrect'; end if;
  -- Removing a collection is exact replacement, never a merge that resurrects entries.
  replacement := jsonb_set(original, '{kitaplanio-lite:shifts:v1}', 'null');
  perform public.caro_sync_cas(1,replacement);
  if (select payload->'kitaplanio-lite:shifts:v1' from public.caro_app_data) <> 'null'::jsonb then raise exception 'Deletion not transferred'; end if;
  begin
    perform public.caro_sync_cas(2,jsonb_set(replacement,'{caro:published-weeks:v1}', 'null'));
    raise exception 'Published archive removed';
  exception when check_violation then null; end;
  begin
    perform public.caro_sync_cas(2,jsonb_set(replacement,'{caro:published-weeks:v1,plans,0,snapshot}', '"changed"'));
    raise exception 'Published snapshot changed';
  exception when check_violation then null; end;
  begin
    perform public.caro_sync_cas(2,'{}');
    raise exception 'Incomplete dataset accepted';
  exception when invalid_parameter_value then null; end;
  if (select revision from public.caro_app_data) <> 2 then raise exception 'Failed writes changed revision'; end if;
  begin
    update public.caro_app_data set payload = '{}' where owner_id = auth.uid();
    raise exception 'Direct update bypassed CAS';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.caro_app_data(owner_id) values (current_setting('caro.test.c')::uuid);
    raise exception 'Direct insert permitted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.caro_app_data where owner_id = current_setting('caro.test.b')::uuid;
    raise exception 'Direct delete permitted';
  exception when insufficient_privilege then null; end;
  begin
    update public.caro_members set enabled = false where user_id = auth.uid();
    raise exception 'Self approval change permitted';
  exception when insufficient_privilege then null; end;
end $$;
-- Approved B has a separate revision; A's writes never changed B.
select set_config('request.jwt.claim.sub', current_setting('caro.test.b'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.b'), 'role', 'authenticated')::text, true);
do $$ begin
  if (select revision from public.caro_app_data) <> 0 then raise exception 'Foreign row changed'; end if;
end $$;
-- Non-approved and anonymous-authenticated users are blocked even through SECURITY DEFINER.
select set_config('request.jwt.claim.sub', current_setting('caro.test.c'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.c'), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from public.caro_app_data) then raise exception 'Unapproved read permitted'; end if;
  begin
    perform public.caro_sync_cas(0,current_setting('caro.test.payload')::jsonb);
    raise exception 'Unapproved RPC permitted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('caro.test.a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.a'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
do $$ begin
  if exists (select 1 from public.caro_app_data) then raise exception 'Anonymous read permitted'; end if;
  begin
    perform public.caro_sync_cas(2,current_setting('caro.test.payload')::jsonb);
    raise exception 'Anonymous authenticated RPC permitted';
  exception when insufficient_privilege then null; end;
end $$;
-- Ordinary anon has neither reads nor RPC execution privileges.
set local role anon;
do $$ begin
  begin
    perform public.caro_sync_cas(0,current_setting('caro.test.payload')::jsonb);
    raise exception 'Unauthenticated RPC permitted';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.caro_app_data;
    raise exception 'Unauthenticated read permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Neither missing nor uninitialized records may be initialized through RPC.
update public.caro_app_data set sync_initialized = false where owner_id = current_setting('caro.test.b')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('caro.test.b'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.b'), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from public.caro_sync_cas(0,current_setting('caro.test.payload')::jsonb)) then raise exception 'Uninitialized record written'; end if;
end $$;
rollback;
