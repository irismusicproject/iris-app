# CLAUDE.md — working on iris-app

Read this before doing anything in this repo. Then read
`docs/DOMAIN-MODEL.md` and `docs/GLOSSARY.md` before writing or changing code,
database tables, or UI text. `docs/REQUIREMENTS.md` says what to build;
`docs/TERMINOLOGY-REVIEW.md` explains the open decisions. `docs/OFFLINE-SPEC.md`
is the draft plan for offline work in the native apps.

## What this app is

The internal web app for Iris Music Project, a nonprofit that runs
Ensemble-in-Residence music programs in senior living communities. Staff and
contract musicians use it to schedule sessions, document them, log
relationship-building activities with residents, record hours, and produce
partner calendars and invoices. See `README.md` for the stack (Next.js on
Vercel, Supabase, Resend) and its security rules. Those rules still apply.

## The three languages (the most important thing in this file)

Iris uses three different vocabularies. Keep them separate.

1. **Domain model (the code).** Defined in `docs/DOMAIN-MODEL.md`. This is
   the authority. One name, one meaning, no overloading.
2. **Team language.** How Iris staff and musicians talk. Fixed. We don't
   change it. The words are overloaded, "program" above all.
3. **Outward language.** What prints on partner calendars, invoices and
   funder reports. Fixed. We don't change it.

`docs/GLOSSARY.md` maps Languages 2 and 3 to the objects in Language 1.

### Hard rules
- **Never** use `program`, `programme`, `community` or `ensemble` as an
  identifier: no table, column, type, variable, route, API field or file
  named with them. These are display words only. Use the domain objects
  instead (`Residency`, `Series`, `Session`, `TimeCategory`, `Partner`,
  `Site`, `RosterMember`…).
- UI labels and generated documents **may** use team or outward words, but
  only through the mappings in the glossary, and only where context makes
  the object unambiguous (e.g. the `Residency` screen is labeled "Program").
- Don't invent objects, attributes or enum values that aren't in
  `DOMAIN-MODEL.md`. If one is needed, that's an ambiguity: see below.
- Lists people edit (interaction types, engagement types, time categories)
  are data, not code, and are retired, never deleted.

## How to map a request to the model

When Lauren or Ryan asks for something in team language:
1. Find each noun in `docs/GLOSSARY.md` Part A (team) or Part B (outward).
2. Resolve it to exactly one object (and attribute) in `docs/DOMAIN-MODEL.md`.
3. Say the mapping back in one line before coding, e.g. *"'Add a program
   leader to Tuesday's program' → set `SessionAssignment.role = leader` on
   that `Session`."*
4. If step 2 gives zero objects or more than one, **stop** (next section).

## Flag ambiguities and ask — before proceeding

**Stop and ask the user** (use the AskUserQuestion tool if available; plain
questions otherwise) before writing code whenever:
- a word in the request isn't in the glossary, or maps to more than one
  object in this context (e.g. "program" could mean a `Residency`, a
  `Series`, a `Session` or the "Programs" `TimeCategory`);
- the work needs an object, attribute, relationship or enum value that
  `DOMAIN-MODEL.md` doesn't define;
- the work depends on anything marked **Assumption (D#)** or **Open** in
  `DOMAIN-MODEL.md` (see "Open decisions" below);
- the request conflicts with `DOMAIN-MODEL.md`, the glossary, or `README.md`;
- the work touches **resident data**, **pay or invoice calculations**, or
  **permissions**: confirm the rule even if it looks settled.

When asking:
- Name the term, list the candidate objects, say what changes with each
  choice, and recommend one.
- Ask all open questions together, then wait. Don't build on a guess. Don't
  pick silently.

After the answer:
- Update `docs/DOMAIN-MODEL.md` and/or `docs/GLOSSARY.md` **in the same
  change** as the code, and bump the draft version note at the top.
- If it settles an open decision, update the list below.

## Open decisions (details in `docs/TERMINOLOGY-REVIEW.md`)

Where the review and `DOMAIN-MODEL.md` differ, `DOMAIN-MODEL.md` wins (e.g.
D1: the review suggested "Ensemble Program"; the model uses `Residency`).
`REQUIREMENTS.md` sections 4–5 predate the model; when they conflict with
`DOMAIN-MODEL.md`, ask.

| ID | Topic | Status |
|---|---|---|
| D1 | Meanings of "program" → `Residency` / `Series` / `Session` / `TimeCategory` | **Decided:** code name `Residency` |
| D2 | Time categories vs. interaction types vs. model types; which interaction-type list is current | **Decided:** 2026 documentation list, chosen only when documenting; one-to-ones logged after the fact, never on calendars; scheduled relationship building (e.g. Lessons) prints without a time |
| D3 | Pay comes from weekly `TimeEntry`, not from session documentation; the session leader documents | **Decided** (option A; leader documents). **Revised Nov 22:** `TimeEntry` hours are calculated from documentation only (never typed) |
| D4 | `Partner` / `Site` / `Location`; who receives community invoices | **Decided:** one invoice per contract (`PartnerAgreement`), per site, per month |
| D5 | Roles: program leader per session; admin lead; point person | **Decided:** admin lead per residency season; core team = admins; review → publish → send flow (DOMAIN-MODEL, `CalendarExport`). Update Nov 22: point person = Iris staff, admin lead = contractor musician; all roster musicians edit draft titles, rooms and musicians (special events also date/time); point person assigns leaders. Nov 22 (schema review): musicians only swap a leader the point person set; drafts lock for musicians once the month is marked reviewed; subs edit only dates they play; after a season, musicians keep read-only access to their own history (resident names only in their own records) until an admin deactivates them |
| D6 | Resident involvement levels; meaning of "collaborative event" | **Decided:** recorded when documenting; Collab? Yes/No, every Yes counts as co-led (Nov 22); target per season, set by point person or admin |
| D7 | Conflicting handbook deadlines | **Decided:** schedule 10th/15th; documentation + hours Tuesday 5 pm; cancellations 9 am (monthly reflection due date assumed) |
| D8 | Semester vs. season | **Decided:** seasons per residency (`Season.kind`) |
| D9 | Contract and pay components; partner billing basis | **Decided:** musician rate per contract; partners per hour or installments; billable hours = per musician (session length × musicians present + their relationship building) per site, after the point person approves the week (Nov 22); admin-set rate, stipends, overhead, corporate invoice; overhead on hours + stipends |
| D10 | Events, extras, special projects | **Decided:** as modeled; concerts are special events; extras billed unless marked not billable |
| D11 | Absences, substitutes, cancellation reasons | **Decided:** planned absences become "No Program"; musicians record their own sub; missed-session limit warns (value not set yet) |
| D12 | Titles separate from personnel and location | Adopted |
| D13 | Workbook functions in or out of version 1 | **Decided:** monthly reflections and blackout dates in; repertoire and meeting notes out |
| D14 | Residents as records; how they're identified | **Decided:** first name + last initial, added by musicians as they work; roster + point person + admins see them; partners confirmed comfortable. Nov 22: room numbers too, only at detailed-notes buildings (partners comfortable) |
| D15 | Attendance counting; individually led vs. multi-musician | **Decided:** one total of everyone present; led-by derived from musician count |
| D16 | Ensemble vs. roster (`RosterMember.is_core`) | **Decided:** roster = everyone who plays that season; core = ensemble; subs join as non-core |
| D17 | Monthly scheduling cycle (`ScheduleMonth`) | **Decided Nov 23 (Lauren), not built yet:** five stages per residency × site × month (team editing → team confirmed → sent to partner → partner changes → final); titles only by the date's leader during team editing; "I can't play" on the calendar date, no approval, no limit for now; leader swaps and every change after final are `ChangeRequest`s the point person approves; the admin lead may send without the confirm step; the app emails the partner calendar to calendar contacts, point person and admin lead cc'd; same-day cancellations by phone, then "Canceled day-of" (reason required, counted at the start time) or "I wasn't there" when documenting; tasks calculated by the database; no timer; Nov 27 (Lauren): a month opened late says "As soon as possible" (deadline unchanged); each Mather building is its own partner and program (TZ1); reminder emails stay off on the live site until Lauren and Ryan switch them on |
| D18 | Offline on the phone app (OFFLINE-SPEC O5, O7, O8) | **Decided Nov 23 (Lauren), built (PR #78):** residents added offline (name clash → Needs attention); resident names (no rooms) kept encrypted on the phone, read logging after B5; 14 days offline since the last confirmed sign-in |

Treat **Open** and **Assumed** items as ask-first. **Decided** items are recorded in `DOMAIN-MODEL.md`.

## Privacy and what never goes in this repo

This repository is **public**. Never commit:
- secrets or `.env` files (see `README.md`);
- real people's data: resident names, musicians' contact details, hours,
  pay, exports;
- handbooks, contracts, workbooks or timesheets themselves (the docs in
  `docs/` may summarize them, but never paste them in);
- anything that identifies a resident.

Never store resident health information anywhere in the app. Use made-up
data in tests, seeds and examples.

## Platform strategy

We're building a **web prototype** at app.irismusicproject.org first, and
**Android and iPhone apps** later. Build now so the native apps can reuse
the same backend:

- **The phone app (decided by Ryan, Nov 22, 2026)** lives in `mobile/`: an
  Expo app for musicians in the field only (no admin features), for Android
  first, then iPhone and iPad from the same code. It talks to Supabase
  directly, through the same rules as the website, and imports
  `src/shared` as `@shared/...`. Its own checks run in
  `.github/workflows/mobile.yml`; Vercel skips website builds when only
  `mobile/` changed (`vercel.json`).
- **Database changes must not break phones in the field.** Phones keep
  running an older app for days or weeks. So never rename or remove a
  table, column, function or enum value the phone app uses in one step:
  **expand, then contract**. Add the new one and keep the old working; remove
  the old one in a later release, after the `min_app_version` setting
  (`docs/OFFLINE-SPEC.md`) has moved past every app that needs it.
- **Database types** live in `src/shared/database.types.ts`, generated from the
  migrations. After changing a migration, run `npm run db:types` (needs the
  local Supabase), or commit the `database-types` artifact from the CI run.
  CI fails while the file is out of date.

- **Rules live in Supabase, not in page code.** Business rules and
  permissions are Row Level Security policies and database functions, so
  every client (web or native) gets the same behavior. Pages only display
  and submit.
- **Shared types and validation.** Each domain object has one TypeScript
  type and one validation schema, kept in a shared folder that native apps
  can import.
- **Phone-first musician screens.** Musicians mostly use a phone right
  after a session; design for that first, and for desktop second.
- **Installable web app.** Ship a web app manifest so people can add the
  app to their home screen.
- **One notification layer.** All reminders and alerts go through a single
  module that starts with email (Resend) and can add push notifications
  later.
- **Offline-friendly drafts.** In the phone app, relationship-building logs
  and new program reports are saved on the phone and sent when there's a
  connection (D18, PR #78). The web form drafts (O1) and the rest of
  `docs/OFFLINE-SPEC.md` aren't built yet; `DOMAIN-MODEL.md` wins where they
  differ.
- **Where each action is best done (D17, `REQUIREMENTS.md` 5.1).** Only
  building the schedule's skeleton needs a computer; everything else is a
  few-tap task on the phone, and every action works on both.
- **Sign-in (decided by Ryan, Nov 2026).** Email and **password** is the
  normal way in, with a minimum of 12 characters. The rule lives in
  `src/shared/auth/password.ts` and in Supabase. An emailed **one-time
  code** is the fallback. Both work on web and native. Emailed links are
  used only for invites and password resets.
- **Paid plans (Ryan, Nov 25, 2026).** Iris pays for **Vercel Pro** and a
  paid **Supabase** plan. Plan for Pro limits, not Hobby ones (e.g.
  schedules can run every minute with about a minute's jitter), and
  remember each Vercel team member is a paid seat.

## Division of labor (Lauren, Nov 22, 2026)

**A guide, not a rule (Ryan, Nov 24, 2026).** Lauren and Ryan sync
regularly, so either side may work across the line below (a design idea on
Ryan's side, a test or a fix on Lauren's) when that moves the work forward.
Say what you did on issue #30 so the other side sees it. Two things stay
firm: Lauren has the last word on how the app looks and works (a change she
doesn't want gets reverted), and the stop-and-ask rules above still apply.

Two sides, each with its own Claude Code session. Know which side you're on
(Lauren's computer and account = Lauren's side; Ryan's = Ryan's side).

**Lauren: designer and product owner.** She decides what the app does and
how it looks and works, and she alone judges whether a feature "looks good,
operationally."
- **Lauren's Claude** builds features as prototypes: screens, and the
  migrations they need, on a feature branch, run locally (`npm run
  dev:local`) so Lauren can try them in the browser.
- It does **not** write new tests or spend time on test runs. CI still runs
  on every PR; if CI fails, say so in plain words and hand it to Ryan's side
  unless the fix is an obvious bug in the feature itself.
- It still follows the stop-and-ask rules and the three languages.
- When Lauren says a feature looks good, it opens (or updates) the PR, marks
  it **ready for Ryan**, and posts a handoff on issue #30: what the feature
  does, which migrations and permission rules it adds, and anything not yet
  checked. **It doesn't merge feature PRs.** Docs-only PRs (decisions,
  glossary, this file) it may merge itself once checks pass.

**Ryan: tester, and maintenance, repair and security of the builds.**
- **Ryan's Claude** tests what Lauren approved: writes and runs permission
  and browser tests, reviews migrations and permission rules, fixes bugs,
  handles security, sign-in and infrastructure, merges to `main`, and deploys
  database changes to production.
- It may propose and build changes to how a feature looks or behaves, on a
  branch Lauren can try; it posts them on issue #30, and Lauren decides
  whether they stay.

**Handoffs** go through issue #30 (`gh issue view 30 --comments`), starting
with **[Lauren's side]** or **[Ryan's side]**.

## Working style

- Small changes, one concern at a time, on a short-lived branch per task.
  Open a pull request; keep it small. **Merging to `main` is the handoff to
  Ryan:** it updates **staging** (database and the staging site), not the live
  site. Merge when CI is green, then post one line in issue #30 saying what's
  ready to look at. Lauren never needs Supabase or Vercel.
- **Releases are Ryan's:** the live site (app.irismusicproject.org) follows the
  `production` branch, which only the Release workflow moves. Never push to,
  merge into, or open a pull request against `production`.
- **Pull `main`** before starting any task, and again before merging.
- **Merge only when** the build, lint and type checks pass and the Vercel
  preview deploys (or Vercel skipped it because only `mobile/` changed).
- **Previews use the staging database**, which holds fake data only (README,
  "Staging database"). Put realistic test data in `supabase/seed.sql`, never
  in production.
- **Coordinate in GitHub issue #30** (pinned): read it with
  `gh issue view 30 --comments` at the start of a session, and comment there
  when you finish something the other side depends on.
- **Prototype locally** (README, "Prototyping locally"). Run `npm run dev:local`:
  a private Supabase in Docker with every migration, fake data and two logins
  (`admin@example.com` / `musician@example.com`, password
  `local-only-password`). Emails land in the local mail viewer it prints.
  Try database changes there, `npm run db:reset` to rebuild, and edit an
  unmerged migration freely. You never need Supabase dashboard access, and
  you never connect to staging or production.
- **Tests are Ryan's side** (see Division of labor): `npm run test:db`
  (permission tests) and `npm run test:e2e` (browser tests). Ryan's side adds
  tests for new tables and screens once Lauren approves a feature.
- **Phone journeys** (Android, against staging, about 35 minutes;
  `.github/workflows/phone-journeys.yml`, personas in `docs/PERSONAS.md`)
  run nightly on `main`, on request, and on a pull request given the
  `phone-tests` label. Don't run them for every small change: develop a
  journey against the simulator first, then confirm on GitHub. Run them
  before every Release.

## Testing habits (Ryan, Nov 25, 2026)

A 40-minute phone run is the final check, never the debugger. These are
standing rules for every session, not suggestions.

1. **Reproduce locally before pushing a journey fix.** Run the journey with
   `mobile/.maestro/run-local.sh <journey>` (Android emulator on this Mac,
   the same script as GitHub; minutes) until it passes, then push.
2. **Rerun only what failed.** Actions → Phone journeys → Run workflow, with
   `journeys` set to the failed ones (e.g. `gus,violet`). A full run (or the
   `phone-tests` label) is for the last check before merging and before a
   Release.
3. **Never wait idle on a run.** Start it in the background and work on
   something else: the next item in `docs/TESTING-BACKLOG.md`, Lauren's open
   questions on #30, or another bug. Read the result when it's done.
4. **Every fragile journey step leaves a test ID behind.** When a journey
   breaks because it found an element by its text, by scrolling, or by
   position, add a `testID` to that element in the app (in the same PR) and
   point the journey at the ID. Cross the item off, or add it, in
   `docs/TESTING-BACKLOG.md`.
5. **Every logic bug fixed leaves a unit test behind.** When a fix changes a
   rule (dates, the 14 days, a count, what a screen trusts), move the rule
   into a pure function with no imports (as in
   `mobile/src/lib/session-choice.ts`) and pin it in `tests/unit/`
   (`npm run test:unit`, plain Node, seconds; runs on every PR). If it can't
   be pinned yet, add it to the backlog.
6. **Each session takes one backlog item** when nothing more urgent is on,
   and reports which on #30.
- **Databases (Ryan owns these):** pull requests never touch a real database.
  Merging a migration to `main` updates **staging** automatically; **production**
  gets it only when Ryan runs **Release** (database first, then the live site). Never edit a migration
  that's on `main`; fix it with a new one. Never tell anyone to paste a
  migration into the SQL Editor.
- Claude may pull, commit, push and open pull requests without asking first
  (permission from Lauren, Nov 2026). **Merging:** feature PRs are merged by
  Ryan's side after testing; Lauren's side merges only docs-only PRs. None
  of this replaces the stop-and-ask rules above.
- **Ryan's Claude merges to `main` without asking** (Ryan, Nov 24, 2026):
  its own PRs and reviewed ones, as soon as CI is green, after pulling
  `main` and re-running checks on the combination. Speed over ceremony; a bad
  merge is reverted with a new PR. Releases to production still need Ryan's
  approval click in the Release workflow.
- Lauren and Ryan may be working in the repo at the same time:
  - Resolve trivial conflicts yourself: non-overlapping changes,
    formatting, lockfile updates.
  - **Stop and ask** when two changes touch the same logic, database
    schema, migrations, permissions or docs in incompatible ways, or when
    resolving would discard someone's work.
  - Never force-push, rewrite `main`'s history, or delete branches you
    didn't create.
- Who owns what: **Lauren** owns product decisions and design, and judges
  whether features work for Iris; **Ryan** owns testing, maintenance, repair
  and security: the database, sign-in, permissions, infrastructure, code
  review, merging features and deploying.
- Before every commit, check `git status` and `git diff --staged` for
  anything private.
- **Waiting for a build or workflow:** use `node scripts/wait-for.mjs vercel
  <commit-sha> [minutes]`, `node scripts/wait-for.mjs run <run-id>
  [minutes]` or, for a phone build on Expo, `node scripts/wait-for.mjs eas
  <build-id> [minutes]`. Don't hand-write wait loops. The script asks the source of
  truth (Vercel's status on the commit, or the run itself), stops on the
  first error, gives up after a time limit (15 minutes by default) and prints
  progress every minute.
- Explain changes in plain language. The project owner is not a
  professional developer.
