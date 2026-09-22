-- Cadet classification and administrative authority are independent.
do $$ begin
  create type public.cadet_type as enum ('GMC', 'POC');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.admin_level as enum ('NONE', 'ADMIN', 'SUPER_ADMIN');
exception when duplicate_object then null; end $$;
alter table public.profiles add column if not exists cadet_type public.cadet_type;
alter table public.profiles add column if not exists admin_level public.admin_level not null default 'NONE';
update public.profiles set cadet_type = case when role = 'POC' then 'POC'::public.cadet_type else 'GMC'::public.cadet_type end where cadet_type is null;
update public.profiles set admin_level = case when role = 'SUPER_ADMIN' then 'SUPER_ADMIN'::public.admin_level when role = 'ADMIN' then 'ADMIN'::public.admin_level else 'NONE'::public.admin_level end;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and active and (cadet_type = 'POC' or admin_level in ('ADMIN','SUPER_ADMIN')))
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and active and admin_level in ('ADMIN','SUPER_ADMIN'))
$$;
drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (id uuid, full_name text, role public.user_role, active boolean, class_level smallint, cadet_type public.cadet_type, admin_level public.admin_level)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role, p.active, p.class_level, p.cadet_type, p.admin_level from public.profiles p where p.id = auth.uid()
$$;
grant execute on function public.get_my_profile() to authenticated;
