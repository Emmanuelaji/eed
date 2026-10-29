-- Storage (private passports bucket), scheduled auto-close, and function grants.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passports', 'passports', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Anonymous visitors may UPLOAD (never read/list/overwrite) into registrations/<token>/ only.
create policy passports_anon_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'passports' and public.is_open_registration_path(storage.objects.name));
create policy passports_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'passports' and public.is_staff());
create policy passports_self_read on storage.objects for select to authenticated
  using (bucket_id = 'passports' and exists (select 1 from public.students s where s.id = public.my_student_id() and s.passport_path = storage.objects.name));
create policy passports_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'passports' and public.is_admin());

-- Scheduled auto-close every minute (enable the pg_cron extension in Supabase: Database > Extensions).
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule('eed-auto-close') from cron.job where jobname = 'eed-auto-close';
  perform cron.schedule('eed-auto-close', '* * * * *', 'select public.reconcile_sessions()');
exception when others then
  raise notice 'pg_cron unavailable (%). Enable it in Database > Extensions; until then sessions are still reconciled on every attendance/lifecycle call and dashboard load.', sqlerrm;
end $$;

-- Function privileges: nothing is callable by default.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.current_app_role(), public.is_admin(), public.is_staff(), public.my_student_id(),
  public.lecturer_teaches_course(uuid), public.can_manage_session(uuid), public.lecturer_can_see_student(uuid),
  public.student_in_session(uuid, uuid, text) to authenticated;
grant execute on function public.get_registration_form(text), public.register_student(text, jsonb), public.is_open_registration_path(text) to anon, authenticated;
grant execute on function public.reconcile_sessions(), public.start_class(uuid), public.end_class(uuid, text),
  public.reopen_class(uuid, timestamptz, text), public.cancel_class(uuid, text),
  public.scan_attendance(uuid, text, text), public.lookup_student_for_session(uuid, text),
  public.enroll_and_attend(uuid, text, text, text, boolean, text), public.override_attendance(uuid, text, text, text, text),
  public.admin_enroll_biometric(uuid, text, text, boolean), public.admin_revoke_biometric(uuid, text),
  public.correct_attendance(uuid, text, timestamptz, timestamptz, text), public.admin_update_profile(uuid, text, text, uuid, boolean),
  public.dashboard_stats(), public.normalize_matric(text) to authenticated;
-- bootstrap_first_admin, write_audit, _apply_attendance, _enroll_biometric stay un-granted (postgres only).
