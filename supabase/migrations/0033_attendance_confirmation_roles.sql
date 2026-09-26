-- Two-level attendance accountability: cadets check themselves in, POC leads
-- confirm GMCs on details they lead, and administrators confirm POC leads.
alter table public.attendance
  add column if not exists self_checked_in_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id),
  add column if not exists confirmed_at timestamptz;

create or replace function public.get_my_attendance_roster()
returns table(
  assignment_id uuid, detail_date date, detail_type public.detail_type,
  report_time time, ceremony_time time, cadet_id uuid, cadet_name text,
  cadet_type public.cadet_type, assignment_position text, status public.attendance_status,
  self_checked_in_at timestamptz, confirmed_at timestamptz, note text
)
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  if not found then raise exception 'An active roster account is required'; end if;
  return query
  select a.id,d.detail_date,d.detail_type,d.report_time,d.ceremony_time,p.id,p.full_name,p.cadet_type,a.position,
    coalesce(att.status,'PENDING'::public.attendance_status),att.self_checked_in_at,att.confirmed_at,att.note
  from public.assignments a
  join public.details d on d.id=a.detail_id
  join public.profiles p on p.id=a.cadet_id
  left join public.attendance att on att.assignment_id=a.id
  where a.removed_at is null and (
    a.cadet_id=auth.uid()
    or (
      actor.cadet_type='POC' and actor.admin_level='NONE' and p.cadet_type='GMC'
      and exists(select 1 from public.assignments lead where lead.detail_id=a.detail_id and lead.cadet_id=auth.uid() and lead.position='POC_LEAD' and lead.removed_at is null)
    )
    -- Administrators can review and confirm every roster member, including themselves.
    or actor.admin_level in ('ADMIN','SUPER_ADMIN')
  )
  order by d.detail_date desc,d.ceremony_time desc,p.full_name;
end $$;

create or replace function public.check_in_to_my_detail(target_assignment_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target public.assignments%rowtype; detail_row public.details%rowtype;
begin
  select * into target from public.assignments where id=target_assignment_id and cadet_id=auth.uid() and removed_at is null;
  if not found then raise exception 'This assignment is not available for check-in'; end if;
  select * into detail_row from public.details where id=target.detail_id and not blocked;
  if not found then raise exception 'This flag detail is unavailable'; end if;
  if now() < (detail_row.detail_date + detail_row.report_time - interval '15 minutes') or now() > (detail_row.detail_date + detail_row.report_time + interval '30 minutes') then
    raise exception 'Check-in is available from 15 minutes before report time through 30 minutes after report time';
  end if;
  insert into public.attendance(assignment_id,status,clocked_at,self_checked_in_at,updated_at)
  values(target_assignment_id,'PENDING',now(),now(),now())
  on conflict (assignment_id) do update set status='PENDING',clocked_at=now(),self_checked_in_at=now(),updated_at=now()
  where public.attendance.confirmed_at is null;
end $$;

create or replace function public.confirm_detail_attendance(target_assignment_id uuid, new_status public.attendance_status, new_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; target public.assignments%rowtype; subject public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  select * into target from public.assignments where id=target_assignment_id and removed_at is null;
  if not found then raise exception 'This assignment is no longer active'; end if;
  select * into subject from public.profiles where id=target.cadet_id and active;
  if actor.admin_level in ('ADMIN','SUPER_ADMIN') then
    -- Admin and Super Admin access is unrestricted, including an assigned
    -- POC administrator confirming their own record.
    null;
  elsif actor.cadet_type='POC' and actor.admin_level='NONE' then
    if subject.cadet_type <> 'GMC' or not exists(select 1 from public.assignments lead where lead.detail_id=target.detail_id and lead.cadet_id=auth.uid() and lead.position='POC_LEAD' and lead.removed_at is null) then
      raise exception 'POC leads may confirm GMC attendance only for details they lead';
    end if;
  else
    raise exception 'Only POC leads or administrators may confirm attendance';
  end if;
  insert into public.attendance(assignment_id,status,recorded_by,confirmed_by,confirmed_at,note,updated_at)
  values(target_assignment_id,new_status,auth.uid(),auth.uid(),now(),nullif(trim(new_note),''),now())
  on conflict (assignment_id) do update set status=excluded.status,recorded_by=auth.uid(),confirmed_by=auth.uid(),confirmed_at=now(),note=excluded.note,updated_at=now();
end $$;

grant execute on function public.get_my_attendance_roster(), public.check_in_to_my_detail(uuid), public.confirm_detail_attendance(uuid,public.attendance_status,text) to authenticated;
