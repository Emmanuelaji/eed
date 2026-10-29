#!/usr/bin/env bash
# Runs the migrations + SQL tests against a throwaway local PostgreSQL database.
# Usage: PGHOST=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=eed_test
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
# roles are cluster-wide: create them only if missing
psql -q -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end \$\$"
sed -e '/^create role/d' supabase/tests/00_stub_supabase.sql | psql -v ON_ERROR_STOP=1 -q -d $DB
for f in supabase/migrations/*.sql; do echo "== $f"; psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"; done
psql -v ON_ERROR_STOP=1 -q -d $DB -f supabase/tests/01_rules.sql

# ---- concurrency: 12 simultaneous connections scan the same finger for the same class ----
SESS=$(psql -qAt -d $DB -c "select t.mk_session(t.id('c1'), interval '-1 minute', interval '2 hours', interval '2 hours 15 minutes')")
LECT=$(psql -qAt -d $DB -c "select t.id('lect1')")
psql -q -d $DB -c "select public.start_class('$SESS')" -c "reset role" >/dev/null 2>&1 || true
psql -q -d $DB <<SQL >/dev/null
select set_config('request.jwt.claim.sub', '$LECT', false);
set role authenticated;
select public.start_class('$SESS');
reset role;
insert into public.students(matric_number, full_name, department_id, level) select 'CSC/22/900', 'Race Condition', id, 100 from public.departments limit 1;
insert into public.student_course_enrollments(reference, student_id, course_id, academic_session_id, semester)
  select 'EED-RACE', s.id, t.id('c1'), t.id('acad'), 'FIRST' from public.students s where s.matric_number = 'CSC/22/900';
insert into public.biometric_enrollments(student_id, template_ref, provider, consent_at) select id, 'race-template-0001', 'mock', now() from public.students where matric_number = 'CSC/22/900';
SQL
rm -f /tmp/eed_conc_*.out
for i in $(seq 1 12); do
  ( psql -qAt -d $DB -c "select set_config('request.jwt.claim.sub', '$LECT', false)" -c "set role authenticated" \
      -c "select public.scan_attendance('$SESS', 'race-template-0001', 'SIGN_IN')->>'code'" > /tmp/eed_conc_$i.out 2>&1 ) &
done
wait
OKS=$(cat /tmp/eed_conc_*.out | grep -c SIGN_IN_SUCCESS || true)
DUPS=$(cat /tmp/eed_conc_*.out | grep -c ALREADY_SIGNED_IN || true)
ROWS=$(psql -qAt -d $DB -c "select count(*) from public.attendance where class_session_id = '$SESS'")
echo "concurrency: successes=$OKS already_signed_in=$DUPS rows=$ROWS"
if [ "$OKS" = "1" ] && [ "$ROWS" = "1" ] && [ "$DUPS" = "11" ]; then echo "PASS: 12 concurrent scans created exactly one attendance record"; else echo "FAIL: concurrency"; exit 1; fi
echo "SQL tests finished"
