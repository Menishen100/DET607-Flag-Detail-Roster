-- Counseling recipients always sign into the same signed-review status.
-- A dispute is recorded as a response flag, not a separate workflow state.
create or replace function public.sign_my_counseling(case_id uuid, explanation text, dispute text, typed_name text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.counseling_cases c where c.id=case_id and c.cadet_id=auth.uid() and c.status='AWAITING_CADET_SIGNATURE') then
    raise exception 'Counseling is not available for this cadet';
  end if;
  if nullif(trim(explanation),'') is null or nullif(trim(typed_name),'') is null then
    raise exception 'Explanation and typed acknowledgment are required';
  end if;
  update public.counseling_cases
  set cadet_explanation=explanation,
      cadet_dispute=nullif(dispute,''),
      acknowledged=true,
      signed_name=typed_name,
      signed_at=now(),
      signed_snapshot=to_jsonb(counseling_cases),
      status='SIGNED_AWAITING_REVIEW'
  where id=case_id;
end $$;

-- POCs may initiate counseling for GMCs only. Admins retain their existing
-- supervisory authority; GMC accounts cannot create counseling records.
create or replace function public.enforce_counseling_initiator_scope()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; recipient public.profiles%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  if not found or actor.cadet_type = 'GMC' then
    raise exception 'Only POCs and administrators may initiate counseling';
  end if;
  if actor.cadet_type = 'POC' and coalesce(actor.admin_level::text, 'NONE') = 'NONE' then
    select * into recipient from public.profiles where id=new.cadet_id and active;
    if not found or recipient.cadet_type <> 'GMC' then
      raise exception 'POCs may initiate counseling only for GMC cadets';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists counseling_initiator_scope on public.counseling_cases;
create trigger counseling_initiator_scope before insert on public.counseling_cases
for each row execute function public.enforce_counseling_initiator_scope();
