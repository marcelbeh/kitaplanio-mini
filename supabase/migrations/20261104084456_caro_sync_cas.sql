-- P8b: a complete existing-format dataset is committed as one row, never merged by area.
-- No existing payload is changed or initialized by this migration. P8c handles explicit provisioning.
alter table public.caro_app_data
  add column revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  add column sync_initialized boolean not null default false,
  add column updated_at timestamptz;

-- Reads still use P8a ownership/approval RLS. Writes must go through the guarded CAS endpoint.
revoke insert, update, delete on public.caro_app_data from authenticated;
create schema caro_private;
revoke all on schema caro_private from public, anon, authenticated;
grant usage on schema caro_private to authenticated;

create function caro_private.sync_cas(p_expected_revision bigint, p_payload jsonb)
returns setof public.caro_app_data
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_old public.caro_app_data;
  v_key text;
  v_keys text[] := array['kitaplanio-lite:kita:v1', 'kitaplanio-lite:interview:v1',
    'kitaplanio-lite:employees:v1', 'kitaplanio-lite:shifts:v1',
    'kitaplanio-lite:absences:v1', 'kitaplanio-lite:events:v1', 'caro:published-weeks:v1'];
  v_old_plans jsonb;
  v_new_plans jsonb;
begin
  -- No owner argument, user-editable metadata, or browser-side authorization decisions.
  if v_owner is null or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false'
    or not exists (select 1 from public.caro_members m where m.user_id = v_owner and m.enabled) then
    raise insufficient_privilege using message = 'Cloud access denied';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise invalid_parameter_value using message = 'Invalid revision';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or not (p_payload ?& v_keys) or (select count(*) from jsonb_object_keys(p_payload)) <> cardinality(v_keys) then
    raise invalid_parameter_value using message = 'Complete dataset required';
  end if;
  foreach v_key in array v_keys loop
    if jsonb_typeof(p_payload->v_key) not in ('object', 'null')
      or (jsonb_typeof(p_payload->v_key) = 'object' and (p_payload->v_key->>'version') is distinct from '1') then
      raise invalid_parameter_value using message = 'Unsupported dataset format';
    end if;
  end loop;
  -- The row lock and revision predicate are in one server transaction, not read-then-upsert.
  select * into v_old from public.caro_app_data d
    where d.owner_id = v_owner and d.sync_initialized and d.revision = p_expected_revision for update;
  if not found then return; end if;
  v_old_plans := coalesce(nullif(v_old.payload->'caro:published-weeks:v1', 'null'::jsonb)->'plans', '[]'::jsonb);
  v_new_plans := coalesce(nullif(p_payload->'caro:published-weeks:v1', 'null'::jsonb)->'plans', '[]'::jsonb);
  if jsonb_typeof(v_old_plans) <> 'array' or jsonb_typeof(v_new_plans) <> 'array' then
    raise invalid_parameter_value using message = 'Invalid publications';
  end if;
  if exists (select 1 from jsonb_array_elements(v_old_plans) old_plan
    where not exists (select 1 from jsonb_array_elements(v_new_plans) new_plan where new_plan = old_plan)) then
    raise check_violation using message = 'Published versions are immutable';
  end if;
  if exists (select 1 from jsonb_array_elements(v_new_plans) plan
    where jsonb_typeof(plan) <> 'object' or plan->>'from' is null or plan->>'version' is null)
    or exists (select 1 from jsonb_array_elements(v_new_plans) plan
      group by plan->>'from', plan->>'version' having count(*) > 1) then
    raise check_violation using message = 'Invalid or duplicate publication version';
  end if;
  return query update public.caro_app_data d
    set payload = p_payload, revision = d.revision + 1, updated_at = clock_timestamp()
    where d.owner_id = v_owner and d.sync_initialized and d.revision = p_expected_revision returning d.*;
end $$;
revoke all on function caro_private.sync_cas(bigint, jsonb) from public, anon, authenticated;
grant execute on function caro_private.sync_cas(bigint, jsonb) to authenticated;

-- SECURITY INVOKER public wrapper; the privileged implementation is not in an exposed schema.
create function public.caro_sync_cas(p_expected_revision bigint, p_payload jsonb)
returns setof public.caro_app_data
language sql security invoker set search_path = '' as $$
  select * from caro_private.sync_cas(p_expected_revision, p_payload);
$$;
revoke all on function public.caro_sync_cas(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.caro_sync_cas(bigint, jsonb) to authenticated;
