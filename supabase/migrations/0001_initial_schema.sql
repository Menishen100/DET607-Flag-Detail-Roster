-- DET 607 Flag Detail Management: initial production data model.
create type public.user_role as enum ('SUPER_ADMIN', 'ADMIN', 'POC', 'GMC');
create type public.detail_type as enum ('REVEILLE', 'RETREAT');
create type public.attendance_status as enum ('PENDING', 'ATTENDED', 'LATE', 'NO_SHOW', 'EXCUSED');
create type public.request_type as enum ('SWAP', 'COVERAGE');
create type public.request_status as enum ('OPEN', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'APPROVED');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, full_name text not null, email text not null unique,
 role public.user_role not null default 'GMC', active boolean not null default true, created_at timestamptz not null default now()
);
create table public.schedules (
 id uuid primary key default gen_random_uuid(), month date not null unique, status text not null default 'DRAFT',
 reveille_report time not null default '08:25', reveille_time time not null default '08:30',
 retreat_report time not null default '16:25', retreat_time time not null default '16:30',
 created_by uuid not null references public.profiles(id), published_at timestamptz, created_at timestamptz not null default now(),
 check (date_trunc('month', month)::date = month)
);
create table public.details (
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null references public.schedules(id) on delete cascade,
 detail_date date not null check (extract(isodow from detail_date) between 1 and 5), detail_type public.detail_type not null,
 report_time time not null, ceremony_time time not null, blocked boolean not null default false, blocked_reason text,
 unique(detail_date, detail_type)
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(), detail_id uuid not null references public.details(id) on delete cascade,
 cadet_id uuid not null references public.profiles(id), position text not null check (position in ('CADET','POC_LEAD')),
 source text not null default 'ADMIN', assigned_by uuid references public.profiles(id), assigned_at timestamptz not null default now(), removed_at timestamptz,
 unique(detail_id, cadet_id)
);
create unique index one_active_poc_lead_per_detail on public.assignments(detail_id) where removed_at is null and position = 'POC_LEAD';
create table public.attendance (
 id uuid primary key default gen_random_uuid(), assignment_id uuid not null unique references public.assignments(id) on delete cascade,
 status public.attendance_status not null default 'PENDING', clocked_at timestamptz, recorded_by uuid references public.profiles(id), note text, updated_at timestamptz not null default now()
);
create table public.shift_requests (
 id uuid primary key default gen_random_uuid(), request_type public.request_type not null, requester_id uuid not null references public.profiles(id),
 source_assignment_id uuid not null references public.assignments(id) on delete cascade, accepted_by uuid references public.profiles(id),
 status public.request_status not null default 'OPEN', reason text not null, created_at timestamptz not null default now()
);
create table public.counseling_cases (
 id uuid primary key default gen_random_uuid(), attendance_id uuid references public.attendance(id) on delete set null,
 cadet_id uuid not null references public.profiles(id), initiated_by uuid not null references public.profiles(id), status text not null default 'OPEN',
 facts text not null, resolution text, reviewed_by uuid references public.profiles(id), created_at timestamptz not null default now(), closed_at timestamptz
);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id), event_type text not null,
 entity_type text not null, entity_id uuid not null, scheduled_for timestamptz not null default now(), delivered_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_events (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), entity_type text not null, entity_id uuid not null,
 action text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and role in ('SUPER_ADMIN','ADMIN','POC')) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and role in ('SUPER_ADMIN','ADMIN')) $$;

alter table public.profiles enable row level security; alter table public.schedules enable row level security; alter table public.details enable row level security;
alter table public.assignments enable row level security; alter table public.attendance enable row level security; alter table public.shift_requests enable row level security;
alter table public.counseling_cases enable row level security; alter table public.notification_outbox enable row level security; alter table public.audit_events enable row level security;
create policy "profiles self or staff" on public.profiles for select using (id=auth.uid() or public.is_staff());
create policy "profiles admin management" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "schedules signed in read" on public.schedules for select to authenticated using (true);
create policy "schedules admin management" on public.schedules for all using (public.is_admin()) with check (public.is_admin());
create policy "details signed in read" on public.details for select to authenticated using (true);
create policy "details admin management" on public.details for all using (public.is_admin()) with check (public.is_admin());
create policy "assignments self or staff" on public.assignments for select using (cadet_id=auth.uid() or public.is_staff());
create policy "assignments staff management" on public.assignments for all using (public.is_staff()) with check (public.is_staff());
create policy "attendance self or staff" on public.attendance for select using (exists(select 1 from public.assignments a where a.id=assignment_id and a.cadet_id=auth.uid()) or public.is_staff());
create policy "attendance staff management" on public.attendance for all using (public.is_staff()) with check (public.is_staff());
create policy "requests self or staff" on public.shift_requests for select using (requester_id=auth.uid() or accepted_by=auth.uid() or public.is_staff());
create policy "requests own insert" on public.shift_requests for insert with check (requester_id=auth.uid());
create policy "requests own or staff update" on public.shift_requests for update using (requester_id=auth.uid() or public.is_staff());
create policy "cases involved or staff" on public.counseling_cases for select using (cadet_id=auth.uid() or initiated_by=auth.uid() or public.is_staff());
create policy "cases staff management" on public.counseling_cases for all using (public.is_staff()) with check (public.is_staff());
create policy "notifications own read" on public.notification_outbox for select using (recipient_id=auth.uid());
create policy "audit admins read" on public.audit_events for select using (public.is_admin());
