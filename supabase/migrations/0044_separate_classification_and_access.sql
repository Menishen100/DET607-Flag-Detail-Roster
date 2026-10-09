-- Classification and portal access are independent:
--   classification: GMC, POC, or CADRE
--   access: User (NONE), Admin, or Super Admin
-- GMC accounts always remain User accounts. POC and Cadre accounts may hold
-- User, Admin, or Super Admin access.

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

  update public.profiles set
    full_name = nullif(trim(new_name), ''),
    phone = nullif(trim(new_phone), ''),
    cadet_type = new_cadet_type,
    -- Keep the legacy display field synchronized with classification only.
    role = new_cadet_type::public.user_role,
    admin_level = case when new_cadet_type = 'GMC' then 'NONE'::public.admin_level else admin_level end,
    class_level = new_class_level,
    flight_name = nullif(trim(new_flight_name), ''),
    school_code = nullif(trim(new_school_code), ''),
    other_school_name = case when new_school_code = 'OTHER' then nullif(trim(new_other_school_name), '') else null end,
    active = new_active
  where id = target_id;
end $$;

create or replace function public.super_admin_update_account_access(
  target_id uuid,
  new_admin_level public.admin_level
)
returns void language plpgsql security definer set search_path = public as $$
declare target_classification public.cadet_type;
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
  select cadet_type into target_classification from public.profiles where id = target_id;
  if not found then raise exception 'Roster account not found'; end if;
  if target_classification = 'GMC' and new_admin_level <> 'NONE' then
    raise exception 'GMC accounts always use User access. Change the classification to POC or Cadre before granting administrative access.';
  end if;
  update public.profiles set admin_level = new_admin_level where id = target_id;
end $$;

-- Make the policy true for existing accounts as well.
update public.profiles
set admin_level = 'NONE'::public.admin_level
where cadet_type = 'GMC' and admin_level <> 'NONE';

grant execute on function public.admin_update_cadet_profile(uuid,text,text,public.cadet_type,smallint,text,text,text,boolean) to authenticated;
grant execute on function public.super_admin_update_account_access(uuid, public.admin_level) to authenticated;
notify pgrst, 'reload schema';
