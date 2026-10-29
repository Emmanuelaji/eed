-- SQL tests for EED business rules and RLS. Runs against the throwaway DB created by run.sh.
create schema t;
grant usage on schema t to public;
create table t.ids(k text primary key, v uuid);
grant select on t.ids to public;
create function t.id(k text) returns uuid language sql stable as $$ select v from t.ids where k = $1 $$;
create function t.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function t.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create function t.as_super() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create function t.ok(name text, cond boolean) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', name; end if; raise notice 'PASS: %', name; end $$;
create function t.raises(name text, stmt text, pattern text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'PASS: %', name; return; end if;
    raise exception 'FAIL: % (got: %)', name, sqlerrm;
  end;
  raise exception 'FAIL: % (no error raised)', name;
end $$;
create function t.affected(stmt text) returns int language plpgsql as $$
declare n int; begin execute stmt; get diagnostics n = row_count; return n; end $$;
create function t.rpc(stmt text) returns jsonb language plpgsql as $$
declare r jsonb; begin execute 'select ' || stmt into r; return r; end $$;
create function t.mk_session(course uuid, start_off interval, end_off interval, close_off interval, early int default 0, late_after int default 15)
returns uuid language plpgsql as $$
declare v uuid; c public.courses;
begin
  select * into c from public.courses where id = course;
  insert into public.class_sessions(course_id, department_id, level, academic_session_id, semester, scheduled_start, scheduled_end, auto_close_at,
     early_signin_minutes, late_after_minutes, lecturer_id, venue)
  values (course, c.department_id, c.level, t.id('acad'), 'FIRST', now() + start_off, now() + end_off, now() + close_off, early, late_after, t.id('lect1'), 'Hall A')
  returning id into v;
  return v;
end $$;

-- ===================== SETUP =====================
do $$
declare d uuid; c1 uuid; c2 uuid; a uuid; u uuid; s uuid;
begin
  insert into public.departments(code, name) values ('CSC', 'Computer Science') returning id into d; insert into t.ids values ('dept', d);
  insert into public.courses(code, title, department_id, level) values ('CSC101', 'Intro to Computing', d, 100) returning id into c1; insert into t.ids values ('c1', c1);
  insert into public.courses(code, title, department_id, level) values ('MTH101', 'Calculus', d, 100) returning id into c2; insert into t.ids values ('c2', c2);
  insert into public.academic_sessions(name, is_current) values ('2025/2026', true) returning id into a; insert into t.ids values ('acad', a);
  -- users (profiles are created by trigger)
  insert into auth.users(email, raw_user_meta_data) values ('evil@x.com', '{"role":"ADMIN","full_name":"Evil"}') returning id into u; insert into t.ids values ('evil', u);
  foreach u in array array[]::uuid[] loop end loop;
  insert into auth.users(email) values ('admin@x.com') returning id into u; insert into t.ids values ('admin', u);
  insert into auth.users(email) values ('lect1@x.com') returning id into u; insert into t.ids values ('lect1', u);
  insert into auth.users(email) values ('lect2@x.com') returning id into u; insert into t.ids values ('lect2', u);
  insert into auth.users(email) values ('stud1@x.com') returning id into u; insert into t.ids values ('stud1u', u);
  insert into auth.users(email) values ('stud2@x.com') returning id into u; insert into t.ids values ('stud2u', u);
  insert into public.students(matric_number, full_name, passport_path, department_id, level) values ('CSC/22/001', 'Ada Obi', 'registrations/x/a.jpg', d, 100) returning id into s; insert into t.ids values ('s1', s);
  insert into public.students(matric_number, full_name, passport_path, department_id, level) values ('CSC/22/002', 'Bola Ade', 'registrations/x/b.jpg', d, 100) returning id into s; insert into t.ids values ('s2', s);
  insert into public.students(matric_number, full_name, passport_path, department_id, level) values ('CSC/22/003', 'Chidi Eze', 'registrations/x/c.jpg', d, 100) returning id into s; insert into t.ids values ('s3', s);
  update public.profiles set role = 'ADMIN' where id = t.id('admin');
  update public.profiles set role = 'LECTURER' where id in (t.id('lect1'), t.id('lect2'));
  update public.profiles set student_id = t.id('s1') where id = t.id('stud1u');
  update public.profiles set student_id = t.id('s2') where id = t.id('stud2u');
  insert into public.course_lecturers values (c1, t.id('lect1'));
  insert into public.course_lecturers values (c2, t.id('lect2'));
  insert into public.student_course_enrollments(reference, student_id, course_id, academic_session_id, semester) values ('EED-T1', t.id('s1'), c1, a, 'FIRST');
  insert into public.student_course_enrollments(reference, student_id, course_id, academic_session_id, semester) values ('EED-T2', t.id('s2'), c1, a, 'FIRST');
  insert into public.student_course_enrollments(reference, student_id, course_id, academic_session_id, semester) values ('EED-T3', t.id('s3'), c2, a, 'FIRST');
  perform t.ok('setup complete', true);
end $$;

-- ===================== AUTH / ROLES =====================
do $$ begin
  perform t.ok('client-supplied role metadata is ignored (new user is STUDENT)', (select role from public.profiles where id = t.id('evil')) = 'STUDENT');
  perform t.as_user(t.id('evil'));
  perform t.raises('user cannot promote themselves', format('update public.profiles set role = %L where id = %L', 'ADMIN', t.id('evil')), 'permission denied');
  perform t.raises('user cannot call bootstrap_first_admin', $q$select public.bootstrap_first_admin('evil@x.com')$q$, 'permission denied');
  perform t.raises('non-admin cannot call admin_update_profile', format('select public.admin_update_profile(%L, %L, null, null, true)', t.id('evil'), 'ADMIN'), 'NOT_AUTHORIZED');
  perform t.as_super();
  perform t.raises('bootstrap refuses when an admin already exists', $q$select public.bootstrap_first_admin('evil@x.com')$q$, 'already exists');
  perform t.as_user(t.id('admin'));
  perform t.ok('cannot demote the last admin', t.rpc(format('public.admin_update_profile(%L, %L, null, null, true)', t.id('admin'), 'LECTURER'))->>'code' = 'LAST_ADMIN');
  perform t.ok('admin can change a role', t.rpc(format('public.admin_update_profile(%L, %L, null, null, true)', t.id('evil'), 'LECTURER'))->>'ok' = 'true');
  perform t.as_super();
  perform t.ok('role change is audited', exists (select 1 from public.audit_logs where action = 'USER_ROLE_CHANGED'));
  update public.profiles set role = 'STUDENT' where id = t.id('evil');
end $$;

-- ===================== PUBLIC REGISTRATION =====================
do $$ declare f uuid; tok text; r jsonb; ref text; fx uuid; tx text; begin
  insert into public.registration_forms(name, course_id, department_id, level, academic_session_id, semester, created_by)
  values ('CSC101 reg', t.id('c1'), t.id('dept'), 100, t.id('acad'), 'FIRST', t.id('admin')) returning id, token into f, tok;
  perform t.ok('registration token is long and random-looking', length(tok) = 14 and tok ~ '^[0-9A-F]+$');
  perform t.as_anon();
  perform t.ok('anon can read form info via RPC', t.rpc(format('public.get_registration_form(%L)', lower(tok)))->>'state' = 'OPEN');
  perform t.ok('unknown token -> NOT_FOUND', t.rpc($q$public.get_registration_form('NOPE')$q$)->>'state' = 'NOT_FOUND');
  perform t.raises('anon cannot browse students', 'select * from public.students', 'permission denied');
  perform t.raises('anon cannot browse registration forms', 'select * from public.registration_forms', 'permission denied');
  perform t.raises('anon cannot insert students directly', $q$insert into public.students(matric_number, full_name, department_id, level) values ('X/1','Eve Eve', gen_random_uuid(), 100)$q$, 'permission denied');
  r := t.rpc(format($q$public.register_student(%L, %L::jsonb)$q$, tok, jsonb_build_object('full_name','Dayo  Bello','matric_number',' csc / 22 /004 ','passport_path','registrations/'||tok||'/p.jpg','phone','+2348012345678','email','dayo@x.com','consent',true)));
  perform t.ok('registration succeeds and matric is normalised', r->>'ok' = 'true' and r->>'matric_number' = 'CSC/22/004' and r->>'reference' like 'EED-%');
  ref := r->>'reference';
  r := t.rpc(format($q$public.register_student(%L, %L::jsonb)$q$, tok, jsonb_build_object('full_name','dayo bello','matric_number','csc/22/004','consent',true)));
  perform t.ok('same person registering twice gets the same reference (no duplicate)', r->>'code' = 'ALREADY_REGISTERED' and r->>'reference' = ref);
  r := t.rpc(format($q$public.register_student(%L, %L::jsonb)$q$, tok, jsonb_build_object('full_name','Somebody Else','matric_number','CSC/22/004','consent',true)));
  perform t.ok('same matric with a different name is a conflict, nothing overwritten', r->>'code' = 'MATRIC_CONFLICT');
  r := t.rpc(format($q$public.register_student(%L, %L::jsonb)$q$, tok, jsonb_build_object('full_name','No Consent','matric_number','CSC/22/010','passport_path','registrations/'||tok||'/q.jpg','consent',false)));
  perform t.ok('consent is mandatory', r->>'code' = 'CONSENT_REQUIRED');
  r := t.rpc(format($q$public.register_student(%L, %L::jsonb)$q$, tok, jsonb_build_object('full_name','Bad Mail','matric_number','CSC/22/011','email','nope','passport_path','registrations/'||tok||'/q.jpg','consent',true)));
  perform t.ok('invalid email rejected', r->>'code' = 'INVALID' and r->>'field' = 'email');
  r := t.rpc(format($q$public.register_student(%L, %L::jsonb)$q$, tok, jsonb_build_object('full_name','Bad Path','matric_number','CSC/22/012','passport_path','../../etc/passwd','consent',true)));
  perform t.ok('passport path outside the form folder rejected', r->>'code' = 'INVALID' and r->>'field' = 'passport_path');
  r := t.rpc(format($q$public.register_student(%L, %L::jsonb)$q$, tok, jsonb_build_object('full_name','No Photo','matric_number','CSC/22/013','consent',true)));
  perform t.ok('new student must provide a photograph', r->>'code' = 'INVALID' and r->>'field' = 'passport_path');
  perform t.as_super();
  perform t.ok('conflict was audited', exists (select 1 from public.audit_logs where action = 'REGISTRATION_CONFLICT'));
  perform t.ok('one student record, one enrollment for the registrant', (select count(*) from public.students where matric_number = 'CSC/22/004') = 1
     and (select count(*) from public.student_course_enrollments e join public.students s on s.id = e.student_id where s.matric_number = 'CSC/22/004') = 1);
  perform t.ok('biometric status starts NOT_ENROLLED', (select biometric_status from public.students where matric_number = 'CSC/22/004') = 'NOT_ENROLLED');
  perform t.raises('database refuses duplicate enrollment', format('insert into public.student_course_enrollments(reference, student_id, course_id, academic_session_id, semester) values (%L,%L,%L,%L,%L)', 'EED-DUP', t.id('s1'), t.id('c1'), t.id('acad'), 'FIRST'), 'duplicate key');
  perform t.raises('database refuses lower-case matric numbers', $q$insert into public.students(matric_number, full_name, department_id, level) select 'abc/1', 'Low Case', id, 100 from public.departments limit 1$q$, 'check constraint');
  -- expiry / inactive / full
  update public.registration_forms set deadline = now() - interval '1 second' where id = f;
  perform t.as_anon();
  perform t.ok('expired form -> EXPIRED state', t.rpc(format('public.get_registration_form(%L)', tok))->>'state' = 'EXPIRED');
  r := t.rpc(format($q$public.register_student(%L, %L::jsonb)$q$, tok, jsonb_build_object('full_name','Late Comer','matric_number','CSC/22/020','passport_path','registrations/'||tok||'/q.jpg','consent',true)));
  perform t.ok('cannot register on an expired form', r->>'code' = 'EXPIRED');
  perform t.as_super();
  update public.registration_forms set deadline = null, is_active = false where id = f;
  perform t.as_anon();
  perform t.ok('inactive form -> INACTIVE', t.rpc(format('public.get_registration_form(%L)', tok))->>'state' = 'INACTIVE');
  perform t.as_super();
  update public.registration_forms set is_active = true, max_registrations = 1 where id = f;
  perform t.as_anon();
  perform t.ok('full form -> FULL', t.rpc(format('public.get_registration_form(%L)', tok))->>'state' = 'FULL');
  perform t.as_super();
  perform t.ok('form changes are audited (column names only)', exists (select 1 from public.audit_logs where action = 'REGISTRATION_FORMS_UPDATED' and metadata ? 'changed_columns'));
  -- storage: anon may upload only into an active form's folder
  update public.registration_forms set max_registrations = null where id = f;
  perform t.as_anon();
  insert into storage.objects(bucket_id, name) values ('passports', 'registrations/' || tok || '/ok.jpg');
  perform t.ok('anon may upload into registrations/<token>/', true);
  perform t.raises('anon cannot upload outside a valid form folder', $q$insert into storage.objects(bucket_id, name) values ('passports', 'registrations/NOTAFORM/x.jpg')$q$, 'row-level security');
  perform t.raises('anon cannot upload to other paths', $q$insert into storage.objects(bucket_id, name) values ('passports', 'students/x.jpg')$q$, 'row-level security');
  perform t.ok('anon cannot list passport files', (select count(*) from storage.objects) = 0);
  perform t.as_super();
end $$;

-- ===================== CLASS LIFECYCLE =====================
do $$ declare s uuid; r jsonb; n int; begin
  s := t.mk_session(t.id('c1'), interval '-1 hour', interval '2 hours', interval '2 hours 15 minutes');
  insert into t.ids values ('sess', s);
  perform t.as_user(t.id('lect2'));
  perform t.raises('lecturer not assigned to the course cannot start it', format('select public.start_class(%L)', s), 'NOT_AUTHORIZED');
  perform t.as_user(t.id('stud1u'));
  perform t.raises('student cannot start a class', format('select public.start_class(%L)', s), 'NOT_AUTHORIZED');
  perform t.as_anon();
  perform t.raises('anon cannot start a class', format('select public.start_class(%L)', s), 'permission denied');
  perform t.as_user(t.id('lect1'));
  perform t.raises('lecturer cannot set status directly', format('update public.class_sessions set status = %L where id = %L', 'OPEN', s), 'Class status can only be changed');
  r := t.rpc(format('public.scan_attendance(%L, %L)', s, 'whatever'));
  perform t.ok('unrecognised print on a SCHEDULED class is reported as not recognised', r->>'code' = 'FINGERPRINT_NOT_RECOGNIZED');
  r := t.rpc(format('public.start_class(%L)', s));
  perform t.ok('authorised lecturer can start the class', r->>'ok' = 'true');
  perform t.ok('starting twice is rejected', t.rpc(format('public.start_class(%L)', s))->>'code' = 'INVALID_STATE');
  perform t.as_super();
  perform t.ok('class start audited', exists (select 1 from public.audit_logs where action = 'CLASS_STARTED' and entity_id = s::text));
  perform t.ok('opened_by recorded', (select opened_by from public.class_sessions where id = s) = t.id('lect1'));

  -- scheduled end has passed but the deadline has not: class stays OPEN
  update public.class_sessions set scheduled_end = now() - interval '5 minutes', scheduled_start = now() - interval '4 hours', auto_close_at = now() + interval '10 minutes' where id = s;
  n := public.reconcile_sessions();
  perform t.ok('after scheduled end but before deadline: still OPEN', n = 0 and (select status from public.class_sessions where id = s) = 'OPEN');
  -- deadline edge: one second before is open, exactly at the deadline it closes
  update public.class_sessions set auto_close_at = now() + interval '1 second' where id = s;
  perform t.ok('1 second before deadline: not closed', public.reconcile_sessions() = 0);
  update public.class_sessions set auto_close_at = now() where id = s;
  n := public.reconcile_sessions();
  perform t.ok('exactly at the deadline: auto-closed', n = 1 and (select status from public.class_sessions where id = s) = 'AUTO_CLOSED');
  perform t.ok('second reconcile is a no-op (no duplicate processing)', public.reconcile_sessions() = 0);
  perform t.ok('exactly one AUTO_CLOSED audit entry', (select count(*) from public.audit_logs where action = 'CLASS_AUTO_CLOSED' and entity_id = s::text) = 1);

  -- attendance is rejected while auto-closed
  perform t.as_user(t.id('lect1'));
  r := t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s, 'CSC/22/001', 'SIGN_IN', 'SCANNER_PROBLEM'));
  perform t.ok('attendance rejected while AUTO_CLOSED', r->>'code' = 'CLASS_CLOSED');
  perform t.ok('reopen needs a future deadline', t.rpc(format('public.reopen_class(%L, now() - interval %L, %L)', s, '1 minute', 'extra time'))->>'code' = 'DEADLINE_IN_PAST');
  perform t.ok('reopen needs a reason', t.rpc(format('public.reopen_class(%L, now() + interval %L, %L)', s, '30 minutes', ''))->>'code' = 'REASON_REQUIRED');
  perform t.as_user(t.id('lect2'));
  perform t.raises('unauthorised user cannot reopen', format('select public.reopen_class(%L, now() + interval %L, %L)', s, '30 minutes', 'x y z'), 'NOT_AUTHORIZED');
  perform t.as_user(t.id('lect1'));
  perform t.ok('authorised lecturer reopens with new deadline', t.rpc(format('public.reopen_class(%L, now() + interval %L, %L)', s, '30 minutes', 'Late arrivals'))->>'code' = 'REOPENED');
  perform t.as_super();
  n := public.reconcile_sessions();
  perform t.ok('reopened class is NOT immediately auto-closed again', n = 0 and (select status from public.class_sessions where id = s) = 'REOPENED');
  perform t.ok('reopen records who/when/why', (select reopened_by from public.class_sessions where id = s) = t.id('lect1')
     and exists (select 1 from public.audit_logs where action = 'CLASS_REOPENED' and reason = 'Late arrivals'));
  perform t.as_user(t.id('lect1'));
  perform t.ok('reopening a non-auto-closed class is rejected', t.rpc(format('public.reopen_class(%L, now() + interval %L, %L)', s, '30 minutes', 'again'))->>'code' = 'INVALID_STATE');
  r := t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s, 'CSC/22/001', 'SIGN_IN', 'FINGERPRINT_FAILED'));
  perform t.ok('attendance accepted after reopen', r->>'ok' = 'true');
  perform t.as_super();
  -- the reopened deadline passes again -> closes again
  update public.class_sessions set auto_close_at = now() - interval '1 second' where id = s;
  perform t.ok('reopened class closes again at its new deadline', public.reconcile_sessions() = 1);
  perform t.as_user(t.id('lect1'));
  r := t.rpc(format('public.end_class(%L, %L)', s, 'Finished'));
  perform t.ok('manual end finalises the class and reports incomplete records', r->>'code' = 'CLOSED' and (r->>'not_signed_out')::int = 1);
  perform t.as_super();
  perform t.ok('incomplete attendance is preserved, not discarded', (select count(*) from public.attendance where class_session_id = s and sign_out_at is null) = 1);
  perform t.as_user(t.id('lect1'));
  r := t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s, 'CSC/22/002', 'SIGN_IN', 'FINGERPRINT_FAILED'));
  perform t.ok('no attendance after final closure', r->>'code' = 'CLASS_CLOSED');
  perform t.ok('a CLOSED class cannot be reopened', t.rpc(format('public.reopen_class(%L, now() + interval %L, %L)', s, '1 hour', 'please'))->>'code' = 'INVALID_STATE');
  perform t.ok('a CLOSED class cannot be cancelled', t.rpc(format('public.cancel_class(%L, %L)', s, 'oops'))->>'code' = 'INVALID_STATE');
  perform t.as_super();
  perform t.ok('end audited', exists (select 1 from public.audit_logs where action = 'CLASS_ENDED' and entity_id = s::text and reason = 'Finished'));
end $$;

-- ===================== ATTENDANCE ENGINE / BIOMETRICS / OVERRIDES =====================
do $$ declare s uuid; r jsonb; att jsonb; tmpl text := 'tmpl-' || gen_random_uuid(); n int; begin
  s := t.mk_session(t.id('c1'), interval '-5 minutes', interval '2 hours', interval '2 hours 15 minutes');
  insert into t.ids values ('sess2', s);
  perform t.as_user(t.id('lect1'));
  perform t.ok('start', t.rpc(format('public.start_class(%L)', s))->>'ok' = 'true');
  r := t.rpc(format('public.scan_attendance(%L, %L)', s, tmpl));
  perform t.ok('unknown fingerprint -> FINGERPRINT_NOT_RECOGNIZED', r->>'code' = 'FINGERPRINT_NOT_RECOGNIZED');
  r := t.rpc(format('public.lookup_student_for_session(%L, %L)', s, ' csc/22/001 '));
  perform t.ok('lookup by matric returns identity for verification', r->>'found' = 'true' and r#>>'{student,full_name}' = 'Ada Obi' and r->>'enrolled_in_class' = 'true');
  perform t.ok('lookup unknown matric -> found=false', t.rpc(format('public.lookup_student_for_session(%L, %L)', s, 'NOPE/1'))->>'found' = 'false');
  r := t.rpc(format('public.enroll_and_attend(%L, %L, %L, %L, false)', s, 'CSC/22/001', tmpl, 'mock'));
  perform t.ok('enrollment without consent is refused', r->>'code' = 'CONSENT_REQUIRED');
  r := t.rpc(format('public.enroll_and_attend(%L, %L, %L, %L, true, %L)', s, 'CSC/22/003', 'tmpl-' || gen_random_uuid(), 'mock', 'SIGN_IN'));
  perform t.ok('student not enrolled in the class cannot enrol/attend here', r->>'code' = 'NOT_ENROLLED');
  r := t.rpc(format('public.enroll_and_attend(%L, %L, %L, %L, true, %L)', s, 'CSC/22/999', 'tmpl-' || gen_random_uuid(), 'mock', 'SIGN_IN'));
  perform t.ok('unknown matric -> STUDENT_NOT_FOUND and no student is created', r->>'code' = 'STUDENT_NOT_FOUND');
  r := t.rpc(format('public.enroll_and_attend(%L, %L, %L, %L, true, %L)', s, 'CSC/22/001', tmpl, 'mock', 'AUTO'));
  perform t.ok('first-time enrolment records fingerprint and first attendance', r->>'ok' = 'true' and r#>>'{attendance,code}' = 'SIGN_IN_SUCCESS' and r#>>'{attendance,first_enrollment}' = 'true');
  perform t.ok('enrolling again is refused', t.rpc(format('public.enroll_and_attend(%L, %L, %L, %L, true, %L)', s, 'CSC/22/001', 'tmpl-' || gen_random_uuid(), 'mock', 'AUTO'))->>'code' = 'ALREADY_ENROLLED');
  r := t.rpc(format('public.scan_attendance(%L, %L)', s, tmpl));
  perform t.ok('immediate repeat scan does NOT sign out or duplicate', r->>'code' = 'ALREADY_SIGNED_IN');
  r := t.rpc(format('public.scan_attendance(%L, %L, %L)', s, tmpl, 'SIGN_IN'));
  perform t.ok('SIGN_IN kiosk mode never signs out', r->>'code' = 'ALREADY_SIGNED_IN');
  r := t.rpc(format('public.scan_attendance(%L, %L, %L)', s, tmpl, 'SIGN_OUT'));
  perform t.ok('SIGN_OUT mode signs out explicitly', r->>'code' = 'SIGN_OUT_SUCCESS');
  perform t.as_super();
  update public.attendance set sign_in_at = now() - interval '95 minutes', sign_out_at = null, sign_out_method = null, duration_minutes = null where class_session_id = s;
  perform t.as_user(t.id('lect1'));
  r := t.rpc(format('public.scan_attendance(%L, %L)', s, tmpl));
  perform t.ok('AUTO mode sign-out after the minimum gap computes duration', r->>'code' = 'SIGN_OUT_SUCCESS' and (r->>'duration_minutes')::int = 95);
  perform t.ok('third scan -> ALREADY_COMPLETE, no duplicates', t.rpc(format('public.scan_attendance(%L, %L)', s, tmpl))->>'code' = 'ALREADY_COMPLETE');
  perform t.as_super();
  perform t.ok('exactly one attendance row per student per class', (select count(*) from public.attendance where class_session_id = s and student_id = t.id('s1')) = 1);
  perform t.raises('database enforces one attendance row per student/class', format('insert into public.attendance(class_session_id, student_id, sign_in_at, sign_in_method) values (%L,%L,now(),%L)', s, t.id('s1'), 'FINGERPRINT'), 'duplicate key');
  perform t.ok('student biometric_status is ENROLLED; only a reference is stored', (select biometric_status from public.students where id = t.id('s1')) = 'ENROLLED'
     and (select template_ref from public.biometric_enrollments where student_id = t.id('s1')) = tmpl);
  perform t.ok('biometric enrolment audited', exists (select 1 from public.audit_logs where action = 'BIOMETRIC_ENROLLED'));

  -- override
  perform t.as_user(t.id('stud2u'));
  perform t.raises('student cannot approve overrides', format('select public.override_attendance(%L, %L, %L, %L)', s, 'CSC/22/002', 'SIGN_IN', 'FINGERPRINT_FAILED'), 'NOT_AUTHORIZED');
  perform t.raises('student cannot write attendance directly', format('insert into public.attendance(class_session_id, student_id, sign_in_at, sign_in_method) values (%L,%L,now(),%L)', s, t.id('s2'), 'ADMIN_OVERRIDE'), 'permission denied');
  perform t.as_user(t.id('lect2'));
  perform t.raises('lecturer of another course cannot override', format('select public.override_attendance(%L, %L, %L, %L)', s, 'CSC/22/002', 'SIGN_IN', 'FINGERPRINT_FAILED'), 'NOT_AUTHORIZED');
  perform t.as_user(t.id('lect1'));
  perform t.ok('OTHER requires notes', t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s, 'CSC/22/002', 'SIGN_IN', 'OTHER'))->>'code' = 'NOTES_REQUIRED');
  perform t.ok('override for unknown matric -> STUDENT_NOT_FOUND', t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s, 'ZZZ/1', 'SIGN_IN', 'SCANNER_PROBLEM'))->>'code' = 'STUDENT_NOT_FOUND');
  perform t.ok('override for a student not in the class is rejected', t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s, 'CSC/22/003', 'SIGN_IN', 'SCANNER_PROBLEM'))->>'code' = 'NOT_ENROLLED');
  r := t.rpc(format('public.override_attendance(%L, %L, %L, %L, %L)', s, 'CSC/22/002', 'SIGN_IN', 'FINGER_INJURY', 'bandaged thumb'));
  perform t.ok('authorised staff can approve an override', r->>'ok' = 'true' and r->>'method' = 'ADMIN_OVERRIDE' and r->>'override_id' is not null and r->>'audit_id' is not null);
  perform t.as_super();
  perform t.ok('override row captures approver, reason, action, audit ref', exists (select 1 from public.attendance_overrides o where o.student_id = t.id('s2')
     and o.approved_by = t.id('lect1') and o.reason = 'FINGER_INJURY' and o.action = 'SIGN_IN' and o.audit_id is not null and o.notes = 'bandaged thumb'));
  perform t.ok('override does not disable biometrics or enrol the student', (select biometric_status from public.students where id = t.id('s2')) = 'NOT_ENROLLED');
  perform t.ok('override attendance is stored with ADMIN_OVERRIDE', (select sign_in_method from public.attendance where student_id = t.id('s2') and class_session_id = s) = 'ADMIN_OVERRIDE');
  -- a staff member who is also a student cannot override themselves
  update public.profiles set student_id = null where id = t.id('stud2u');
  update public.profiles set student_id = t.id('s2') where id = t.id('lect1');
  perform t.as_user(t.id('lect1'));
  perform t.raises('staff cannot approve an override for themselves', format('select public.override_attendance(%L, %L, %L, %L)', s, 'CSC/22/002', 'SIGN_OUT', 'SCANNER_PROBLEM'), 'yourself');
  perform t.as_super();
  update public.profiles set student_id = null where id = t.id('lect1');
  update public.profiles set student_id = t.id('s2') where id = t.id('stud2u');
  -- next class uses the normal workflow: new session has no attendance for s2 and s2 has no template
  declare s3 uuid; begin
    s3 := t.mk_session(t.id('c1'), interval '1 day', interval '1 day 2 hours', interval '1 day 2 hours 15 minutes');
    perform t.as_user(t.id('lect1'));
    perform t.ok('start next class', t.rpc(format('public.start_class(%L)', s3))->>'ok' = 'true');
    perform t.ok('override from the previous class does not carry over', (select count(*) from public.attendance where class_session_id = s3) = 0);
    perform t.ok('fingerprint of s2 is still unknown, not auto-approved', t.rpc(format('public.scan_attendance(%L, %L)', s3, 'tmpl-none'))->>'code' = 'FINGERPRINT_NOT_RECOGNIZED');
    perform t.as_super();
  end;
end $$;

-- ===================== PRESENT / LATE / EARLY SIGN-IN =====================
do $$ declare s_ok uuid; s_late uuid; s_sched uuid; s_noearly uuid; begin
  s_ok := t.mk_session(t.id('c1'), interval '0', interval '2 hours', interval '2 hours 15 minutes', 0, 15);
  s_late := t.mk_session(t.id('c1'), interval '-31 minutes', interval '2 hours', interval '2 hours 15 minutes', 0, 15);
  s_sched := t.mk_session(t.id('c1'), interval '20 minutes', interval '2 hours', interval '2 hours 15 minutes', 30, 15);
  s_noearly := t.mk_session(t.id('c1'), interval '20 minutes', interval '2 hours', interval '2 hours 15 minutes', 0, 15);
  perform t.as_user(t.id('lect1'));
  perform t.rpc(format('public.start_class(%L)', s_ok)); perform t.rpc(format('public.start_class(%L)', s_late));
  perform t.ok('on-time sign-in is PRESENT', t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s_ok, 'CSC/22/001', 'SIGN_IN', 'SCANNER_PROBLEM'))->>'status' = 'PRESENT');
  perform t.ok('sign-in after the grace period is LATE', t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s_late, 'CSC/22/001', 'SIGN_IN', 'SCANNER_PROBLEM'))->>'status' = 'LATE');
  perform t.ok('early sign-in window allows sign-in on a SCHEDULED class', t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s_sched, 'CSC/22/001', 'SIGN_IN', 'SCANNER_PROBLEM'))->>'status' = 'PRESENT');
  perform t.ok('without an early window a SCHEDULED class rejects sign-in', t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s_noearly, 'CSC/22/001', 'SIGN_IN', 'SCANNER_PROBLEM'))->>'code' = 'CLASS_NOT_STARTED');
  perform t.ok('cancel needs a reason', t.rpc(format('public.cancel_class(%L, %L)', s_noearly, ''))->>'code' = 'REASON_REQUIRED');
  perform t.ok('cancel works', t.rpc(format('public.cancel_class(%L, %L)', s_noearly, 'Lecturer absent'))->>'code' = 'CANCELLED');
  perform t.ok('cancelled class rejects attendance', t.rpc(format('public.override_attendance(%L, %L, %L, %L)', s_noearly, 'CSC/22/001', 'SIGN_IN', 'SCANNER_PROBLEM'))->>'code' = 'CLASS_CANCELLED');
  perform t.as_super();
end $$;

-- ===================== RLS ISOLATION =====================
do $$ declare n int; begin
  perform t.as_user(t.id('stud1u'));
  perform t.ok('student sees only their own student row', (select count(*) from public.students) = 1 and (select id from public.students) = t.id('s1'));
  perform t.ok('student sees only their own attendance', (select count(*) from public.attendance where student_id <> t.id('s1')) = 0 and (select count(*) from public.attendance) > 0);
  perform t.ok('student cannot read audit logs', (select count(*) from public.audit_logs) = 0);
  perform t.ok('student cannot read biometric template refs', (select count(*) from public.biometric_enrollments) = 0);
  perform t.ok('student cannot read registration forms', (select count(*) from public.registration_forms) = 0);
  perform t.ok('student sees only classes of enrolled courses', (select count(*) from public.class_sessions where course_id <> t.id('c1')) = 0 and (select count(*) from public.class_sessions) > 0);
  perform t.ok('student cannot update class sessions', t.affected($q$update public.class_sessions set venue = 'Hacked'$q$) = 0);
  perform t.raises('student cannot delete attendance', 'delete from public.attendance', 'permission denied');
  perform t.raises('student cannot write overrides', format('insert into public.attendance_overrides(attendance_id, student_id, class_session_id, action, reason, approved_by) select id, student_id, class_session_id, %L, %L, %L from public.attendance limit 1', 'SIGN_IN', 'OTHER', t.id('stud1u')), 'permission denied');
  perform t.raises('student cannot enrol a fingerprint', format('insert into public.biometric_enrollments(student_id, template_ref, provider, consent_at) values (%L, %L, %L, now())', t.id('s1'), 'x', 'mock'), 'permission denied');
  perform t.ok('student cannot update student records', t.affected($q$update public.students set full_name = 'Hacked Name'$q$) = 0);
  perform t.as_user(t.id('lect2'));
  perform t.ok('lecturer of another course sees no attendance for CSC101', (select count(*) from public.attendance a join public.class_sessions cs on cs.id = a.class_session_id where cs.course_id = t.id('c1')) = 0);
  perform t.ok('lecturer of another course sees only their own course students', (select count(*) from public.students) = 1 and (select matric_number from public.students) = 'CSC/22/003');
  perform t.ok('lecturer cannot read audit logs', (select count(*) from public.audit_logs) = 0);
  perform t.as_user(t.id('lect1'));
  perform t.ok('assigned lecturer sees their course students', (select count(*) from public.students) >= 2 and (select count(*) from public.students where matric_number = 'CSC/22/003') = 0);
  perform t.ok('assigned lecturer sees roster with ABSENT/PENDING derived', (select count(*) from public.session_roster where class_session_id = t.id('sess')) = 3);
  perform t.ok('derived ABSENT for a closed class', (select attendance_status from public.session_roster where class_session_id = t.id('sess') and matric_number = 'CSC/22/002') = 'ABSENT');
  perform t.raises('lecturer cannot create a session for a course they are not assigned to', format('insert into public.class_sessions(course_id, department_id, level, academic_session_id, semester, scheduled_start, scheduled_end, auto_close_at, lecturer_id) select %L, department_id, level, %L, %L, now(), now() + interval %L, now() + interval %L, %L from public.courses where id = %L', t.id('c2'), t.id('acad'), 'FIRST', '1 hour', '1 hour', t.id('lect1'), t.id('c2')), 'row-level security');
  perform t.ok('lecturer can create a session for an assigned course', t.affected(format('insert into public.class_sessions(course_id, department_id, level, academic_session_id, semester, scheduled_start, scheduled_end, auto_close_at, lecturer_id) select id, department_id, level, %L, %L, now(), now() + interval %L, now() + interval %L, %L from public.courses where id = %L', t.id('acad'), 'FIRST', '1 hour', '1 hour', t.id('lect1'), t.id('c1'))) = 1);
  perform t.raises('lecturer cannot create an already-OPEN session', format('insert into public.class_sessions(course_id, department_id, level, academic_session_id, semester, scheduled_start, scheduled_end, auto_close_at, lecturer_id, status) select id, department_id, level, %L, %L, now(), now() + interval %L, now() + interval %L, %L, %L from public.courses where id = %L', t.id('acad'), 'FIRST', '1 hour', '1 hour', t.id('lect1'), 'OPEN', t.id('c1')), 'must start as SCHEDULED');
  perform t.as_user(t.id('admin'));
  perform t.ok('admin reads audit logs', (select count(*) from public.audit_logs) > 5);
  perform t.raises('admin cannot delete audit logs', 'delete from public.audit_logs', 'permission denied');
  perform t.raises('admin cannot edit audit logs', $q$update public.audit_logs set action = 'x'$q$, 'permission denied');
  perform t.raises('admin cannot write attendance directly (RPC only)', format('update public.attendance set status = %L', 'PRESENT'), 'permission denied');
  perform t.as_anon();
  perform t.raises('anon cannot read attendance', 'select * from public.attendance', 'permission denied');
  perform t.raises('anon cannot call attendance RPCs', format('select public.scan_attendance(%L, %L)', t.id('sess2'), 'x'), 'permission denied');
  perform t.as_super();
  perform t.raises('even the owner cannot tamper with audit rows', 'delete from public.audit_logs', 'append-only');
end $$;

-- ===================== CORRECTIONS, STUDENT EDITS, TIMEZONE =====================
do $$ declare a uuid; r jsonb; begin
  select id into a from public.attendance where class_session_id = t.id('sess2') and student_id = t.id('s1');
  perform t.as_user(t.id('lect1'));
  perform t.raises('lecturer cannot correct attendance', format('select public.correct_attendance(%L, %L, now(), null, %L)', a, 'PRESENT', 'because'), 'NOT_AUTHORIZED');
  perform t.as_user(t.id('admin'));
  perform t.ok('correction requires a reason', t.rpc(format('public.correct_attendance(%L, %L, now() - interval %L, null, %L)', a, 'LATE', '1 hour', ''))->>'code' = 'REASON_REQUIRED');
  perform t.ok('correction rejects sign-out before sign-in', t.rpc(format('public.correct_attendance(%L, %L, now(), now() - interval %L, %L)', a, 'LATE', '1 hour', 'typo fix'))->>'code' = 'INVALID_TIMES');
  perform t.ok('admin can correct with a reason', t.rpc(format('public.correct_attendance(%L, %L, now() - interval %L, now(), %L)', a, 'LATE', '2 hours', 'Scanner clock was wrong'))->>'ok' = 'true');
  perform t.as_super();
  perform t.ok('correction audited with before/after and reason', exists (select 1 from public.audit_logs where action = 'ATTENDANCE_CORRECTED' and reason = 'Scanner clock was wrong' and metadata ? 'before' and metadata ? 'after'));
  perform t.ok('admin student edits are audited as changed columns only', true);
  update public.students set phone = '0800' where id = t.id('s3');
  perform t.ok('student update audited without values', exists (select 1 from public.audit_logs where action = 'STUDENTS_UPDATED' and metadata->'changed_columns' = '["phone"]'::jsonb) and not exists (select 1 from public.audit_logs where metadata::text like '%0800%'));
  -- timezone: a class at 00:30 Lagos today (= 23:30 UTC the day before) counts as "today" in Lagos
  declare d date := (now() at time zone 'Africa/Lagos')::date; sx uuid; before_n int; after_n int; begin
    perform t.as_user(t.id('admin'));
    before_n := (public.dashboard_stats()->>'today_classes')::int;
    perform t.as_super();
    insert into public.class_sessions(course_id, department_id, level, academic_session_id, semester, scheduled_start, scheduled_end, auto_close_at, lecturer_id)
    select id, department_id, level, t.id('acad'), 'FIRST', ((d::timestamp + time '00:30') at time zone 'Africa/Lagos'), ((d::timestamp + time '01:30') at time zone 'Africa/Lagos'), ((d::timestamp + time '01:45') at time zone 'Africa/Lagos'), t.id('lect1') from public.courses where id = t.id('c1');
    perform t.as_user(t.id('admin'));
    after_n := (public.dashboard_stats()->>'today_classes')::int;
    perform t.ok('dashboard "today" follows Africa/Lagos (00:30 Lagos == 23:30 UTC previous day)', after_n = before_n + 1);
    perform t.as_super();
  end;
  perform t.ok('Lagos is UTC+1 with no DST', (timestamp '2026-01-15 08:00' at time zone 'Africa/Lagos') = timestamptz '2026-01-15 07:00+00' and (timestamp '2026-07-15 08:00' at time zone 'Africa/Lagos') = timestamptz '2026-07-15 07:00+00');
end $$;
