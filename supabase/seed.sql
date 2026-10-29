-- Optional. Run manually in the SQL editor; nothing here is applied automatically and nothing is fake production data.
-- Default settings are already inserted by migration 0001.
-- Example reference data (uncomment and edit to suit your institution):
-- insert into public.departments(code, name) values ('CSC', 'Computer Science');
-- insert into public.academic_sessions(name, is_current) values ('2025/2026', true);

-- First administrator: see README step 6. Run ONCE, after creating the user in Authentication > Users:
-- select public.bootstrap_first_admin('you@example.com');
