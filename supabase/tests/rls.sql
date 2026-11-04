-- Run using psql -v ON_ERROR_STOP=1. Synthetic identities/data are always rolled back.
-- No email addresses, passwords, production rows or real user IDs are used.
begin;
select set_config('caro.test.a', gen_random_uuid()::text, true);
select set_config('caro.test.b', gen_random_uuid()::text, true);
select set_config('caro.test.c', gen_random_uuid()::text, true);
insert into auth.users(id) values
  (current_setting('caro.test.a')::uuid),
  (current_setting('caro.test.b')::uuid),
  (current_setting('caro.test.c')::uuid);
insert into public.caro_members(user_id, enabled) values
  (current_setting('caro.test.a')::uuid, true), (current_setting('caro.test.b')::uuid, true);
insert into public.caro_app_data(owner_id, payload) values
  (current_setting('caro.test.b')::uuid, '{"test":"owner-b"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('caro.test.a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
do $$
declare affected integer;
begin
  if (select count(*) from public.caro_members) <> 1 then raise exception 'Approval isolation failed'; end if;
  if exists (select 1 from public.caro_app_data) then raise exception 'Foreign SELECT permitted'; end if;
  insert into public.caro_app_data(owner_id, payload) values (auth.uid(), '{"test":"owner-a"}');
  if (select count(*) from public.caro_app_data) <> 1 then raise exception 'Own SELECT failed'; end if;
  update public.caro_app_data set payload = '{"test":"updated"}' where owner_id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own UPDATE failed'; end if;
  update public.caro_app_data set payload = '{}' where owner_id = current_setting('caro.test.b')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign UPDATE permitted'; end if;
  delete from public.caro_app_data where owner_id = current_setting('caro.test.b')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign DELETE permitted'; end if;
  begin
    insert into public.caro_app_data(owner_id) values (current_setting('caro.test.b')::uuid);
    raise exception 'Forged owner INSERT permitted';
  exception when insufficient_privilege then null; end;
  begin
    update public.caro_app_data set owner_id = current_setting('caro.test.b')::uuid where owner_id = auth.uid();
    raise exception 'Owner reassignment permitted';
  exception when insufficient_privilege then null; end;
  begin
    update public.caro_members set enabled = false where user_id = auth.uid();
    raise exception 'Client changed approval';
  exception when insufficient_privilege then null; end;
  delete from public.caro_app_data where owner_id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own DELETE failed'; end if;
  insert into public.caro_app_data(owner_id) values (auth.uid());
end $$;
-- An authenticated but unapproved account cannot read/write or approve itself.
select set_config('request.jwt.claim.sub', current_setting('caro.test.c'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.c'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.caro_app_data) then raise exception 'Unapproved SELECT permitted'; end if;
  begin
    insert into public.caro_app_data(owner_id) values (auth.uid());
    raise exception 'Unapproved INSERT permitted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.caro_members(user_id, enabled) values (auth.uid(), true);
    raise exception 'Self approval permitted';
  exception when insufficient_privilege then null; end;
end $$;
-- Immediate revocation, independent of the age of an access token.
reset role;
update public.caro_members set enabled = false where user_id = current_setting('caro.test.a')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('caro.test.a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.a'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.caro_app_data) then raise exception 'Revoked SELECT permitted'; end if;
end $$;
-- Even an allowlisted UID must not gain access through an anonymous-auth session.
reset role;
update public.caro_members set enabled = true where user_id = current_setting('caro.test.a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('caro.test.a'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
do $$
begin
  if exists (select 1 from public.caro_members) or exists (select 1 from public.caro_app_data) then raise exception 'Anonymous session gained access'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.caro_app_data;
    raise exception 'anon SELECT permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'RLS owner CRUD, foreign isolation, approval, revocation and anonymous denial passed; all fixtures rolled back' as result;
