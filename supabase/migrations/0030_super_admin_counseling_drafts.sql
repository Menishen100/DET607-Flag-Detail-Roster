-- Super Admins may revise, send, or delete a counseling record only while it
-- is a draft. Once sent or signed, the record remains preserved for review.
create or replace function public.super_admin_update_counseling_draft(
  target_case_id uuid,
  new_reason text,
  new_facts text,
  new_expected_standards text,
  new_corrective_action text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then
    raise exception 'Super Admin access is required';
  end if;
  if nullif(trim(new_facts), '') is null then
    raise exception 'Objective facts are required';
  end if;
  update public.counseling_cases
  set reason = nullif(trim(new_reason), ''),
      facts = trim(new_facts),
      drafted_text = trim(new_facts),
      expected_standards = nullif(trim(new_expected_standards), ''),
      corrective_action = nullif(trim(new_corrective_action), '')
  where id = target_case_id and status = 'DRAFT';
  if not found then raise exception 'This counseling draft is no longer available to edit'; end if;
end $$;

create or replace function public.super_admin_send_counseling_draft(target_case_id uuid)
returns table (id uuid, cadet_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then
    raise exception 'Super Admin access is required';
  end if;
  return query
  update public.counseling_cases
  set status = 'AWAITING_CADET_SIGNATURE', sent_at = null
  where counseling_cases.id = target_case_id and counseling_cases.status = 'DRAFT'
  returning counseling_cases.id, counseling_cases.cadet_id;
  if not found then raise exception 'This counseling draft is no longer available to send'; end if;
end $$;

create or replace function public.super_admin_delete_counseling_draft(target_case_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and admin_level = 'SUPER_ADMIN') then
    raise exception 'Super Admin access is required';
  end if;
  delete from public.counseling_cases where id = target_case_id and status = 'DRAFT';
  if not found then raise exception 'This counseling draft is no longer available to delete'; end if;
end $$;

grant execute on function public.super_admin_update_counseling_draft(uuid,text,text,text,text), public.super_admin_send_counseling_draft(uuid), public.super_admin_delete_counseling_draft(uuid) to authenticated;
notify pgrst, 'reload schema';
