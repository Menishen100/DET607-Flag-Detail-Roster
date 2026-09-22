-- Cadets choose their own academic class level; roster visibility stays admin-only.
alter table public.profiles add column if not exists class_level smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_class_level_check') then
    alter table public.profiles add constraint profiles_class_level_check check (class_level is null or class_level in (100, 150, 200, 250, 300, 400, 500, 600));
  end if;
end $$;

drop policy if exists "profiles self or staff" on public.profiles;
create policy "profiles self or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (id uuid, full_name text, role public.user_role, active boolean, class_level smallint)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role, p.active, p.class_level from public.profiles p where p.id = auth.uid()
$$;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.update_my_class_level(new_class_level smallint)
returns table (id uuid, class_level smallint)
language plpgsql security definer set search_path = public as $$
begin
  if new_class_level is null or new_class_level not in (100, 150, 200, 250, 300, 400, 500, 600) then raise exception 'Invalid class level'; end if;
  update public.profiles set class_level = new_class_level where id = auth.uid();
  return query select p.id, p.class_level from public.profiles p where p.id = auth.uid();
end $$;
grant execute on function public.update_my_class_level(smallint) to authenticated;
