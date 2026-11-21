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
- **URLs.** Under Authentication, then URL Configuration, set the Site URL to `https://app.irismusicproject.com`. Add `http://localhost:3000/**` to the redirect allow list.
- **Email sending.** Supabase's built-in email has a strict hourly limit. Before staff use the app for real, connect an SMTP provider such as Resend or Postmark.

## Deploying to app.irismusicproject.com

1. Import this repository into Vercel.
2. Add the three variables from `.env.example` to the Vercel project. Set `NEXT_PUBLIC_SITE_URL` to `https://app.irismusicproject.com`.
3. In the Vercel project, open Settings, then Domains, and add `app.irismusicproject.com`.
4. At the registrar for irismusicproject.com, add the CNAME record Vercel shows. It is usually `app` pointing to `cname.vercel-dns.com`. The main website at irismusicproject.com stays as it is.
