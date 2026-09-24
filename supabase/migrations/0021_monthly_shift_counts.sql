-- Staff can see workload counts for the active roster; cadets can see only their own.
create or replace function public.get_monthly_shift_counts(target_month date)
returns table (cadet_id uuid, shift_count integer)
language plpgsql security definer set search_path = public as $$
declare month_start date := date_trunc('month', target_month)::date;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'An active DET 607 roster account is required';
  end if;

  return query
  select a.cadet_id, count(*)::integer
  from public.assignments a
  join public.details d on d.id = a.detail_id
  where a.removed_at is null
    and d.detail_date >= month_start
    and d.detail_date < (month_start + interval '1 month')::date
    and (public.is_admin() or a.cadet_id = auth.uid())
  group by a.cadet_id;
end $$;

grant execute on function public.get_monthly_shift_counts(date) to authenticated;
