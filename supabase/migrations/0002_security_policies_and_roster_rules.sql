-- Follow-up migration: run after 0001 when the base tables were created manually.
-- It makes policy creation repeatable and preserves the operational rule of three
-- GMC cadets plus one POC lead for each active detail.

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('SUPER_ADMIN', 'ADMIN', 'POC')
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('SUPER_ADMIN', 'ADMIN')
  )
$$;

create or replace function public.enforce_detail_assignment_rules()
returns trigger language plpgsql set search_path = public as $$
declare
  active_cadet_count integer;
  cadet_role public.user_role;
begin
  if new.removed_at is not null then
    return new;
  end if;

  select role into cadet_role from public.profiles where id = new.cadet_id;
  if new.position = 'POC_LEAD' and cadet_role not in ('POC', 'ADMIN', 'SUPER_ADMIN') then
    raise exception 'Only a POC, admin, or super admin can lead a detail';
  end if;
  if new.position = 'CADET' and cadet_role <> 'GMC' then
    raise exception 'Cadet positions may only be assigned to GMC cadets';
  end if;

  if new.position = 'CADET' then
    select count(*) into active_cadet_count
    from public.assignments
    where detail_id = new.detail_id
      and position = 'CADET'
      and removed_at is null
      and id is distinct from new.id;
    if active_cadet_count >= 3 then
      raise exception 'A detail may have no more than three active cadet assignments';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists enforce_detail_assignment_rules on public.assignments;
create trigger enforce_detail_assignment_rules
before insert or update of detail_id, cadet_id, position, removed_at on public.assignments
for each row execute function public.enforce_detail_assignment_rules();

drop policy if exists "profiles self or staff" on public.profiles;
drop policy if exists "profiles admin management" on public.profiles;
drop policy if exists "schedules signed in read" on public.schedules;
drop policy if exists "schedules admin management" on public.schedules;
drop policy if exists "details signed in read" on public.details;
drop policy if exists "details admin management" on public.details;
drop policy if exists "assignments self or staff" on public.assignments;
drop policy if exists "assignments staff management" on public.assignments;
drop policy if exists "attendance self or staff" on public.attendance;
drop policy if exists "attendance staff management" on public.attendance;
drop policy if exists "requests self or staff" on public.shift_requests;
drop policy if exists "requests own insert" on public.shift_requests;
drop policy if exists "requests own or staff update" on public.shift_requests;
drop policy if exists "cases involved or staff" on public.counseling_cases;
drop policy if exists "cases staff management" on public.counseling_cases;
drop policy if exists "notifications own read" on public.notification_outbox;
drop policy if exists "audit admins read" on public.audit_events;

create policy "profiles self or staff" on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy "profiles admin management" on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());
create policy "schedules signed in read" on public.schedules for select to authenticated using (true);
create policy "schedules admin management" on public.schedules for all
  using (public.is_admin()) with check (public.is_admin());
create policy "details signed in read" on public.details for select to authenticated using (true);
create policy "details admin management" on public.details for all
  using (public.is_admin()) with check (public.is_admin());
create policy "assignments self or staff" on public.assignments for select
  using (cadet_id = auth.uid() or public.is_staff());
create policy "assignments staff management" on public.assignments for all
  using (public.is_staff()) with check (public.is_staff());
create policy "attendance self or staff" on public.attendance for select
  using (exists (select 1 from public.assignments a where a.id = assignment_id and a.cadet_id = auth.uid()) or public.is_staff());
create policy "attendance staff management" on public.attendance for all
  using (public.is_staff()) with check (public.is_staff());
create policy "requests self or staff" on public.shift_requests for select
  using (requester_id = auth.uid() or accepted_by = auth.uid() or public.is_staff());
create policy "requests own insert" on public.shift_requests for insert with check (requester_id = auth.uid());
create policy "requests own or staff update" on public.shift_requests for update
  using (requester_id = auth.uid() or public.is_staff());
create policy "cases involved or staff" on public.counseling_cases for select
  using (cadet_id = auth.uid() or initiated_by = auth.uid() or public.is_staff());
create policy "cases staff management" on public.counseling_cases for all
  using (public.is_staff()) with check (public.is_staff());
create policy "notifications own read" on public.notification_outbox for select using (recipient_id = auth.uid());
create policy "audit admins read" on public.audit_events for select using (public.is_admin());
