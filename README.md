# NUFHAS Alumni Association — setup guide

Static front end (GitHub Pages) + Supabase back end (login, database, file storage).
Everything below is free-tier friendly. Menu labels in Supabase can change slightly; the names below are the ones to look for.

## What is in this folder
```
index.html            Pages: Directory, Jobs, My profile, Admin
assets/config.js      <-- paste your Supabase URL + key here
assets/data.js        Static content (events, quick links, skills list, 1 demo member)
assets/smart.js       Smart Talent Search engine (rule-based, runs in the browser)
assets/app.js         Application logic
assets/style.css      Deloitte-colour theme
supabase/schema.sql   Database + security rules (paste into Supabase SQL editor)
```
`members_import.csv` is delivered SEPARATELY. It holds real personal data. Never upload it to GitHub.

## STEP 0 — Remove the old public copy (important)
The first package contained all member names, emails, phones and blood groups. If it is on a public GitHub repo, that data is visible in the repo AND in its commit history.
1. GitHub > the old repo > Settings > scroll to Danger Zone > Delete this repository.
2. Create a brand-new repo in Step 6 (history is not carried over).

## STEP 1 — Create the Supabase project
1. https://supabase.com > Sign in with GitHub > New project.
2. Name: `nufhas-alumni`. Set a strong Database Password (save it). Region: Singapore (closest to Bangladesh). Create. Wait ~2 minutes.

## STEP 2 — Create the database
1. Left menu > SQL Editor > New query.
2. Open `supabase/schema.sql`, copy everything, paste, click Run. Expect "Success".
3. New query, run this with YOUR email (the one you will log in with):
   `insert into public.admins (email) values ('your.email@deloitte.com') on conflict do nothing;`

## STEP 3 — Email login (one-time code)
Supabase's built-in email sender only sends 2 emails/hour and only to your own team, so you MUST add your own SMTP sender.

A. Gmail sender (simplest)
1. Use a Gmail account for the association. Turn on 2-Step Verification, then create an App password (Google Account > Security > App passwords).
2. Supabase > Authentication > Emails > SMTP Settings (or Project Settings > Authentication > SMTP) > enable Custom SMTP:
   Sender email = that Gmail; Sender name = NUFHAS Alumni Association; Host = smtp.gmail.com; Port = 465; Username = the Gmail; Password = the app password. Save.
   (Alternative: Brevo free plan: host smtp-relay.brevo.com, port 587, login/key from Brevo > SMTP & API. Verify your sender first.)
3. Authentication > Rate Limits: raise "emails sent per hour" (new custom SMTP starts at about 30/hour).

B. Show the code in the email
1. Authentication > Emails > Templates.
2. Edit BOTH "Confirm sign up" and "Magic Link". Replace the body with:
```
<h2>NUFHAS Alumni Association</h2>
<p>Your sign-in code is:</p>
<h1 style="letter-spacing:4px">{{ .Token }}</h1>
<p>It expires soon. If you did not request it, ignore this email.</p>
<p>Or <a href="{{ .ConfirmationURL }}">click here to sign in</a>.</p>
```
   New people (and imported members on their first login) receive the "Confirm sign up" template; returning users receive "Magic Link". Both need the code.

C. Authentication > URL Configuration:
   Site URL = https://YOUR-USERNAME.github.io/nufhas-alumni/  (use your real URL from Step 6)
   Redirect URLs: add the same URL and the same URL followed by `**`.
   Make sure Email provider is enabled and "Allow new users to sign up" is ON.

## STEP 4 — Connect the website to Supabase
1. Supabase > Project Settings > API (or API Keys). Copy the Project URL and the anon / publishable key.
2. Edit `assets/config.js`:
   `const SUPABASE_URL = "https://xxxx.supabase.co";`
   `const SUPABASE_ANON_KEY = "eyJ... or sb_publishable_...";`
3. Never paste the service_role / secret key anywhere in this folder. The anon key is safe because the security rules in schema.sql protect the data.

## STEP 5 — Import your 150 members
1. Supabase > Table Editor > profiles > Insert > Import data from CSV.
2. Upload `members_import.csv`, check column mapping, Import.
3. SQL Editor: `select count(*) from public.profiles;` should return 150.
Members are imported as approved. They claim their own profile by logging in with the same email.

## STEP 6 — Publish on GitHub Pages
1. github.com > + > New repository > name `nufhas-alumni` > Public > Create.
2. Add file > Upload files > drag everything INSIDE this folder (index.html, assets, supabase, README.md, .gitignore, .nojekyll) > Commit changes.
3. Settings > Pages > Source: Deploy from a branch > Branch: main, folder /(root) > Save.
4. After 1–2 minutes the site is at https://YOUR-USERNAME.github.io/nufhas-alumni/. Put this exact URL in Step 3C.

## STEP 7 — First login and checks
1. Open the site > Sign in > enter your admin email > Send code > enter the code from your email.
2. You should now see the directory (sorted by earliest articleship start), the Jobs page and an Admin tab.
3. My profile > fill in your details, upload a photo and a CV.
4. Jobs > Post a job > then "Find candidates" to test Smart Talent Search.

## HOW MEMBERS LOG IN (share this with them)
1. Open the website > Sign in.
2. Enter the same official email that is in the directory > Send code.
3. Type the code from the email > you are in. Your profile is already there.
4. Go to My profile: add subjects cleared, articleship end date, skills, photo and CV. Save.
New people: sign in with any email, create a profile; it appears after an admin approves it (Admin tab > Approve).

## ADMIN TASKS
- Approve or reject new members: Admin tab.
- Delete any job: Admin tab.
- Add another admin: SQL Editor > insert into public.admins (email) values ('name@example.com');
- Edit/export data in bulk: Table Editor. Export profiles to CSV monthly as a backup.
- Free Supabase projects may be paused after about a week without activity; open the dashboard now and then or upgrade.

## FEATURES
- Smart Talent Search: type a brief like "audit senior, 3+ years experience, IFRS, advanced level, O+". The page shows what it understood, filters members and ranks them by match %. It is rule-based (no external AI service).
- Experience is calculated from the articleship start date until today.
- Order: earliest articleship start first.
- Chartered Accountants glow gold. Certificate/Professional/Advanced Level show subjects cleared in brackets, e.g. "Advanced Level (3)".
- Jobs: members post; each job shows your fit %. Poster/admin can find matching candidates.
- CVs are private files: only signed-in approved members can open them.

## TROUBLESHOOTING
- "email rate limit exceeded": SMTP not set up, or raise the limit (Step 3A).
- No code in the email: edit BOTH templates (Step 3B). Check spam.
- "Token has expired or is invalid": request a new code and use the latest one.
- "row-level security policy" error: you are not signed in, or the profile is not approved, or schema.sql was not run fully.
- Directory empty after login: your profile is not approved/imported, or your login email differs from the imported email.
- Blank page / "demo mode" footer: config.js values are empty or wrong.
