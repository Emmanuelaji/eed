# EED — Electronic Entry & Departure

Student registration, fingerprint-based classroom attendance and class control.
React + Vite + Tailwind frontend, Supabase (Auth, PostgreSQL + RLS, Storage, Realtime) backend, Netlify hosting.

> **Read the "Status" section first** — it says exactly what was run and what was not.

## Status (honest checklist)

| Area | State |
|---|---|
| Database schema, RLS, RPC functions, storage policy | **Implemented and tested** on PostgreSQL 16 with a Supabase-compatible stub (141 assertions + a 12-way concurrency race) |
| Class lifecycle (start / auto-close / reopen / end / cancel), deadline edge cases, duplicate auto-close | **Tested (SQL)** |
| Attendance engine: sign-in/out, LATE, duration, no duplicates, early sign-in window | **Tested (SQL)** |
| Public registration (RPC), duplicate matric handling, expiry/inactive/full | **Tested (SQL)** |
| Override workflow, self-approval blocked, single-event scope, audit trail | **Tested (SQL)** |
| RLS isolation (student / lecturer / anon / admin), immutable audit log | **Tested (SQL)** |
| Africa/Lagos handling | **Tested** (SQL + JS) |
| Frontend: all pages in the spec, scanner station, reports, CSV, QR, realtime | **Written; builds; every route renders** (smoke test). **Not clicked through against a live Supabase project** |
| Real fingerprint hardware | **Not implemented, not verified.** Mock adapter + bridge/hardware interfaces only |
| pg_cron auto-close job | Migration schedules it; needs the extension enabled on Supabase. **Not run here** (not available in the test DB). Without it, sessions are still closed on every attendance/lifecycle call and every dashboard/class-list load |
| Browser/E2E tests, mobile device testing, PDF export | **Not done** (CSV + print-to-PDF via the browser only) |
| Netlify deploy, Supabase project setup | **Not done here** — follow the steps below |

Run the tests yourself: `npm test` (76 JS tests) and `npm run test:sql` (needs a local PostgreSQL; see `supabase/tests/run.sh`).

## 1. Install
```bash
node -v        # 18+ (20 recommended)
npm install
cp .env.example .env
```

## 2. Create the Supabase project
1. https://supabase.com → New project. Copy **Project URL** and **anon public key** into `.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). **Never** put the `service_role` key in the app.
2. Authentication → Providers → Email: enabled. **Disable "Allow new users to sign up"** (accounts are created by admins; students register via links, not accounts).
   Set Site URL to your Netlify URL and add `http://localhost:5173/**` and `https://YOUR-SITE.netlify.app/**` as redirect URLs (password reset).
3. Database → Extensions → enable **pg_cron** (before step 3, so the auto-close job is scheduled).

## 3. Apply migrations (in order)
SQL Editor → run each file, or `supabase db push` with the Supabase CLI:
`supabase/migrations/0001_schema.sql` → `0002_security_helpers_rls.sql` → `0003_functions.sql` → `0004_storage_cron_grants.sql`.
If pg_cron was not enabled, run `0004` again after enabling it (it is idempotent for the cron part; the policy creation will report "already exists" — that is fine).
Check: Storage shows a **private** `passports` bucket; Database → Cron shows `eed-auto-close` every minute.

## 4. Realtime
Migration 0002 adds `attendance` and `class_sessions` to the `supabase_realtime` publication. Verify under Database → Replication.

## 5. Run locally
```bash
npm run dev     # http://localhost:5173
```

## 6. Create the first administrator (no default credentials exist)
1. Authentication → Users → **Add user** (email + strong password, auto-confirm).
2. SQL Editor: `select public.bootstrap_first_admin('you@example.com');`
   It works only while **no admin exists** and is not callable through the API.
3. Sign in at `/login`. Create lecturers the same way (Auth user), then **Users & roles** → set role LECTURER and tick their courses.
   Student logins: create the Auth user, then link it to the student record in **Users & roles**.

## 7. First-use walkthrough (mock scanner)
1. Admin → Departments, Courses, Academic sessions (mark one current).
2. Registration forms → New → copy link / QR → open it in a private window and register a student (photo ≤ 2 MB).
3. Class sessions → New (Lagos time) → Start class → **Open scanner**.
4. At the station: **First time? Enrol** → matric number → confirm identity + consent → *Capture fingerprint & sign in*. The mock panel (amber, "DEVELOPMENT MOCK SCANNER") then lists the new finger; choose it → *Place finger* to sign out / test repeat scans. "Unknown finger" ×3 reveals *Use matric number* → override flow.
5. Reports / Attendance records / Audit log to inspect results.

The mock adapter is **blocked in production builds** unless `VITE_ALLOW_MOCK_IN_PROD=true` (demo only).

## 8. Deploy to Netlify
`netlify.toml` already sets build command, publish dir and the SPA redirect (`/* → /index.html`), plus security headers.
Netlify → Add site → import repo → add env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BIOMETRIC_MODE` (`bridge` for real use) → deploy.
Then update Supabase Auth Site URL / redirect URLs, and test `https://YOUR-SITE/register/<token>` from a phone.

## 9. How the rules work (short)
* **Lifecycle:** SCHEDULED → OPEN → AUTO_CLOSED → REOPENED → CLOSED / CANCELLED. Scheduled end, auto-close deadline and manual closure are separate columns. `reconcile_sessions()` closes expired classes (cron every minute + on every relevant call; idempotent). Reopen requires a **new future deadline** and a reason, so it never instantly re-closes. Final closure keeps incomplete (not-signed-out) records and reports them.
* **Attendance:** one row per student per class (unique constraint + row locks). `AUTO` mode: first scan signs in, a scan after ≥ 2 minutes signs out, further scans are rejected as already complete. `SIGN_IN` / `SIGN_OUT` modes are explicit. LATE = after start + the class's "late after" minutes.
* **Identity:** the browser only sends the scanner's opaque *template reference*; the server resolves the student. Clients cannot write attendance, overrides, biometrics or audit rows at all — only the SECURITY DEFINER functions can.
* **Overrides:** one approved event (sign-in *or* sign-out), reason required, notes required for "Other", staff cannot approve their own record, biometrics are not disabled, next class starts normally.
* **Duplicate matric on registration:** same matric + same name → the existing student is reused and only the course enrolment is added (idempotent, same reference returned). Same matric + **different name** → rejected with `MATRIC_CONFLICT`, nothing overwritten, an audit entry `REGISTRATION_CONFLICT` is written. **Admin resolution:** open Students → search the matric → compare with the audit entry → correct the name/details on the student record (or contact the student), then ask the student to re-submit the link.
* **Time:** everything is stored as UTC `timestamptz`; the UI reads/writes **Africa/Lagos** (UTC+1, no DST) explicitly, never the browser timezone.

## 10. Backups, logging, monitoring
Supabase: enable daily backups (Pro) or schedule `pg_dump`; test a restore. Review Auth/API logs and the in-app Audit log. Add an uptime check on the Netlify URL. Keep migrations in git.

## 11. Known limitations
* Admin client-side pages query tables directly under RLS; lecturers' “Students” list shows only students enrolled in their courses (RLS).
* Passport upload happens before the registration RPC; if registration is rejected the uploaded file is orphaned (private, unreachable). Periodically purge `registrations/*` objects with no matching `students.passport_path`.
* Public registration has no CAPTCHA/rate limit; add Supabase rate limiting or Turnstile before a large public rollout.
* Reports show roster-based ABSENT only for CLOSED/AUTO_CLOSED classes. PDF is via browser print.
* Mock fingerprints live in the browser's localStorage and are only meaningful on that machine.

See `docs/hardware-integration.md` and `docs/security-checklist.md`.
