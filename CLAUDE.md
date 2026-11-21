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
| D1 | Meanings of "program" → `Residency` / `Series` / `Session` / `TimeCategory` | Model adopted; confirm the name `Residency` |
| D2 | Time categories vs. interaction types vs. model types; which interaction-type list is current | Open |
| D3 | Pay comes from weekly `TimeEntry`, not from session documentation; the session leader documents | Assumed |
| D4 | `Partner` / `Site` / `Location`; who receives community invoices | Open (billing entity) |
| D5 | Roles: program leader per session; admin lead; point person | Assumed |
| D6 | Resident involvement levels; meaning of "collaborative event" | Assumed; confirm |
| D7 | Conflicting handbook deadlines | Open |
| D8 | Semester vs. season | Assumed (`Season.kind`) |
| D9 | Contract and pay components; partner billing basis | Open (partner billing) |
| D10 | Events, extras, special projects | Assumed |
| D11 | Absences, substitutes, cancellation reasons | Assumed |
| D12 | Titles separate from personnel and location | Adopted |
| D13 | Workbook functions in or out of version 1 | Open |
| D14 | Residents as records; how they're identified | Assumed; confirm |
| D15 | Attendance counting; individually led vs. multi-musician | Assumed |
| D16 | Ensemble vs. roster (`RosterMember.is_core`) | Assumed |

Treat **Open** and **Assumed** items as ask-first.

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

## Working style

- Small changes, one concern at a time. Branch and open a pull request;
  merging to `main` deploys to production.
- Before every commit, check `git status` and `git diff --staged` for
  anything private.
- Explain changes in plain language. The project owner is not a
  professional developer.
