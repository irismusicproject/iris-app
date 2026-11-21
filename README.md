# iris-app
This is the first app for Iris Music Project, a Maryland-based nonprofit.

The app is built with Next.js on Vercel. Sign-in runs through Supabase. For now only staff and volunteers have accounts, and they sign in with an emailed link instead of a password.

## Pages

| Path | What it does |
|------|--------------|
| `/` | Welcome page |
| `/login` | The log-in page. Enter an email address to get a sign-in link. |
| `/dashboard` | Signed-in placeholder. It redirects to `/login` if you are not signed in. |
| `/auth/confirm` | Handles the link from the sign-in and invite emails. |

## How it's set up

| Piece | Where | Notes |
|-------|-------|-------|
| Code | GitHub, `irismusicproject/iris-app` (public) | Merging to `main` deploys automatically. |
| Hosting | Vercel | Live at https://app.irismusicproject.org |
| Sign-in and data | Supabase | Invite-only; sign-in by emailed link. |
| Email sending | Resend | Sends from `no-reply@mail.irismusicproject.org`. |
| DNS | Squarespace (irismusicproject.org) | The main website and Google email stay on the root domain. |

## Local setup

1. Install Node.js. On a Mac with Homebrew: `brew install node`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and **publishable** key (`sb_publishable_…`). Find both in Supabase under Project Settings, then API. The publishable key goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY` (its older name). Keep `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
3. Run `npm install`, then `npm run dev`, and open http://localhost:3000.

## Adding staff

Public sign-up is off. To give someone access, go to Supabase, then **Authentication → Users → Add user → Send invitation**, and enter their email. They click the link in the email to get in. After that, they sign in from `/login` with an emailed link.

## Supabase settings

All under **Authentication**:

- **Sign In / Providers:** "Allow new users to sign up" is **off**.
- **URL Configuration:**
  - Site URL: `https://app.irismusicproject.org`
  - Redirect URLs: `https://app.irismusicproject.org/**` and `http://localhost:3000/**`
- **Emails → Templates:** the links in these two templates go through the app's `/auth/confirm` page:
  - **Magic Link:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
  - **Invite user:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/dashboard`
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

## Deploying

Vercel deploys every merge to `main` automatically. It needs these three environment variables, under Settings, then Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the Supabase publishable key
- `NEXT_PUBLIC_SITE_URL`: `https://app.irismusicproject.org`

After changing a variable, redeploy from the **Deployments** tab so it takes effect.

## Security

This repository is public. Anyone can read the code, so the code must never hold anything private. Our data lives in Supabase, not here.

**Never commit:**
- `.env.local` or any other `.env` file except `.env.example`. These are already in `.gitignore`.
- The Supabase **secret key** (`sb_secret_…`, or the older `service_role` key). It skips every access rule. If the app ever needs it, add it only in Vercel's environment variables, and never with a `NEXT_PUBLIC_` name.
- Passwords, tokens or other service keys.
- Real people's data: names, emails, phone numbers, hours, exports, CSVs or database dumps. Use made-up data in tests and examples.
- Planning documents. They are kept privately in the "iris-app" folder in Google Drive, and `docs/` is ignored for this reason.

**Safe to commit:** the Supabase project URL and the **publishable** key (`sb_publishable_…`). They are sent to every visitor's browser anyway.

**The database protects the data.** Because the publishable key is public, anyone can send requests to our Supabase project. Turn on Row Level Security (RLS) for every table, with rules that let each person see only what their role allows. Do this when you create the table, before it holds real data.

**Before every commit,** look over what is staged (`git status` and `git diff --staged`). If a secret is ever pushed, deleting the commit is not enough: change (rotate) the key in Supabase or the other service right away, then remove it from the code.

**Found a security problem?** Please don't open a public issue. Email the Iris Music Project team instead.

## License

[MIT](LICENSE). You're welcome to reuse this code.
