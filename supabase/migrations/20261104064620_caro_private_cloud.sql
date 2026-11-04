-- P8a: private, explicitly approved accounts; no local-data import or automatic account creation.
-- Fail instead of silently replacing an existing table/schema contract.
create table public.caro_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false
);
alter table public.caro_members enable row level security;
alter table public.caro_members force row level security;
revoke all on public.caro_members from public, anon, authenticated;
grant select on public.caro_members to authenticated;
create policy caro_members_read_own_approval on public.caro_members
  for select to authenticated
  using (user_id = (select auth.uid()) and enabled
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');

-- One future app-data container per owner. Existing versioned local objects can be nested unchanged.
-- P8a frontend never reads or writes this table.
create table public.caro_app_data (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  format_version integer not null default 1 check (format_version = 1),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object')
);
alter table public.caro_app_data enable row level security;
alter table public.caro_app_data force row level security;
revoke all on public.caro_app_data from public, anon, authenticated;
grant select, insert, update, delete on public.caro_app_data to authenticated;

create policy caro_data_select on public.caro_app_data for select to authenticated
  using (owner_id = (select auth.uid()) and exists (
    select 1 from public.caro_members where user_id = (select auth.uid()) and enabled
  ));
create policy caro_data_insert on public.caro_app_data for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.caro_members where user_id = (select auth.uid()) and enabled
  ));
create policy caro_data_update on public.caro_app_data for update to authenticated
  using (owner_id = (select auth.uid()) and exists (
    select 1 from public.caro_members where user_id = (select auth.uid()) and enabled
  ))
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.caro_members where user_id = (select auth.uid()) and enabled
  ));
create policy caro_data_delete on public.caro_app_data for delete to authenticated
  using (owner_id = (select auth.uid()) and exists (
    select 1 from public.caro_members where user_id = (select auth.uid()) and enabled
  ));

-- Existing Supabase event-trigger helper must not be callable as a public RPC.
-- Its event-trigger behavior and owner privileges remain unchanged.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
      and p.pronargs = 0 and p.prorettype = 'event_trigger'::regtype) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
