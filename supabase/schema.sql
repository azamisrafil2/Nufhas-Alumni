-- =====================================================================
--  NUFHAS Alumni Association — database schema (Supabase / PostgreSQL)
--  Paste this whole file into: Supabase Dashboard > SQL Editor > New query > Run
--  Safe to re-run (v2: moderators, news, Q&A, messages, reports, job saves).
-- =====================================================================

-- ---------- TABLES ----------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;   -- no policies = nobody can read it directly

-- Moderators: trusted members who can approve new members and remove bad posts.
-- (Only admins can add or remove moderators; managed from the Admin page.)
create table if not exists public.moderators (
  email text primary key check (email = lower(email))
);
alter table public.moderators enable row level security;

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

-- v2 additions (safe to re-run)
alter table public.profiles add column if not exists suspended    boolean not null default false;
alter table public.profiles add column if not exists notify_email boolean not null default true;
alter table public.profiles add column if not exists blood_donor  boolean not null default false;
alter table public.profiles add column if not exists mentor       boolean not null default false;
alter table public.profiles add column if not exists mentor_topics text;
alter table public.profiles add column if not exists hide_phone   boolean not null default false;
alter table public.profiles add column if not exists hide_email   boolean not null default false;

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
alter table public.jobs add column if not exists notify boolean not null default false;   -- email members when posted

-- ---------- HELPER FUNCTIONS ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a
                 where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.moderators m
                 where m.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- staff = admin or moderator
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_moderator();
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
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
    'cas',     count(*) filter (where approved and ca_status = 'Chartered Accountant'))
  from public.profiles;
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin(), public.is_moderator(), public.is_staff(), public.is_member(), public.public_stats() to anon, authenticated;
grant execute on function public.owns_profile_folder(text) to authenticated;
grant select, insert, update, delete on public.profiles, public.jobs, public.moderators to authenticated;

drop policy if exists "moderators admin" on public.moderators;
create policy "moderators admin" on public.moderators for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- PROFILE GUARD ----------
-- Members can never approve themselves, lift a suspension or change their email.
-- Moderators can only APPROVE other people's profiles (never edit them, never lift a suspension).
-- Changes made from the Supabase dashboard / SQL editor (no logged-in user) are trusted.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  req boolean;
begin
  new.email := lower(new.email);
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.approved  := false;
      new.suspended := false;
    elsif public.is_moderator() and lower(old.email) <> me then
      req := new.approved and not old.suspended;
      new := old;
      new.approved := (old.approved or req);
    else
      new.approved  := old.approved;
      new.suspended := old.suspended;
      new.email     := old.email;
    end if;
  end if;
  new.updated_at := now();
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
  using ( public.is_staff()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
       or (approved and public.is_member()) );

create policy "profiles insert" on public.profiles for insert to authenticated
  with check ( lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) );

create policy "profiles update" on public.profiles for update to authenticated
  using      ( public.is_staff() or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) )
  with check ( public.is_staff() or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) );

-- admins can remove anyone; moderators can only reject people who are still pending (never suspended members)
create policy "profiles delete" on public.profiles for delete to authenticated
  using ( public.is_admin() or (public.is_moderator() and not approved and not suspended) );

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
  using ( public.is_staff() or lower(posted_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

create policy "jobs delete" on public.jobs for delete to authenticated
  using ( public.is_staff() or lower(posted_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

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

-- ---------- EVENTS + QUICK LINKS (managed by admins, visible to everyone) ----------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  event_date date not null,
  place      text,
  tag        text,
  link       text,
  created_at timestamptz not null default now()
);
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  url         text not null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.events add column if not exists description text;
alter table public.events add column if not exists event_time  text;
alter table public.events add column if not exists banner_path text;
alter table public.events enable row level security;
alter table public.links  enable row level security;

drop policy if exists "events read"  on public.events;
drop policy if exists "events admin" on public.events;
drop policy if exists "links read"   on public.links;
drop policy if exists "links admin"  on public.links;

create policy "events read"  on public.events for select to authenticated using (public.is_member());
create policy "events admin" on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "links read"   on public.links  for select to authenticated using (public.is_member());
create policy "links admin"  on public.links  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke select on public.events, public.links from anon;
grant select, insert, update, delete on public.events, public.links to authenticated;

-- public bucket for event banner pictures (only admins can upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-banners', 'event-banners', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "banners read"   on storage.objects;
drop policy if exists "banners insert" on storage.objects;
drop policy if exists "banners update" on storage.objects;
drop policy if exists "banners delete" on storage.objects;
create policy "banners read"   on storage.objects for select using ( bucket_id = 'event-banners' );
create policy "banners insert" on storage.objects for insert to authenticated with check ( bucket_id = 'event-banners' and public.is_admin() );
create policy "banners update" on storage.objects for update to authenticated using ( bucket_id = 'event-banners' and public.is_admin() );
create policy "banners delete" on storage.objects for delete to authenticated using ( bucket_id = 'event-banners' and public.is_admin() );

insert into public.links (title, description, url, sort)
select * from (values
  ('Job Board', 'Openings posted by senior members and alumni.', '#/jobs', 1),
  ('Update your profile', 'Add your photo, CV, skills and subject progress.', '#/profile', 2)
) v(title, description, url, sort)
where not exists (select 1 from public.links);

-- ---------- LIBRARY: past papers + exam notes ----------
create table if not exists public.library (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  kind             text not null check (kind in ('Past Paper','Exam Notes')),
  level            text check (level in ('Certificate Level','Professional Level','Advanced Level')),
  subject          text not null,
  year             int,
  description      text,
  file_path        text,
  link_url         text,
  uploaded_by      text not null,
  uploaded_by_name text,
  created_at       timestamptz not null default now(),
  check (file_path is not null or link_url is not null)
);
alter table public.library enable row level security;
grant select, insert, update, delete on public.library to authenticated;

drop policy if exists "library read"   on public.library;
drop policy if exists "library insert" on public.library;
drop policy if exists "library update" on public.library;
drop policy if exists "library delete" on public.library;
create policy "library read"   on public.library for select to authenticated using ( public.is_member() );
create policy "library insert" on public.library for insert to authenticated
  with check ( public.is_member() and lower(uploaded_by) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "library update" on public.library for update to authenticated
  using ( public.is_staff() or lower(uploaded_by) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "library delete" on public.library for delete to authenticated
  using ( public.is_staff() or lower(uploaded_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "library files read"   on storage.objects;
drop policy if exists "library files insert" on storage.objects;
drop policy if exists "library files delete" on storage.objects;
create policy "library files read" on storage.objects for select to authenticated
  using ( bucket_id = 'library' and public.is_member() );
create policy "library files insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'library' and public.is_member() and public.owns_profile_folder((storage.foldername(name))[1]) );
create policy "library files delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'library' and (public.is_staff() or public.owns_profile_folder((storage.foldername(name))[1])) );

-- =====================================================================
--  v2: COMMUNITY FEATURES (news, Q&A, messages, reports, job marks)
-- =====================================================================

-- Daily posting limits (staff exempt). Stops spam and runaway scripts.
create or replace function public.rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare col text := tg_argv[0]; lim int := tg_argv[1]::int; n int;
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  execute format('select count(*) from %I.%I where lower(%I) = lower($1) and created_at > now() - interval ''1 day''',
                 tg_table_schema, tg_table_name, col)
    using (to_jsonb(new) ->> col) into n;
  if n >= lim then
    raise exception 'Daily limit reached (% per day). Please try again tomorrow.', lim;
  end if;
  return new;
end $$;

drop trigger if exists trg_rate_jobs on public.jobs;
create trigger trg_rate_jobs before insert on public.jobs
  for each row execute function public.rate_limit('posted_by', '5');
drop trigger if exists trg_rate_library on public.library;
create trigger trg_rate_library before insert on public.library
  for each row execute function public.rate_limit('uploaded_by', '10');

-- ---------- NEWS (members submit, staff approve) ----------
create table if not exists public.news (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) <= 140),
  body           text check (char_length(body) <= 2000),
  link           text,
  pinned         boolean not null default false,
  status         text not null default 'pending' check (status in ('pending','approved')),
  posted_by      text not null,
  posted_by_name text,
  created_at     timestamptz not null default now()
);
alter table public.news enable row level security;
grant select, insert, update, delete on public.news to authenticated;

create or replace function public.guard_news() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and tg_op = 'INSERT' then
    if public.is_staff() then new.status := 'approved';
    else new.status := 'pending'; new.pinned := false; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_news on public.news;
create trigger trg_guard_news before insert on public.news for each row execute function public.guard_news();
drop trigger if exists trg_rate_news on public.news;
create trigger trg_rate_news before insert on public.news
  for each row execute function public.rate_limit('posted_by', '5');

drop policy if exists "news read"   on public.news;
drop policy if exists "news insert" on public.news;
drop policy if exists "news update" on public.news;
drop policy if exists "news delete" on public.news;
create policy "news read" on public.news for select to authenticated
  using ( public.is_member() and (status = 'approved' or public.is_staff()
          or lower(posted_by) = lower(coalesce(auth.jwt() ->> 'email',''))) );
create policy "news insert" on public.news for insert to authenticated
  with check ( public.is_member() and lower(posted_by) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "news update" on public.news for update to authenticated
  using ( public.is_staff() ) with check ( public.is_staff() );
create policy "news delete" on public.news for delete to authenticated
  using ( public.is_staff() or lower(posted_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

-- ---------- Q&A ----------
create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 5 and 200),
  body           text check (char_length(body) <= 3000),
  tag            text,
  asked_by       text not null,
  asked_by_name  text,
  created_at     timestamptz not null default now()
);
create table if not exists public.answers (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references public.questions(id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 3000),
  answered_by      text not null,
  answered_by_name text,
  created_at       timestamptz not null default now()
);
alter table public.questions enable row level security;
alter table public.answers   enable row level security;
grant select, insert, update, delete on public.questions, public.answers to authenticated;

drop trigger if exists trg_rate_questions on public.questions;
create trigger trg_rate_questions before insert on public.questions
  for each row execute function public.rate_limit('asked_by', '5');
drop trigger if exists trg_rate_answers on public.answers;
create trigger trg_rate_answers before insert on public.answers
  for each row execute function public.rate_limit('answered_by', '20');

drop policy if exists "questions read"   on public.questions;
drop policy if exists "questions insert" on public.questions;
drop policy if exists "questions delete" on public.questions;
create policy "questions read"   on public.questions for select to authenticated using ( public.is_member() );
create policy "questions insert" on public.questions for insert to authenticated
  with check ( public.is_member() and lower(asked_by) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "questions delete" on public.questions for delete to authenticated
  using ( public.is_staff() or lower(asked_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

drop policy if exists "answers read"   on public.answers;
drop policy if exists "answers insert" on public.answers;
drop policy if exists "answers delete" on public.answers;
create policy "answers read"   on public.answers for select to authenticated using ( public.is_member() );
create policy "answers insert" on public.answers for insert to authenticated
  with check ( public.is_member() and lower(answered_by) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "answers delete" on public.answers for delete to authenticated
  using ( public.is_staff() or lower(answered_by) = lower(coalesce(auth.jwt() ->> 'email','')) );

-- ---------- CONTACT REQUESTS (private in-site messages; staff cannot read them) ----------
create table if not exists public.contact_requests (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'message' check (kind in ('message','mentorship','hiring')),
  from_email text not null,
  from_name  text,
  to_email   text not null,
  message    text not null check (char_length(message) between 1 and 1000),
  is_read    boolean not null default false,
  created_at timestamptz not null default now(),
  check (lower(from_email) <> lower(to_email))
);
alter table public.contact_requests enable row level security;
grant select, insert, update, delete on public.contact_requests to authenticated;

drop trigger if exists trg_rate_contact on public.contact_requests;
create trigger trg_rate_contact before insert on public.contact_requests
  for each row execute function public.rate_limit('from_email', '10');

drop policy if exists "contact read"   on public.contact_requests;
drop policy if exists "contact insert" on public.contact_requests;
drop policy if exists "contact update" on public.contact_requests;
drop policy if exists "contact delete" on public.contact_requests;
create policy "contact read" on public.contact_requests for select to authenticated
  using ( lower(to_email) = lower(coalesce(auth.jwt() ->> 'email',''))
       or lower(from_email) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "contact insert" on public.contact_requests for insert to authenticated
  with check ( public.is_member()
    and lower(from_email) = lower(coalesce(auth.jwt() ->> 'email',''))
    and exists (select 1 from public.profiles p where p.approved and lower(p.email) = lower(to_email)) );
create policy "contact update" on public.contact_requests for update to authenticated
  using ( lower(to_email) = lower(coalesce(auth.jwt() ->> 'email','')) )
  with check ( lower(to_email) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "contact delete" on public.contact_requests for delete to authenticated
  using ( lower(to_email) = lower(coalesce(auth.jwt() ->> 'email',''))
       or lower(from_email) = lower(coalesce(auth.jwt() ->> 'email','')) );

-- Recipients may only flip is_read, never rewrite a message.
create or replace function public.guard_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare r boolean;
begin
  r := new.is_read; new := old; new.is_read := r; return new;
end $$;
drop trigger if exists trg_guard_contact on public.contact_requests;
create trigger trg_guard_contact before update on public.contact_requests
  for each row execute function public.guard_contact();

-- ---------- REPORTS (flag a post for staff to review) ----------
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('job','library','news','question','answer')),
  target_id    uuid not null,
  target_label text,
  reason       text check (char_length(reason) <= 500),
  reported_by  text not null,
  status       text not null default 'open' check (status in ('open','closed')),
  created_at   timestamptz not null default now()
);
create unique index if not exists reports_once on public.reports (kind, target_id, lower(reported_by));
alter table public.reports enable row level security;
grant select, insert, update, delete on public.reports to authenticated;

drop trigger if exists trg_rate_reports on public.reports;
create trigger trg_rate_reports before insert on public.reports
  for each row execute function public.rate_limit('reported_by', '20');

drop policy if exists "reports insert" on public.reports;
drop policy if exists "reports staff"  on public.reports;
create policy "reports insert" on public.reports for insert to authenticated
  with check ( public.is_member() and lower(reported_by) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "reports staff" on public.reports for all to authenticated
  using ( public.is_staff() ) with check ( public.is_staff() );

-- ---------- JOB MARKS (private "saved" + "I'm interested" visible to the poster) ----------
create table if not exists public.job_marks (
  job_id     uuid not null references public.jobs(id) on delete cascade,
  email      text not null,
  kind       text not null check (kind in ('save','interested')),
  created_at timestamptz not null default now(),
  primary key (job_id, email, kind)
);
alter table public.job_marks enable row level security;
grant select, insert, delete on public.job_marks to authenticated;

drop policy if exists "marks read"   on public.job_marks;
drop policy if exists "marks insert" on public.job_marks;
drop policy if exists "marks delete" on public.job_marks;
create policy "marks read" on public.job_marks for select to authenticated
  using ( lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
       or (kind = 'interested' and exists (select 1 from public.jobs j
             where j.id = job_id and lower(j.posted_by) = lower(coalesce(auth.jwt() ->> 'email',''))))
       or public.is_staff() );
create policy "marks insert" on public.job_marks for insert to authenticated
  with check ( public.is_member() and lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) );
create policy "marks delete" on public.job_marks for delete to authenticated
  using ( lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) );

-- ---------- NOTIFICATION LOG (written by the Edge Function; nobody can read it from the site) ----------
create table if not exists public.notify_log (
  id         bigint generated always as identity primary key,
  kind       text not null,
  ref_id     text,
  recipients int  not null default 0,
  status     text not null,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.notify_log enable row level security;   -- no policies: service role only

-- ---------- FIRST ADMIN ----------
-- Only needed on a brand-new project. Replace with YOUR email, remove the leading dashes, run once:
-- insert into public.admins (email) values ('your.name@example.com') on conflict do nothing;
-- Moderators are added later from the Admin page (no SQL needed).
