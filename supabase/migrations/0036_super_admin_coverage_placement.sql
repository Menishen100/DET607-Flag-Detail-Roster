-- Administrators can review every coverage or swap request. Manual placement
-- is reserved for the Super Admin; regular admins cannot change a roster.
create or replace function public.get_swap_requests()
returns table(id uuid, requester_id uuid, requester_name text, requester_type text, detail_date date, detail_type text, report_time time, ceremony_time time, reason text, status text, can_accept boolean)
language sql stable security definer set search_path=public as $$
  select r.id,p.id,p.full_name,p.cadet_type::text,d.detail_date,d.detail_type::text,d.report_time,d.ceremony_time,r.reason,r.status::text,
    (r.status='OPEN'::public.request_status and r.requester_id<>auth.uid() and p.cadet_type=(select cadet_type from public.profiles where id=auth.uid() and active) and exists(select 1 from public.assignments mine join public.details md on md.id=mine.detail_id where mine.cadet_id=auth.uid() and mine.removed_at is null and md.detail_date>=current_date and not md.blocked and md.detail_date<>d.detail_date))
  from public.shift_requests r join public.assignments a on a.id=r.source_assignment_id join public.details d on d.id=a.detail_id join public.profiles p on p.id=r.requester_id
  where r.request_type='SWAP'::public.request_type and (public.is_admin() or r.requester_id=auth.uid() or r.accepted_by=auth.uid() or (r.status='OPEN'::public.request_status and p.cadet_type=(select cadet_type from public.profiles where id=auth.uid() and active)))
  order by d.detail_date,d.ceremony_time;
$$;

create or replace function public.get_coverage_assignment_candidates(target_request_id uuid)
returns table(id uuid, full_name text, cadet_type text, monthly_shift_count bigint)
language plpgsql security definer set search_path=public as $$
declare request_row public.shift_requests%rowtype; requester public.profiles%rowtype; target_date date;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and active and admin_level='SUPER_ADMIN'::public.admin_level) then raise exception 'Super Admin access is required'; end if;
  select * into request_row from public.shift_requests where id=target_request_id and request_type='COVERAGE'::public.request_type and status='OPEN'::public.request_status;
  if not found then raise exception 'This coverage request is no longer open'; end if;
  select * into requester from public.profiles where id=request_row.requester_id;
  select d.detail_date into target_date from public.assignments a join public.details d on d.id=a.detail_id where a.id=request_row.source_assignment_id and a.removed_at is null;
  return query select p.id,p.full_name,p.cadet_type::text,count(a.id) from public.profiles p left join public.assignments a on a.cadet_id=p.id and a.removed_at is null left join public.details md on md.id=a.detail_id where p.active and p.cadet_type=requester.cadet_type and p.id<>requester.id and not exists(select 1 from public.assignments x join public.details xd on xd.id=x.detail_id where x.cadet_id=p.id and x.removed_at is null and xd.detail_date=target_date) group by p.id,p.full_name,p.cadet_type order by count(a.id),p.full_name;
end $$;

create or replace function public.admin_assign_coverage_request(target_request_id uuid,target_cadet_id uuid,new_admin_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare req public.shift_requests%rowtype; source_row public.assignments%rowtype; requester public.profiles%rowtype; candidate public.profiles%rowtype; target_detail public.details%rowtype; replacement uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and active and admin_level='SUPER_ADMIN'::public.admin_level) then raise exception 'Super Admin access is required'; end if;
  select * into req from public.shift_requests where id=target_request_id and request_type='COVERAGE'::public.request_type and status='OPEN'::public.request_status for update;
  if not found then raise exception 'This coverage request is no longer open'; end if;
  select * into source_row from public.assignments where id=req.source_assignment_id and removed_at is null for update;
  select * into requester from public.profiles where id=req.requester_id;
  select * into candidate from public.profiles where id=target_cadet_id and active;
  if not found or candidate.cadet_type<>requester.cadet_type then raise exception 'Choose an active cadet with the matching classification'; end if;
  select * into target_detail from public.details where id=source_row.detail_id and not blocked;
  if not found or target_detail.detail_date<current_date then raise exception 'This detail is unavailable for placement'; end if;
  if exists(select 1 from public.assignments a join public.details d on d.id=a.detail_id where a.cadet_id=candidate.id and a.removed_at is null and d.detail_date=target_detail.detail_date) then raise exception 'That cadet already has a flag detail on this day'; end if;
  update public.assignments set removed_at=now() where id=source_row.id;
  insert into public.assignments(detail_id,cadet_id,position,source,assigned_by) values(source_row.detail_id,candidate.id,source_row.position,'COVERAGE',auth.uid()) returning id into replacement;
  update public.shift_requests set status='APPROVED'::public.request_status,accepted_by=candidate.id,resolved_at=now(),resolved_by=auth.uid(),admin_note=nullif(trim(new_admin_note),'') where id=req.id;
  return replacement;
end $$;

grant execute on function public.get_swap_requests(),public.get_coverage_assignment_candidates(uuid),public.admin_assign_coverage_request(uuid,uuid,text) to authenticated;
