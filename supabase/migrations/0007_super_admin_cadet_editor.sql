alter table public.profiles add column if not exists phone text;
create or replace function public.update_cadet_profile(
  target_id uuid, new_name text, new_phone text, new_cadet_type public.cadet_type,
  new_class_level smallint, new_admin_level public.admin_level, new_active boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then
    raise exception 'Super Admin access is required';
  end if;
  if new_class_level is not null and new_class_level not in (100,150,200,250,300,400,500,600) then raise exception 'Invalid class level'; end if;
  update public.profiles set full_name=new_name, phone=nullif(new_phone,''), cadet_type=new_cadet_type,
    class_level=new_class_level, admin_level=new_admin_level, active=new_active where id=target_id;
end $$;
grant execute on function public.update_cadet_profile(uuid,text,text,public.cadet_type,smallint,public.admin_level,boolean) to authenticated;
