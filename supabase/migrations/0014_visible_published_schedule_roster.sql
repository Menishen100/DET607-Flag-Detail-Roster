-- Every active cadet can view the published flag-detail schedule and assigned names.
-- Contact information and other profile fields remain private.
create or replace function public.get_schedule_roster()
returns table (
  detail_id uuid,
  detail_date date,
  detail_type public.detail_type,
  report_time time,
  ceremony_time time,
  blocked boolean,
  blocked_reason text,
  cadet_names text[],
  poc_name text
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'An active DET 607 roster account is required';
  end if;

  return query
  select d.id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time,
    d.blocked, d.blocked_reason,
    coalesce(array_agg(p.full_name order by p.full_name) filter (where a.position = 'CADET'), array[]::text[]),
    max(p.full_name) filter (where a.position = 'POC_LEAD')
  from public.details d
  join public.schedules s on s.id = d.schedule_id
  left join public.assignments a on a.detail_id = d.id and a.removed_at is null
  left join public.profiles p on p.id = a.cadet_id
  where public.is_staff() or s.status = 'PUBLISHED'
  group by d.id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time, d.blocked, d.blocked_reason
  order by d.detail_date, d.detail_type;
end $$;

grant execute on function public.get_schedule_roster() to authenticated;
