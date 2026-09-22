-- Structured counseling lifecycle. Signed content is preserved and never edited in place.
alter table public.counseling_cases add column if not exists assignment_id uuid references public.assignments(id);
alter table public.counseling_cases add column if not exists counselor_id uuid references public.profiles(id);
alter table public.counseling_cases add column if not exists counselor_position text;
alter table public.counseling_cases add column if not exists reason text;
alter table public.counseling_cases add column if not exists incident_description text;
alter table public.counseling_cases add column if not exists expected_standards text;
alter table public.counseling_cases add column if not exists corrective_action text;
alter table public.counseling_cases add column if not exists drafted_text text;
alter table public.counseling_cases add column if not exists sent_at timestamptz;
alter table public.counseling_cases add column if not exists cadet_explanation text;
alter table public.counseling_cases add column if not exists cadet_dispute text;
alter table public.counseling_cases add column if not exists acknowledged boolean not null default false;
alter table public.counseling_cases add column if not exists signed_name text;
alter table public.counseling_cases add column if not exists signed_at timestamptz;
alter table public.counseling_cases add column if not exists signed_snapshot jsonb;
alter table public.counseling_cases add column if not exists supervisor_remarks text;
alter table public.counseling_cases add column if not exists void_reason text;
alter table public.counseling_cases alter column status set default 'DRAFT';
alter table public.counseling_cases drop constraint if exists counseling_cases_status_check;
alter table public.counseling_cases add constraint counseling_cases_status_check check (status in ('DRAFT','AWAITING_CADET_SIGNATURE','SIGNED_AWAITING_REVIEW','DISPUTED_AWAITING_REVIEW','COMPLETED','VOIDED'));
create unique index if not exists one_active_counseling_per_assignment on public.counseling_cases(assignment_id) where status not in ('VOIDED','COMPLETED');
grant select, insert, update on public.counseling_cases to authenticated;
create or replace function public.sign_my_counseling(case_id uuid, explanation text, dispute text, typed_name text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.counseling_cases c where c.id=case_id and c.cadet_id=auth.uid() and c.status='AWAITING_CADET_SIGNATURE') then raise exception 'Counseling is not available for this cadet'; end if;
  if nullif(trim(explanation),'') is null or nullif(trim(typed_name),'') is null then raise exception 'Explanation and typed acknowledgment are required'; end if;
  update public.counseling_cases set cadet_explanation=explanation,cadet_dispute=nullif(dispute,''),acknowledged=true,signed_name=typed_name,signed_at=now(),signed_snapshot=to_jsonb(counseling_cases),status=case when nullif(dispute,'') is null then 'SIGNED_AWAITING_REVIEW' else 'DISPUTED_AWAITING_REVIEW' end where id=case_id;
end $$;
grant execute on function public.sign_my_counseling(uuid,text,text,text) to authenticated;
