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
      max(p.full_name) filter (where a.position = 'POC_LEAD') as poc_name
    from public.details d
    join public.schedules s on s.id = d.schedule_id
    left join public.assignments a on a.detail_id = d.id and a.removed_at is null
    left join public.profiles p on p.id = a.cadet_id
    where s.status = 'PUBLISHED'
    group by d.id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time, d.blocked, d.blocked_reason
  ) rows;
  return roster;
end $$;
grant execute on function public.get_live_schedule_roster() to authenticated;
