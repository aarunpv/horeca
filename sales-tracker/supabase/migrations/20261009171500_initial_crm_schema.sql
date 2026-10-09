create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

grant usage on schema public to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin', 'staff')),
  is_active boolean not null default true
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), 'Staff'),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
revoke all on function private.handle_new_user() from public, anon, authenticated;

insert into public.profiles (id, name, role)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1), 'Staff'),
  'staff'
from auth.users as u
on conflict (id) do nothing;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
  zone text not null default 'Unassigned',
  address text not null default '',
  google_rating numeric,
  google_reviews integer,
  phone_raw text not null,
  phone_normalized text not null,
  current_status text not null default 'Not Contacted',
  next_follow_up_at timestamptz,
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  user_id uuid references public.profiles(id),
  status text not null,
  action text,
  notes text,
  follow_up_date timestamptz,
  called_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contacts_assigned_to_idx on public.contacts (assigned_to);
create index if not exists calls_contact_id_called_at_idx on public.calls (contact_id, called_at desc);

alter table public.contacts drop constraint if exists contacts_phone_normalized_key;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.is_active
  );
$$;

revoke all on function private.is_active_admin() from public, anon;
grant execute on function private.is_active_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.calls enable row level security;
alter table public.activity_logs enable row level security;

revoke all on table public.profiles, public.contacts, public.calls, public.activity_logs from anon, authenticated;
grant select on table public.profiles to authenticated;
grant select, insert on table public.contacts to authenticated;
grant update (assigned_to, current_status, next_follow_up_at, updated_at) on table public.contacts to authenticated;
grant select, insert on table public.calls to authenticated;
grant select on table public.activity_logs to authenticated;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_active_admin()));

drop policy if exists "contacts_select_assigned_or_admin" on public.contacts;
create policy "contacts_select_assigned_or_admin"
on public.contacts for select to authenticated
using (assigned_to = (select auth.uid()) or (select private.is_active_admin()));

drop policy if exists "contacts_insert_admin" on public.contacts;
create policy "contacts_insert_admin"
on public.contacts for insert to authenticated
with check ((select private.is_active_admin()));

drop policy if exists "contacts_update_assigned_or_admin" on public.contacts;
create policy "contacts_update_assigned_or_admin"
on public.contacts for update to authenticated
using (assigned_to = (select auth.uid()) or (select private.is_active_admin()))
with check (assigned_to = (select auth.uid()) or (select private.is_active_admin()));

drop policy if exists "calls_select_assigned_or_admin" on public.calls;
create policy "calls_select_assigned_or_admin"
on public.calls for select to authenticated
using (
  (select private.is_active_admin())
  or exists (
    select 1
    from public.contacts as c
    where c.id = calls.contact_id
      and c.assigned_to = (select auth.uid())
  )
);

drop policy if exists "calls_insert_assigned_or_admin" on public.calls;
create policy "calls_insert_assigned_or_admin"
on public.calls for insert to authenticated
with check (
  (select private.is_active_admin())
  or (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.contacts as c
      where c.id = calls.contact_id
        and c.assigned_to = (select auth.uid())
    )
  )
);

drop policy if exists "activity_logs_select_assigned_or_admin" on public.activity_logs;
create policy "activity_logs_select_assigned_or_admin"
on public.activity_logs for select to authenticated
using (
  (select private.is_active_admin())
  or exists (
    select 1
    from public.contacts as c
    where c.id = activity_logs.contact_id
      and c.assigned_to = (select auth.uid())
  )
);
