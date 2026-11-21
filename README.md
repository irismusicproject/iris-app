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

## Local setup

1. Create a Supabase project at https://supabase.com.
2. Copy `.env.example` to `.env.local` and fill in the project URL and anon key. Find both under Project Settings, then API.
3. Run `npm install`, then `npm run dev`, and open http://localhost:3000.

## Supabase settings

- **No public sign-up.** Under Authentication, then Sign In / Providers, turn off "Allow new users to sign up." Add each staff member under Authentication, then Users, with "Invite user."
- **Email templates.** Under Authentication, then Email Templates, change the link in the **Magic Link** and **Invite user** templates to:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
  (In the Invite template, use `type=invite`.)
- **URLs.** Under Authentication, then URL Configuration, set the Site URL to `https://app.irismusicproject.org`. Add `http://localhost:3000/**` to the redirect allow list.
- **Email sending.** Supabase's built-in email has a strict hourly limit. Before staff use the app for real, connect an SMTP provider such as Resend or Postmark.

## Deploying to app.irismusicproject.org

1. Import this repository into Vercel.
2. Add the three variables from `.env.example` to the Vercel project. Set `NEXT_PUBLIC_SITE_URL` to `https://app.irismusicproject.org`.
3. In the Vercel project, open Settings, then Domains, and add `app.irismusicproject.org`.
4. At the registrar for irismusicproject.org, add the CNAME record Vercel shows. It is usually `app` pointing to `cname.vercel-dns.com`. The main website at irismusicproject.org stays as it is.

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
