-- Super Admin-managed portal branding. The public bucket is needed because
-- the logo also appears before a cadet signs in; writes remain Super Admin-only.
alter table public.portal_important_information
  add column if not exists logo_url text;

create or replace function public.get_portal_important_information_content()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare information jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'An active DET 607 roster account is required';
  end if;
  select jsonb_build_object(
    'contact_name', p.contact_name, 'contact_email', p.contact_email, 'contact_discord', p.contact_discord,
    'reveille_title', p.reveille_title, 'reveille_message', p.reveille_message,
    'retreat_title', p.retreat_title, 'retreat_message', p.retreat_message,
    'dress_message', p.dress_message, 'coverage_message', p.coverage_message,
    'missed_message', p.missed_message, 'note_message', p.note_message,
    'logo_url', p.logo_url
  ) into information
  from public.portal_important_information p where p.id = true;
  return information;
end $$;

create or replace function public.super_admin_update_portal_logo(new_logo_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level = 'SUPER_ADMIN'
  ) then
    raise exception 'Super Admin access is required';
  end if;
  if nullif(trim(coalesce(new_logo_url, '')), '') is not null
     and trim(new_logo_url) !~ '^https://vudktftqguxfosadufdh\.supabase\.co/storage/v1/object/public/portal-branding/' then
    raise exception 'Logo must be stored in the DET 607 branding bucket';
  end if;
  update public.portal_important_information
  set logo_url = nullif(trim(coalesce(new_logo_url, '')), ''), updated_by = auth.uid(), updated_at = now()
  where id = true;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-branding', 'portal-branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "portal branding public read" on storage.objects;
create policy "portal branding public read"
on storage.objects for select
using (bucket_id = 'portal-branding');

drop policy if exists "portal branding super admin insert" on storage.objects;
create policy "portal branding super admin insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'portal-branding'
  and exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN')
);

drop policy if exists "portal branding super admin update" on storage.objects;
create policy "portal branding super admin update"
on storage.objects for update to authenticated
using (
  bucket_id = 'portal-branding'
  and exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN')
)
with check (
  bucket_id = 'portal-branding'
  and exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN')
);

grant execute on function public.super_admin_update_portal_logo(text) to authenticated;
notify pgrst, 'reload schema';
