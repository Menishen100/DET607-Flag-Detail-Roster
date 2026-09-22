-- Safe bootstrap/read path for the browser: it can return only the caller's profile.
create or replace function public.get_my_profile()
returns table (id uuid, full_name text, role public.user_role, active boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role, p.active
  from public.profiles p
  where p.id = auth.uid()
$$;

grant execute on function public.get_my_profile() to authenticated;
