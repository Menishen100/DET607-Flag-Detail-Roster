-- Store one consistent contact format and refuse placeholder, incomplete, or
-- non-numeric phone values regardless of which profile screen submits them.
create or replace function public.normalize_us_phone(input_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g');
begin
  if length(digits) = 11 and left(digits, 1) = '1' then
    digits := substr(digits, 2);
  end if;
  if length(digits) <> 10 then
    raise exception 'Enter a valid 10-digit U.S. phone number';
  end if;
  return substr(digits, 1, 3) || '-' || substr(digits, 4, 3) || '-' || substr(digits, 7, 4);
end;
$$;

create or replace function public.update_my_profile_details(
  new_phone text, new_class_level smallint, new_flight_name text, new_school_code text, new_other_school_name text
) returns table (phone text, class_level smallint, flight_name text, school_code text, other_school_name text)
language plpgsql security definer set search_path = public as $$
declare normalized_phone text := public.normalize_us_phone(new_phone);
begin
  if new_class_level is not null and new_class_level not in (100,150,200,250,300,400,500,600) then raise exception 'Invalid class level'; end if;
  if new_flight_name is not null and new_flight_name not in ('Alpha Flight','Bravo Flight','Charlie Flight','Delta Flight','Echo Flight','Foxtrot Flight','Golf Flight','POC Flight') then raise exception 'Invalid flight'; end if;
  if new_school_code is not null and new_school_code not in ('FSU','UNCP','MU','FTCC','CU','OTHER') then raise exception 'Invalid school'; end if;
  if new_school_code = 'OTHER' and nullif(trim(new_other_school_name), '') is null then raise exception 'Enter the name of the other school'; end if;

  update public.profiles set phone = normalized_phone, class_level = new_class_level,
    flight_name = nullif(trim(new_flight_name), ''), school_code = nullif(trim(new_school_code), ''),
    other_school_name = case when new_school_code = 'OTHER' then nullif(trim(new_other_school_name), '') else null end
  where id = auth.uid();
  return query select p.phone, p.class_level, p.flight_name, p.school_code, p.other_school_name from public.profiles p where p.id = auth.uid();
end $$;

create or replace function public.admin_update_cadet_profile(
  target_id uuid, new_name text, new_phone text, new_cadet_type public.cadet_type, new_class_level smallint,
  new_flight_name text, new_school_code text, new_other_school_name text, new_active boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller_level public.admin_level;
  target_level public.admin_level;
  normalized_phone text;
begin
  select admin_level into caller_level from public.profiles where id = auth.uid() and active;
  if caller_level not in ('ADMIN','SUPER_ADMIN') then raise exception 'Administrator access is required'; end if;

  if not new_active and nullif(trim(new_phone), '') is null then
    normalized_phone := null;
  else
    normalized_phone := public.normalize_us_phone(new_phone);
  end if;

  select admin_level into target_level from public.profiles where id = target_id;
  if not found then raise exception 'Roster account not found'; end if;
  if caller_level = 'ADMIN' and target_level = 'SUPER_ADMIN' then raise exception 'Admins cannot manage Super Admin accounts'; end if;
  if new_class_level is not null and new_class_level not in (100,150,200,250,300,400,500,600) then raise exception 'Invalid class level'; end if;
  if new_flight_name is not null and new_flight_name not in ('Alpha Flight','Bravo Flight','Charlie Flight','Delta Flight','Echo Flight','Foxtrot Flight','Golf Flight','POC Flight') then raise exception 'Invalid flight'; end if;
  if new_school_code is not null and new_school_code not in ('FSU','UNCP','MU','FTCC','CU','OTHER') then raise exception 'Invalid school'; end if;
  if new_school_code = 'OTHER' and nullif(trim(new_other_school_name), '') is null then raise exception 'Enter the name of the other school'; end if;

  update public.profiles set
    full_name = nullif(trim(new_name), ''),
    phone = normalized_phone,
    cadet_type = new_cadet_type,
    role = case new_cadet_type
      when 'GMC' then 'GMC'::public.user_role
      when 'POC' then 'POC'::public.user_role
      when 'CADRE' then 'CADRE'::public.user_role
    end,
    admin_level = case when new_cadet_type = 'GMC' then 'NONE'::public.admin_level else admin_level end,
    class_level = new_class_level,
    flight_name = nullif(trim(new_flight_name), ''),
    school_code = nullif(trim(new_school_code), ''),
    other_school_name = case when new_school_code = 'OTHER' then nullif(trim(new_other_school_name), '') else null end,
    active = new_active
  where id = target_id;
end $$;

grant execute on function public.update_my_profile_details(text,smallint,text,text,text) to authenticated;
grant execute on function public.admin_update_cadet_profile(uuid,text,text,public.cadet_type,smallint,text,text,text,boolean) to authenticated;
notify pgrst, 'reload schema';
