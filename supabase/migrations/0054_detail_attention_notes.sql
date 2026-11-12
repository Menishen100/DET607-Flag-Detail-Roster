-- A detail can carry a short, cadet-visible instruction such as "Half-staff
-- today". It is intentionally per detail, so Reveille and Retreat may differ.
alter table public.details add column if not exists attention_note text;
alter table public.details drop constraint if exists details_attention_note_length;
alter table public.details add constraint details_attention_note_length
  check (attention_note is null or char_length(attention_note) <= 500);

create or replace function public.super_admin_update_detail_attention_note(
  target_detail_id uuid,
  new_attention_note text
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare recipients uuid[];
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active and admin_level = 'SUPER_ADMIN'
  ) then
    raise exception 'Super Admin access is required';
  end if;

  update public.details
  set attention_note = nullif(trim(new_attention_note), '')
  where id = target_detail_id;
  if not found then raise exception 'Flag detail was not found'; end if;

  select coalesce(array_agg(cadet_id), array[]::uuid[]) into recipients
  from public.assignments
  where detail_id = target_detail_id and removed_at is null;
  return recipients;
end;
$$;

create or replace function public.get_live_schedule_roster()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare roster jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'An active DET 607 roster account is required';
  end if;
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.detail_date, rows.detail_type), '[]'::jsonb)
  into roster
  from (
    select d.id as detail_id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time,
      d.blocked, d.blocked_reason, d.attention_note,
      coalesce(array_agg(p.full_name order by p.full_name) filter (where a.position = 'CADET'), array[]::text[]) as cadet_names,
      coalesce(array_agg(a.cadet_id order by p.full_name) filter (where a.position = 'CADET'), array[]::uuid[]) as cadet_ids,
      max(p.full_name) filter (where a.position = 'POC_LEAD') as poc_name,
      (array_agg(a.cadet_id order by a.cadet_id) filter (where a.position = 'POC_LEAD'))[1] as poc_id
    from public.details d
    join public.schedules s on s.id = d.schedule_id
    left join public.assignments a on a.detail_id = d.id and a.removed_at is null
    left join public.profiles p on p.id = a.cadet_id
    where s.status = 'PUBLISHED'
    group by d.id, d.detail_date, d.detail_type, d.report_time, d.ceremony_time,
      d.blocked, d.blocked_reason, d.attention_note
  ) rows;
  return roster;
end;
$$;

grant execute on function public.super_admin_update_detail_attention_note(uuid,text) to authenticated;
grant execute on function public.get_live_schedule_roster() to authenticated;
notify pgrst, 'reload schema';
