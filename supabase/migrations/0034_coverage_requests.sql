-- Role-safe coverage workflow. A coverage request preserves the original
-- position, only exposes it to the matching cadet classification, and blocks
-- a volunteer who already has another flag detail on that calendar day.
alter table public.shift_requests
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id),
  add column if not exists admin_note text;

-- Direct table access is limited to participants and administrators. Eligible
-- open requests are deliberately returned only through get_coverage_requests.
drop policy if exists "requests self or staff" on public.shift_requests;
drop policy if exists "requests own insert" on public.shift_requests;
drop policy if exists "requests own or staff update" on public.shift_requests;
create policy "coverage request participants or administrators" on public.shift_requests
  for select using (
    requester_id = auth.uid() or accepted_by = auth.uid() or public.is_admin()
  );

create or replace function public.get_coverage_requests()
returns table(
  id uuid, requester_id uuid, requester_name text, requester_type text,
  source_assignment_id uuid, detail_id uuid, detail_date date, detail_type text,
  report_time time, ceremony_time time, assignment_position text, reason text,
  status text, accepted_by uuid, accepted_by_name text, created_at timestamptz,
  resolved_at timestamptz, admin_note text, can_accept boolean
)
language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  if not found then raise exception 'An active roster account is required'; end if;
  return query
  select r.id, requester.id, requester.full_name, requester.cadet_type::text,
    r.source_assignment_id, d.id, d.detail_date, d.detail_type::text,
    d.report_time, d.ceremony_time, source.position, r.reason, r.status::text,
    r.accepted_by, accepted.full_name, r.created_at, r.resolved_at, r.admin_note,
    (
      r.status='OPEN'::public.request_status
      and requester.id <> actor.id
      and requester.cadet_type = actor.cadet_type
      and d.detail_date >= current_date
      and not d.blocked
      and not exists (
        select 1 from public.assignments conflict
        join public.details conflict_detail on conflict_detail.id=conflict.detail_id
        where conflict.cadet_id=actor.id and conflict.removed_at is null
          and conflict_detail.detail_date=d.detail_date
      )
    )
  from public.shift_requests r
  join public.assignments source on source.id=r.source_assignment_id
  join public.details d on d.id=source.detail_id
  join public.profiles requester on requester.id=r.requester_id
  left join public.profiles accepted on accepted.id=r.accepted_by
  where r.request_type='COVERAGE'::public.request_type
    and (
      actor.admin_level in ('ADMIN'::public.admin_level,'SUPER_ADMIN'::public.admin_level)
      or r.requester_id=actor.id or r.accepted_by=actor.id
      or (
        r.status='OPEN'::public.request_status and requester.cadet_type=actor.cadet_type
        and requester.id<>actor.id and d.detail_date>=current_date and not d.blocked
        and not exists (
          select 1 from public.assignments conflict
          join public.details conflict_detail on conflict_detail.id=conflict.detail_id
          where conflict.cadet_id=actor.id and conflict.removed_at is null
            and conflict_detail.detail_date=d.detail_date
        )
      )
    )
  order by case when r.status='OPEN'::public.request_status then 0 else 1 end, d.detail_date, d.ceremony_time, r.created_at;
end $$;

create or replace function public.get_my_coverage_eligible_assignments()
returns table(assignment_id uuid, detail_date date, detail_type text, report_time time, ceremony_time time, position text)
language sql stable security definer set search_path=public as $$
  select a.id, d.detail_date, d.detail_type::text, d.report_time, d.ceremony_time, a.position
  from public.assignments a
  join public.details d on d.id=a.detail_id
  join public.schedules s on s.id=d.schedule_id
  where a.cadet_id=auth.uid() and a.removed_at is null and s.status='PUBLISHED'
    and not d.blocked and d.detail_date>=current_date
    and not exists (
      select 1 from public.shift_requests r where r.source_assignment_id=a.id
        and r.request_type='COVERAGE'::public.request_type and r.status='OPEN'::public.request_status
    )
  order by d.detail_date,d.ceremony_time;
$$;

create or replace function public.create_coverage_request(target_assignment_id uuid, request_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare source public.assignments%rowtype; detail_row public.details%rowtype; created_id uuid;
begin
  if nullif(trim(request_reason),'') is null then raise exception 'A brief coverage reason is required'; end if;
  select * into source from public.assignments where id=target_assignment_id and cadet_id=auth.uid() and removed_at is null;
  if not found then raise exception 'You may request coverage only for your own active assignment'; end if;
  select * into detail_row from public.details where id=source.detail_id and not blocked;
  if not found or detail_row.detail_date<current_date then raise exception 'Coverage may be requested only for an available current or future detail'; end if;
  if exists(select 1 from public.shift_requests where source_assignment_id=source.id and request_type='COVERAGE'::public.request_type and status='OPEN'::public.request_status) then
    raise exception 'A coverage request is already open for this assignment';
  end if;
  insert into public.shift_requests(request_type,requester_id,source_assignment_id,status,reason)
  values('COVERAGE'::public.request_type,auth.uid(),source.id,'OPEN'::public.request_status,trim(request_reason))
  returning id into created_id;
  return created_id;
end $$;

create or replace function public.cancel_coverage_request(target_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.shift_requests set status='CANCELLED'::public.request_status,resolved_at=now(),resolved_by=auth.uid()
  where id=target_request_id and request_type='COVERAGE'::public.request_type
    and status='OPEN'::public.request_status and requester_id=auth.uid();
  if not found then raise exception 'Only the requester may cancel an open coverage request'; end if;
end $$;

create or replace function public.accept_coverage_request(target_request_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; request_row public.shift_requests%rowtype;
  requester public.profiles%rowtype; source public.assignments%rowtype; detail_row public.details%rowtype; replacement_id uuid;
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  if not found then raise exception 'An active roster account is required'; end if;
  select * into request_row from public.shift_requests where id=target_request_id and request_type='COVERAGE'::public.request_type and status='OPEN'::public.request_status for update;
  if not found then raise exception 'This coverage request is no longer available'; end if;
  if request_row.requester_id=actor.id then raise exception 'You cannot accept your own coverage request'; end if;
  select * into requester from public.profiles where id=request_row.requester_id and active;
  if requester.cadet_type<>actor.cadet_type then raise exception 'Only an eligible ' || requester.cadet_type::text || ' may accept this request'; end if;
  select * into source from public.assignments where id=request_row.source_assignment_id and removed_at is null for update;
  if not found then raise exception 'The original assignment is no longer available'; end if;
  select * into detail_row from public.details where id=source.detail_id and not blocked;
  if not found or detail_row.detail_date<current_date then raise exception 'This detail is unavailable for coverage'; end if;
  if exists(select 1 from public.assignments a join public.details d on d.id=a.detail_id where a.cadet_id=actor.id and a.removed_at is null and d.detail_date=detail_row.detail_date) then
    raise exception 'You already have a flag-detail assignment on ' || to_char(detail_row.detail_date,'FMDay, FMMonth FMDD, YYYY');
  end if;
  update public.assignments set removed_at=now() where id=source.id;
  insert into public.assignments(detail_id,cadet_id,position,source,assigned_by)
    values(source.detail_id,actor.id,source.position,'COVERAGE',actor.id) returning id into replacement_id;
  update public.shift_requests set status='ACCEPTED'::public.request_status,accepted_by=actor.id,resolved_at=now(),resolved_by=actor.id where id=request_row.id;
  return replacement_id;
end $$;

create or replace function public.get_coverage_assignment_candidates(target_request_id uuid)
returns table(id uuid, full_name text, cadet_type text, monthly_shift_count bigint)
language plpgsql security definer set search_path=public as $$
declare request_row public.shift_requests%rowtype; requester public.profiles%rowtype; target_date date;
begin
  if not public.is_admin() then raise exception 'Administrator access is required'; end if;
  select * into request_row from public.shift_requests where id=target_request_id and request_type='COVERAGE'::public.request_type and status='OPEN'::public.request_status;
  if not found then raise exception 'This coverage request is no longer open'; end if;
  select * into requester from public.profiles where id=request_row.requester_id;
  select d.detail_date into target_date from public.assignments a join public.details d on d.id=a.detail_id where a.id=request_row.source_assignment_id and a.removed_at is null;
  if target_date is null then raise exception 'The original assignment is no longer available'; end if;
  return query
  select p.id,p.full_name,p.cadet_type::text,count(a.id) filter (where month_detail.detail_date>=date_trunc('month',target_date)::date and month_detail.detail_date<(date_trunc('month',target_date) + interval '1 month')::date)
  from public.profiles p
  left join public.assignments a on a.cadet_id=p.id and a.removed_at is null
  left join public.details month_detail on month_detail.id=a.detail_id
  where p.active and p.cadet_type=requester.cadet_type and p.id<>requester.id
    and not exists(select 1 from public.assignments same_day join public.details same_detail on same_detail.id=same_day.detail_id where same_day.cadet_id=p.id and same_day.removed_at is null and same_detail.detail_date=target_date)
  group by p.id,p.full_name,p.cadet_type order by count(a.id) filter (where month_detail.detail_date>=date_trunc('month',target_date)::date and month_detail.detail_date<(date_trunc('month',target_date) + interval '1 month')::date),p.full_name;
end $$;

create or replace function public.admin_assign_coverage_request(target_request_id uuid, target_cadet_id uuid, new_admin_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare request_row public.shift_requests%rowtype; source public.assignments%rowtype; requester public.profiles%rowtype;
  candidate public.profiles%rowtype; detail_row public.details%rowtype; replacement_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access is required'; end if;
  select * into request_row from public.shift_requests where id=target_request_id and request_type='COVERAGE'::public.request_type and status='OPEN'::public.request_status for update;
  if not found then raise exception 'This coverage request is no longer open'; end if;
  select * into source from public.assignments where id=request_row.source_assignment_id and removed_at is null for update;
  select * into requester from public.profiles where id=request_row.requester_id;
  select * into candidate from public.profiles where id=target_cadet_id and active;
  select * into detail_row from public.details where id=source.detail_id and not blocked;
  if not found or detail_row.detail_date<current_date then raise exception 'This detail is unavailable for placement'; end if;
  if candidate.cadet_type<>requester.cadet_type then raise exception 'Select an eligible ' || requester.cadet_type::text || ' for this coverage'; end if;
  if candidate.id=requester.id then raise exception 'The requester cannot cover their own assignment'; end if;
  if exists(select 1 from public.assignments a join public.details d on d.id=a.detail_id where a.cadet_id=candidate.id and a.removed_at is null and d.detail_date=detail_row.detail_date) then raise exception 'That cadet already has a flag-detail assignment on this day'; end if;
  update public.assignments set removed_at=now() where id=source.id;
  insert into public.assignments(detail_id,cadet_id,position,source,assigned_by) values(source.detail_id,candidate.id,source.position,'COVERAGE',auth.uid()) returning id into replacement_id;
  update public.shift_requests set status='APPROVED'::public.request_status,accepted_by=candidate.id,resolved_at=now(),resolved_by=auth.uid(),admin_note=nullif(trim(new_admin_note),'') where id=request_row.id;
  return replacement_id;
end $$;

grant execute on function public.get_coverage_requests(), public.get_my_coverage_eligible_assignments(), public.create_coverage_request(uuid,text), public.cancel_coverage_request(uuid), public.accept_coverage_request(uuid), public.get_coverage_assignment_candidates(uuid), public.admin_assign_coverage_request(uuid,uuid,text) to authenticated;
