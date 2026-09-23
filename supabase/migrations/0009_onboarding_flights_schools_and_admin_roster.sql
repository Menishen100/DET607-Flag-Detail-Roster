-- Cadet onboarding information. Use school acronyms to keep roster displays compact.
alter table public.profiles add column if not exists flight_name text;
alter table public.profiles add column if not exists school_code text;
alter table public.profiles add column if not exists other_school_name text;
alter table public.profiles drop constraint if exists profiles_flight_name_check;
alter table public.profiles add constraint profiles_flight_name_check check (flight_name is null or flight_name in ('Alpha Flight','Bravo Flight','Charlie Flight','Delta Flight','POC Flight'));
alter table public.profiles drop constraint if exists profiles_school_code_check;
alter table public.profiles add constraint profiles_school_code_check check (school_code is null or school_code in ('FSU','UNCP','MU','FTCC','CU','OTHER'));
alter table public.profiles drop constraint if exists profiles_other_school_check;
alter table public.profiles add constraint profiles_other_school_check check (school_code is distinct from 'OTHER' or nullif(trim(other_school_name), '') is not null);

create or replace function public.update_my_profile_details(
  new_phone text, new_class_level smallint, new_flight_name text, new_school_code text, new_other_school_name text
) returns table (phone text, class_level smallint, flight_name text, school_code text, other_school_name text)
language plpgsql security definer set search_path = public as $$
begin
  if new_class_level is not null and new_class_level not in (100,150,200,250,300,400,500,600) then raise exception 'Invalid class level'; end if;
  if new_flight_name is not null and new_flight_name not in ('Alpha Flight','Bravo Flight','Charlie Flight','Delta Flight','POC Flight') then raise exception 'Invalid flight'; end if;
  if new_school_code is not null and new_school_code not in ('FSU','UNCP','MU','FTCC','CU','OTHER') then raise exception 'Invalid school'; end if;
  if new_school_code = 'OTHER' and nullif(trim(new_other_school_name), '') is null then raise exception 'Enter the name of the other school'; end if;
  update public.profiles set phone = nullif(trim(new_phone), ''), class_level = new_class_level,
    flight_name = nullif(trim(new_flight_name), ''), school_code = nullif(trim(new_school_code), ''),
    other_school_name = case when new_school_code = 'OTHER' then nullif(trim(new_other_school_name), '') else null end
  where id = auth.uid();
  return query select p.phone, p.class_level, p.flight_name, p.school_code, p.other_school_name from public.profiles p where p.id = auth.uid();
end $$;
grant execute on function public.update_my_profile_details(text,smallint,text,text,text) to authenticated;

create or replace function public.admin_update_cadet_profile(
  target_id uuid, new_name text, new_phone text, new_cadet_type public.cadet_type, new_class_level smallint,
  new_flight_name text, new_school_code text, new_other_school_name text, new_active boolean
) returns void language plpgsql security definer set search_path = public as $$
declare caller_level public.admin_level; target_level public.admin_level;
begin
  select admin_level into caller_level from public.profiles where id = auth.uid() and active;
  if caller_level not in ('ADMIN','SUPER_ADMIN') then raise exception 'Administrator access is required'; end if;
  select admin_level into target_level from public.profiles where id = target_id;
  if caller_level = 'ADMIN' and target_level = 'SUPER_ADMIN' then raise exception 'Admins cannot manage Super Admin accounts'; end if;
  if new_class_level is not null and new_class_level not in (100,150,200,250,300,400,500,600) then raise exception 'Invalid class level'; end if;
  if new_flight_name is not null and new_flight_name not in ('Alpha Flight','Bravo Flight','Charlie Flight','Delta Flight','POC Flight') then raise exception 'Invalid flight'; end if;
  if new_school_code is not null and new_school_code not in ('FSU','UNCP','MU','FTCC','CU','OTHER') then raise exception 'Invalid school'; end if;
  if new_school_code = 'OTHER' and nullif(trim(new_other_school_name), '') is null then raise exception 'Enter the name of the other school'; end if;
  update public.profiles set full_name = nullif(trim(new_name), ''), phone = nullif(trim(new_phone), ''), cadet_type = new_cadet_type,
    class_level = new_class_level, flight_name = nullif(trim(new_flight_name), ''), school_code = nullif(trim(new_school_code), ''),
    other_school_name = case when new_school_code = 'OTHER' then nullif(trim(new_other_school_name), '') else null end,
    active = new_active
  where id = target_id;
end $$;
grant execute on function public.admin_update_cadet_profile(uuid,text,text,public.cadet_type,smallint,text,text,text,boolean) to authenticated;

drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (id uuid, full_name text, role public.user_role, active boolean, class_level smallint, cadet_type public.cadet_type, admin_level public.admin_level, phone text, flight_name text, school_code text, other_school_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role, p.active, p.class_level, p.cadet_type, p.admin_level, p.phone, p.flight_name, p.school_code, p.other_school_name
  from public.profiles p where p.id = auth.uid()
$$;
grant execute on function public.get_my_profile() to authenticated;
