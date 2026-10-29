-- Authorization helpers, audit plumbing, guards and Row Level Security.

-- ---------- helpers (SECURITY DEFINER so policies can read profiles without recursion) ----------
create function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'ADMIN', false)
$$;
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('ADMIN','LECTURER'), false)
$$;
create function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid() and is_active and role = 'STUDENT'
$$;
create function public.lecturer_teaches_course(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.course_lecturers where course_id = p_course and lecturer_id = auth.uid())
      or exists (select 1 from public.class_sessions where course_id = p_course and lecturer_id = auth.uid())
$$;
create function public.can_manage_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.current_app_role() = 'LECTURER' and exists (
      select 1 from public.class_sessions cs
      where cs.id = p_session
        and (cs.lecturer_id = auth.uid() or exists (
              select 1 from public.course_lecturers cl where cl.course_id = cs.course_id and cl.lecturer_id = auth.uid())))
  )
$$;
create function public.lecturer_can_see_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() = 'LECTURER' and exists (
    select 1 from public.student_course_enrollments e
    where e.student_id = p_student and public.lecturer_teaches_course(e.course_id))
$$;
create function public.student_in_session(p_course uuid, p_acad uuid, p_sem text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_course_enrollments e
    where e.student_id = public.my_student_id() and e.course_id = p_course
      and e.academic_session_id = p_acad and e.semester = p_sem and e.status = 'ENROLLED')
$$;

-- ---------- audit ----------
create function public.write_audit(p_action text, p_entity_type text, p_entity_id text, p_reason text, p_metadata jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, reason, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_reason, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create function public.audit_logs_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_logs are append-only'; end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- Row-change auditing records which columns changed, never the values of personal data.
create function public.audit_row_change() returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_changed text[]; v_id text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_id := v_new->>'id';
    perform public.write_audit(upper(tg_table_name) || '_CREATED', tg_table_name, v_id, null, '{}'::jsonb);
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := v_new->>'id';
    select array_agg(k order by k) into v_changed from jsonb_object_keys(v_new) k
      where k <> 'updated_at' and v_new->k is distinct from v_old->k;
    if v_changed is null then return new; end if;
    perform public.write_audit(upper(tg_table_name) || '_UPDATED', tg_table_name, v_id, null,
      jsonb_build_object('changed_columns', to_jsonb(v_changed)));
    return new;
  else
    v_old := to_jsonb(old);
    perform public.write_audit(upper(tg_table_name) || '_DELETED', tg_table_name, v_old->>'id', null, '{}'::jsonb);
    return old;
  end if;
end $$;
create trigger audit after insert or update or delete on public.registration_forms for each row execute function public.audit_row_change();
create trigger audit after update or delete on public.students for each row execute function public.audit_row_change();
create trigger audit after update on public.profiles for each row execute function public.audit_row_change();
create trigger audit after insert or update or delete on public.course_lecturers for each row execute function public.audit_row_change() ;

-- ---------- class session guard: lifecycle columns change only through the RPCs ----------
create function public.guard_class_session() returns trigger language plpgsql as $$
declare v_internal boolean := coalesce(current_setting('eed.internal', true), '') = 'on';
begin
  if v_internal then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'SCHEDULED' or new.opened_at is not null or new.closed_at is not null then
      raise exception 'New class sessions must start as SCHEDULED';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.opened_at is distinct from old.opened_at
     or new.opened_by is distinct from old.opened_by or new.closed_at is distinct from old.closed_at
     or new.closed_by is distinct from old.closed_by or new.reopened_at is distinct from old.reopened_at
     or new.reopened_by is distinct from old.reopened_by or new.auto_closed_at is distinct from old.auto_closed_at then
    raise exception 'Class status can only be changed with start_class/end_class/reopen_class/cancel_class';
  end if;
  if old.status <> 'SCHEDULED' and (new.scheduled_start is distinct from old.scheduled_start
     or new.scheduled_end is distinct from old.scheduled_end or new.auto_close_at is distinct from old.auto_close_at
     or new.course_id is distinct from old.course_id) then
    raise exception 'Schedule and course can only be edited while the class is SCHEDULED';
  end if;
  return new;
end $$;
create trigger guard before insert or update on public.class_sessions for each row execute function public.guard_class_session();

-- ---------- new auth user -> profile (role is ALWAYS STUDENT; never taken from client metadata) ----------
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'STUDENT')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- baseline privileges ----------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
-- attendance, overrides, biometrics and audit are written ONLY by SECURITY DEFINER functions
revoke insert, update, delete on public.attendance, public.attendance_overrides,
  public.biometric_enrollments, public.audit_logs from authenticated;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['app_settings','departments','courses','academic_sessions','students','profiles','course_lecturers',
    'registration_forms','student_course_enrollments','class_sessions','attendance','biometric_enrollments','audit_logs','attendance_overrides'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_staff_read_lecturers on public.profiles for select to authenticated using (public.is_staff() and role in ('ADMIN','LECTURER'));
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- reference data: readable by any signed-in user, writable by admins
create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy departments_read on public.departments for select to authenticated using (true);
create policy departments_admin on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy courses_read on public.courses for select to authenticated using (true);
create policy courses_admin on public.courses for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy acad_read on public.academic_sessions for select to authenticated using (true);
create policy acad_admin on public.academic_sessions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy course_lecturers_read on public.course_lecturers for select to authenticated using (public.is_admin() or lecturer_id = auth.uid());
create policy course_lecturers_admin on public.course_lecturers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- registration forms: admin only (public access is via get_registration_form / register_student)
create policy forms_admin on public.registration_forms for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- students
create policy students_admin on public.students for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy students_self on public.students for select to authenticated using (id = public.my_student_id());
create policy students_lecturer on public.students for select to authenticated using (public.lecturer_can_see_student(id));

-- enrollments
create policy enroll_admin on public.student_course_enrollments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy enroll_self on public.student_course_enrollments for select to authenticated using (student_id = public.my_student_id());
create policy enroll_lecturer on public.student_course_enrollments for select to authenticated
  using (public.current_app_role() = 'LECTURER' and public.lecturer_teaches_course(course_id));

-- class sessions
create policy sessions_admin on public.class_sessions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sessions_lecturer_read on public.class_sessions for select to authenticated using (public.can_manage_session(id));
create policy sessions_lecturer_insert on public.class_sessions for insert to authenticated
  with check (public.current_app_role() = 'LECTURER' and lecturer_id = auth.uid()
              and exists (select 1 from public.course_lecturers cl
                          where cl.course_id = class_sessions.course_id and cl.lecturer_id = auth.uid()));
create policy sessions_lecturer_update on public.class_sessions for update to authenticated
  using (public.can_manage_session(id)) with check (lecturer_id = auth.uid() or public.is_admin());
create policy sessions_student_read on public.class_sessions for select to authenticated
  using (public.student_in_session(course_id, academic_session_id, semester));

-- attendance (read-only for clients)
create policy attendance_admin_read on public.attendance for select to authenticated using (public.is_admin());
create policy attendance_lecturer_read on public.attendance for select to authenticated using (public.can_manage_session(class_session_id));
create policy attendance_self_read on public.attendance for select to authenticated using (student_id = public.my_student_id());

-- overrides (read-only for clients)
create policy overrides_admin_read on public.attendance_overrides for select to authenticated using (public.is_admin());
create policy overrides_lecturer_read on public.attendance_overrides for select to authenticated using (public.can_manage_session(class_session_id));
create policy overrides_self_read on public.attendance_overrides for select to authenticated using (student_id = public.my_student_id());

-- biometrics: only admins can list template references; students see status through students.biometric_status
create policy biometrics_admin_read on public.biometric_enrollments for select to authenticated using (public.is_admin());

-- audit: admins read; nobody writes directly
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Roster view used by reports: RLS of the underlying tables applies to the caller.
create view public.session_roster with (security_invoker = true) as
select cs.id as class_session_id, cs.course_id, cs.department_id, cs.level, cs.academic_session_id, cs.semester,
       cs.scheduled_start, cs.status as session_status, cs.venue,
       s.id as student_id, s.matric_number, s.full_name,
       a.id as attendance_id, a.sign_in_at, a.sign_out_at, a.sign_in_method, a.sign_out_method,
       a.duration_minutes, coalesce(a.first_enrollment, false) as first_enrollment,
       case when a.id is not null then a.status
            when cs.status in ('AUTO_CLOSED','CLOSED') then 'ABSENT'
            else 'PENDING' end as attendance_status,
       (a.sign_in_at is not null and a.sign_out_at is null) as not_signed_out
from public.class_sessions cs
join public.student_course_enrollments e on e.course_id = cs.course_id and e.academic_session_id = cs.academic_session_id
     and e.semester = cs.semester and e.status = 'ENROLLED'
join public.students s on s.id = e.student_id
left join public.attendance a on a.class_session_id = cs.id and a.student_id = s.id
where cs.status <> 'CANCELLED';
grant select on public.session_roster to authenticated;

-- Realtime (RLS still applies to what each subscriber receives)
do $$ begin
  alter publication supabase_realtime add table public.attendance;
  alter publication supabase_realtime add table public.class_sessions;
exception when undefined_object then raise notice 'supabase_realtime publication not found (non-Supabase database)';
end $$;
