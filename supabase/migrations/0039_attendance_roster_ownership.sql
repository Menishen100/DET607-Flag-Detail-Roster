-- Let the secured roster query explicitly identify the signed-in cadet's
-- assignments.  The client must not infer ownership from a stale profile.
drop function if exists public.get_my_attendance_roster();

create function public.get_my_attendance_roster()
returns table(
  assignment_id uuid, detail_date date, detail_type public.detail_type,
  report_time time, ceremony_time time, cadet_id uuid, cadet_name text,
  cadet_type public.cadet_type, assignment_position text, status public.attendance_status,
  self_checked_in_at timestamptz, confirmed_at timestamptz, note text, is_own boolean
)
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  if not found then raise exception 'An active roster account is required'; end if;

  return query
  select
    a.id,d.detail_date,d.detail_type,d.report_time,d.ceremony_time,p.id,p.full_name,p.cadet_type,a.position,
    coalesce(att.status,'PENDING'::public.attendance_status),att.self_checked_in_at,att.confirmed_at,att.note,
    (a.cadet_id=auth.uid()) as is_own
  from public.assignments a
  join public.details d on d.id=a.detail_id
  join public.profiles p on p.id=a.cadet_id
  left join public.attendance att on att.assignment_id=a.id
  where a.removed_at is null and (
    a.cadet_id=auth.uid()
    or (
      actor.cadet_type='POC' and actor.admin_level='NONE' and p.cadet_type='GMC'
      and exists(
        select 1 from public.assignments lead
        where lead.detail_id=a.detail_id and lead.cadet_id=auth.uid()
          and lead.position='POC_LEAD' and lead.removed_at is null
      )
    )
    or actor.admin_level in ('ADMIN','SUPER_ADMIN')
  )
  order by d.detail_date desc,d.ceremony_time desc,p.full_name;
end $$;

grant execute on function public.get_my_attendance_roster() to authenticated;

-- Make the new return shape immediately available to the API used by the
-- browser, rather than waiting for the schema cache to expire.
notify pgrst, 'reload schema';
