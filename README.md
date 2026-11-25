# iris-app
This is the first app for Iris Music Project, a Maryland-based nonprofit.

The app is built with Next.js on Vercel. Sign-in runs through Supabase. Only invited staff and musicians have accounts. They log in with their email and a password, or with a one-time code emailed to them.

## Pages

| Path | What it does |
|------|--------------|
| `/` | Welcome page |
| `/login` | Log in with email and password. |
| `/login/code` | Fallback: log in with a one-time code sent by email. |
| `/forgot-password` | Emails a link to set a new password. |
| `/account/password` | Set or change your password (signed in only). New people land here from their invite. |
| `/dashboard` | Home page after logging in. |
| `/account/profile` | My profile: change your own phone and instruments. |
| `/admin/people` | Admins only: add (invite), edit, deactivate and reactivate people. |
| `/admin/partners` | Admins only: partners, their sites (buildings or campuses), and the rooms within each site. |
| `/auth/confirm` | Handles the links in invite and password-reset emails. |

## How it's set up

| Piece | Where | Notes |
|-------|-------|-------|
| Code | GitHub, `irismusicproject/iris-app` (public) | `main` = finished work, on staging. `production` = released, on the live site (see Releasing). |
| Hosting | Vercel | Live at https://app.irismusicproject.org |
| Sign-in and data | Supabase | Invite-only; email and password, or an emailed code. |
| Email sending | Resend | Sends from `no-reply@mail.irismusicproject.org`. |
| DNS | Squarespace (irismusicproject.org) | The main website and Google email stay on the root domain. |

## Prototyping locally

The fastest way to try things: a private Supabase on your own computer, with no Supabase account, no approvals, and no way to touch real data.

**One time:** install [Node.js](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (free for nonprofits), open Docker Desktop once, and run `npm install`.

**Every time:** with Docker Desktop open, run `npm run dev:local` and go to http://localhost:3000.

| | |
|---|---|
| Admin login | `admin@example.com` / `local-only-password` |
| Musician login | `musician@example.com` / `local-only-password` |
| Emails (invites, codes, resets) | the mail viewer address the command prints (usually http://127.0.0.1:54324) |
| Start over | `npm run db:reset` rebuilds the database from `supabase/migrations/` and `supabase/seed.sql` |
| Stop | `npm run db:stop` |

The command writes `.env.development.local` (ignored by git), which points `npm run dev` at the local database. Delete it to point back at whatever `.env.local` says.

**Database changes:** add a file to `supabase/migrations/` (named `YYYYMMDDHHMMSS_what.sql`), then `npm run db:reset`. Until it's merged, edit it as often as you like. Check with `npm run test:db` and `npm run test:e2e`.

## Local setup against a hosted database

Only for checking something on staging. Copy `.env.example` to `.env.local`, fill in staging's URL and publishable key, run `npm install`, then `npm run dev`.

## Adding staff

Admins add people in the app at **People** (`/admin/people`). The app sends the invite. The steps below are the older way, through Supabase directly; use them only if the People screen isn't available.

Public sign-up is off. To give someone access, an admin adds them on **People** (with "Send the invite email now" ticked), or adds them quietly and later presses **Send invite** on their page (v0.30). Admins can also set up many people, programs and schedules at once from **Admin → Import**, which sends no email. (Supabase's **Authentication → Users → Add user → Send invitation** still works too.) They click the link in the email, choose a password (12 characters or more), and land on the dashboard. After that, they log in at `/login` with their email and password.

People who joined before passwords existed have no password yet. They can use **Email me a code instead** on the log-in page, then **Set or change your password** on the dashboard, or use **Forgot password?**.

## Supabase settings

All under **Authentication**:

- **Sign In / Providers:** "Allow new users to sign up" is **off**.
- **URL Configuration:**
  - Site URL: `https://app.irismusicproject.org`
  - Redirect URLs: `https://app.irismusicproject.org/**` and `http://localhost:3000/**`
- **Sign In / Providers → Email:** **Minimum password length** is **12**. This matches `PASSWORD_MIN_LENGTH` in `src/shared/auth/password.ts`; change both together. Leave **Email OTP Length** at 6.
- **Emails → Templates:**
  - **Invite user:** the link is `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/account/password?welcome=1`. The new person sets a password right away.
  - **Reset Password:** the link is `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/password`. This works even when the email is opened on a different device.
  - **Magic Link:** shows a **code** instead of a link, because `/login/code` asks people to type it. Put `{{ .Token }}` in the body, for example: "Your Iris Music Project sign-in code is **{{ .Token }}**. It expires in one hour." Remove the old link.
- **Emails → SMTP Settings:** custom SMTP through Resend:

  | Field | Value |
  |-------|-------|
  | Sender email | `no-reply@mail.irismusicproject.org` |
  | Sender name | `Iris Music Project` |
  | Host | `smtp.resend.com` |
  | Port | `465` |
  | Username | `resend` |
  | Password | A Resend API key with **Sending access** only. It lives only in Supabase; never paste it anywhere else. |

## Email (Resend)

- Resend sends from the subdomain **mail.irismusicproject.org**, verified in the US East region with open and click tracking off. Click tracking would rewrite the sign-in links.
- **The sender address must end in `@mail.irismusicproject.org`.** The root domain irismusicproject.org is not verified in Resend, and Resend rejects sends from it.
- If emails stop arriving, check Resend's **Logs** and **Emails** pages first. They show each send from Supabase and any error.
- **Emails the app sends itself** (`src/lib/notify.ts`) are separate from Supabase's sign-in emails and use two Vercel settings:
  - `RESEND_API_KEY`: a Resend key with **Sending access** only, separate from the one in Supabase. With it, the app sends the **welcome email** to people an admin added earlier (`src/lib/welcome-email.ts`). Without it, those people get Supabase's "Reset your password" email instead.
  - `NOTIFICATIONS_ENABLED=true`: only then do queued notifications (No Program, deadline reminders) go out. Until then they stay in the admin **Outbox** and are never sent later. Turn it on per environment, deliberately.
  - A message that keeps failing stops after **5 tries**; the Outbox shows why.
  - Staging (Vercel previews) sends as **Iris (staging)** from `staging@mail.irismusicproject.org`.
- If you need a new key, create it in Resend under **API Keys** with **Sending access** for `mail.irismusicproject.org`, paste it into Supabase's SMTP password, test, then delete the old key.

## DNS records (Squarespace)

Managed in Squarespace under **Domains → irismusicproject.org → DNS → Custom records**. Squarespace's **Name** field takes only the part before `.irismusicproject.org`.

| Name | Type | Points to | For |
|------|------|-----------|-----|
| `app` | CNAME | The value shown in Vercel, under Settings, then Domains | The app on Vercel |
| `resend._domainkey.mail` | TXT | DKIM key shown in Resend, under Domains | Resend email signing |
| `send.mail` | MX | `feedback-smtp.us-east-1.amazonses.com` (priority 10) | Resend bounces |
| `send.mail` | TXT | `v=spf1 include:amazonses.com ~all` | Resend SPF |
| `rsend.mail` | CNAME | `send.forge.rmta.net` | Resend |
| `_dmarc.mail` | TXT | `v=DMARC1; p=none;` | Spam protection for the `mail` subdomain |

Don't change the other records. They run the main website (Squarespace) and staff email (Google Workspace).

## Database changes (migrations)

The database's tables and security rules live in `supabase/migrations/`, one SQL file per change, applied in filename order. `npm run test:db` checks the security rules in a throwaway database, and CI runs it on every pull request.

**To apply a new migration:** open a pull request. GitHub applies it to staging, and to production after an owner approves (see [Automated database changes](#automated-database-changes)).

**First admins (one-time, after `20261121120000_person.sql`).** People who signed in before the People screen existed have no record yet. In the SQL Editor, run this once per person, filling in their details. (Real names and emails go in Supabase, never in this repo.)

```sql
insert into public.person (id, name, email, employment_type, system_roles)
select id, 'FULL NAME', lower(email), 'employee_w2', '{admin}'
from auth.users where email = 'THEIR EMAIL';
```

Use `'{}'` instead of `'{admin}'` for non-admins, and `contractor_1099` or `volunteer` as the employment type where it fits. After that, admins add everyone else from the People screen.

## Staging database (for previews)

Iris has **two** Supabase projects:

| | Production | Staging |
|---|---|---|
| Used by | The live site, app.irismusicproject.org | Every Vercel **preview** (addresses ending in `vercel.app`) |
| Data | Real people and partners | **Fake data only** (`supabase/seed.sql`) |
| Migrations | Applied by GitHub after an owner approves, **before** merging | Applied by GitHub automatically on every pull request |

Testing on a preview never touches real data. A preview's invite and reset emails link back to that same preview. You'll need to be logged in to Vercel to open them, so test with your own email (a `+test` address works).

### Setting it up (one time, Ryan)

1. **Create the project.** In Supabase, in the Iris organization, click **New project** (an organization-level project, not a branch). Name it `iris-staging`, choose **East US (North Virginia)** like production, and save the database password in your password manager.
2. **Build the tables.** After the GitHub environments exist ([Automated database changes](#automated-database-changes)), run **Actions → Database migrations → Run workflow → build-staging**. It applies every migration plus `supabase/seed.sql` (fake data) to staging only.
3. **Sign-in settings** (under **Authentication**), matching production except for the email links:
   - **Sign In / Providers:** turn "Allow new users to sign up" **off**. Set **Minimum password length** to **12**.
   - **URL Configuration:** Site URL `http://localhost:3000`. Staging links don't use it; it only has to be a valid address. Redirect URLs: `https://staging.irismusicproject.org/**` (the main branch's emails link there, `NEXT_PUBLIC_SITE_URL` on Vercel's Preview for `main`), `https://*-rhearty1-5601s-projects.vercel.app/**` (other previews) and `http://localhost:3000/**`. An address missing here sends the email's link to the Site URL instead.
   - **Emails → Templates:** previews have no fixed address, so staging's links use `{{ .RedirectTo }}` (which the app fills in) instead of `{{ .SiteURL }}`:
     - **Invite user:** `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite`
     - **Reset Password:** `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`
     - **Magic Link:** the same code email as production (`{{ .Token }}`).
   - **Emails → SMTP Settings:** Resend, as in production, but with a **separate** Resend API key named `supabase-staging` (Sending access only). Use the sender `staging@mail.irismusicproject.org` and the sender name `Iris (staging)`, so test emails are easy to tell apart.
4. **Make yourself an admin there.** Under **Authentication → Users → Add user → Create new user**, add your email with a password. Then run the "First admins" SQL from [Database changes](#database-changes-migrations) in the staging SQL Editor. In staging, always invite people **from the app's People screen**. Invites sent from the Supabase dashboard have no return address.
5. **Point previews at staging.** In Vercel, open **Settings → Environment Variables**. For each of these, set the **Preview** value to staging's and keep **Production** on production's. Where one entry covers both environments, edit it to Production only, then add a separate Preview entry.
   - `NEXT_PUBLIC_SUPABASE_URL`: staging's project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: staging's publishable key
   - `SUPABASE_SECRET_KEY`: a staging secret key named `vercel-iris-app-staging` (Sensitive)
   - `NEXT_PUBLIC_SITE_URL`: **Production only.** Remove it from Preview, so each preview uses its own address (`src/lib/site-url.ts`).
6. **Check it.** Redeploy any preview, log in with your staging account, and confirm that **People** lists only staging's people, not real ones.

## Automated database changes

GitHub applies migrations. **Don't paste migrations into the SQL Editor.** While Iris is prototyping:

1. **Pull requests never touch a real database.** Prototype locally; CI tests every pull request in a throwaway database.
2. **Merging to `main`** applies new migrations to **staging** automatically, plus the fake data in `supabase/seed.sql`.
3. **Production** changes only when an owner (Ryan) runs **Actions → Database migrations → Run workflow → deploy-production** and approves it. Until then, new screens that need new tables won't work on the live site.

**If staging gets out of step with `main`** (the staging update fails with "Remote migration versions not found in local migrations directory," usually because a migration changed after it reached staging), run **Actions → Database migrations → Run workflow → reset-staging**. It wipes staging's tables and rebuilds them from `main` plus the fake data. It can only reach staging. Afterward, rerun the "First admins" SQL in staging for anyone who needs an admin login there.

**Rules for migrations:**
- **Add, don't break.** When production is updated, the live code must keep working. To rename or remove a column, first add the new one, switch the code over, then drop the old one.
- **Never edit a migration that has already run.** Fix it with a new migration.
- **The seed is staging-only.** Production never gets `seed.sql`.

### One-time setup (Ryan)

1. **Get each database's connection string.** In each Supabase project (staging and production), click **Connect** and copy the **Session pooler** URI. GitHub's machines can't reach the direct connection. Replace `[YOUR-PASSWORD]` with that project's database password. If the password contains symbols, percent-encode them (for example, `@` becomes `%40`).
2. **Create two GitHub environments.** In the repository's **Settings → Environments**, create:
   - **`staging`**, with the secret `DATABASE_URL` set to staging's connection string.
   - **`production`**, with **Required reviewers** set to Ryan and Lauren, and the secret `DATABASE_URL` set to production's connection string.

   Each secret lives only in its environment, so the staging job can never reach production.
3. **Build staging's tables.** Open **Actions → Database migrations → Run workflow**, choose **build-staging**, and run it. It applies every migration plus the fake data to staging only.
4. **Tell the tool what production already has.** Production's first migrations were run by hand. Open **Actions → Database migrations → Run workflow**, choose **mark-applied**, and enter the versions already run on production, for example `20261121120000 20261122120000`. Approve the run. Its last step should show nothing pending.

## Overnight testing

Every night at 12:15 am Eastern, **Actions → Overnight test** (`.github/workflows/nightly.yml`) opens every page of the **staging** site as each test persona (signed out, admin, point person, Admin Lead, musician, substitute, deactivated), on desktop and phone. It records where each persona lands, screenshots, an accessibility scan (axe-core), browser console errors, failed requests and load times. It only opens pages; it has no database keys. Pages are found from `src/app/**/page.tsx`. The specs are in `e2e/overnight/` with their own config, `playwright.overnight.config.ts`.

**The report** is a new issue, "Overnight test report <date>": a permission matrix (✅ allowed, ↪ redirected, 🚫 not found, ❌ error; ⚠ marks a non-admin on an `/admin` page or a signed-out visitor on a private page), then errors, accessibility, console and network problems, and the slowest pages. Screenshots are in the run's **overnight-results** artifact (14 days; real emails and phone numbers blacked out). An optional AI tester adds findings as a comment: see `docs/overnight-ai-tester.md`.

**One-time setup (Ryan):**
1. **Repository secrets** (Settings → Secrets and variables → Actions):
   - `STAGING_TEST_PASSWORD`: a new password of 12+ characters for the test personas.
   - `VERCEL_AUTOMATION_BYPASS_SECRET`: from Vercel → Settings → Deployment Protection → **Protection Bypass for Automation**.
   - Optional `STAGING_URL`, if staging moves from https://staging.irismusicproject.org.
2. **`staging` environment secrets:** `SUPABASE_URL` (staging's project URL) and `SUPABASE_SECRET_KEY` (a new staging secret key, e.g. `github-staging-accounts`).
3. Run **Actions → Staging test accounts** (`scripts/staging-accounts.mjs`). It creates the `persona+<role>@example.com` accounts and links them to the first residency. Run it again after **reset-staging** or when new scheduling tables reach staging.

Until the secrets exist, both workflows skip with a warning.

### Exploring staging as anyone

The fake data in `supabase/seed.sql` (generated by `scripts/generate-seed.mjs`) is sized to try everything at once: 24 fake musicians and 3 fake staff on every real building, three months of programs, special events, relationship building and hours, with the last two weeks mixed (waiting for approval, sent back, not documented yet) and Ring House set up for detailed one-to-one notes. **Staging test accounts** also gives every fake person (an `@example.com` address and a name ending "(fake)") the `STAGING_TEST_PASSWORD`, so you can sign in as any of them, e.g. `clara.clarinet@example.com` (a musician) or `stella.staff@example.com` (an admin and point person). To start over, run **Database migrations → reset-staging**, then **Staging test accounts** again.

## Automated PR review

Every pull request gets one advisory comment from Claude (`.github/workflows/claude-review.yml`). It checks the change against `CLAUDE.md` and `docs/DOMAIN-MODEL.md`: permissions on new tables, forbidden names, privacy, edited migrations, missing tests and docs. Each push updates the same comment.

- **It never blocks merging.** It isn't a required check, and a failed review doesn't fail the run. Treat it as a second pair of eyes, not a gate.
- **It costs Anthropic API credit** on every run (each push to a pull request).
- **It skips pull requests from forks.**
- **Setup (Ryan, once):** add the repository secret `ANTHROPIC_API_KEY` under **Settings → Secrets and variables → Actions**. Until then, the workflow skips with a warning.
- **To turn it off:** open **Actions → Claude PR review**, click **⋯**, and choose **Disable workflow**. Deleting the secret also stops it.

## Releasing

Two branches, two meanings:

| Branch | Means | Database | Website |
|---|---|---|---|
| `main` | Finished: merged after CI passes | staging, updated automatically | the staging site: https://staging.irismusicproject.org (also at Vercel's branch address, https://iris-app-git-main-rhearty1-5601s-projects.vercel.app, which asks for a Vercel login) |
| `production` | Released by Ryan | production | app.irismusicproject.org |

**The handoff:** Lauren (or anyone) merges finished work to `main` when CI is green and notes it in issue #30. Ryan checks it on the staging site.

**To release:** **Actions → Release → Run workflow**, enter the **version**, then approve the **production** environment when GitHub asks. The workflow applies new migrations to production's database first, then moves `production` up to `main`, and Vercel publishes it. The run's summary lists what was released. Only this workflow moves `production`.

**Versions** follow `MAJOR.MINOR.PATCH`: **v0.x** while only insiders use the app; **v1.0** is the first release to musicians (Joanna and Jiyoung); then **v1.1, v1.2…** for new features and **v1.1.1** for a bug fix only. Each release tags the exact code and publishes a page under **Releases** listing the pull requests it contains. v0.1 is the sign-in, People and Partners version that was live on November 21, 2026.

**If a release goes wrong:** in Vercel, open **Deployments**, choose the previous production deployment, and click **Instant Rollback**.

**One-time setup (Ryan):** in Vercel → **Settings → Git**, set **Production Branch** to `production`.

## Deploying

Vercel publishes the `production` branch to the live site and builds every other branch (including `main`) as a preview. Production needs these four environment variables, under Settings, then Environment Variables. Previews use staging's values instead:

- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the Supabase publishable key
- `NEXT_PUBLIC_SITE_URL`: `https://app.irismusicproject.org` (Production only; see [Staging database](#staging-database-for-previews))
- `SUPABASE_SECRET_KEY`: the Supabase **secret** key (`sb_secret_…`), from Project Settings → API Keys. Mark it **Sensitive** in Vercel. The People screen uses it to send invites and block sign-in; nothing else does.

After changing a variable, redeploy from the **Deployments** tab so it takes effect.

## Brand

From Iris's brand guide (June 2026). Partner calendars and other outward documents use the same assets.

- **Logos** are in `public/brand/`, in purple (for light backgrounds) and white (for dark), in three versions: `horizontal` (app header), `primary` (stacked) and `mark` ("IRiS" only, for small sizes). Use the `Logo` component in `src/components/logo.tsx`; it switches to white in dark mode.
- **App icons:** `src/app/icon.png` and `src/app/apple-icon.png`; `public/icons/` holds the home-screen icons used by `src/app/manifest.ts`.
- **Colors:** purple `#411F50` (main), orange `#E84B1B`, blue `#629BD3`, pink `#F29FC5`. They're defined once in `src/app/globals.css`. Screens use the semantic names (`iris`, `muted`, `surface`…); the `brand-*` names are for accents. Orange and blue are too light for body text on white.
- **Fonts:** Montserrat (the guide's Google version): Bold for titles, Medium for subheadings and captions, Regular for body text. The website's Quincy and Gotham fonts are licensed through Squarespace only, so the app doesn't use them.

## Planning documents

The app's design documents are in `docs/`, and they are public like the rest of this repo:

| File | What it is |
|------|------------|
| `docs/DOMAIN-MODEL.md` | The app's objects, attributes and rules. The authority for code. |
| `docs/GLOSSARY.md` | How the team's words and partner-facing words map to those objects. |
| `docs/REQUIREMENTS.md` | What the app needs to do. |
| `docs/TERMINOLOGY-REVIEW.md` | Open naming and design decisions (D1–D16). |
| `docs/OFFLINE-SPEC.md` | Draft plan for working without a connection in the Android and iPhone apps (verdicts on each proposal; open items marked Ask). Not decided until copied into the domain model. |

See `CLAUDE.md` for how these are used when coding.

## Security

This repository is public. Anyone can read the code, so the code must never hold anything private. Our data lives in Supabase, not here.

**Never commit:**
- `.env.local` or any other `.env` file except `.env.example`. These are already in `.gitignore`.
- The Supabase **secret key** (`sb_secret_…`, or the older `service_role` key). It skips every access rule. If the app ever needs it, add it only in Vercel's environment variables, and never with a `NEXT_PUBLIC_` name.
- Passwords, tokens or other service keys.
- Real people's data: names, emails, phone numbers, hours, exports, CSVs or database dumps. Use made-up data in tests and examples.

**Safe to commit:** the Supabase project URL and the **publishable** key (`sb_publishable_…`). They are sent to every visitor's browser anyway.

**The database protects the data.** Because the publishable key is public, anyone can send requests to our Supabase project. Turn on Row Level Security (RLS) for every table, with rules that let each person see only what their role allows. Do this when you create the table, before it holds real data.

**Before every commit,** look over what is staged (`git status` and `git diff --staged`). If a secret is ever pushed, deleting the commit is not enough: change (rotate) the key in Supabase or the other service right away, then remove it from the code.

**Found a security problem?** Please don't open a public issue. Email the Iris Music Project team instead.

## License

[MIT](LICENSE). You're welcome to reuse this code.
