-- Track whether an invited cadet has completed first sign-in/onboarding.
alter table public.profiles add column if not exists onboarding_complete boolean not null default false;
alter table public.profiles add column if not exists invited_at timestamptz not null default now();

create or replace function public.complete_my_onboarding()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
  set onboarding_complete = true
  where id = auth.uid() and active;
end $$;

grant execute on function public.complete_my_onboarding() to authenticated;

-- Re-sending an invitation puts the record back into a pending state.
create or replace function public.admin_create_invited_cadet_profile(
  target_id uuid, new_name text, new_email text, new_cadet_type public.cadet_type
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level in ('ADMIN', 'SUPER_ADMIN')
  ) then
    raise exception 'Administrator access is required';
  end if;

  insert into public.profiles (id, full_name, email, role, cadet_type, admin_level, active, onboarding_complete, invited_at)
  values (target_id, nullif(trim(new_name), ''), lower(trim(new_email)), new_cadet_type, new_cadet_type, 'NONE', true, false, now())
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    cadet_type = excluded.cadet_type,
    active = true,
    onboarding_complete = false,
    invited_at = now();
end $$;

create or replace function public.admin_delete_pending_invite(target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level in ('ADMIN', 'SUPER_ADMIN')
  ) then
    raise exception 'Administrator access is required';
  end if;

  delete from public.profiles
  where id = target_id and onboarding_complete = false;

  if not found then
    raise exception 'Only a pending invitation can be deleted';
  end if;
end $$;

grant execute on function public.admin_delete_pending_invite(uuid) to authenticated;
