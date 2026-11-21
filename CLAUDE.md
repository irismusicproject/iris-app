# CLAUDE.md — working on iris-app

Read this before doing anything in this repo. Then read
`docs/DOMAIN-MODEL.md` and `docs/GLOSSARY.md` before writing or changing code,
database tables, or UI text. `docs/REQUIREMENTS.md` says what to build;
`docs/TERMINOLOGY-REVIEW.md` explains the open decisions.

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
| D2 | Time categories vs. interaction types vs. model types; which interaction-type list is current | **Decided:** 2026 documentation list, chosen only when documenting; one-to-ones logged after the fact, never on calendars |
| D3 | Pay comes from weekly `TimeEntry`, not from session documentation; the session leader documents | **Decided** (option A; leader documents) |
| D4 | `Partner` / `Site` / `Location`; who receives community invoices | **Decided:** one invoice per contract (`PartnerAgreement`), per site, per month |
| D5 | Roles: program leader per session; admin lead; point person | **Decided:** admin lead per residency season; core team = admins; review → publish → send flow (DOMAIN-MODEL, `CalendarExport`) |
| D6 | Resident involvement levels; meaning of "collaborative event" | **Decided:** co-facilitated or co-led, recorded when documenting |
| D7 | Conflicting handbook deadlines | **Decided:** schedule 10th/15th; documentation + hours Tuesday 5 pm; cancellations 9 am (monthly reflection due date assumed) |
| D8 | Semester vs. season | **Decided:** seasons per residency (`Season.kind`) |
| D9 | Contract and pay components; partner billing basis | **Decided:** musician rate per contract; partners per hour or installments; billable hours = session + relationship building per site; admin-set rate, stipends, overhead, corporate invoice; overhead on hours + stipends |
| D10 | Events, extras, special projects | **Decided:** as modeled; concerts are special events; extras billed unless marked not billable |
| D11 | Absences, substitutes, cancellation reasons | **Decided:** planned absences become "No Program"; musicians record their own sub; missed-session limit warns (value not set yet) |
| D12 | Titles separate from personnel and location | Adopted |
| D13 | Workbook functions in or out of version 1 | **Decided:** monthly reflections and blackout dates in; repertoire and meeting notes out |
| D14 | Residents as records; how they're identified | **Decided:** first name + last initial, added by musicians as they work; roster + point person + admins see them. **Partner permission (REQUIREMENTS Q1) still open** |
| D15 | Attendance counting; individually led vs. multi-musician | **Decided:** one total of everyone present; led-by derived from musician count |
| D16 | Ensemble vs. roster (`RosterMember.is_core`) | **Decided:** roster = everyone who plays that season; core = ensemble; subs join as non-core |

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
- **Offline-friendly drafts.** Documentation forms keep drafts on the device
  and submit when there's a connection.
- **Sign-in (decided by Ryan, Nov 2026).** Email and **password** is the
  normal way in, with a minimum of 12 characters. The rule lives in
  `src/shared/auth/password.ts` and in Supabase. An emailed **one-time
  code** is the fallback. Both work on web and native. Emailed links are
  used only for invites and password resets.

## Working style

- Small changes, one concern at a time, on a short-lived branch per task.
  Open a pull request; keep it small. Merging to `main` deploys to the live
  site at app.irismusicproject.org.
- **Pull `main`** before starting any task, and again before merging.
- **Merge only when** the build, lint and type checks pass and the Vercel
  preview deploys.
- Claude may pull, commit, push, open pull requests and merge them without
  asking first (permission from Lauren, Nov 2026). This does **not** replace
  the stop-and-ask rules above.
- Lauren and Ryan may be working in the repo at the same time:
  - Resolve trivial conflicts yourself: non-overlapping changes,
    formatting, lockfile updates.
  - **Stop and ask** when two changes touch the same logic, database
    schema, migrations, permissions or docs in incompatible ways, or when
    resolving would discard someone's work.
  - Never force-push, rewrite `main`'s history, or delete branches you
    didn't create.
- Who owns what: **Lauren** owns product decisions and testing; **Ryan**
  owns the database, sign-in, permissions, infrastructure and code review.
- Before every commit, check `git status` and `git diff --staged` for
  anything private.
- Explain changes in plain language. The project owner is not a
  professional developer.
