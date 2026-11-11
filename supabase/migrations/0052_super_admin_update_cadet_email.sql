-- The browser must never hold an Auth secret. This RPC updates the roster
-- copy after the trusted Edge Function changes the matching Auth identity.
create or replace function public.super_admin_update_cadet_email(target_id uuid, new_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare normalized_email text := lower(trim(new_email));
declare saved_email text;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level = 'SUPER_ADMIN'
  ) then
    raise exception 'Super Admin access is required';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if exists (select 1 from public.profiles where email = normalized_email and id <> target_id) then
    raise exception 'That email address is already assigned to another roster account';
  end if;

  update public.profiles
  set email = normalized_email
  where id = target_id
  returning email into saved_email;
  if not found then raise exception 'Roster account not found'; end if;
  return saved_email;
end;
$$;

grant execute on function public.super_admin_update_cadet_email(uuid, text) to authenticated;
notify pgrst, 'reload schema';
