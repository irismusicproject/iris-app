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
| `/auth/confirm` | Handles the links in invite and password-reset emails. |

## How it's set up

| Piece | Where | Notes |
|-------|-------|-------|
| Code | GitHub, `irismusicproject/iris-app` (public) | Merging to `main` deploys automatically. |
| Hosting | Vercel | Live at https://app.irismusicproject.org |
| Sign-in and data | Supabase | Invite-only; email and password, or an emailed code. |
| Email sending | Resend | Sends from `no-reply@mail.irismusicproject.org`. |
| DNS | Squarespace (irismusicproject.org) | The main website and Google email stay on the root domain. |

## Local setup

1. Install Node.js. On a Mac with Homebrew: `brew install node`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and **publishable** key (`sb_publishable_…`). Find both in Supabase under Project Settings, then API. The publishable key goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY` (its older name). Keep `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
3. Run `npm install`, then `npm run dev`, and open http://localhost:3000.

## Adding staff

Admins add people in the app at **People** (`/admin/people`). The app sends the invite. The steps below are the older way, through Supabase directly; use them only if the People screen isn't available.

Public sign-up is off. To give someone access, go to Supabase, then **Authentication → Users → Add user → Send invitation**, and enter their email. They click the link in the email, choose a password (12 characters or more), and land on the dashboard. After that, they log in at `/login` with their email and password.

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

**To apply a new migration** (Ryan or Lauren, as a Supabase owner): open the project's **SQL Editor → New query**, paste the whole file, and click **Run**. Run it on **staging first** and test on the pull request's preview. Then run it on **production** just before merging. Apply each file once per project, in order.

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
| Migrations | Run **after** testing on staging, **before** merging | Run **first**, when a pull request adds one |

Testing on a preview never touches real data. A preview's invite and reset emails link back to that same preview. You'll need to be logged in to Vercel to open them, so test with your own email (a `+test` address works).

### Setting it up (one time, Ryan)

1. **Create the project.** In Supabase, in the Iris organization, click **New project**. Name it `iris-staging`, pick the same region as production, and save the database password in your password manager.
2. **Build the tables.** In the staging project's **SQL Editor**, run every file in `supabase/migrations/` in filename order, then run `supabase/seed.sql` for the fake partners and sites. Both are safe to run once each; the seed is safe to repeat.
3. **Sign-in settings** (under **Authentication**), matching production except for the email links:
   - **Sign In / Providers:** turn "Allow new users to sign up" **off**. Set **Minimum password length** to **12**.
   - **URL Configuration:** Site URL `http://localhost:3000`. Staging links don't use it; it only has to be a valid address. Redirect URLs: `https://*-rhearty1-5601s-projects.vercel.app/**` and `http://localhost:3000/**`.
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

## Deploying

Vercel deploys every merge to `main` automatically. Production needs these four environment variables, under Settings, then Environment Variables. Previews use staging's values instead:

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
