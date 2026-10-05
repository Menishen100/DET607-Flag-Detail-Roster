-- A swap exchanges two active assignments atomically. It is intentionally
-- separate from coverage: neither cadet loses a shift, and only matching GMC
-- or POC classifications can see or accept an open offer.
create or replace function public.get_my_swap_eligible_assignments()
returns table(assignment_id uuid, detail_date date, detail_type text, report_time time, ceremony_time time)
language sql stable security definer set search_path=public as $$
  select a.id,d.detail_date,d.detail_type::text,d.report_time,d.ceremony_time
  from public.assignments a join public.details d on d.id=a.detail_id join public.schedules s on s.id=d.schedule_id
  where a.cadet_id=auth.uid() and a.removed_at is null and s.status='PUBLISHED' and not d.blocked and d.detail_date>=current_date
    and not exists(select 1 from public.shift_requests r where r.source_assignment_id=a.id and r.request_type='SWAP'::public.request_type and r.status='OPEN'::public.request_status)
  order by d.detail_date,d.ceremony_time;
$$;

create or replace function public.create_swap_request(target_assignment_id uuid, request_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare source_row public.assignments%rowtype; detail_row public.details%rowtype; request_id uuid;
begin
  if nullif(trim(request_reason),'') is null then raise exception 'A brief swap reason is required'; end if;
  select * into source_row from public.assignments where id=target_assignment_id and cadet_id=auth.uid() and removed_at is null;
  if not found then raise exception 'You may offer only your own active assignment'; end if;
  select * into detail_row from public.details where id=source_row.detail_id and not blocked;
  if not found or detail_row.detail_date<current_date then raise exception 'Only available current or future shifts can be offered'; end if;
  if exists(select 1 from public.shift_requests where source_assignment_id=source_row.id and request_type='SWAP'::public.request_type and status='OPEN'::public.request_status) then raise exception 'A swap request is already open for this shift'; end if;
  insert into public.shift_requests(request_type,requester_id,source_assignment_id,status,reason) values('SWAP'::public.request_type,auth.uid(),source_row.id,'OPEN'::public.request_status,trim(request_reason)) returning id into request_id;
  return request_id;
end $$;

create or replace function public.get_swap_requests()
returns table(id uuid, requester_id uuid, requester_name text, requester_type text, detail_date date, detail_type text, report_time time, ceremony_time time, reason text, status text, can_accept boolean)
language sql stable security definer set search_path=public as $$
  select r.id,p.id,p.full_name,p.cadet_type::text,d.detail_date,d.detail_type::text,d.report_time,d.ceremony_time,r.reason,r.status::text,
    (r.status='OPEN'::public.request_status and r.requester_id<>auth.uid() and p.cadet_type=(select cadet_type from public.profiles where id=auth.uid() and active) and exists(select 1 from public.assignments mine join public.details mine_detail on mine_detail.id=mine.detail_id where mine.cadet_id=auth.uid() and mine.removed_at is null and mine_detail.detail_date>=current_date and not mine_detail.blocked and mine_detail.detail_date<>d.detail_date))
  from public.shift_requests r join public.assignments a on a.id=r.source_assignment_id join public.details d on d.id=a.detail_id join public.profiles p on p.id=r.requester_id
  where r.request_type='SWAP'::public.request_type and (r.requester_id=auth.uid() or r.accepted_by=auth.uid() or (r.status='OPEN'::public.request_status and p.cadet_type=(select cadet_type from public.profiles where id=auth.uid() and active)))
  order by case when r.status='OPEN'::public.request_status then 0 else 1 end,d.detail_date,d.ceremony_time;
$$;

create or replace function public.get_my_swap_offer_assignments(target_request_id uuid)
returns table(assignment_id uuid, detail_date date, detail_type text, report_time time, ceremony_time time)
language plpgsql security definer set search_path=public as $$
declare req public.shift_requests%rowtype; requester public.profiles%rowtype; requested_date date;
begin
  select * into req from public.shift_requests where id=target_request_id and request_type='SWAP'::public.request_type and status='OPEN'::public.request_status;
  if not found then raise exception 'This swap request is no longer open'; end if;
  select * into requester from public.profiles where id=req.requester_id;
  select d.detail_date into requested_date from public.assignments a join public.details d on d.id=a.detail_id where a.id=req.source_assignment_id and a.removed_at is null;
  if requester.cadet_type<>(select cadet_type from public.profiles where id=auth.uid() and active) then raise exception 'Only a matching cadet classification may offer a swap'; end if;
  return query select a.id,d.detail_date,d.detail_type::text,d.report_time,d.ceremony_time from public.assignments a join public.details d on d.id=a.detail_id where a.cadet_id=auth.uid() and a.removed_at is null and not d.blocked and d.detail_date>=current_date and d.detail_date<>requested_date order by d.detail_date,d.ceremony_time;
end $$;

create or replace function public.accept_swap_request(target_request_id uuid, offered_assignment_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare req public.shift_requests%rowtype; source_row public.assignments%rowtype; offered_row public.assignments%rowtype; requester public.profiles%rowtype; actor public.profiles%rowtype; source_date date; offered_date date;
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  select * into req from public.shift_requests where id=target_request_id and request_type='SWAP'::public.request_type and status='OPEN'::public.request_status for update;
  if not found or req.requester_id=auth.uid() then raise exception 'This swap request is unavailable'; end if;
  select * into requester from public.profiles where id=req.requester_id and active;
  if requester.cadet_type<>actor.cadet_type then raise exception 'Only a matching cadet classification may accept this swap'; end if;
  select * into source_row from public.assignments where id=req.source_assignment_id and removed_at is null for update;
  select * into offered_row from public.assignments where id=offered_assignment_id and cadet_id=auth.uid() and removed_at is null for update;
  if not found then raise exception 'Choose one of your own active assignments'; end if;
  select detail_date into source_date from public.details where id=source_row.detail_id and not blocked;
  select detail_date into offered_date from public.details where id=offered_row.detail_id and not blocked;
  if source_date is null or offered_date is null or source_date<current_date or offered_date<current_date or source_date=offered_date then raise exception 'Both shifts must be available future shifts on different days'; end if;
  if source_row.position<>offered_row.position then raise exception 'Swap assignments must have the same position type'; end if;
  update public.assignments set cadet_id=actor.id,source='SWAP',assigned_by=actor.id,assigned_at=now() where id=source_row.id;
  update public.assignments set cadet_id=requester.id,source='SWAP',assigned_by=actor.id,assigned_at=now() where id=offered_row.id;
  update public.shift_requests set status='ACCEPTED'::public.request_status,accepted_by=actor.id,resolved_at=now(),resolved_by=actor.id where id=req.id;
end $$;

create or replace function public.cancel_swap_request(target_request_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin update public.shift_requests set status='CANCELLED'::public.request_status,resolved_at=now(),resolved_by=auth.uid() where id=target_request_id and request_type='SWAP'::public.request_type and status='OPEN'::public.request_status and requester_id=auth.uid(); if not found then raise exception 'Only the requester may cancel an open swap'; end if; end $$;

grant execute on function public.get_my_swap_eligible_assignments(),public.create_swap_request(uuid,text),public.get_swap_requests(),public.get_my_swap_offer_assignments(uuid),public.accept_swap_request(uuid,uuid),public.cancel_swap_request(uuid) to authenticated;
