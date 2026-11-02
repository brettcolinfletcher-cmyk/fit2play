# Fit2Perform

Clinician dashboard and public site for **Fit2Perform** (performance and squad testing) and **Fit2Play** (return-to-sport testing). Live at [fit2perform.com.au](https://www.fit2perform.com.au).

- **Athlete testing:** Hawkins force plates and handheld dynamometry, sprint device sync, hop tests, trends, asymmetry (LSI), performance bands, team rankings, PDF reports.
- **Practice:** public booking, diary, practitioners, appointment types, invoices, email confirmations and reminders.

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres, Auth) · Vercel · Recharts · @react-pdf/renderer · Resend

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in values from Vercel
npm run dev
```

Before every push: `npx next build 2>&1 | tail -20`

## Environment variables

Set in Vercel (Production). Never prefix a secret with `NEXT_PUBLIC_`; anything with that prefix is shipped to the browser.

| Name | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client (public by design; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server routes only |
| `CRON_SECRET` | Vercel cron auth (sent automatically as `Authorization: Bearer`) |
| `SYNC_SECRET` | Server scripts calling sync/upload routes via `x-sync-secret` |
| `HAWKINS_REFRESH_TOKEN`, `HAWKINS_TOKEN_URL`, `HAWKINS_API_BASE` | Hawkins sync (APAC server) |
| `MOTION_API_KEY` | Sprint device sync |
| `RESEND_API_KEY` | Booking, reminder, cancellation and invoice emails (sent from info@f2p.au) |

## Security rules

- Staff-only API routes: `if (!(await staffOrServerAuthorized(req)))` from `lib/routeAuth.ts`.
- Dashboard calls to those routes: `headers: await staffAuthHeaders()` from `lib/staffAuthHeaders.ts`.
- New database views: `security_invoker = true`, no `anon` grants. New `SECURITY DEFINER` functions: revoke execute from `public` and `anon`, and check the caller inside.
- Public sign-up is off. Add users in Supabase > Authentication > Users. Users cannot change their own role.
- Never name the sprint device on public pages.

## Database

- Schema changes: apply in Supabase and save the same SQL in `supabase/migrations/`.
- Snapshot: `SUPABASE_DB_URL='…' ./scripts/db-backup.sh` writes `supabase/schema.sql` (commit it) and a full data backup to `_private/backups/` (git-ignored, contains health data).
- Metric key contract: `docs/metrics.md`.

## Scheduled jobs (`vercel.json`)

| Path | Schedule (UTC) | Perth |
| --- | --- | --- |
| `/api/sync/hawkins`, `/api/sync/1080` | 14:00 daily | 10pm |
| `/api/cron/reminders` | 00:00 daily | 8am |

Check `sync_log` (or the dashboard Sync page) after a missed day.

## Folders

| Path | What |
| --- | --- |
| `app/` | Pages and API routes (`app/api`) |
| `components/` | UI, charts, PDF document |
| `lib/` | Data loading, calculations, sync, booking, email, auth helpers |
| `supabase/migrations/` | SQL applied to the database |
| `scripts/` | One-off admin and backup scripts |
| `_private/` | Local-only files (research PDFs, backups). Git-ignored |
