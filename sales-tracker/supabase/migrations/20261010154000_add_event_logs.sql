create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  event_category text not null check (event_category in ('error', 'audit', 'activity')),
  action text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists event_logs_created_at_id_idx
  on public.event_logs (created_at desc, id desc);

create index if not exists event_logs_category_created_at_id_idx
  on public.event_logs (event_category, created_at desc, id desc);

alter table public.event_logs enable row level security;
revoke all on table public.event_logs from anon, authenticated;
grant select, insert on table public.event_logs to authenticated;

drop policy if exists "event_logs_select_admin" on public.event_logs;
create policy "event_logs_select_admin"
on public.event_logs for select to authenticated
using ((select private.is_active_admin()));

drop policy if exists "event_logs_insert_own_client_logs" on public.event_logs;
create policy "event_logs_insert_own_client_logs"
on public.event_logs for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and event_category in ('error', 'audit')
);

create or replace function private.log_call_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_logs (actor_id, event_category, action, message, details)
  values (
    new.user_id,
    'activity',
    'staff.call.logged',
    'Staff logged a call outcome.',
    jsonb_build_object(
      'call_id', new.id,
      'contact_id', new.contact_id,
      'contact_name', (select c.name from public.contacts as c where c.id = new.contact_id),
      'phone', (select c.phone_raw from public.contacts as c where c.id = new.contact_id),
      'staff_name', (select p.name from public.profiles as p where p.id = new.user_id),
      'action_item', new.status,
      'outcome', new.action,
      'follow_up_date', new.follow_up_date
    )
  );
  return new;
end;
$$;

revoke all on function private.log_call_activity() from public, anon, authenticated;

drop trigger if exists calls_log_activity on public.calls;
create trigger calls_log_activity
  after insert on public.calls
  for each row execute function private.log_call_activity();

create or replace function private.log_contact_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.assigned_to is distinct from new.assigned_to then
    insert into public.event_logs (actor_id, event_category, action, message, details)
    values (
      auth.uid(),
      'activity',
      'contact.assignment.changed',
      'Contact assignment changed.',
      jsonb_build_object(
        'contact_id', new.id,
        'contact_name', new.name,
        'phone', new.phone_raw,
        'previous_staff_id', old.assigned_to,
        'previous_staff_name', (select p.name from public.profiles as p where p.id = old.assigned_to),
        'new_staff_id', new.assigned_to,
        'new_staff_name', (select p.name from public.profiles as p where p.id = new.assigned_to)
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.log_contact_assignment_activity() from public, anon, authenticated;

drop trigger if exists contacts_log_assignment_activity on public.contacts;
create trigger contacts_log_assignment_activity
  after update of assigned_to on public.contacts
  for each row execute function private.log_contact_assignment_activity();
