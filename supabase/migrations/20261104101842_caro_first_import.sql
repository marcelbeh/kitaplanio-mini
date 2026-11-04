-- P8c: additive, no existing payload is read, changed, initialized, or deleted by installation.
-- Requires P8a + P8b. The token is a backup-bound recovery identifier, not a credential.
alter table public.caro_app_data add column initialization_id uuid;

create function caro_private.initialize(p_payload jsonb, p_initialization_id uuid)
returns setof public.caro_app_data
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_old public.caro_app_data;
  v_key text;
  v_field text;
begin
  if v_owner is null or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false'
    or not exists (select 1 from public.caro_members m where m.user_id = v_owner and m.enabled) then
    raise insufficient_privilege using message = 'Cloud access denied';
  end if;
  if p_initialization_id is null then raise invalid_parameter_value using message = 'Backup recovery identifier required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload->'kitaplanio-lite:kita:v1') is distinct from 'object'
    or p_payload->'kitaplanio-lite:kita:v1'->'completed' is distinct from 'true'::jsonb
    or jsonb_typeof(p_payload->'kitaplanio-lite:employees:v1') is distinct from 'object' then
    raise invalid_parameter_value using message = 'Complete local dataset required';
  end if;
  for v_key, v_field in select * from (values
    ('kitaplanio-lite:kita:v1', 'groups'), ('kitaplanio-lite:employees:v1', 'employees'),
    ('kitaplanio-lite:shifts:v1', 'shifts'), ('kitaplanio-lite:absences:v1', 'absences'),
    ('kitaplanio-lite:events:v1', 'events'), ('caro:published-weeks:v1', 'plans')) fields(key, field)
  loop
    if p_payload->v_key is distinct from 'null'::jsonb and (
      p_payload->v_key->'version' is distinct from '1'::jsonb or
      jsonb_typeof(p_payload->v_key->v_field) is distinct from 'array') then
      raise invalid_parameter_value using message = 'Invalid versioned collection';
    end if;
  end loop;
  -- Unique owner PK serializes concurrent first inserts; the locked predicate also covers pre-created empty rows.
  insert into public.caro_app_data(owner_id) values (v_owner) on conflict (owner_id) do nothing;
  select * into v_old from public.caro_app_data d where d.owner_id = v_owner for update;
  if v_old.sync_initialized or v_old.payload <> '{}'::jsonb or v_old.format_version <> 1
    or v_old.revision <> 0 or v_old.updated_at is not null or v_old.initialization_id is not null then
    return; -- Never overwrite/merge an existing dataset, even if its contents happen to match.
  end if;
  update public.caro_app_data set sync_initialized = true, initialization_id = p_initialization_id where owner_id = v_owner;
  -- Reuse P8b's complete manifest, version, publication and CAS checks, in this SAME transaction.
  -- Any exception rolls back the placeholder, flag, token, payload and revision together.
  return query select * from caro_private.sync_cas(0, p_payload);
end $$;
revoke all on function caro_private.initialize(jsonb, uuid) from public, anon, authenticated;
grant execute on function caro_private.initialize(jsonb, uuid) to authenticated;

create function public.caro_initialize(p_payload jsonb, p_initialization_id uuid)
returns setof public.caro_app_data
language sql security invoker set search_path = '' as $$
  select * from caro_private.initialize(p_payload, p_initialization_id);
$$;
revoke all on function public.caro_initialize(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.caro_initialize(jsonb, uuid) to authenticated;
