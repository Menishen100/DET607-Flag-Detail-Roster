-- The Super Admin may prepare a month, block a weekday with a visible reason,
-- then publish the reviewed schedule. Cadets can never claim blocked details.
create or replace function public.super_admin_block_schedule_date(target_date date, block_reason text)
returns table (removed_assignments integer, recipient_ids uuid[], event_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  target_schedule uuid;
  recipients uuid[];
  removed_count integer;
  block_event uuid := gen_random_uuid();
  month_start date := date_trunc('month', target_date)::date;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level = 'SUPER_ADMIN'
  ) then
    raise exception 'Super Admin access is required to block a date';
  end if;
  if extract(isodow from target_date) not between 1 and 5 then
    raise exception 'There is no flag detail on weekends';
  end if;
  if nullif(trim(block_reason), '') is null then
    raise exception 'A blocking reason is required';
  end if;

  select id into target_schedule from public.schedules where month = month_start;
  if target_schedule is null then
    insert into public.schedules (month, status, created_by)
    values (month_start, 'DRAFT', auth.uid()) returning id into target_schedule;
  end if;

  -- Create the schedule grid early when a date is blocked before publication.
  if not exists (select 1 from public.details where schedule_id = target_schedule) then
    insert into public.details (schedule_id, detail_date, detail_type, report_time, ceremony_time)
    select target_schedule, day::date, kind.detail_kind,
      case when kind.detail_kind = 'REVEILLE' then s.reveille_report else s.retreat_report end,
      case when kind.detail_kind = 'REVEILLE' then s.reveille_time else s.retreat_time end
    from public.schedules s
    cross join generate_series(month_start, month_start + interval '1 month - 1 day', interval '1 day') day
    cross join (values ('REVEILLE'::public.detail_type), ('RETREAT'::public.detail_type)) as kind(detail_kind)
    where s.id = target_schedule and extract(isodow from day) between 1 and 5;
  end if;

  select coalesce(array_agg(distinct a.cadet_id), array[]::uuid[]) into recipients
  from public.assignments a join public.details d on d.id = a.detail_id
  where d.detail_date = target_date and a.removed_at is null;

  update public.assignments a set removed_at = now()
  from public.details d
  where d.id = a.detail_id and d.detail_date = target_date and a.removed_at is null;
  get diagnostics removed_count = row_count;

  update public.details
  set blocked = true, blocked_reason = trim(block_reason)
  where schedule_id = target_schedule and detail_date = target_date;

  return query select removed_count, recipients, block_event;
end $$;

-- Secure the prior public function too, in case an older client still calls it.
create or replace function public.admin_block_schedule_date(target_date date, block_reason text)
returns table (removed_assignments integer, recipient_ids uuid[], event_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query select * from public.super_admin_block_schedule_date(target_date, block_reason);
end $$;

grant execute on function public.super_admin_block_schedule_date(date, text) to authenticated;
grant execute on function public.admin_block_schedule_date(date, text) to authenticated;
notify pgrst, 'reload schema';
