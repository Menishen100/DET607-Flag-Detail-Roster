-- Publishing always completes the standard weekday template, even when a
-- draft already contains a blocked date or a manually created exception.
create or replace function public.publish_month_schedule(target_month date)
returns table (schedule_id uuid, recipient_ids uuid[])
language plpgsql security definer set search_path = public as $$
declare
  target_schedule uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level = 'SUPER_ADMIN'
  ) then
    raise exception 'Super Admin access is required to publish a schedule';
  end if;

  if date_trunc('month', target_month)::date <> target_month then
    raise exception 'Use the first day of the schedule month';
  end if;

  select s.id into target_schedule
  from public.schedules s
  where s.month = target_month;

  if target_schedule is null then
    insert into public.schedules (month, status, created_by)
    values (target_month, 'DRAFT', auth.uid())
    returning id into target_schedule;
  end if;

  if exists (select 1 from public.schedules s where s.id = target_schedule and s.status = 'PUBLISHED') then
    raise exception 'This schedule is already published';
  end if;

  -- Do not replace existing draft records: a blocked date or time exception
  -- must be preserved. Add every missing weekday Reveille/Retreat record.
  insert into public.details (schedule_id, detail_date, detail_type, report_time, ceremony_time)
  select target_schedule, day::date, kind.detail_kind,
    case when kind.detail_kind = 'REVEILLE' then s.reveille_report else s.retreat_report end,
    case when kind.detail_kind = 'REVEILLE' then s.reveille_time else s.retreat_time end
  from public.schedules s
  cross join generate_series(target_month, target_month + interval '1 month - 1 day', interval '1 day') day
  cross join (values ('REVEILLE'::public.detail_type), ('RETREAT'::public.detail_type)) as kind(detail_kind)
  where s.id = target_schedule
    and extract(isodow from day) between 1 and 5
  on conflict (detail_date, detail_type) do nothing;

  update public.schedules s
  set status = 'PUBLISHED', published_at = now()
  where s.id = target_schedule;

  return query
    select target_schedule, coalesce(array_agg(p.id), array[]::uuid[])
    from public.profiles p
    where p.active;
end $$;

grant execute on function public.publish_month_schedule(date) to authenticated;
notify pgrst, 'reload schema';
