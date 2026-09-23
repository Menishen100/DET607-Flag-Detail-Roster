-- Administrators may remove an operational date while retaining assignment history.
create or replace function public.admin_block_schedule_date(target_date date, block_reason text)
returns table (removed_assignments integer, recipient_ids uuid[], event_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  recipients uuid[];
  removed_count integer;
  block_event uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'Administrator access is required to block a date'; end if;
  if extract(isodow from target_date) not between 1 and 5 then raise exception 'There is no flag detail on weekends'; end if;
  if nullif(trim(block_reason), '') is null then raise exception 'A blocking reason is required'; end if;
  if not exists (select 1 from public.details where detail_date = target_date) then raise exception 'No flag details exist on this date'; end if;

  select coalesce(array_agg(distinct a.cadet_id), array[]::uuid[]) into recipients
  from public.assignments a join public.details d on d.id = a.detail_id
  where d.detail_date = target_date and a.removed_at is null;

  update public.assignments a set removed_at = now()
  from public.details d
  where d.id = a.detail_id and d.detail_date = target_date and a.removed_at is null;
  get diagnostics removed_count = row_count;

  update public.details set blocked = true, blocked_reason = trim(block_reason) where detail_date = target_date;
  return query select removed_count, recipients, block_event;
end $$;

grant execute on function public.admin_block_schedule_date(date, text) to authenticated;
