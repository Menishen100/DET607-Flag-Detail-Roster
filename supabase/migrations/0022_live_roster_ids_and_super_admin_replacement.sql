-- Include assignment IDs for the roster UI. They are used only for Super Admin replacement controls.
create or replace function public.get_live_schedule_roster()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare roster jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'An active DET 607 roster account is required';
  end if;
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.detail_date, rows.detail_type), '[]'::jsonb)
  into roster
  from (
    select d.id as detail_id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time,
      d.blocked, d.blocked_reason,
      coalesce(array_agg(p.full_name order by p.full_name) filter (where a.position = 'CADET'), array[]::text[]) as cadet_names,
      coalesce(array_agg(a.cadet_id order by p.full_name) filter (where a.position = 'CADET'), array[]::uuid[]) as cadet_ids,
      max(p.full_name) filter (where a.position = 'POC_LEAD') as poc_name,
      max(a.cadet_id) filter (where a.position = 'POC_LEAD') as poc_id
    from public.details d
    join public.schedules s on s.id = d.schedule_id
    left join public.assignments a on a.detail_id = d.id and a.removed_at is null
    left join public.profiles p on p.id = a.cadet_id
    where s.status = 'PUBLISHED'
    group by d.id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time, d.blocked, d.blocked_reason
  ) rows;
  return roster;
end $$;

-- A Super Admin may replace an existing assignee with an eligible cadet. Regular admins and cadets may not.
create or replace function public.super_admin_replace_detail_assignment(
  target_detail_id uuid,
  current_cadet_id uuid,
  replacement_cadet_id uuid
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare current_assignment public.assignments%rowtype; replacement_profile public.profiles%rowtype;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then
    raise exception 'Super Admin access is required';
  end if;
  select * into current_assignment from public.assignments
    where detail_id = target_detail_id and cadet_id = current_cadet_id and removed_at is null;
  if not found then raise exception 'The selected roster position is no longer assigned'; end if;
  select * into replacement_profile from public.profiles where id = replacement_cadet_id and active;
  if not found then raise exception 'Replacement cadet is not active'; end if;
  if current_assignment.position = 'CADET' and replacement_profile.cadet_type <> 'GMC' then
    raise exception 'Only GMC cadets may fill a GMC position';
  end if;
  if current_assignment.position = 'POC_LEAD' and replacement_profile.cadet_type <> 'POC' then
    raise exception 'Only POCs may fill the POC lead position';
  end if;
  if exists (select 1 from public.assignments where detail_id = target_detail_id and cadet_id = replacement_cadet_id and removed_at is null) then
    raise exception 'That cadet is already assigned to this detail';
  end if;
  update public.assignments set cadet_id = replacement_cadet_id, assigned_by = auth.uid(), assigned_at = now(), source = 'ADMIN'
    where id = current_assignment.id;
  return current_assignment.id;
end $$;

grant execute on function public.get_live_schedule_roster() to authenticated;
grant execute on function public.super_admin_replace_detail_assignment(uuid,uuid,uuid) to authenticated;
