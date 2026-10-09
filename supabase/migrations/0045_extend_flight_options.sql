-- Reserve additional flight names for future Det 607 roster growth.
alter table public.profiles drop constraint if exists profiles_flight_name_check;
alter table public.profiles add constraint profiles_flight_name_check check (
  flight_name is null or flight_name in (
    'Alpha Flight','Bravo Flight','Charlie Flight','Delta Flight',
    'Echo Flight','Foxtrot Flight','Golf Flight','POC Flight'
  )
);

create or replace function public.update_my_profile_details(
  new_phone text, new_class_level smallint, new_flight_name text, new_school_code text, new_other_school_name text
) returns table (phone text, class_level smallint, flight_name text, school_code text, other_school_name text)
language plpgsql security definer set search_path = public as $$
begin
  if new_class_level is not null and new_class_level not in (100,150,200,250,300,400,500,600) then raise exception 'Invalid class level'; end if;
  if new_flight_name is not null and new_flight_name not in ('Alpha Flight','Bravo Flight','Charlie Flight','Delta Flight','Echo Flight','Foxtrot Flight','Golf Flight','POC Flight') then raise exception 'Invalid flight'; end if;
  if new_school_code is not null and new_school_code not in ('FSU','UNCP','MU','FTCC','CU','OTHER') then raise exception 'Invalid school'; end if;
  if new_school_code = 'OTHER' and nullif(trim(new_other_school_name), '') is null then raise exception 'Enter the name of the other school'; end if;
  update public.profiles set phone = nullif(trim(new_phone), ''), class_level = new_class_level,
    flight_name = nullif(trim(new_flight_name), ''), school_code = nullif(trim(new_school_code), ''),
    other_school_name = case when new_school_code = 'OTHER' then nullif(trim(new_other_school_name), '') else null end
  where id = auth.uid();
  return query select p.phone, p.class_level, p.flight_name, p.school_code, p.other_school_name from public.profiles p where p.id = auth.uid();
end $$;

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
  if new_flight_name is not null and new_flight_name not in ('Alpha Flight','Bravo Flight','Charlie Flight','Delta Flight','Echo Flight','Foxtrot Flight','Golf Flight','POC Flight') then raise exception 'Invalid flight'; end if;
  if new_school_code is not null and new_school_code not in ('FSU','UNCP','MU','FTCC','CU','OTHER') then raise exception 'Invalid school'; end if;
  if new_school_code = 'OTHER' and nullif(trim(new_other_school_name), '') is null then raise exception 'Enter the name of the other school'; end if;
  update public.profiles set full_name = nullif(trim(new_name), ''), phone = nullif(trim(new_phone), ''), cadet_type = new_cadet_type,
    role = new_cadet_type::public.user_role,
    admin_level = case when new_cadet_type = 'GMC' then 'NONE'::public.admin_level else admin_level end,
    class_level = new_class_level, flight_name = nullif(trim(new_flight_name), ''), school_code = nullif(trim(new_school_code), ''),
    other_school_name = case when new_school_code = 'OTHER' then nullif(trim(new_other_school_name), '') else null end,
    active = new_active
  where id = target_id;
end $$;

grant execute on function public.update_my_profile_details(text,smallint,text,text,text) to authenticated;
grant execute on function public.admin_update_cadet_profile(uuid,text,text,public.cadet_type,smallint,text,text,text,boolean) to authenticated;
notify pgrst, 'reload schema';
