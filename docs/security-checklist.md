# Production security checklist

- [ ] `service_role` key is **not** in any `VITE_` variable, repo, or Netlify env for the frontend
- [ ] `.env` is git-ignored; only `.env.example` is committed
- [ ] Auth: public sign-ups disabled; password policy raised; email confirmations on; redirect URLs limited to your domains
- [ ] Migrations 0001–0004 applied in order; `passports` bucket is **private**; pg_cron job `eed-auto-close` exists
- [ ] `select public.bootstrap_first_admin(...)` run once; verify it now errors ("already exists")
- [ ] In SQL editor: `select count(*) from pg_policies where schemaname='public'` > 0 and every public table has RLS enabled (`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;` returns no rows)
- [ ] Run `npm run test:sql` against a scratch database after any migration change
- [ ] Test with real accounts: a student cannot see others' data; a lecturer sees only assigned courses; anon cannot read students or photos
- [ ] `VITE_BIOMETRIC_MODE=bridge` (mock refused in production builds); bridge bound to 127.0.0.1 with an origin/secret check
- [ ] Add CAPTCHA / rate limiting on public registration; purge orphaned `registrations/*` uploads
- [ ] Backups enabled and a restore tested; uptime monitoring; review Audit log regularly
- [ ] Privacy notice and biometric-consent wording reviewed against Nigerian Data Protection Act requirements for your institution
- [ ] Rotate any credentials that were ever pasted into chats, zips or tickets
