-- =====================================================================
--  NUFHAS Alumni Association — database schema (Supabase / PostgreSQL)
--  Paste this whole file into: Supabase Dashboard > SQL Editor > New query > Run
--  Safe to re-run.
-- =====================================================================

-- ---------- TABLES ----------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;   -- no policies = nobody can read it directly

create table if not exists public.profiles (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,                -- stored lower-case; identifies the owner
  name             text not null,
  company          text default 'Nurul Faruk Hasan & Co',
  location         text,
  department       text,
  designation      text,
  phone            text,
  ca_status        text check (ca_status in ('Certificate Level','Professional Level','Advanced Level','Chartered Accountant')),
  subjects_cleared int  check (subjects_cleared between 0 and 20),
  blood_group      text check (blood_group in ('A+','A-','B+','B-','O+','O-','AB+','AB-')),
  articleship_start date,
  articleship_end   date,
  skills           text,
  about            text,
  linkedin         text,
  photo_path       text,
  cv_path          text,
  approved         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table if not exists public.jobs (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  company        text not null,
  location       text,
  job_type       text default 'Full-time',
  exp_min        numeric default 0,
  exp_max        numeric,
  ca_status      text,
  skills         text,
  description    text,
  apply_contact  text not null,
  deadline       date,
  posted_by      text not null,
  posted_by_name text,
  created_at     timestamptz not null default now()
);
alter table public.jobs enable row level security;

-- ---------- HELPER FUNCTIONS ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a
                 where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.profiles p
                 where p.approved
                   and lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.owns_profile_folder(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.profiles p
                 where p.id::text = folder
                   and lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- public numbers for the landing page (no personal data)
create or replace function public.public_stats() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'members', count(*) filter (where approved),
    'cas',     count(*) filter (where approved and ca_status = 'Chartered Accountant'));
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin(), public.is_member(), public.public_stats() to anon, authenticated;
grant execute on function public.owns_profile_folder(text) to authenticated;
grant select, insert, update, delete on public.profiles, public.jobs to authenticated;

-- ---------- PROFILE GUARD ----------
-- Members can never approve themselves or change their email.
-- Changes made from the Supabase dashboard / SQL editor (no logged-in user) are trusted.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(new.email);
  new.updated_at := now();
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.approved := false;
    else
      new.approved := old.approved;
      new.email    := old.email;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before insert or update on public.profiles
for each row execute function public.guard_profile();

-- ---------- ROW LEVEL SECURITY: profiles ----------
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
drop policy if exists "profiles delete" on public.profiles;

create policy "profiles read" on public.profiles for select to authenticated
  using ( public.is_admin()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
       or (approved and public.is_member()) );

create policy "profiles insert" on public.profiles for insert to authenticated
  with check ( lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) );

create policy "profiles update" on public.profiles for update to authenticated
  using      ( public.is_admin() or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) )
  with check ( public.is_admin() or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) );

create policy "profiles delete" on public.profiles for delete to authenticated
  using ( public.is_admin() );

-- ---------- ROW LEVEL SECURITY: jobs ----------
drop policy if exists "jobs read"   on public.jobs;
drop policy if exists "jobs insert" on public.jobs;
drop policy if exists "jobs update" on public.jobs;
drop policy if exists "jobs delete" on public.jobs;

create policy "jobs read" on public.jobs for select to authenticated
  using ( public.is_member() );

create policy "jobs insert" on public.jobs for insert to authenticated
  with check ( public.is_member() and lower(posted_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

create policy "jobs update" on public.jobs for update to authenticated
  using ( public.is_admin() or lower(posted_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

create policy "jobs delete" on public.jobs for delete to authenticated
  using ( public.is_admin() or lower(posted_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

-- ---------- STORAGE (photos + CVs) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true,  2097152, array['image/jpeg','image/png','image/webp']),
  ('cvs',     'cvs',     false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars public read" on storage.objects;
drop policy if exists "cv members read"     on storage.objects;
drop policy if exists "own files insert"    on storage.objects;
drop policy if exists "own files update"    on storage.objects;
drop policy if exists "own files delete"    on storage.objects;

create policy "avatars public read" on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "cv members read" on storage.objects for select to authenticated
  using ( bucket_id = 'cvs' and public.is_member() );

create policy "own files insert" on storage.objects for insert to authenticated
  with check ( bucket_id in ('avatars','cvs') and public.owns_profile_folder((storage.foldername(name))[1]) );

create policy "own files update" on storage.objects for update to authenticated
  using ( bucket_id in ('avatars','cvs') and public.owns_profile_folder((storage.foldername(name))[1]) );

create policy "own files delete" on storage.objects for delete to authenticated
  using ( bucket_id in ('avatars','cvs') and public.owns_profile_folder((storage.foldername(name))[1]) );

-- ---------- FIRST ADMIN ----------
-- Replace with YOUR email, remove the leading dashes, and run once:
-- insert into public.admins (email) values ('your.name@example.com') on conflict do nothing;
