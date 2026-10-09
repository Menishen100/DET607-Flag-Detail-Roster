-- Only a Super Admin can grant or revoke portal administrator access. The
-- caller cannot remove their own access through this control.
create or replace function public.super_admin_update_account_access(
  target_id uuid,
  new_admin_level public.admin_level
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level = 'SUPER_ADMIN'
  ) then
    raise exception 'Super Admin access is required';
  end if;
  if target_id = auth.uid() then
    raise exception 'Use another Super Admin to change your own access';
  end if;
  if not exists (select 1 from public.profiles where id = target_id) then
    raise exception 'Roster account not found';
  end if;
  update public.profiles set admin_level = new_admin_level where id = target_id;
end $$;

grant execute on function public.super_admin_update_account_access(uuid, public.admin_level) to authenticated;
notify pgrst, 'reload schema';
