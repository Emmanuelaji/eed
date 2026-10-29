-- TEST HARNESS ONLY: emulates the parts of Supabase that the migrations rely on, so the SQL can be
-- tested on a plain PostgreSQL server. Do NOT run this on a real Supabase project.
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create publication supabase_realtime;
grant usage on schema public, auth, storage to anon, authenticated;
grant select on storage.objects to anon, authenticated; grant insert on storage.objects to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
