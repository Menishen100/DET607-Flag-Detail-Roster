-- The notification feed is a user-facing activity log. Read it through a
-- narrowly scoped function so the browser never needs direct table access.
create or replace function public.get_my_notification_log()
returns table(
  id uuid,
  event_type text,
  entity_type text,
  scheduled_for timestamptz,
  delivered_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.event_type, n.entity_type, n.scheduled_for, n.delivered_at, n.created_at
  from public.notification_outbox n
  where n.recipient_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active
    )
  order by n.created_at desc
  limit 50
$$;

revoke all on function public.get_my_notification_log() from public;
grant execute on function public.get_my_notification_log() to authenticated;
