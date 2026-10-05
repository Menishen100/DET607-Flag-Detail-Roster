-- The output column named "id" in this table-returning function is also a
-- PL/pgSQL variable.  Qualify every table column so PostgreSQL does not treat
-- a profile/request id reference as ambiguous when the Super Admin opens the
-- placement picker.
create or replace function public.get_coverage_assignment_candidates(target_request_id uuid)
returns table(id uuid, full_name text, cadet_type text, monthly_shift_count bigint)
language plpgsql security definer set search_path=public as $$
declare request_row public.shift_requests%rowtype; requester public.profiles%rowtype; target_date date;
begin
  if not exists(
    select 1 from public.profiles caller
    where caller.id=auth.uid() and caller.active and caller.admin_level='SUPER_ADMIN'::public.admin_level
  ) then
    raise exception 'Super Admin access is required';
  end if;

  select * into request_row
  from public.shift_requests request_item
  where request_item.id=target_request_id
    and request_item.request_type='COVERAGE'::public.request_type
    and request_item.status='OPEN'::public.request_status;
  if not found then raise exception 'This coverage request is no longer open'; end if;

  select * into requester from public.profiles requester_profile where requester_profile.id=request_row.requester_id;
  select detail.detail_date into target_date
  from public.assignments assignment_item
  join public.details detail on detail.id=assignment_item.detail_id
  where assignment_item.id=request_row.source_assignment_id and assignment_item.removed_at is null;
  if target_date is null then raise exception 'The original assignment is no longer available'; end if;

  return query
  select candidate.id, candidate.full_name, candidate.cadet_type::text,
    count(active_assignment.id) filter (
      where month_detail.detail_date>=date_trunc('month',target_date)::date
        and month_detail.detail_date<(date_trunc('month',target_date) + interval '1 month')::date
    )
  from public.profiles candidate
  left join public.assignments active_assignment on active_assignment.cadet_id=candidate.id and active_assignment.removed_at is null
  left join public.details month_detail on month_detail.id=active_assignment.detail_id
  where candidate.active
    and candidate.cadet_type=requester.cadet_type
    and candidate.id<>requester.id
    and not exists(
      select 1 from public.assignments same_day_assignment
      join public.details same_day_detail on same_day_detail.id=same_day_assignment.detail_id
      where same_day_assignment.cadet_id=candidate.id
        and same_day_assignment.removed_at is null
        and same_day_detail.detail_date=target_date
    )
  group by candidate.id,candidate.full_name,candidate.cadet_type
  order by count(active_assignment.id) filter (
    where month_detail.detail_date>=date_trunc('month',target_date)::date
      and month_detail.detail_date<(date_trunc('month',target_date) + interval '1 month')::date
  ), candidate.full_name;
end $$;

grant execute on function public.get_coverage_assignment_candidates(uuid) to authenticated;
