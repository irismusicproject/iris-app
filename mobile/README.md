# Iris phone app

For musicians in the field (no admin features). Android first, then iPhone and
iPad from the same code. It talks to Supabase directly, through the same rules
as the website, and imports `../src/shared` as `@shared/...` (see `CLAUDE.md`,
"Platform strategy").

## What's in it (DOMAIN-MODEL v0.40)

| Tab / screen | Same as on the website |
|---|---|
| **Sign in**: email and password, or "Email me a code instead" | `/login`, `/login/code` |
| **Upcoming**: the dates I play in the next four weeks; "N programs to document". Tap a date for who's playing (call or text them) and directions | calendar feed / program month view |
| **Review my dates** (from Upcoming): a draft month building by building, "Done reviewing", and "No Program" on a draft date I play | month view |
| **My week**: programs I led (document each), relationship building (log, delete, "Not me"), hours and **Submit my week**, the month's reflection | `/documentation` |
| **More**: who's signed in, log out, My profile (phone, instruments), set my password, my private calendar link (create and share), Iris staff directory, link to My invoices | Home, `/account/*` |

Invoices (linked) and everything admin stay on the website.

**Offline (v0.40, `docs/OFFLINE-SPEC.md`).** Logging relationship building
and documenting a program (a new report) work without signal: they go into
the **outbox** on the phone and send by themselves when the connection comes
back (`src/lib/offline/`). Each is sent with a call that's safe to repeat
(the phone picks the id), so a lost answer never makes a duplicate. My week
and Upcoming open from the last copy ("Last updated …"). Anything the
database refuses goes to **Needs attention** on My week, with a fix or
Discard. Everything else (changing work already sent, reflections, Submit
my week) needs a connection.

- Kept in one encrypted SQLite file (SQLCipher; its key is in the phone's
  secure store). Resident names only, no room numbers (O7).
- Nothing is kept unless the phone has a screen lock (O12).
- Log out (after a warning about unsent work) and losing access wipe it
  (O9, O13).
- After 14 days without reaching Iris (`Setting` `offline_signin_max_days`,
  O8) it stops saving new work offline; unsent work is kept.
- In Expo Go the file isn't encrypted (Expo Go has no SQLCipher); installed
  builds are.

Code layout: screens in `src/app/` (Expo Router), the outbox and the phone's
copy in `src/lib/offline/`, the week's data in
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

Installable test builds (`eas build --profile preview --platform android`)
take their settings from Expo's **preview** environment (`eas.json`), which
needs the Iris Expo account. They listen on the **preview** update channel:

- **Code-only changes** (screens, wording, queries) reach installed test apps
  without reinstalling: `npx eas-cli update --channel preview --environment preview
  --message "…"`. The app picks it up the next time it's opened (or the time after).
- **Native changes** (a new package with native code, app icon, `app.json`
  plugins) need a new build. Bump `expo.version` in `app.json` first: updates
  only go to builds with the same version (`runtimeVersion` policy `appVersion`),
  so an update never lands on an app that can't run it.

## Checks

`npx tsc --noEmit` (CI runs it: `.github/workflows/mobile.yml`).
