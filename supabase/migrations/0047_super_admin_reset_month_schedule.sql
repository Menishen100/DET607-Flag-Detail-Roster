-- Testing reset: Super Admins can clear one selected month's roster without
-- changing other months, blocked dates, or time exceptions.
create or replace function public.super_admin_reset_month_schedule(target_month date)
returns table(schedule_id uuid, removed_assignments integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_schedule uuid;
  cleared_assignments integer := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level = 'SUPER_ADMIN'
  ) then
    raise exception 'Super Admin access is required to reset a schedule';
  end if;

  if date_trunc('month', target_month)::date <> target_month then
    raise exception 'Use the first day of the schedule month';
  end if;

  select id into target_schedule from public.schedules where month = target_month;
  if target_schedule is null then
    raise exception 'No schedule exists for this month';
  end if;

  delete from public.notification_outbox n
  where n.entity_id = target_schedule
     or n.entity_id in (select d.id from public.details d where d.schedule_id = target_schedule);

  delete from public.assignments a
  using public.details d
  where a.detail_id = d.id and d.schedule_id = target_schedule;
  get diagnostics cleared_assignments = row_count;

  update public.schedules
  set status = 'DRAFT', published_at = null
  where id = target_schedule;

  insert into public.audit_events(actor_id, entity_type, entity_id, action, after_data)
  values (auth.uid(), 'SCHEDULE', target_schedule, 'RESET_MONTH_SCHEDULE', jsonb_build_object('month', target_month, 'removed_assignments', cleared_assignments));

  return query select target_schedule, cleared_assignments;
end $$;

grant execute on function public.super_admin_reset_month_schedule(date) to authenticated;
notify pgrst, 'reload schema';
