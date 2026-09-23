create or replace function public.super_admin_remove_cadet(target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then raise exception 'Super Admin access is required'; end if;
  if target_id = auth.uid() then raise exception 'You cannot remove your own Super Admin account'; end if;
  update public.profiles set active = false, email = 'removed-' || target_id::text || '@deleted.det607flagdetail.invalid', onboarding_complete = false where id = target_id;
  if not found then raise exception 'Cadet record was not found'; end if;
end $$;
grant execute on function public.super_admin_remove_cadet(uuid) to authenticated;
