-- Organization audit trail. The log is immutable to portal users and readable
-- only by an active Super Admin through the RPC below.
create or replace function public.write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare audit_id uuid;
begin
  if tg_op = 'DELETE' then
    audit_id := (to_jsonb(old) ->> 'id')::uuid;
    insert into public.audit_events (actor_id, entity_type, entity_id, action, before_data)
    values (auth.uid(), tg_table_name, audit_id, lower(tg_op), to_jsonb(old));
    return old;
  end if;

  audit_id := (to_jsonb(new) ->> 'id')::uuid;
  insert into public.audit_events (actor_id, entity_type, entity_id, action, before_data, after_data)
  values (auth.uid(), tg_table_name, audit_id, lower(tg_op),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists audit_profiles_changes on public.profiles;
create trigger audit_profiles_changes after insert or update or delete on public.profiles for each row execute function public.write_audit_event();
drop trigger if exists audit_schedules_changes on public.schedules;
create trigger audit_schedules_changes after insert or update or delete on public.schedules for each row execute function public.write_audit_event();
drop trigger if exists audit_details_changes on public.details;
create trigger audit_details_changes after insert or update or delete on public.details for each row execute function public.write_audit_event();
drop trigger if exists audit_assignments_changes on public.assignments;
create trigger audit_assignments_changes after insert or update or delete on public.assignments for each row execute function public.write_audit_event();
drop trigger if exists audit_attendance_changes on public.attendance;
create trigger audit_attendance_changes after insert or update or delete on public.attendance for each row execute function public.write_audit_event();
drop trigger if exists audit_shift_requests_changes on public.shift_requests;
create trigger audit_shift_requests_changes after insert or update or delete on public.shift_requests for each row execute function public.write_audit_event();
drop trigger if exists audit_counseling_cases_changes on public.counseling_cases;
create trigger audit_counseling_cases_changes after insert or update or delete on public.counseling_cases for each row execute function public.write_audit_event();
drop trigger if exists audit_notification_outbox_changes on public.notification_outbox;
create trigger audit_notification_outbox_changes after insert or update or delete on public.notification_outbox for each row execute function public.write_audit_event();

create or replace function public.get_super_admin_audit_log(max_entries integer default 200)
returns table(id bigint, created_at timestamptz, actor_id uuid, actor_name text, actor_email text, entity_type text, entity_id uuid, action text, before_data jsonb, after_data jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.active and profiles.admin_level = 'SUPER_ADMIN') then
    raise exception 'Super Admin access is required';
  end if;
  return query select event.id, event.created_at, event.actor_id, actor.full_name, actor.email, event.entity_type, event.entity_id, event.action, event.before_data, event.after_data
  from public.audit_events event left join public.profiles actor on actor.id = event.actor_id
  order by event.created_at desc, event.id desc limit greatest(1, least(coalesce(max_entries, 200), 500));
end;
$$;

revoke all on function public.get_super_admin_audit_log(integer) from public;
grant execute on function public.get_super_admin_audit_log(integer) to authenticated;
notify pgrst, 'reload schema';
