-- Keep name changes independent from the broader roster-profile update so an
-- administrator can always correct a displayed name without changing role,
-- class level, flight, school, or account status.
create or replace function public.admin_update_cadet_name(target_id uuid, new_name text)
returns text language plpgsql security definer set search_path = public as $$
declare caller_level public.admin_level;
declare target_level public.admin_level;
declare saved_name text;
begin
  select admin_level into caller_level
  from public.profiles
  where id = auth.uid() and active;

  if caller_level not in ('ADMIN', 'SUPER_ADMIN') then
    raise exception 'Administrator access is required';
  end if;

  select admin_level into target_level from public.profiles where id = target_id;
  if not found then
    raise exception 'Roster account not found';
  end if;
  if caller_level = 'ADMIN' and target_level = 'SUPER_ADMIN' then
    raise exception 'Admins cannot manage Super Admin accounts';
  end if;
  if nullif(trim(new_name), '') is null then
    raise exception 'A full name is required';
  end if;

  update public.profiles
  set full_name = trim(new_name)
  where id = target_id
  returning full_name into saved_name;

  return saved_name;
end $$;

create or replace function public.update_my_profile_name(new_name text)
returns text language plpgsql security definer set search_path = public as $$
declare saved_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;
  if nullif(trim(new_name), '') is null then
    raise exception 'A full name is required';
  end if;

  update public.profiles
  set full_name = trim(new_name)
  where id = auth.uid()
  returning full_name into saved_name;

  return saved_name;
end $$;

grant execute on function public.admin_update_cadet_name(uuid, text) to authenticated;
grant execute on function public.update_my_profile_name(text) to authenticated;
notify pgrst, 'reload schema';
