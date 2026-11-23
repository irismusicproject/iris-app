# Iris phone app

For musicians in the field (no admin features). Android first, then iPhone and
iPad from the same code. It talks to Supabase directly, through the same rules
as the website, and imports `../src/shared` as `@shared/...` (see `CLAUDE.md`,
"Platform strategy").

## What's in it (DOMAIN-MODEL v0.39)

| Tab / screen | Same as on the website |
|---|---|
| **Sign in**: email and password, or "Email me a code instead" | `/login`, `/login/code` |
| **Upcoming**: the dates I play in the next four weeks; "N programs to document". Tap a date for who's playing (call or text them) and directions | calendar feed / program month view |
| **Review my dates** (from Upcoming): a draft month building by building, "Done reviewing", and "No Program" on a draft date I play | month view |
| **My week**: programs I led (document each), relationship building (log, delete, "Not me"), hours and **Submit my week**, the month's reflection | `/documentation` |
| **More**: who's signed in, log out, My profile (phone, instruments), set my password, my private calendar link (create and share), Iris staff directory, link to My invoices | Home, `/account/*` |

Invoices (linked) and everything admin stay on the website. It's
**online only** for now: nothing is kept on the phone except the sign-in
(in the phone's secure store). Offline drafts are `docs/OFFLINE-SPEC.md`.

Code layout: screens in `src/app/` (Expo Router), the week's data in
`src/lib/week.ts` (a port of the website's My week queries), shared by screens
through `src/lib/week-context.tsx`; building blocks in `src/components/ui.tsx`.

## Try it on your phone (Expo Go)

1. Install **Expo Go** from the Play Store (or App Store).
2. Copy `.env.example` to `.env.local` and fill in **staging's** URL and
   publishable key (never production's, never a secret key).
3. `npm install`, then `npx expo start --go`.
4. Scan the QR code with Expo Go (phone and computer on the same Wi‑Fi).
5. Sign in with a fake staging login (e.g. `clara.clarinet@example.com` and
   `STAGING_TEST_PASSWORD`).

Installable test builds (`eas build --profile preview`) take their settings
from Expo's **preview** environment (`eas.json`), which needs the Iris Expo
account.

## Checks

`npx tsc --noEmit` (CI runs it: `.github/workflows/mobile.yml`).
