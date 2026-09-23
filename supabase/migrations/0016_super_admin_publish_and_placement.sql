-- Publication and manual placement are reserved for the Super Admin.
create or replace function public.publish_month_schedule(target_month date)
returns table (schedule_id uuid, recipient_ids uuid[])
language plpgsql security definer set search_path = public as $$
declare target_schedule uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then
    raise exception 'Super Admin access is required to publish a schedule';
  end if;
  if date_trunc('month', target_month)::date <> target_month then raise exception 'Use the first day of the schedule month'; end if;
  select id into target_schedule from public.schedules where month = target_month;
  if target_schedule is null then insert into public.schedules (month, status, created_by) values (target_month, 'DRAFT', auth.uid()) returning id into target_schedule; end if;
  if exists (select 1 from public.schedules where id = target_schedule and status = 'PUBLISHED') then raise exception 'This schedule is already published'; end if;
  if not exists (select 1 from public.details where schedule_id = target_schedule) then
    insert into public.details (schedule_id, detail_date, detail_type, report_time, ceremony_time)
    select target_schedule, day::date, detail_kind,
      case when detail_kind = 'REVEILLE' then schedule.reveille_report else schedule.retreat_report end,
      case when detail_kind = 'REVEILLE' then schedule.reveille_time else schedule.retreat_time end
    from public.schedules schedule cross join generate_series(target_month, target_month + interval '1 month - 1 day', interval '1 day') day
    cross join (values ('REVEILLE'::public.detail_type), ('RETREAT'::public.detail_type)) as kinds(detail_kind)
    where schedule.id = target_schedule and extract(isodow from day) between 1 and 5;
  end if;
  update public.schedules set status = 'PUBLISHED', published_at = now() where id = target_schedule;
  return query select target_schedule, coalesce(array_agg(p.id), array[]::uuid[]) from public.profiles p where p.active;
end $$;

create or replace function public.super_admin_assign_detail(target_detail_id uuid, target_cadet_id uuid)
returns public.assignments
language plpgsql security definer set search_path = public as $$
declare target_profile public.profiles%rowtype; target_detail public.details%rowtype; assigned public.assignments%rowtype; target_position text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then raise exception 'Super Admin access is required'; end if;
  select * into target_profile from public.profiles where id = target_cadet_id and active;
  if not found then raise exception 'Cadet account is not active'; end if;
  select d.* into target_detail from public.details d join public.schedules s on s.id = d.schedule_id where d.id = target_detail_id and s.status = 'PUBLISHED' and not d.blocked;
  if not found then raise exception 'This published detail is unavailable'; end if;
  if exists (select 1 from public.assignments where detail_id = target_detail_id and cadet_id = target_cadet_id and removed_at is null) then raise exception 'Cadet is already assigned to this detail'; end if;
  target_position := case when target_profile.cadet_type = 'POC' then 'POC_LEAD' else 'CADET' end;
  if target_position = 'POC_LEAD' and exists (select 1 from public.assignments where detail_id = target_detail_id and position = 'POC_LEAD' and removed_at is null) then raise exception 'The POC lead slot is already filled'; end if;
  if target_position = 'CADET' and (select count(*) from public.assignments where detail_id = target_detail_id and position = 'CADET' and removed_at is null) >= 3 then raise exception 'All GMC slots are filled'; end if;
  insert into public.assignments (detail_id, cadet_id, position, source, assigned_by) values (target_detail_id, target_cadet_id, target_position, 'ADMIN', auth.uid()) returning * into assigned;
  return assigned;
end $$;

grant execute on function public.publish_month_schedule(date) to authenticated;
grant execute on function public.super_admin_assign_detail(uuid, uuid) to authenticated;
