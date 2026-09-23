create or replace function public.claim_open_detail(target_detail_id uuid)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  roster_profile public.profiles%rowtype;
  target_detail public.details%rowtype;
  assignment_position text;
  created_assignment public.assignments%rowtype;
begin
  select * into roster_profile from public.profiles where id = auth.uid() and active;
  if not found then raise exception 'An active roster account is required'; end if;
  select * into target_detail from public.details where id = target_detail_id and not blocked;
  if not found then raise exception 'This flag detail is no longer available'; end if;
  if exists (select 1 from public.assignments where detail_id = target_detail_id and cadet_id = auth.uid() and removed_at is null) then
    raise exception 'This flag detail is already on your schedule';
  end if;
  assignment_position := case when roster_profile.cadet_type = 'POC' then 'POC_LEAD' else 'CADET' end;
  insert into public.assignments (detail_id, cadet_id, position, source)
  values (target_detail_id, auth.uid(), assignment_position, 'SELF')
  returning * into created_assignment;
  return created_assignment;
end;
$$;

grant execute on function public.claim_open_detail(uuid) to authenticated;
