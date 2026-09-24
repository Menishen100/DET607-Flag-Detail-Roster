-- Preserve the standard information as a starting template while allowing
-- authorized staff to keep every cadet-facing instruction current.
alter table public.portal_important_information
  add column if not exists reveille_title text not null default 'Reveille · 08:30',
  add column if not exists reveille_message text not null default 'Report by 08:25 in the Detachment Lounge.',
  add column if not exists retreat_title text not null default 'Retreat · 15:30',
  add column if not exists retreat_message text not null default 'Report by 15:25 in the Detachment Lounge.',
  add column if not exists dress_message text not null default 'Comply with DET 607 and AFI 36-2903 Dress and Appearance Standards during Flag Detail.',
  add column if not exists coverage_message text not null default 'You are responsible for finding a replacement if you cannot attend your scheduled slot.',
  add column if not exists missed_message text not null default 'Without coverage: verbal counseling for the first absence, written counseling for the second, and cadre counseling for further absences.',
  add column if not exists note_message text not null default 'Follow the time shown on your published shift if the schedule lists an exception.';

create or replace function public.get_portal_important_information_content()
returns jsonb
language plpgsql security definer set search_path = public as $$
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
    'missed_message', p.missed_message, 'note_message', p.note_message
  ) into information
  from public.portal_important_information p where p.id = true;
  return information;
end $$;

create or replace function public.admin_update_portal_important_information(
  new_contact_name text, new_contact_email text, new_contact_discord text,
  new_reveille_title text, new_reveille_message text,
  new_retreat_title text, new_retreat_message text,
  new_dress_message text, new_coverage_message text,
  new_missed_message text, new_note_message text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level in ('ADMIN', 'SUPER_ADMIN')
  ) then
    raise exception 'Administrator access is required';
  end if;
  if coalesce(trim(new_contact_name), '') = '' or coalesce(trim(new_contact_email), '') = ''
     or coalesce(trim(new_reveille_title), '') = '' or coalesce(trim(new_reveille_message), '') = ''
     or coalesce(trim(new_retreat_title), '') = '' or coalesce(trim(new_retreat_message), '') = ''
     or coalesce(trim(new_dress_message), '') = '' or coalesce(trim(new_coverage_message), '') = ''
     or coalesce(trim(new_missed_message), '') = '' or coalesce(trim(new_note_message), '') = '' then
    raise exception 'Complete every required information field';
  end if;
  if trim(new_contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid contact email address';
  end if;
  update public.portal_important_information set
    contact_name = trim(new_contact_name), contact_email = lower(trim(new_contact_email)),
    contact_discord = nullif(trim(coalesce(new_contact_discord, '')), ''),
    reveille_title = trim(new_reveille_title), reveille_message = trim(new_reveille_message),
    retreat_title = trim(new_retreat_title), retreat_message = trim(new_retreat_message),
    dress_message = trim(new_dress_message), coverage_message = trim(new_coverage_message),
    missed_message = trim(new_missed_message), note_message = trim(new_note_message),
    updated_by = auth.uid(), updated_at = now()
  where id = true;
end $$;

grant execute on function public.get_portal_important_information_content() to authenticated;
grant execute on function public.admin_update_portal_important_information(text, text, text, text, text, text, text, text, text, text, text) to authenticated;
notify pgrst, 'reload schema';
