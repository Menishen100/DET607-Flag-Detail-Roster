-- DET 607 standard flag-detail times.
-- Reveille remains 08:30 with an 08:25 report time. Retreat changes to
-- 15:30 with a 15:25 report time for all newly created schedules.
alter table public.schedules
  alter column reveille_report set default '08:25',
  alter column reveille_time set default '08:30',
  alter column retreat_report set default '15:25',
  alter column retreat_time set default '15:30';

-- Keep existing schedule defaults aligned. Detail-specific exceptions are
-- preserved; only details still using the former Retreat default are updated.
update public.schedules
set reveille_report = '08:25',
    reveille_time = '08:30',
    retreat_report = '15:25',
    retreat_time = '15:30'
where reveille_report = '08:25'
  and reveille_time = '08:30'
  and retreat_report = '16:25'
  and retreat_time = '16:30';

update public.details
set report_time = '15:25',
    ceremony_time = '15:30'
where detail_type = 'RETREAT'
  and report_time = '16:25'
  and ceremony_time = '16:30'
  and detail_date >= current_date;

notify pgrst, 'reload schema';
