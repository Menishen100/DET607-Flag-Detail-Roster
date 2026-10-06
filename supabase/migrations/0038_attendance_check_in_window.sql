-- Cadets can self check in beginning one hour before their report time.  The
-- window remains open afterwards until either the cadet checks in or an
-- authorized POC/Admin confirms the final attendance result.
create or replace function public.check_in_to_my_detail(target_assignment_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target public.assignments%rowtype; detail_row public.details%rowtype;
begin
  select * into target
  from public.assignments assignment_item
  where assignment_item.id=target_assignment_id
    and assignment_item.cadet_id=auth.uid()
    and assignment_item.removed_at is null;
  if not found then raise exception 'This assignment is not available for check-in'; end if;

  select * into detail_row from public.details detail where detail.id=target.detail_id and not detail.blocked;
  if not found then raise exception 'This flag detail is unavailable'; end if;

  if timezone('America/New_York', now()) < (detail_row.detail_date + detail_row.report_time - interval '1 hour') then
    raise exception 'Check-in opens one hour before the % report time', to_char(detail_row.report_time, 'FMHH12:MI AM');
  end if;

  if exists(select 1 from public.attendance existing_record where existing_record.assignment_id=target.id and existing_record.confirmed_at is not null) then
    raise exception 'Attendance has already been confirmed for this detail';
  end if;

  insert into public.attendance(assignment_id,status,clocked_at,self_checked_in_at,updated_at)
  values(target.id,'PENDING',now(),now(),now())
  on conflict (assignment_id) do update
    set status='PENDING',clocked_at=now(),self_checked_in_at=now(),updated_at=now()
    where public.attendance.confirmed_at is null;
end $$;

grant execute on function public.check_in_to_my_detail(uuid) to authenticated;
