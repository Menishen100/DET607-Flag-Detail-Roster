# Detachment 607 Flag Detail — Implementation Plan

## Operating rules captured in the prototype

| Rule | System behavior |
| --- | --- |
| Details | Reveille and Retreat are generated only Monday–Friday. Weekends are excluded by default. |
| Staffing | Every detail requires three cadets plus exactly one POC lead. A detail is not ready until all four positions are filled. |
| Times | Default Reveille ceremony/report times are 08:30/08:25. Default Retreat times are 16:30/16:25. An administrator can change a month default or an individual date. |
| Eligibility | GMC cadets may occupy cadet positions. POC cadets may occupy a cadet position or the POC-lead position. Only a POC can lead. |
| Conflicts | Assignment, coverage acceptance, and swap acceptance are rejected when the candidate has another overlapping active detail. |
| Publication | A detail begins as draft/open, is published to invite sign-up, and is locked once the schedule is finalized. |
| Attendance | The assignee may check in at report time. A POC can mark attendance/no-show for their detail. Admin and Super Admin can correct any record. |
| Accountability | A no-show creates a counseling case. The POC records facts and submits it; an admin/supervisor reviews and closes it. A POC no-show is escalated directly to the Super Admin queue. |

## Notification matrix

Every event writes an immutable notification/audit record. In production, the same event is delivered by email.

| Event | Recipients |
| --- | --- |
| Schedule published | all active cadets |
| Assigned, self-selected, removed, or time updated | affected cadet and the POC lead |
| Shift swap/coverage request | eligible, non-conflicting cadets; current POC lead |
| Swap/coverage accepted or declined | requester, current assignees, POC lead, admins |
| Reminder: day before, 2 hours, 1 hour, 10 minutes | every assigned cadet and POC lead |
| Attendance marked no-show | cadet, lead POC, admins; Super Admin if the no-show is a POC |
| Counseling opened/updated | cadet, initiating POC, reviewing admin; Super Admin for POC cases |

Use an outbox table (`notification_outbox`) and a background worker. Each email has an idempotency key composed of event ID + recipient + reminder type, so retries cannot duplicate it. Store delivery status, provider message ID, and timestamps; never store email-provider credentials in the repository.

## Production data model

`users(id, university_id, name, email, role, status, created_at)`

`schedules(id, month, status, default_reveille_time, default_retreat_time, published_at, created_by)`

`details(id, schedule_id, date, type, report_at, ceremony_at, status, blocked_reason, created_by)`

`assignments(id, detail_id, user_id, position [CADET|POC_LEAD], source [SELF|ADMIN|SWAP|COVERAGE], status, assigned_at)`

`availability(id, user_id, date, availability, note)`

`requests(id, type [SWAP|COVERAGE], source_assignment_id, target_assignment_id nullable, requester_id, status, reason, reviewed_by)`

`attendance(id, assignment_id, status [PENDING|ATTENDED|LATE|NO_SHOW|EXCUSED], recorded_at, recorded_by, note)`

`counseling_cases(id, attendance_id, cadet_id, initiated_by, severity, status, facts, resolution, reviewed_by)`

`audit_events(id, actor_id, entity_type, entity_id, action, before_json, after_json, created_at)`

## Safety and security controls

- Use university SSO if permitted and require multi-factor authentication for Super Admin/Admin accounts.
- Enforce role checks on the server for every endpoint; hiding a button is not authorization.
- Keep a tamper-evident audit trail for assignment, attendance, and counseling changes.
- Encrypt traffic (HTTPS), database backups, and email addresses at rest. Apply least-privilege database accounts.
- Use an approved retention policy for counseling records and limit access to POC cases to the direct chain of responsibility.
- Do not use facial recognition or GPS attendance without written university approval and a privacy assessment. A POC-verified timestamp is the safer baseline.

## Research: build versus off-the-shelf tools

| Option | Useful capability | Fit for Det 607 |
| --- | --- | --- |
| Deputy | Shift scheduling, time and attendance, open shifts, swap support, and notifications. | Strong operational features, but it is workforce/payroll-oriented and would need policy/configuration work for cadet/P.O.C. rules and counseling. |
| When I Work | Publish schedules, staff shift requests/swaps, attendance, and alerts. | Good simple alternative to evaluate if a custom counseling/accountability workflow is not essential. |
| Custom Det 607 app | Exact four-person staffing rule, GMC/POC permissions, POC escalation, counseling, university branding and data policy. | Best functional fit; requires owned hosting, security review, and maintenance. |

Both Deputy and When I Work describe schedule publication, attendance, and shift changes/swaps as core workflow features. The recommended path is a short pilot of the custom system with 10–20 cadets while separately obtaining university-approved pricing and privacy answers from those vendors. Sources: [Deputy scheduling](https://www.deputy.com/features/scheduling-software), [Deputy shift swapping](https://www.deputy.com/features/shift-swapping), [When I Work scheduling](https://wheniwork.com/features/employee-scheduling-software), and [When I Work request processing](https://help.wheniwork.net/articles/processing-shift-requests-computer/).

## Acceptance tests before deployment

1. Attempt assignment to a blocked date, weekend, full detail, and overlapping detail; each must fail with a clear reason.
2. Confirm the POC-lead seat rejects a GMC cadet and each detail cannot publish as "ready" until three cadets and one POC are assigned.
3. Change a detail time after publishing and confirm every assignee receives exactly one update message.
4. Trigger each reminder window using test clock controls; verify no duplicate sends after worker retry.
5. Verify POC can record their own detail but cannot modify unrelated details; admin can correct records and the audit entry is present.
6. Mark a POC no-show and verify it appears in the Super Admin escalation queue and a counseling case is created.

