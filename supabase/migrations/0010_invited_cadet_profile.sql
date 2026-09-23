-- Create the roster record after Supabase Auth creates an invited user.
-- SECURITY DEFINER keeps the table write scoped to active administrators.
create or replace function public.admin_create_invited_cadet_profile(
  target_id uuid, new_name text, new_email text, new_cadet_type public.cadet_type
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level in ('ADMIN', 'SUPER_ADMIN')
  ) then
    raise exception 'Administrator access is required';
  end if;

  insert into public.profiles (id, full_name, email, role, cadet_type, admin_level, active)
  values (target_id, nullif(trim(new_name), ''), lower(trim(new_email)), new_cadet_type, new_cadet_type, 'NONE', true)
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    cadet_type = excluded.cadet_type,
    active = true;
end $$;

grant execute on function public.admin_create_invited_cadet_profile(uuid,text,text,public.cadet_type) to authenticated;
