-- EED schema. Apply in order: 0001 -> 0002 -> 0003 -> 0004.
-- All timestamps are timestamptz (UTC). The UI displays Africa/Lagos.

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key, value) values
  ('institution_name', '"Your Institution"'),
  ('late_after_minutes', '15'),
  ('default_early_signin_minutes', '0'),
  ('default_auto_close_grace_minutes', '15');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  title text not null check (length(trim(title)) > 0),
  department_id uuid not null references public.departments(id) on delete restrict,
  level int not null check (level between 100 and 900),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.courses(department_id);

create table public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),   -- e.g. 2025/2026
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index one_current_session on public.academic_sessions(is_current) where is_current;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  matric_number text not null unique check (matric_number = upper(matric_number) and length(matric_number) between 3 and 40),
  full_name text not null check (length(trim(full_name)) >= 3),
  passport_path text,
  department_id uuid not null references public.departments(id) on delete restrict,
  level int not null check (level between 100 and 900),
  phone text,
  email text,
  address text,
  registration_status text not null default 'REGISTERED' check (registration_status in ('REGISTERED','ACTIVE','SUSPENDED','GRADUATED','WITHDRAWN')),
  biometric_status text not null default 'NOT_ENROLLED' check (biometric_status in ('NOT_ENROLLED','ENROLLED','REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.students(department_id);
create index on public.students(lower(full_name));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'STUDENT' check (role in ('ADMIN','LECTURER','STUDENT')),
  student_id uuid unique references public.students(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.profiles(role);

create table public.course_lecturers (
  course_id uuid not null references public.courses(id) on delete cascade,
  lecturer_id uuid not null references public.profiles(id) on delete cascade,
  primary key (course_id, lecturer_id)
);

create table public.registration_forms (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 14)),
  name text not null check (length(trim(name)) > 0),
  course_id uuid not null references public.courses(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  level int not null check (level between 100 and 900),
  academic_session_id uuid not null references public.academic_sessions(id) on delete restrict,
  semester text not null check (semester in ('FIRST','SECOND')),
  deadline timestamptz,
  max_registrations int check (max_registrations is null or max_registrations > 0),
  instructions text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_course_enrollments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  academic_session_id uuid not null references public.academic_sessions(id) on delete restrict,
  semester text not null check (semester in ('FIRST','SECOND')),
  form_id uuid references public.registration_forms(id) on delete set null,
  status text not null default 'ENROLLED' check (status in ('ENROLLED','DROPPED')),
  registered_at timestamptz not null default now(),
  unique (student_id, course_id, academic_session_id, semester)
);
create index on public.student_course_enrollments(course_id, academic_session_id, semester);
create index on public.student_course_enrollments(form_id);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  level int not null,
  academic_session_id uuid not null references public.academic_sessions(id) on delete restrict,
  semester text not null check (semester in ('FIRST','SECOND')),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  auto_close_at timestamptz not null,
  early_signin_minutes int not null default 0 check (early_signin_minutes >= 0),
  late_after_minutes int not null default 15 check (late_after_minutes >= 0),
  venue text,
  lecturer_id uuid references public.profiles(id) on delete set null,
  instructions text,
  kiosk_mode text not null default 'AUTO' check (kiosk_mode in ('SIGN_IN','SIGN_OUT','AUTO')),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','OPEN','AUTO_CLOSED','REOPENED','CLOSED','CANCELLED')),
  opened_at timestamptz, opened_by uuid references public.profiles(id) on delete set null,
  auto_closed_at timestamptz,
  reopened_at timestamptz, reopened_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz, closed_by uuid references public.profiles(id) on delete set null,
  status_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  check (auto_close_at >= scheduled_end)
);
create index on public.class_sessions(status, auto_close_at);
create index on public.class_sessions(course_id, scheduled_start);
create index on public.class_sessions(lecturer_id);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.class_sessions(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  sign_in_at timestamptz,
  sign_in_method text check (sign_in_method in ('FINGERPRINT','ADMIN_OVERRIDE')),
  sign_out_at timestamptz,
  sign_out_method text check (sign_out_method in ('FINGERPRINT','ADMIN_OVERRIDE')),
  status text not null default 'PRESENT' check (status in ('PRESENT','LATE')),
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  first_enrollment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_session_id, student_id),
  check (sign_out_at is null or (sign_in_at is not null and sign_out_at >= sign_in_at))
);
create index on public.attendance(student_id);

create table public.biometric_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  template_ref text not null,            -- opaque reference from the biometric provider; never a raw image
  provider text not null,                -- e.g. 'mock', 'local-bridge'
  consent_at timestamptz not null,
  enrolled_by uuid references public.profiles(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null
);
create unique index one_active_enrollment_per_student on public.biometric_enrollments(student_id) where revoked_at is null;
create unique index one_active_template_ref on public.biometric_enrollments(template_ref) where revoked_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs(created_at desc);
create index on public.audit_logs(entity_type, entity_id);

create table public.attendance_overrides (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  class_session_id uuid not null references public.class_sessions(id) on delete restrict,
  action text not null check (action in ('SIGN_IN','SIGN_OUT')),
  verification_method text not null default 'ADMIN_OVERRIDE' check (verification_method = 'ADMIN_OVERRIDE'),
  reason text not null check (reason in ('FINGERPRINT_FAILED','FINGER_INJURY','SCANNER_PROBLEM','OTHER')),
  notes text,
  approved_by uuid not null references public.profiles(id) on delete restrict,
  approved_at timestamptz not null default now(),
  audit_id uuid references public.audit_logs(id) on delete set null
);
create index on public.attendance_overrides(class_session_id);
create index on public.attendance_overrides(student_id);

-- updated_at maintenance
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['departments','courses','academic_sessions','students','profiles','registration_forms','class_sessions','attendance'] loop
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
