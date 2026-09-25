-- DET 607 conducts flag detail Monday through Thursday only. Friday records
-- remain in the database as blocked history, but are never shown or claimable.
update public.assignments a
set removed_at = coalesce(a.removed_at, now())
from public.details d
where d.id = a.detail_id
  and extract(isodow from d.detail_date) = 5
  and a.removed_at is null;

update public.details
set blocked = true,
    blocked_reason = 'No Friday flag detail'
where extract(isodow from detail_date) = 5;

create or replace function public.publish_month_schedule(target_month date)
returns table (schedule_id uuid, recipient_ids uuid[])
language plpgsql security definer set search_path = public as $$
declare target_schedule uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then raise exception 'Super Admin access is required to publish a schedule'; end if;
  if date_trunc('month', target_month)::date <> target_month then raise exception 'Use the first day of the schedule month'; end if;
  select s.id into target_schedule from public.schedules s where s.month = target_month;
  if target_schedule is null then insert into public.schedules (month, status, created_by) values (target_month, 'DRAFT', auth.uid()) returning id into target_schedule; end if;
  if exists (select 1 from public.schedules s where s.id = target_schedule and s.status = 'PUBLISHED') then raise exception 'This schedule is already published'; end if;
  insert into public.details (schedule_id, detail_date, detail_type, report_time, ceremony_time)
  select target_schedule, day::date, kind.detail_kind,
    case when kind.detail_kind = 'REVEILLE' then s.reveille_report else s.retreat_report end,
    case when kind.detail_kind = 'REVEILLE' then s.reveille_time else s.retreat_time end
  from public.schedules s
  cross join generate_series(target_month, target_month + interval '1 month - 1 day', interval '1 day') day
  cross join (values ('REVEILLE'::public.detail_type), ('RETREAT'::public.detail_type)) as kind(detail_kind)
  where s.id = target_schedule and extract(isodow from day) between 1 and 4
  on conflict (detail_date, detail_type) do nothing;
  update public.schedules s set status = 'PUBLISHED', published_at = now() where s.id = target_schedule;
  return query select target_schedule, coalesce(array_agg(p.id), array[]::uuid[]) from public.profiles p where p.active;
end $$;

create or replace function public.get_live_schedule_roster()
returns jsonb language plpgsql security definer set search_path = public as $$
declare roster jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then raise exception 'An active DET 607 roster account is required'; end if;
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.detail_date, rows.detail_type), '[]'::jsonb) into roster
  from (
    select d.id as detail_id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time, d.blocked, d.blocked_reason,
      coalesce(array_agg(p.full_name order by p.full_name) filter (where a.position = 'CADET'), array[]::text[]) as cadet_names,
      coalesce(array_agg(a.cadet_id order by p.full_name) filter (where a.position = 'CADET'), array[]::uuid[]) as cadet_ids,
      max(p.full_name) filter (where a.position = 'POC_LEAD') as poc_name,
      (array_agg(a.cadet_id order by a.cadet_id) filter (where a.position = 'POC_LEAD'))[1] as poc_id
    from public.details d join public.schedules s on s.id = d.schedule_id
    left join public.assignments a on a.detail_id = d.id and a.removed_at is null
    left join public.profiles p on p.id = a.cadet_id
    where s.status = 'PUBLISHED' and extract(isodow from d.detail_date) between 1 and 4
    group by d.id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time, d.blocked, d.blocked_reason
  ) rows;
  return roster;
end $$;

grant execute on function public.publish_month_schedule(date), public.get_live_schedule_roster() to authenticated;
notify pgrst, 'reload schema';
