-- Preserve historical removed assignments while allowing a cadet to be
-- assigned to that same detail again after a cancellation or blocked date is
-- reopened. Only active assignments must remain unique.
alter table public.assignments
  drop constraint if exists assignments_detail_id_cadet_id_key;

create unique index if not exists assignments_active_detail_cadet_unique
  on public.assignments(detail_id, cadet_id)
  where removed_at is null;
