-- An administrator publishes a completed monthly schedule before cadets can claim slots.
create or replace function public.publish_month_schedule(target_month date)
returns table (schedule_id uuid, recipient_ids uuid[])
language plpgsql security definer set search_path = public as $$
declare
  target_schedule uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access is required to publish a schedule'; end if;
  if date_trunc('month', target_month)::date <> target_month then raise exception 'Use the first day of the schedule month'; end if;

  select id into target_schedule from public.schedules where month = target_month;
  if target_schedule is null then raise exception 'Create the monthly schedule before publishing it'; end if;
  if not exists (select 1 from public.details where schedule_id = target_schedule) then raise exception 'Add flag-detail dates before publishing this schedule'; end if;
  if exists (select 1 from public.schedules where id = target_schedule and status = 'PUBLISHED') then raise exception 'This schedule is already published'; end if;

  update public.schedules set status = 'PUBLISHED', published_at = now() where id = target_schedule;
  return query select target_schedule, coalesce(array_agg(p.id), array[]::uuid[]) from public.profiles p where p.active;
end $$;

grant execute on function public.publish_month_schedule(date) to authenticated;

-- GMC cadets claim only one of the three cadet positions. POCs claim only the POC lead position.
create or replace function public.claim_open_detail(target_detail_id uuid)
returns public.assignments
language plpgsql security definer set search_path = public as $$
declare
  roster_profile public.profiles%rowtype;
  target_detail public.details%rowtype;
  assignment_position text;
  created_assignment public.assignments%rowtype;
begin
  select * into roster_profile from public.profiles where id = auth.uid() and active;
  if not found then raise exception 'An active roster account is required'; end if;
  select d.* into target_detail from public.details d join public.schedules s on s.id = d.schedule_id
    where d.id = target_detail_id and not d.blocked and s.status = 'PUBLISHED';
  if not found then raise exception 'This flag detail is not published or is no longer available'; end if;
  if exists (select 1 from public.assignments where detail_id = target_detail_id and cadet_id = auth.uid() and removed_at is null) then
    raise exception 'This flag detail is already on your schedule';
  end if;

  assignment_position := case when roster_profile.cadet_type = 'POC' then 'POC_LEAD' else 'CADET' end;
  if assignment_position = 'POC_LEAD' and exists (select 1 from public.assignments where detail_id = target_detail_id and position = 'POC_LEAD' and removed_at is null) then
    raise exception 'The POC lead position has already been claimed';
  end if;
  if assignment_position = 'CADET' and (select count(*) from public.assignments where detail_id = target_detail_id and position = 'CADET' and removed_at is null) >= 3 then
    raise exception 'All GMC cadet positions have already been claimed';
  end if;

  insert into public.assignments (detail_id, cadet_id, position, source)
  values (target_detail_id, auth.uid(), assignment_position, 'SELF')
  returning * into created_assignment;
  return created_assignment;
end $$;

grant execute on function public.claim_open_detail(uuid) to authenticated;
