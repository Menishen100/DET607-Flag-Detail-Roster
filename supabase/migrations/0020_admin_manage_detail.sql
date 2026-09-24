create or replace function public.admin_assign_detail(target_detail_id uuid, target_cadet_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_profile public.profiles; target_detail public.details; assigned uuid; position_kind text;
begin
  if not public.is_admin() then raise exception 'Administrator access is required'; end if;
  select * into target_profile from public.profiles where id = target_cadet_id and active;
  if not found then raise exception 'Cadet account is not active'; end if;
  select d.* into target_detail from public.details d join public.schedules s on s.id=d.schedule_id where d.id=target_detail_id and s.status='PUBLISHED' and not d.blocked;
  if not found then raise exception 'This published detail is unavailable'; end if;
  if exists (select 1 from public.assignments where detail_id=target_detail_id and cadet_id=target_cadet_id and removed_at is null) then raise exception 'Cadet is already assigned to this detail'; end if;
  position_kind := case when target_profile.cadet_type='POC' then 'POC_LEAD' else 'CADET' end;
  if position_kind='POC_LEAD' and exists (select 1 from public.assignments where detail_id=target_detail_id and position='POC_LEAD' and removed_at is null) then raise exception 'The POC lead slot is already filled'; end if;
  if position_kind='CADET' and (select count(*) from public.assignments where detail_id=target_detail_id and position='CADET' and removed_at is null) >= 3 then raise exception 'All three GMC slots are filled'; end if;
  insert into public.assignments(detail_id,cadet_id,position,assigned_by) values(target_detail_id,target_cadet_id,position_kind,auth.uid()) returning id into assigned;
  return assigned;
end $$;

create or replace function public.admin_update_detail_times(target_detail_id uuid, new_report_time time, new_ceremony_time time)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare recipients uuid[];
begin
  if not public.is_admin() then raise exception 'Administrator access is required'; end if;
  if new_report_time is null or new_ceremony_time is null then raise exception 'Both report and ceremony times are required'; end if;
  update public.details set report_time=new_report_time, ceremony_time=new_ceremony_time where id=target_detail_id;
  if not found then raise exception 'Flag detail was not found'; end if;
  select coalesce(array_agg(cadet_id),array[]::uuid[]) into recipients from public.assignments where detail_id=target_detail_id and removed_at is null;
  return recipients;
end $$;
grant execute on function public.admin_assign_detail(uuid,uuid) to authenticated;
grant execute on function public.admin_update_detail_times(uuid,time,time) to authenticated;
