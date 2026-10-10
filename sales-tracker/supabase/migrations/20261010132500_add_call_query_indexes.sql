create index if not exists contacts_created_at_id_idx
  on public.contacts (created_at desc, id);

create index if not exists calls_status_contact_id_id_idx
  on public.calls (status, contact_id, id);

create index if not exists calls_called_at_idx
  on public.calls (called_at desc);

create index if not exists calls_follow_up_date_idx
  on public.calls (follow_up_date desc)
  where follow_up_date is not null;

create index if not exists calls_user_id_called_at_idx
  on public.calls (user_id, called_at desc);

create index if not exists calls_user_id_follow_up_date_idx
  on public.calls (user_id, follow_up_date desc)
  where follow_up_date is not null;
