-- Past details remain visible as historical records, but cadets cannot claim
-- them even if an old browser session or a direct RPC request is used.
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

  select d.* into target_detail
  from public.details d
  join public.schedules s on s.id = d.schedule_id
  where d.id = target_detail_id and not d.blocked and s.status = 'PUBLISHED';
  if not found then raise exception 'This flag detail is not published or is no longer available'; end if;
  if target_detail.detail_date < timezone('America/New_York', now())::date then
    raise exception 'Past flag details can no longer be selected';
  end if;
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
notify pgrst, 'reload schema';
