# Flag Detail Roster

A focused, browser-based personal prototype for managing weekday reveille and retreat flag details.

## Run locally

Open `index.html` in a modern browser. No build step or external dependency is needed. Demo data is stored only in that browser's local storage; use **Reset demo** to restore it.

## What this prototype demonstrates

- Separate roles: Super Admin, Admin, POC, and GMC cadet.
- Monthly scheduling with a three-cadet requirement plus one POC lead for each detail.
- Flexible reporting/ceremony times, weekday-only scheduling, and blocked holiday dates.
- Cadet self-signup, administrator assignment, and schedule publication.
- Conflict protection (a cadet cannot be assigned to overlapping details).
- Swap / coverage request flow with candidate eligibility checks.
- Attendance clocking and an accountable no-show / counseling workflow.
- An in-app notification log that models the email events required for production.

## Production implementation recommendation

Use the screen flows here as the front end for a production app with an API, a relational database, an identity provider, and a job scheduler. Do **not** rely on browser local storage for roster records or attendance. See `docs/implementation-plan.md` for the data model, security controls, email reminder plan, and research comparison.

## Recommended stack

- Front end: React + TypeScript (or keep this as a static prototype during discovery)
- API: FastAPI or Django REST with PostgreSQL
- Authentication: a provider you control, such as Clerk, Auth0, Supabase Auth, or password/magic-link onboarding with MFA for staff roles
- Email: your own SMTP provider, Resend, Postmark, SendGrid, or Amazon SES
- Scheduled reminders: Celery/Redis, APScheduler, or cloud scheduler/queue
- Hosting: an environment you control with encrypted backups and audit logging
