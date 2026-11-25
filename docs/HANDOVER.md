# Developer handover: how the Iris app was built, and how to carry on

_Written November 25, 2026 (Ryan's side), covering the work from November 20
to November 25, 2026. For a developer who joins without Lauren or Ryan at
hand. The file explains how the pieces fit, how a change travels from an
idea to the live site, what happened day by day, and where the work stopped.
A user guide comes later, with version 1.0._

**Read in this order:** this file, then `CLAUDE.md` (the working rules),
`README.md` (every setting, step by step), `docs/DOMAIN-MODEL.md` (what the
code means) and `docs/GLOSSARY.md` (what people mean). Where this file and
those disagree, they win: this file summarizes and points.

**No secrets here.** The repository is public. This file names accounts and
settings but never holds a password, key or real person's data. Credentials
come from Ryan or Lauren (section 3).

---

## 1. The app in one page

Iris Music Project, a Maryland nonprofit, runs Ensemble-in-Residence music
programs in senior living communities. Staff and contract musicians use the
app to schedule programs month by month, document each program, log
relationship building with residents, record hours, and produce partner
calendars and invoices.

There are two front ends over one database:

| Part | Built with | Who uses it | Lives at |
|---|---|---|---|
| **Website** | Next.js 15 (App Router, React 19), TypeScript | Everyone; all admin work happens here | `app.irismusicproject.org` (live), `staging.irismusicproject.org` (staging) |
| **Phone app** | Expo SDK 58 (React Native 0.88, Expo Router), in `mobile/` | Musicians in the field; no admin features | Android test builds through Expo (EAS); iPhone later |
| **Database, sign-in, rules** | Supabase (Postgres, Auth, Row Level Security) | Both front ends talk to it directly | Two projects: production and `iris-staging` |
| **Email** | Resend | Sign-in emails (through Supabase) and the app's own notices | Sends from `@mail.irismusicproject.org` |

**The design choice that shapes everything:** business rules and
permissions live **in the database** (Row Level Security policies and
Postgres functions), not in page code. The website and the phone app only
display and submit. A rule changed in a migration therefore changes for
both apps at once, and a page that forgets a check still can't leak data.

---

## 2. Who did what

- **Lauren** (Iris staff) is the **product owner and designer**. She decides
  what the app does and how it looks and works, and she has the last word
  on both. Her Claude Code sessions build features as prototypes on feature
  branches, run locally.
- **Ryan** is the **chief engineer**: testing, maintenance, repair, security,
  sign-in, infrastructure, merging to `main` and releasing. His Claude Code
  sessions write the tests, review migrations and permission rules, fix
  bugs and run releases.
- Both worked mostly through **Claude Code** sessions, one per side. The
  split is "a guide, not a rule" (`CLAUDE.md`, Nov 24): either side may
  cross it, but Lauren keeps the last word on design.
- They coordinate on **GitHub issue #30** (pinned). Every handoff is a
  comment that starts with **[Lauren's side]** or **[Ryan's side]**. Read it
  first: `gh issue view 30 --comments`.

---

## 3. Accounts and credentials you will need

Ask Ryan (or Lauren) to add you to each account; don't share logins. Each
row says what the account controls, so you can tell what you lack when
something fails.

| Service | What it holds | Access you need |
|---|---|---|
| **GitHub**, organization `irismusicproject`, repo `iris-app` (public) | Code, pull requests, Actions (CI, migrations, releases, tests), issue #30 | Write access; an owner to approve the `production` environment |
| **Vercel**, project `iris-app` | Website hosting, previews, environment variables, domains | Team member |
| **Supabase**, two projects (production; `iris-staging`) | Database, sign-in, email templates, API keys | Organization member; the database passwords are in Ryan's password manager |
| **Resend** | Email sending for `mail.irismusicproject.org`; API keys | Team member |
| **Squarespace** (domain `irismusicproject.org`) | DNS records for `app`, `staging` and `mail` | Rarely needed; Iris staff hold it |
| **Expo / EAS**, account `iris-music-project`, project `iris-app` | Phone app builds, over-the-air updates, the phone's environment settings | Organization member |
| **Anthropic API** | The key behind the advisory Claude PR review | Only if you keep that review on |
| Google Play / Apple developer accounts | Not set up yet | Needed before version 1.0 ships to phones |

**Where each secret is stored (names only):**

- **Vercel environment variables:** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase's publishable key),
  `SUPABASE_SECRET_KEY` (Sensitive), `NEXT_PUBLIC_SITE_URL` (Production
  only), `RESEND_API_KEY`, `NOTIFICATIONS_ENABLED`.
  Production holds production's values; Preview holds staging's.
- **GitHub repository secrets:** `STAGING_TEST_PASSWORD` (the fake test
  accounts' password), `VERCEL_AUTOMATION_BYPASS_SECRET` (lets robots open
  protected previews), `ANTHROPIC_API_KEY`, optionally `STAGING_URL`.
  **Repository variables:** `STAGING_SUPABASE_URL`,
  `STAGING_SUPABASE_PUBLISHABLE_KEY`.
- **GitHub environment `staging`:** `DATABASE_URL` (staging's pooled
  connection string), `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
- **GitHub environment `production`:** `DATABASE_URL`, with required
  reviewers. The staging job cannot reach production's secret.
- **Supabase (each project):** the Resend SMTP password, under
  Authentication → Emails → SMTP.
- **Expo environments `preview` and `production`:**
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Your computer only:** `.env.local`, `.env.development.local`,
  `.env.overnight`, `mobile/.env.local`. All are ignored by git.

Two keys are safe in public: the Supabase project URL and the
**publishable** key. The **secret** key bypasses every rule; it belongs only
in Vercel and GitHub secrets, never in code or a `NEXT_PUBLIC_` name.

---

## 4. How the repository is organized

```
iris-app/
├── CLAUDE.md               working rules for people and Claude sessions (read first)
├── README.md               every setting and setup step
├── docs/                   design: domain model, glossary, requirements, decisions,
│                           offline plan, personas, acceptance checklist, this file
├── src/
│   ├── app/                website pages and API routes (Next.js App Router)
│   │   └── api/            server endpoints: schedule-month (PDF + email),
│   │                       notify, cron/notifications, calendar feeds…
│   ├── components/         website building blocks
│   ├── lib/                website-only code: Supabase clients, email (notify.ts),
│   │                       PDFs, site URL
│   └── shared/             code BOTH apps import (the phone as @shared/…):
│       ├── database.types.ts   generated from the migrations; never edit by hand
│       ├── auth/password.ts    the 12-character rule
│       └── domain/             one module per domain area: validation, time zones,
│                               scheduling, documentation, invoices, forms…
├── supabase/
│   ├── migrations/         one SQL file per change, applied in filename order
│   ├── seed.sql            fake data for local and staging (generated)
│   ├── templates/          email templates for the local Supabase
│   └── tests/              database tests (node scripts against a local Supabase)
├── e2e/                    browser tests (Playwright); e2e/overnight/ and
│                           e2e/staging-journeys/ run against staging
├── mobile/                 the phone app (its own package.json and README)
│   ├── src/app/            screens (Expo Router; tabs: To do, Today, Calendar)
│   ├── src/lib/offline/    the outbox and the encrypted local copy
│   ├── .maestro/           phone journey tests and their prep scripts
│   └── eas.json, app.json  build profiles and app settings
├── scripts/                local Supabase, seed generator, staging accounts,
│                           overnight report, wait-for (bounded waits)
├── .github/workflows/      CI, migrations, release, nightly tests (section 9)
├── next.config.ts          includes the PDF font files in Vercel's bundle (section 8)
└── vercel.json             skips website builds when only mobile/ changed
```

---

## 5. The three languages (the rule most likely to trip you)

Iris staff overload words, "program" above all: it can mean a residency, a
weekly series, a single session or a time category. So the code has its own
vocabulary:

1. **Domain model (the code):** `docs/DOMAIN-MODEL.md`. One name, one meaning:
   `Residency`, `Series`, `Session`, `Partner`, `Site`, `Location`,
   `RosterMember`, `ScheduleMonth`, `ChangeRequest`, `TimeEntry`…
2. **Team language:** how staff and musicians talk. Fixed.
3. **Outward language:** what prints on partner calendars and invoices. Fixed.

`docs/GLOSSARY.md` maps languages 2 and 3 onto language 1. **Never** name a
table, column, type, variable, route or file `program`, `community` or
`ensemble`; those words appear only in screen text, through the glossary.
A request in team language gets mapped to domain objects in one line before
any code is written, and anything that maps to zero objects or to several is
a question for Lauren, not a guess (`CLAUDE.md`, "Flag ambiguities").

The decisions behind the model are numbered **D1–D18** (table in `CLAUDE.md`,
reasoning in `docs/TERMINOLOGY-REVIEW.md`). Every one is now decided. Each
change to the model bumps the draft version at the top of
`DOMAIN-MODEL.md` (v0.46 at this writing), and feature PR titles carry that
version.

---

## 6. Environments, and how a change reaches the live site

| Environment | Database | Website | Data | Who changes it |
|---|---|---|---|---|
| **Local** | Supabase in Docker (`npm run dev:local`) | `localhost:3000` | Fake (`seed.sql`); logins `admin@example.com` / `musician@example.com` | You, freely |
| **CI** | A throwaway Supabase per run | none | Test data | GitHub Actions |
| **Staging** | `iris-staging` | `staging.irismusicproject.org`, plus every Vercel preview | **Fake only**: 24 fake musicians, 3 fake staff on Iris's real buildings, three months of work | Automatic on merge to `main` |
| **Production** | production | `app.irismusicproject.org` | Real | Only the **Release** workflow, after Ryan approves |

**Branches:** `main` means finished and on staging. `production` means
released and live, and only the Release workflow moves it. Never push to
`production` or open a pull request against it.

**The path of one change:**

1. **Prototype** on a short-lived branch against the local database
   (`npm run dev:local`). A database change is a new file in
   `supabase/migrations/`; edit it freely until it merges.
2. **Regenerate types** after a migration: `npm run db:types` (CI fails
   while `src/shared/database.types.ts` is stale).
3. **Open a pull request.** CI runs lint, types, build, database tests,
   browser tests and a package audit; Vercel builds a preview against
   staging's database; Claude posts one advisory review comment. Add the
   label `phone-tests` to run the phone journeys too (about 35 minutes).
4. **Merge to `main`** once green (Ryan's side merges feature PRs; Lauren's
   side merges docs-only PRs). The migration workflow applies the new
   migrations and the fake seed to **staging**; Vercel updates the staging
   site. Post one line on issue #30.
5. **Release:** Actions → **Release** → Run workflow → enter a version →
   approve `production`. It migrates production's database first, then
   moves `production` to `main` (Vercel publishes), tags the version and
   writes release notes. Roll back with Vercel's **Instant Rollback**.

**Two database rules that keep phones working:** never edit a migration
that has reached `main` (fix it with a new one), and **expand, then
contract**: phones in the field run older app versions for weeks, so add the
new column or function, keep the old one working, and remove the old one in
a later release.

---

## 7. The database (Supabase)

- **37 migrations** so far, from `20261121120000_person.sql` to
  `20261228120000_my_tasks_local_date.sql`. (The later filenames carry
  December dates; the numbers only need to sort in order.)
- **Every table has Row Level Security** from the moment it's created. The
  publishable key is public, so the rules are the only protection.
- **Logic lives in Postgres functions** the apps call with `rpc(...)`:
  opening and confirming a month, "I can't play", change requests, logging
  relationship building, `my_tasks` (the To do list, calculated by the
  database). The phone's offline sends use functions that are safe to
  repeat: the phone picks the record's id, so a lost reply never makes a
  duplicate.
- **Time zones:** each `Site` has a time zone. "Today" and deadlines are
  computed in the site's zone or Eastern, never in the database's UTC. Two
  evening bugs came from UTC dates (#67, #94, #95); shared helpers in
  `src/shared/domain/time.ts` (`todayIn`) prevent a third.
- **Tests:** `npm run test:db` runs eleven suites in `supabase/tests/`:
  permission rules (`rls`), scheduling and money scenarios, seeded-random
  "invariant" tests that hunt for rule gaps, the monthly cycle, offline
  calls and the phone's functions. CI runs them on every pull request.
- **Seed data:** `scripts/generate-seed.mjs` writes `supabase/seed.sql`;
  `scripts/check-seed.mjs` checks it. Real building names, fake everything
  else.
- **Staging tools** (Actions tab): **Database migrations** with
  `build-staging`, `reset-staging` (wipe and rebuild from `main`),
  `deploy-production` and `mark-applied`; **Staging test accounts** gives
  every fake person the test password. Run it again after a reset.

---

## 8. The website (Vercel)

- Vercel builds every branch as a preview and publishes `production` to
  `app.irismusicproject.org`. `staging.irismusicproject.org` points at
  `main`'s preview. Previews are protected; robots get in with the bypass
  secret.
- `vercel.json` skips website builds when only `mobile/` changed.
- **PDFs** (invoices, the partner calendar) use `pdfkit`. Vercel trims
  files it doesn't see imported, which broke every PDF until
  `outputFileTracingIncludes` in `next.config.ts` listed pdfkit's font and
  data files, the Montserrat font files and the logo (#97, #99). Keep that
  list in step if you add fonts or images to PDFs.
- **Forms** normalize line breaks (browsers send `\r\n`) through `formText()`
  in `src/shared/domain/form.ts` (#103), so a note's length is counted the
  same on both apps.
- **Email** has two paths. Supabase sends sign-in emails through Resend's
  SMTP. The app sends its own notices (welcome, No Program, deadline and task
  reminders, the partner calendar) through `src/lib/notify.ts`, which
  queues everything in an outbox table and sends only where
  `NOTIFICATIONS_ENABLED=true`. Staging sends as "Iris (staging)".
- **Reminders run hourly on Vercel Schedules** (added Nov 25): `vercel.json`
  points the `notifications` schedule at a private function,
  `src/app/api/schedules/notifications/route.ts`, which only Vercel's
  scheduler can call. Staging's copy of the schedule must be switched on
  once in Vercel's Schedules page; production's is on from its first
  release. README, "Email (Resend)", has the details and how to run it by
  hand.

---

## 9. Automation (`.github/workflows/`)

| Workflow | When | What |
|---|---|---|
| `e2e.yml` | Every PR and push | Lint, types, build, database tests and browser tests against a throwaway Supabase (retries a slow start once) |
| `mobile.yml` | Every PR | Checks `database.types.ts` is current; type-checks and audits the phone app |
| `audit.yml` | PRs, and Mondays | `npm audit` |
| `claude-review.yml` | Every PR | One advisory Claude comment against `CLAUDE.md` and the domain model; never blocks |
| `supabase-migrations.yml` | Merge to `main`; by hand | Staging automatically; production only by hand, with approval |
| `release.yml` | By hand | Production database, then the live site, then the version tag |
| `staging-accounts.yml` | By hand | Fake test accounts on staging |
| `nightly.yml` | 12:15 am Eastern | **Overnight test**: every page of staging as every persona, on desktop and phone; screenshots, accessibility, console, network, timing; posts an "Overnight test report" issue |
| `phone-journeys.yml` | 3:30 am Eastern; label `phone-tests` on a PR; by hand | **Phone journeys** on an Android emulator against staging, then the website halves of the same journeys (section 11) |

**Waiting on a build:** use `node scripts/wait-for.mjs vercel <sha>`,
`run <run-id>` or `eas <build-id>`. It asks the source of truth, stops on
the first error and gives up after a time limit. A GitHub hiccup (HTTP 401
or 500) also stops it, so restart it once before assuming a real failure.

---

## 10. The phone app (`mobile/`)

- **Expo SDK 58**, Expo Router, TypeScript. It imports `src/shared` as
  `@shared/...` and talks to Supabase directly under the same rules. Its own
  README (`mobile/README.md`) lists every screen.
- **Builds** run on Expo's servers (EAS). `eas.json` has two profiles:
  `preview` (installable Android test builds, pointed at staging) and
  `production` (not used yet). An `ios-simulator` profile exists only on
  PR #91's branch so far.
- **Over-the-air updates:** code-only changes reach installed test apps
  without reinstalling:
  `npx eas-cli update --branch preview --environment preview --message "…"`.
  Native changes (new native packages, icons, plugins) need a new build and
  a bump of `expo.version` in `app.json` (currently 1.1.0), since updates only
  reach builds with the same version.
- **Offline (D18, `docs/OFFLINE-SPEC.md`):** relationship-building logs and
  new program reports work without signal. They go into an **outbox** in an
  encrypted SQLite file (SQLCipher, key in the phone's secure store) and send
  themselves when signal returns. Nothing is stored without a screen lock;
  everything is wiped on log out or when access ends; after 14 days without
  reaching Iris (`Setting` `offline_signin_max_days`) the phone stops saving
  new work offline but keeps what's unsent.
- **Sign-in** is saved in the phone's secure store, split into chunks
  (`src/lib/secure-storage.ts`) because the store holds about 2 KB per item.

---

## 11. Testing layers

| Layer | Where | Runs | Proves |
|---|---|---|---|
| Database tests | `supabase/tests/` | Every PR (`npm run test:db`) | Permission and business rules, including randomized hunts for gaps |
| Browser tests | `e2e/*.spec.ts` | Every PR (`npm run test:e2e`) | Website flows on a throwaway database |
| Overnight test | `e2e/overnight/` | Nightly, on staging | Every page × every persona: permissions, accessibility, errors, speed |
| Phone journeys | `mobile/.maestro/` + `e2e/staging-journeys/` | Nightly; label `phone-tests`; by hand | Whole journeys of the **personas** in `docs/PERSONAS.md` (Fern offline, Violet away 15 days, Gus's double taps, Dex phone-then-web, Vera at the largest text size…), on Android and then the website |
| Acceptance checklist | `docs/ACCEPTANCE.md` | By hand | Each promise in the domain model, with the test that proves it (DB / Web / Phone / Hand) |

The phone journeys use **Maestro**, which drives the app like a person
would. Each journey has a prep script (`prepare-*.mjs`) that finds suitable
fake dates on staging and prints settings for the run, and a check script
that confirms what reached staging. Lessons from building them, worth
knowing before you write another:

- Maestro passes an **empty setting as `undefined`**; skip steps with
  `${!!MAESTRO_X}`, not `!= ''`.
- Its scroll always **swipes from the middle of the screen**; a swipe that
  starts on a text box doesn't scroll, and fast swipes **fling** long lists
  past their target. Scroll slowly (`speed: 15`) to find a calendar row.
- Wait for the sign-in screen after a fresh launch; the splash screen can
  outlast the first tap.
- Turn airplane mode off after every offline journey, or later journeys fail.

---

## 12. What happened, day by day

PR numbers are GitHub pull requests in `irismusicproject/iris-app`.

**Thursday, November 20.** Repository created (public, MIT license, security
guidance). Welcome page and staff sign-in through Supabase magic links (#2).
Domain set to `app.irismusicproject.org` (#4).

**Friday, November 21.** The foundations. Security patches and a package
audit in CI (#5, #6). Hosting, email and DNS documented (#7). The **domain
model, glossary, requirements and `CLAUDE.md`** (#8, #9). Sign-in switched to
email and password with an emailed code as fallback (#10). First tables with
permission rules: people and admin (#11), partners, sites and locations
(#12). Lauren settled decisions D1–D16 in a run of docs PRs (#13–#15, #17,
#21–#23, #25, #26). A **staging database** for previews (#16), **browser
tests in CI** on a throwaway Supabase (#18), **migrations by GitHub** (#19),
and the Iris brand (#20). v0.1 (sign-in, People, Partners) went live that
night.

**Saturday, November 22.** Scheduling arrived, along with the machinery for
releasing it safely. Scheduling tables and rules (#24). Local prototyping for
Lauren with Docker (#28), the division of labor in `CLAUDE.md` (#31, #32),
separate migration queues and a one-click staging reset (#34, #36), the
advisory Claude review (#38), the **one-button Release** with version tags
(#40, #43), fake and real-building seed data (#44, #46). Lauren's stack of
prototype screens (#24 through #42) was integrated with tests in #45. The
**overnight test** (#47) and two large database test suites (#48, #50)
found ten rule gaps in money, hours and scheduling, fixed in #52 and #53.
Then shared logs, documented-only pay and reminders (#54), adding people
without invites and spreadsheet Import (#56), approved weeks made final
(#57), email readiness (#58), `wait-for` (#59), email changes and merging
duplicate people (#62, #63), and the **phone app** landed on `main` (#64).
Releases v0.2 through v0.5.2.

**Sunday, November 23.** Weekly programs by building (#66), two evening
time-zone bugs (#67, #68), done-reviewing and draft locks (#69), detailed
one-to-one notes (#70), who plays on published dates (#71), staging demo data
with sign-in as any fake person (#73), and the phone app's musician screens
(#75, #76). Lauren decided the **monthly scheduling cycle** (D17) and
offline rules (D18). Releases v0.6 and v0.7.

**Monday, November 24.** The monthly cycle, built end to end: installable
phone builds with over-the-air updates (#77), **offline logging** (#78), the
cycle recorded (#79), "program" identifiers renamed to domain names (#80),
month stages and locks (#81), requests, absences, cancellations and To do
(#82), the send-calendar endpoint that makes the PDF and emails it (#83), the
phone's three tabs (#84) and the website's cycle (#85). Ryan's side added
tests for the batch (#86, #88), the acceptance checklist and the first
cross-app journey (#90), and fixed evening "today" bugs, To do dates, phone
log out, every PDF on Vercel, and staging email links (#94–#99, #100, #102).

**Tuesday, November 25.** Line breaks in forms (#103) and a reliable
overnight report (#104). On PR #91: the phone journeys made to run on
GitHub's free machines, with fixes for test timing, and a real bug the
Violet journey exposed (section 13).

---

## 13. Where we left off (November 25, 2026)

**Released:** v0.7 is live. **v0.8 waits on two things:** one fully green
phone-journey run, and Lauren's go-ahead on issue #30.

**Open pull requests:**

- **#91, phone journeys on GitHub** (Ryan's side, in progress). Eight
  persona journeys, the nightly schedule and the label trigger. Its latest
  commit also fixes a **sign-in bug in the phone app**
  (`mobile/src/lib/session.tsx`). Opened offline more than about an hour
  after it last reached Iris, the app showed a sign-in screen that can't
  work offline. The library reports "no session" when it can't renew the
  expired access token, so the 14 offline days of D18 shrank to about an
  hour. The fix keeps the saved session when renewal fails only for lack of
  a connection. A follow-up commit (`b01ef17`) opens the app at once when
  the phone reports no connection, from the copy kept on the phone, instead
  of waiting about 30 seconds per request while the library retries. The
  run testing both commits (Actions run 45709525675) was queued when this
  was written; read its result before merging. The fix touches sign-in, so
  review it with care.
- **#93, phone calendar "tap a day"** (a prototype for Lauren). Needs
  rebasing on `main` and her verdict.
- **#27, #29, #33, #35, #39, #42** (Lauren's November 22 prototype
  branches). #45 integrated them, so they look superseded. Confirm with
  Lauren, then close them.

**Known gaps and open questions:**

- **Reminder emails are off on purpose.** The hourly schedule (section 8)
  queues reminders, but `NOTIFICATIONS_ENABLED` stays off in production
  until Lauren wants emails going out; until then they wait in the Outbox.
- **Accessibility** findings from the overnight report, not yet posted for
  Lauren: brand orange fails contrast on white (about 170 elements), some
  links stand out by color alone, and one scrolling region can't be reached
  by keyboard.
- **On Android**, a swipe that starts on the Minutes box on the logging form
  doesn't scroll the page, a small piece of friction for musicians (found by
  the phone tests).
- **Questions waiting on Lauren** (issue #30): a Withdraw button for change
  requests; two people retitling one date at once; which time zone decides
  deadlines for a building in another zone; showing why a month "isn't open
  for the team yet"; a phone number for every point person.
- **Planned after v0.8:** run Maestro locally against the simulator,
  unit tests for the shared logic in `src/shared/domain/`, and phone
  journeys against a local database instead of staging.
- **Before version 1.0:** Google Play and Apple developer accounts, store
  builds (`production` profile), and the user guide.

---

## 14. Taking over: a first-day checklist

1. Get access to the accounts in section 3. Confirm you can open the
   Actions tab and the Vercel project.
2. Read `CLAUDE.md`, then issue #30 from the latest comment back.
3. Install Node.js and Docker Desktop; run `npm install`, then
   `npm run dev:local`; sign in at `localhost:3000` as `admin@example.com`.
4. Run `npm run test:db` and `npm run test:e2e`. Both should pass on `main`.
5. Open `staging.irismusicproject.org` and sign in as a fake person
   (`clara.clarinet@example.com`, password from Ryan) to see real-looking
   data.
6. For the phone: `cd mobile`, copy `.env.example` to `.env.local` with
   **staging's** URL and publishable key, `npm install`,
   `npx expo start --go`, and open it in Expo Go.
7. Read the newest "Overnight test report" issue and the latest
   phone-journeys run. They show the app's current state better than any
   document.
8. Post on issue #30 that you've joined, and which side's work you're
   picking up.

**If you're stuck:** the README explains every setting; the domain model
explains every rule; `git log` and the pull request descriptions explain
every change. Each PR description says what it does, which migrations and
permission rules it adds, and what was left unchecked.
