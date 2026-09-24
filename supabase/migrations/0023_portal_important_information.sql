create table if not exists public.portal_important_information (
  id boolean primary key default true check (id),
  contact_name text not null default 'C/Lt Col Fuller',
  contact_email text not null default 'tfuller8@broncos.uncfsu.edu',
  contact_discord text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.portal_important_information (id, contact_name, contact_email, contact_discord)
values (true, 'C/Lt Col Fuller', 'tfuller8@broncos.uncfsu.edu', 'pocsfinest_27028')
on conflict (id) do nothing;

alter table public.portal_important_information enable row level security;

create or replace function public.get_portal_important_information()
returns table (contact_name text, contact_email text, contact_discord text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'An active DET 607 roster account is required';
  end if;
  return query select p.contact_name, p.contact_email, p.contact_discord from public.portal_important_information p where p.id = true;
end $$;

create or replace function public.update_portal_important_information(
  new_contact_name text,
  new_contact_email text,
  new_contact_discord text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then
    raise exception 'Super Admin access is required';
  end if;
  if coalesce(trim(new_contact_name), '') = '' or coalesce(trim(new_contact_email), '') = '' then
    raise exception 'A contact name and email address are required';
  end if;
  if trim(new_contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid contact email address';
  end if;
  update public.portal_important_information
  set contact_name = trim(new_contact_name), contact_email = lower(trim(new_contact_email)),
      contact_discord = nullif(trim(coalesce(new_contact_discord, '')), ''), updated_by = auth.uid(), updated_at = now()
  where id = true;
end $$;

grant execute on function public.get_portal_important_information() to authenticated;
grant execute on function public.update_portal_important_information(text,text,text) to authenticated;
