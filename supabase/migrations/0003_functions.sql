-- Business logic. Everything that changes attendance, class status, biometrics or roles lives here.
-- Business outcomes are returned as jsonb {ok, code, ...}; authorization failures RAISE 'NOT_AUTHORIZED: ...'.

create function public.normalize_matric(p text) returns text
language sql immutable as $$ select upper(regexp_replace(trim(coalesce(p,'')), '\s+', '', 'g')) $$;

create function public._internal_on() returns void language sql as $$ select set_config('eed.internal', 'on', true) $$;

create function public._require_session_manager(p_session uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_session(p_session) then
    raise exception 'NOT_AUTHORIZED: you cannot control this class session';
  end if;
end $$;

-- ---------- class lifecycle ----------
-- Closes every OPEN/REOPENED session whose deadline has passed. Idempotent: the status predicate makes a
-- second run (or a concurrent run) a no-op. Called by pg_cron every minute AND by every attendance/lifecycle RPC.
create function public.reconcile_sessions() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform public._internal_on();
  for r in
    update public.class_sessions set status = 'AUTO_CLOSED', auto_closed_at = now(),
           status_reason = 'Automatic close deadline passed'
     where status in ('OPEN','REOPENED') and auto_close_at <= now()
     returning id, auto_close_at
  loop
    n := n + 1;
    perform public.write_audit('CLASS_AUTO_CLOSED', 'class_sessions', r.id::text, null,
      jsonb_build_object('system', true, 'deadline', r.auto_close_at));
  end loop;
  return n;
end $$;

create function public.start_class(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.class_sessions;
begin
  perform public._require_session_manager(p_session);
  perform public.reconcile_sessions();
  perform public._internal_on();
  select * into s from public.class_sessions where id = p_session for update;
  if s.status <> 'SCHEDULED' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Only a SCHEDULED class can be started (current: ' || s.status || ')');
  end if;
  if now() >= s.auto_close_at then
    return jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED', 'message', 'The automatic-close deadline for this class has already passed');
  end if;
  update public.class_sessions set status = 'OPEN', opened_at = now(), opened_by = auth.uid(), status_reason = null where id = p_session;
  perform public.write_audit('CLASS_STARTED', 'class_sessions', p_session::text, null, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'STARTED');
end $$;

create function public.end_class(p_session uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.class_sessions; v_open int;
begin
  perform public._require_session_manager(p_session);
  perform public.reconcile_sessions();
  perform public._internal_on();
  select * into s from public.class_sessions where id = p_session for update;
  if s.status not in ('OPEN','REOPENED','AUTO_CLOSED') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Class cannot be ended from status ' || s.status);
  end if;
  -- Incomplete records are NOT discarded: they stay in attendance with sign_out_at null and are reported as "not signed out".
  select count(*) into v_open from public.attendance where class_session_id = p_session and sign_out_at is null;
  update public.class_sessions set status = 'CLOSED', closed_at = now(), closed_by = auth.uid(), status_reason = p_reason where id = p_session;
  perform public.write_audit('CLASS_ENDED', 'class_sessions', p_session::text, p_reason, jsonb_build_object('not_signed_out', v_open));
  return jsonb_build_object('ok', true, 'code', 'CLOSED', 'not_signed_out', v_open);
end $$;

create function public.reopen_class(p_session uuid, p_new_deadline timestamptz, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.class_sessions;
begin
  perform public._require_session_manager(p_session);
  if p_reason is null or length(trim(p_reason)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', 'A reason is required to reopen a class');
  end if;
  perform public.reconcile_sessions();
  perform public._internal_on();
  select * into s from public.class_sessions where id = p_session for update;
  if s.status <> 'AUTO_CLOSED' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Only an AUTO_CLOSED class can be reopened (current: ' || s.status || ')');
  end if;
  if p_new_deadline is null or p_new_deadline <= now() then
    return jsonb_build_object('ok', false, 'code', 'DEADLINE_IN_PAST', 'message', 'Choose a new closing deadline in the future');
  end if;
  update public.class_sessions set status = 'REOPENED', reopened_at = now(), reopened_by = auth.uid(),
         auto_close_at = p_new_deadline, status_reason = p_reason where id = p_session;
  perform public.write_audit('CLASS_REOPENED', 'class_sessions', p_session::text, p_reason,
    jsonb_build_object('previous_deadline', s.auto_close_at, 'new_deadline', p_new_deadline));
  return jsonb_build_object('ok', true, 'code', 'REOPENED');
end $$;

create function public.cancel_class(p_session uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.class_sessions;
begin
  perform public._require_session_manager(p_session);
  if p_reason is null or length(trim(p_reason)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', 'A reason is required to cancel a class');
  end if;
  perform public._internal_on();
  select * into s from public.class_sessions where id = p_session for update;
  if s.status in ('CLOSED','CANCELLED') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Class is already ' || s.status);
  end if;
  update public.class_sessions set status = 'CANCELLED', closed_at = now(), closed_by = auth.uid(), status_reason = p_reason where id = p_session;
  perform public.write_audit('CLASS_CANCELLED', 'class_sessions', p_session::text, p_reason, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'CANCELLED');
end $$;

-- ---------- attendance engine ----------
-- Core routine. Callers have ALREADY authorised the actor. Serialises on the (student, session) attendance row.
create function public._apply_attendance(p_session uuid, p_student uuid, p_method text, p_mode text, p_first boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions; st public.students; a public.attendance;
  v_mode text; v_accepting boolean; v_status text; v_dur int; v_action text;
  v_student jsonb;
  c_min_gap constant interval := interval '2 minutes';
begin
  perform public.reconcile_sessions();
  select * into s from public.class_sessions where id = p_session for share;
  select * into st from public.students where id = p_student;
  v_student := jsonb_build_object('id', st.id, 'matric_number', st.matric_number, 'full_name', st.full_name, 'passport_path', st.passport_path);

  v_accepting := now() < s.auto_close_at and (
      s.status in ('OPEN','REOPENED')
      or (s.status = 'SCHEDULED' and s.early_signin_minutes > 0 and now() >= s.scheduled_start - make_interval(mins => s.early_signin_minutes)));
  if not v_accepting then
    return jsonb_build_object('ok', false, 'code', case s.status when 'SCHEDULED' then 'CLASS_NOT_STARTED' when 'CANCELLED' then 'CLASS_CANCELLED' else 'CLASS_CLOSED' end,
      'session_status', s.status, 'student', v_student);
  end if;
  if st.registration_status not in ('REGISTERED','ACTIVE') then
    return jsonb_build_object('ok', false, 'code', 'STUDENT_INACTIVE', 'student', v_student);
  end if;
  if not exists (select 1 from public.student_course_enrollments e where e.student_id = p_student and e.course_id = s.course_id
                 and e.academic_session_id = s.academic_session_id and e.semester = s.semester and e.status = 'ENROLLED') then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED', 'student', v_student);
  end if;

  v_mode := coalesce(p_mode, s.kiosk_mode);
  select * into a from public.attendance where class_session_id = p_session and student_id = p_student for update;

  if v_mode = 'AUTO' then
    if not found then v_action := 'SIGN_IN';
    elsif a.sign_out_at is null then
      if now() - a.sign_in_at < c_min_gap then
        return jsonb_build_object('ok', false, 'code', 'ALREADY_SIGNED_IN', 'student', v_student, 'sign_in_at', a.sign_in_at, 'status', a.status);
      end if;
      v_action := 'SIGN_OUT';
    else
      return jsonb_build_object('ok', false, 'code', 'ALREADY_COMPLETE', 'student', v_student, 'sign_in_at', a.sign_in_at, 'sign_out_at', a.sign_out_at, 'duration_minutes', a.duration_minutes);
    end if;
  else
    v_action := v_mode;
  end if;

  if v_action = 'SIGN_IN' then
    if a.id is not null then
      return jsonb_build_object('ok', false, 'code', 'ALREADY_SIGNED_IN', 'student', v_student, 'sign_in_at', a.sign_in_at, 'status', a.status);
    end if;
    v_status := case when now() > s.scheduled_start + make_interval(mins => s.late_after_minutes) then 'LATE' else 'PRESENT' end;
    insert into public.attendance(class_session_id, student_id, sign_in_at, sign_in_method, status, first_enrollment)
    values (p_session, p_student, now(), p_method, v_status, coalesce(p_first, false))
    on conflict (class_session_id, student_id) do nothing
    returning * into a;
    if a.id is null then   -- lost a race with a concurrent scan
      return jsonb_build_object('ok', false, 'code', 'ALREADY_SIGNED_IN', 'student', v_student);
    end if;
    return jsonb_build_object('ok', true, 'code', 'SIGN_IN_SUCCESS', 'action', 'SIGN_IN', 'student', v_student, 'attendance_id', a.id,
      'at', a.sign_in_at, 'status', a.status, 'method', p_method, 'first_enrollment', a.first_enrollment);
  else
    if a.id is null then
      return jsonb_build_object('ok', false, 'code', 'NOT_SIGNED_IN', 'student', v_student);
    end if;
    if a.sign_out_at is not null then
      return jsonb_build_object('ok', false, 'code', 'ALREADY_COMPLETE', 'student', v_student, 'sign_in_at', a.sign_in_at, 'sign_out_at', a.sign_out_at, 'duration_minutes', a.duration_minutes);
    end if;
    v_dur := floor(extract(epoch from (now() - a.sign_in_at)) / 60);
    update public.attendance set sign_out_at = now(), sign_out_method = p_method, duration_minutes = v_dur where id = a.id returning * into a;
    return jsonb_build_object('ok', true, 'code', 'SIGN_OUT_SUCCESS', 'action', 'SIGN_OUT', 'student', v_student, 'attendance_id', a.id,
      'at', a.sign_out_at, 'sign_in_at', a.sign_in_at, 'status', a.status, 'method', p_method, 'duration_minutes', a.duration_minutes);
  end if;
end $$;

-- Fingerprint scan: the server resolves the student from the provider's template reference.
create function public.scan_attendance(p_session uuid, p_template_ref text, p_mode text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_student uuid;
begin
  perform public._require_session_manager(p_session);
  if p_mode is not null and p_mode not in ('SIGN_IN','SIGN_OUT','AUTO') then raise exception 'INVALID_MODE'; end if;
  select student_id into v_student from public.biometric_enrollments where template_ref = p_template_ref and revoked_at is null;
  if v_student is null then
    return jsonb_build_object('ok', false, 'code', 'FINGERPRINT_NOT_RECOGNIZED');
  end if;
  return public._apply_attendance(p_session, v_student, 'FINGERPRINT', p_mode, false);
end $$;

create function public.lookup_student_for_session(p_session uuid, p_matric text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.students; s public.class_sessions; v_enrolled boolean; a public.attendance;
begin
  perform public._require_session_manager(p_session);
  select * into st from public.students where matric_number = public.normalize_matric(p_matric);
  if not found then return jsonb_build_object('found', false); end if;
  select * into s from public.class_sessions where id = p_session;
  select exists (select 1 from public.student_course_enrollments e where e.student_id = st.id and e.course_id = s.course_id
     and e.academic_session_id = s.academic_session_id and e.semester = s.semester and e.status = 'ENROLLED') into v_enrolled;
  select * into a from public.attendance where class_session_id = p_session and student_id = st.id;
  return jsonb_build_object('found', true, 'enrolled_in_class', v_enrolled,
    'student', jsonb_build_object('id', st.id, 'matric_number', st.matric_number, 'full_name', st.full_name, 'passport_path', st.passport_path,
                                  'level', st.level, 'biometric_status', st.biometric_status, 'registration_status', st.registration_status),
    'signed_in', a.sign_in_at is not null, 'signed_out', a.sign_out_at is not null);
end $$;

-- ---------- biometrics ----------
create function public._enroll_biometric(p_student uuid, p_ref text, p_provider text, p_replace boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_replace then
    update public.biometric_enrollments set revoked_at = now(), revoked_by = auth.uid() where student_id = p_student and revoked_at is null;
  end if;
  insert into public.biometric_enrollments(student_id, template_ref, provider, consent_at, enrolled_by)
  values (p_student, p_ref, p_provider, now(), auth.uid()) returning id into v_id;
  update public.students set biometric_status = 'ENROLLED' where id = p_student;
  perform public.write_audit('BIOMETRIC_ENROLLED', 'students', p_student::text, null, jsonb_build_object('provider', p_provider, 'replaced', p_replace));
  return v_id;
end $$;

create function public.enroll_and_attend(p_session uuid, p_matric text, p_template_ref text, p_provider text, p_consent boolean, p_mode text default 'SIGN_IN')
returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.students; s public.class_sessions; v_att jsonb;
begin
  perform public._require_session_manager(p_session);
  if p_consent is not true then return jsonb_build_object('ok', false, 'code', 'CONSENT_REQUIRED'); end if;
  if p_template_ref is null or length(p_template_ref) < 8 then return jsonb_build_object('ok', false, 'code', 'ENROLLMENT_FAILED'); end if;
  select * into st from public.students where matric_number = public.normalize_matric(p_matric);
  if not found then return jsonb_build_object('ok', false, 'code', 'STUDENT_NOT_FOUND'); end if;
  select * into s from public.class_sessions where id = p_session;
  if not exists (select 1 from public.student_course_enrollments e where e.student_id = st.id and e.course_id = s.course_id
     and e.academic_session_id = s.academic_session_id and e.semester = s.semester and e.status = 'ENROLLED') then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENROLLED', 'student', jsonb_build_object('id', st.id, 'matric_number', st.matric_number, 'full_name', st.full_name, 'passport_path', st.passport_path));
  end if;
  if st.biometric_status = 'ENROLLED' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ENROLLED');
  end if;
  begin
    perform public._enroll_biometric(st.id, p_template_ref, coalesce(p_provider, 'unknown'), false);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'TEMPLATE_IN_USE');
  end;
  v_att := public._apply_attendance(p_session, st.id, 'FINGERPRINT', p_mode, true);
  return jsonb_build_object('ok', true, 'code', 'ENROLLED', 'enrolled', true, 'attendance', v_att);
end $$;

create function public.admin_enroll_biometric(p_student uuid, p_template_ref text, p_provider text, p_consent boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED: admin only'; end if;
  if p_consent is not true then return jsonb_build_object('ok', false, 'code', 'CONSENT_REQUIRED'); end if;
  begin
    perform public._enroll_biometric(p_student, p_template_ref, coalesce(p_provider, 'unknown'), true);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'TEMPLATE_IN_USE');
  end;
  return jsonb_build_object('ok', true, 'code', 'ENROLLED');
end $$;

create function public.admin_revoke_biometric(p_student uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED: admin only'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  update public.biometric_enrollments set revoked_at = now(), revoked_by = auth.uid() where student_id = p_student and revoked_at is null;
  update public.students set biometric_status = 'REVOKED' where id = p_student;
  perform public.write_audit('BIOMETRIC_REMOVED', 'students', p_student::text, p_reason, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'REVOKED');
end $$;

-- ---------- temporary override (single event only) ----------
create function public.override_attendance(p_session uuid, p_matric text, p_action text, p_reason text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.students; v_res jsonb; v_audit uuid; v_ov uuid; v_own uuid;
begin
  perform public._require_session_manager(p_session);
  if p_action not in ('SIGN_IN','SIGN_OUT') then raise exception 'INVALID_ACTION'; end if;
  if p_reason not in ('FINGERPRINT_FAILED','FINGER_INJURY','SCANNER_PROBLEM','OTHER') then raise exception 'INVALID_REASON'; end if;
  if p_reason = 'OTHER' and (p_notes is null or length(trim(p_notes)) < 3) then
    return jsonb_build_object('ok', false, 'code', 'NOTES_REQUIRED');
  end if;
  select * into st from public.students where matric_number = public.normalize_matric(p_matric);
  if not found then return jsonb_build_object('ok', false, 'code', 'STUDENT_NOT_FOUND'); end if;
  select student_id into v_own from public.profiles where id = auth.uid();
  if v_own is not null and v_own = st.id then
    raise exception 'NOT_AUTHORIZED: you cannot approve an override for yourself';
  end if;
  v_res := public._apply_attendance(p_session, st.id, 'ADMIN_OVERRIDE', p_action, false);
  if (v_res->>'ok')::boolean is not true then return v_res; end if;
  v_audit := public.write_audit('ATTENDANCE_OVERRIDE', 'attendance', v_res->>'attendance_id', p_reason,
     jsonb_build_object('action', p_action, 'student_id', st.id, 'session_id', p_session));
  insert into public.attendance_overrides(attendance_id, student_id, class_session_id, action, reason, notes, approved_by, audit_id)
  values ((v_res->>'attendance_id')::uuid, st.id, p_session, p_action, p_reason, nullif(trim(p_notes), ''), auth.uid(), v_audit)
  returning id into v_ov;
  return v_res || jsonb_build_object('override_id', v_ov, 'audit_id', v_audit);
end $$;

create function public.correct_attendance(p_attendance uuid, p_status text, p_sign_in_at timestamptz, p_sign_out_at timestamptz, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.attendance; v_before jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED: admin only'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if p_status not in ('PRESENT','LATE') then raise exception 'INVALID_STATUS'; end if;
  select * into a from public.attendance where id = p_attendance for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_sign_in_at is null or (p_sign_out_at is not null and p_sign_out_at < p_sign_in_at) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TIMES');
  end if;
  v_before := jsonb_build_object('status', a.status, 'sign_in_at', a.sign_in_at, 'sign_out_at', a.sign_out_at);
  update public.attendance set status = p_status, sign_in_at = p_sign_in_at, sign_out_at = p_sign_out_at,
     sign_out_method = case when p_sign_out_at is null then null else coalesce(sign_out_method, 'ADMIN_OVERRIDE') end,
     duration_minutes = case when p_sign_out_at is null then null else floor(extract(epoch from (p_sign_out_at - p_sign_in_at)) / 60) end
   where id = p_attendance;
  perform public.write_audit('ATTENDANCE_CORRECTED', 'attendance', p_attendance::text, p_reason,
    jsonb_build_object('before', v_before, 'after', jsonb_build_object('status', p_status, 'sign_in_at', p_sign_in_at, 'sign_out_at', p_sign_out_at)));
  return jsonb_build_object('ok', true, 'code', 'CORRECTED');
end $$;

-- ---------- public registration (callable by anon) ----------
create function public.get_registration_form(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f public.registration_forms; v_count int; v_state text;
begin
  select * into f from public.registration_forms where token = upper(trim(p_token));
  if not found then return jsonb_build_object('state', 'NOT_FOUND'); end if;
  select count(*) into v_count from public.student_course_enrollments where form_id = f.id;
  v_state := case when not f.is_active then 'INACTIVE'
                  when f.deadline is not null and now() > f.deadline then 'EXPIRED'
                  when f.max_registrations is not null and v_count >= f.max_registrations then 'FULL'
                  else 'OPEN' end;
  return jsonb_build_object('state', v_state, 'name', f.name, 'level', f.level, 'semester', f.semester, 'deadline', f.deadline,
    'instructions', f.instructions,
    'course', (select jsonb_build_object('code', c.code, 'title', c.title) from public.courses c where c.id = f.course_id),
    'department', (select d.name from public.departments d where d.id = f.department_id),
    'academic_session', (select a.name from public.academic_sessions a where a.id = f.academic_session_id));
end $$;

create function public.register_student(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.registration_forms; st public.students; v_matric text; v_name text; v_ref text; v_count int;
  v_email text := nullif(trim(p_data->>'email'), ''); v_phone text := nullif(trim(p_data->>'phone'), '');
  v_path text := nullif(trim(p_data->>'passport_path'), ''); v_enrol_id uuid; v_existing text;
begin
  select * into f from public.registration_forms where token = upper(trim(p_token)) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not f.is_active then return jsonb_build_object('ok', false, 'code', 'INACTIVE'); end if;
  if f.deadline is not null and now() > f.deadline then return jsonb_build_object('ok', false, 'code', 'EXPIRED'); end if;
  select count(*) into v_count from public.student_course_enrollments where form_id = f.id;
  if f.max_registrations is not null and v_count >= f.max_registrations then return jsonb_build_object('ok', false, 'code', 'FULL'); end if;

  if (p_data->>'consent') is distinct from 'true' then return jsonb_build_object('ok', false, 'code', 'CONSENT_REQUIRED'); end if;
  v_name := regexp_replace(trim(coalesce(p_data->>'full_name', '')), '\s+', ' ', 'g');
  v_matric := public.normalize_matric(p_data->>'matric_number');
  if length(v_name) < 3 or length(v_name) > 120 then return jsonb_build_object('ok', false, 'code', 'INVALID', 'field', 'full_name'); end if;
  if v_matric !~ '^[A-Z0-9/\-]{3,40}$' then return jsonb_build_object('ok', false, 'code', 'INVALID', 'field', 'matric_number'); end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'code', 'INVALID', 'field', 'email'); end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 \-]{7,20}$' then return jsonb_build_object('ok', false, 'code', 'INVALID', 'field', 'phone'); end if;
  if v_path is not null and v_path !~ ('^registrations/' || f.token || '/[A-Za-z0-9._-]+$') then
    return jsonb_build_object('ok', false, 'code', 'INVALID', 'field', 'passport_path');
  end if;

  select * into st from public.students where matric_number = v_matric for update;
  if found then
    -- Same matric number: only accept if it is the same person (name matches). Never overwrite an existing record.
    if lower(regexp_replace(st.full_name, '\s+', ' ', 'g')) <> lower(v_name) then
      perform public.write_audit('REGISTRATION_CONFLICT', 'students', st.id::text, null,
        jsonb_build_object('matric_number', v_matric, 'form_id', f.id));
      return jsonb_build_object('ok', false, 'code', 'MATRIC_CONFLICT');
    end if;
  else
    if v_path is null then return jsonb_build_object('ok', false, 'code', 'INVALID', 'field', 'passport_path'); end if;
    insert into public.students(matric_number, full_name, passport_path, department_id, level, phone, email, address)
    values (v_matric, v_name, v_path, f.department_id, f.level, v_phone, lower(v_email), nullif(trim(p_data->>'address'), ''))
    returning * into st;
  end if;

  v_ref := 'EED-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.student_course_enrollments(reference, student_id, course_id, academic_session_id, semester, form_id)
  values (v_ref, st.id, f.course_id, f.academic_session_id, f.semester, f.id)
  on conflict (student_id, course_id, academic_session_id, semester) do nothing
  returning id into v_enrol_id;
  if v_enrol_id is null then
    select reference into v_existing from public.student_course_enrollments
     where student_id = st.id and course_id = f.course_id and academic_session_id = f.academic_session_id and semester = f.semester;
    return jsonb_build_object('ok', true, 'code', 'ALREADY_REGISTERED', 'reference', v_existing, 'matric_number', v_matric);
  end if;
  return jsonb_build_object('ok', true, 'code', 'REGISTERED', 'reference', v_ref, 'matric_number', v_matric, 'registered_at', now());
end $$;

-- ---------- administration ----------
create function public.admin_update_profile(p_user uuid, p_role text, p_full_name text, p_student_id uuid, p_is_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare old public.profiles; v_admins int;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED: admin only'; end if;
  if p_role not in ('ADMIN','LECTURER','STUDENT') then raise exception 'INVALID_ROLE'; end if;
  select * into old from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if old.role = 'ADMIN' and (p_role <> 'ADMIN' or not p_is_active) then
    select count(*) into v_admins from public.profiles where role = 'ADMIN' and is_active and id <> p_user;
    if v_admins = 0 then return jsonb_build_object('ok', false, 'code', 'LAST_ADMIN'); end if;
  end if;
  update public.profiles set role = p_role, full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
         student_id = p_student_id, is_active = p_is_active where id = p_user;
  perform public.write_audit('USER_ROLE_CHANGED', 'profiles', p_user::text, null,
    jsonb_build_object('old_role', old.role, 'new_role', p_role, 'active', p_is_active));
  return jsonb_build_object('ok', true, 'code', 'UPDATED');
end $$;

-- Run ONCE from the Supabase SQL editor (postgres role). Not callable through the API.
create function public.bootstrap_first_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where role = 'ADMIN') then raise exception 'An administrator already exists'; end if;
  update public.profiles set role = 'ADMIN' where lower(email) = lower(trim(p_email));
  if not found then raise exception 'No profile with that email. Create the user in Authentication > Users first.'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (null, 'FIRST_ADMIN_BOOTSTRAPPED', 'profiles', lower(trim(p_email)), '{}'::jsonb);
  return 'ok';
end $$;

-- SECURITY INVOKER: numbers respect the caller's RLS (lecturers only see their own classes).
create function public.dashboard_stats() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  return jsonb_build_object(
    'total_students', (select count(*) from public.students),
    'biometric_enrolled', (select count(*) from public.students where biometric_status = 'ENROLLED'),
    'biometric_not_enrolled', (select count(*) from public.students where biometric_status <> 'ENROLLED'),
    'active_classes', (select count(*) from public.class_sessions where status in ('OPEN','REOPENED')),
    'upcoming_classes', (select count(*) from public.class_sessions where status = 'SCHEDULED' and scheduled_start >= now()),
    'today_classes', (select count(*) from public.class_sessions where (scheduled_start at time zone 'Africa/Lagos')::date = v_today and status <> 'CANCELLED'),
    'today_attendance', (select count(*) from public.attendance a join public.class_sessions cs on cs.id = a.class_session_id
                          where (cs.scheduled_start at time zone 'Africa/Lagos')::date = v_today),
    'today_present', (select count(*) from public.attendance a join public.class_sessions cs on cs.id = a.class_session_id
                          where (cs.scheduled_start at time zone 'Africa/Lagos')::date = v_today and a.status = 'PRESENT'),
    'today_late', (select count(*) from public.attendance a join public.class_sessions cs on cs.id = a.class_session_id
                          where (cs.scheduled_start at time zone 'Africa/Lagos')::date = v_today and a.status = 'LATE'),
    'currently_signed_in', (select count(*) from public.attendance a join public.class_sessions cs on cs.id = a.class_session_id
                          where a.sign_out_at is null and cs.status in ('OPEN','REOPENED')),
    'today_overrides', (select count(*) from public.attendance_overrides where (approved_at at time zone 'Africa/Lagos')::date = v_today),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'present', p, 'late', l) order by d)
      from (select (cs.scheduled_start at time zone 'Africa/Lagos')::date d,
                   count(*) filter (where a.status = 'PRESENT') p, count(*) filter (where a.status = 'LATE') l
              from public.attendance a join public.class_sessions cs on cs.id = a.class_session_id
             where cs.scheduled_start >= now() - interval '14 days' group by 1) t), '[]'::jsonb));
end $$;

-- Used by the storage policy so anonymous uploads can be limited to registrations/<active token>/ without
-- giving anon any read access to registration_forms.
create function public.is_open_registration_path(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.registration_forms f
                  where f.is_active and (f.deadline is null or now() <= f.deadline)
                    and p_name like 'registrations/' || f.token || '/%')
$$;
