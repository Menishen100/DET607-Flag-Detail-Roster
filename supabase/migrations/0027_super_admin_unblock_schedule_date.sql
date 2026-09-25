-- Only the Super Admin may reopen a previously blocked operational date.
-- Removed assignments remain historical; reopening makes current open slots
-- available for normal GMC/POC sign-up again.
create or replace function public.super_admin_unblock_schedule_date(target_date date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level = 'SUPER_ADMIN'
  ) then
    raise exception 'Super Admin access is required to unblock a date';
  end if;
  if extract(isodow from target_date) not between 1 and 5 then
    raise exception 'There is no flag detail on weekends';
  end if;
  update public.details
  set blocked = false, blocked_reason = null
  where detail_date = target_date and blocked = true;
  if not found then
    raise exception 'No blocked flag detail exists on this date';
  end if;
end $$;

grant execute on function public.super_admin_unblock_schedule_date(date) to authenticated;
notify pgrst, 'reload schema';
