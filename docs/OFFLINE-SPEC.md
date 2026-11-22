# Working without a connection — offline specification

_Draft v0.2, November 22, 2026 (v0.2: Ryan's side reviewed v0.1 against
`DOMAIN-MODEL.md` v0.30, the glossary, `REQUIREMENTS.md`, `CLAUDE.md` and the
code as built; every principle and proposal now carries a verdict, and
sections 3, 4, 8 and 9 follow the verdicts. v0.1: first draft, written outside
the codebase). **Nothing here is decided until it reaches `DOMAIN-MODEL.md`.**
Items marked **Ask** are open decisions: treat them as ask-first, the same as
an **Open** item in `DOMAIN-MODEL.md`._

## How to use this document

- **Authority, in order:** `DOMAIN-MODEL.md`, `GLOSSARY.md`,
  `REQUIREMENTS.md`, `CLAUDE.md`, then the code as built. Where this document
  disagrees with any of them, they win. Nothing here adds an object,
  attribute, state, setting or rule until it's recorded in `DOMAIN-MODEL.md`
  in the same change as the code.
- **Verdicts** (sections 2 and 5):
  - **Adopt**: fits the existing rules as proposed.
  - **Adapt**: fits after the change noted.
  - **Replace**: the existing rules already give a different answer; that answer is used.
  - **Drop**: not needed once the other verdicts apply.
  - **Ask**: the existing rules don't settle it, or `CLAUDE.md` requires
    confirmation (resident data, pay or invoice calculations, permissions).
    Each Ask has one question and a recommended answer.
- **What exists today (Nov 22, 2026):** nothing offline is built. The web app
  has a home-screen manifest (`src/app/manifest.ts`) but no service worker,
  no browser storage and no draft saving. "Offline-friendly drafts"
  (`CLAUDE.md`, `REQUIREMENTS.md` 5.1) is a goal, not a feature.

## 1. The problem

Musicians sometimes work in buildings with no Wi-Fi and no cell signal:
basements, interior rooms, rural sites. Right after a program is when they
document it and log relationship building. Today the app needs a connection
to open, to load a form and to save it. A musician with no signal either
waits until later, when details have faded, or writes on paper and types it
in twice.

The goal: a musician can open the app, write what they need to write, and
press **Submit** with no connection. The app keeps the work safe on the
phone and sends it on its own once the phone is back online. Nothing is
lost, nothing is sent twice, and the person can always see what is still
waiting.

## 2. Principles

These come before any feature below. If a later rule conflicts with one of
them, the principle wins and the rule goes back for discussion.

1. **The database stays the record.** The phone holds a queue of outgoing
   work and a small read-only copy of what the person needs. It never
   becomes a second database that has to be merged with the first.
   **Verdict: Adopt.** "Rules live in Supabase, not in page code"
   (`CLAUDE.md`, platform strategy; R9.7).
2. **Offline is for capture, not for decisions.** Musicians record what
   happened. Approving, publishing, scheduling, invoicing and managing
   people stay online-only.
   **Verdict: Adopt.** Also online-only: **Submit my week** (`submit_week()`,
   v0.21, v0.24), because the database checks the week's reports at that
   moment and the point person acts on it (O6).
3. **Nothing disappears silently.** Every queued item shows its state. The
   app never throws away a person's work on its own; only the person can
   discard it, and only after a clear warning.
   **Verdict: Adapt.** One exception, required by R9.5 and `Person`
   ("deactivating … hides all data from that person at once"): when access
   ends, the phone wipes its copy, unsent work included (O9). The admin is
   warned before deactivating.
4. **Every submission is safe to send twice.** Each item gets a unique ID
   on the phone when it is created. The database accepts that ID once and
   answers "already have it" every time after.
   **Verdict: Adopt.** No new column is needed: every table offline writes to
   already has a `uuid` primary key, so the phone's ID becomes the record's
   `id`. `SessionReport` (unique `session_id`) and `MonthlyReflection`
   (unique person × residency × month) also have natural keys.
5. **The same rules apply when the work arrives.** Row Level Security and
   the database functions check queued work exactly as they check live
   work. Checks on the phone exist only to help the person; they protect
   nothing.
   **Verdict: Adopt.** Includes the B1 "active person" checks, D16 roster
   rules, "logged after it happens", and the v0.29 approved-weeks lock.
6. **Keep the least possible on the phone, and protect it.** Only what the
   person's own offline work needs, stored encrypted, and wiped on sign-out
   or when access ends.
   **Verdict: Adopt.** R9.1, R9.2, R9.4.
7. **Tell the truth about the connection.** The app always shows whether
   it is online, what is waiting to send, and when it last synced.
   **Verdict: Adopt.**

## 3. Scope

### 3.1 Works offline

| Task | Domain object | Offline behavior |
|---|---|---|
| Log relationship building | `RelationshipActivity` (create), with its residents and the musicians it's shared with (`RelationshipActivityMusician`, v0.24) | Fill in and submit; queued |
| Document a program I led | `SessionReport` (create) | Fill in and submit; queued. Only the session's leader (D3) |
| Write my monthly reflection | `MonthlyReflection` (`draft`, `submitted`) | Save drafts on the phone; submit is queued |
| Add a resident while logging | `Resident` (create) | **Ask O5** |
| Edit or discard my own work **still on the phone** | Items in the outbox | Any time before it's sent (O11) |

Not offline:
- **Hours.** Hours are calculated from documentation and never typed
  (`TimeEntry`, v0.24), so there is nothing to enter.
- **Changing a record already in the database.** Editing or deleting a sent
  `SessionReport` or `RelationshipActivity`, until the week is approved
  (v0.29), needs a connection (O11).

### 3.2 Readable offline (a cached copy, refreshed when online)

- My own upcoming and recent sessions: the next 14 days and the past 14
  days, with title, site, room, time and who plays. Enough to know where
  to be and what to document.
- The sites, rooms (`Location`s) and interaction types those sessions
  need; the program's usual relationship-building lengths
  (`ActivityLength`, v0.21); and the names of my current rosters' musicians,
  so I can share a log (v0.13, v0.24).
- The resident list for the sites on my current rosters, `display_name` and
  `disambiguator` only (**Ask O7**: the most sensitive item in the spec).
- My own unsent work, and my recently submitted work.

Every cached screen shows **"Last updated [day, time]."**

### 3.3 Online only

- **Hours:** Submit my week (O6).
- **Approvals:** approvals and send-backs (point person, admins).
- **Schedules:**
  - reviewing, publishing or downloading a month's schedule;
  - creating or editing sessions;
  - marking myself absent and naming a sub (time-sensitive, and it notifies other people);
  - change requests (`ChangeRequest`).
- **Records already sent:** changing a record already in the database (O11).
- **Money and people:** invoices and pay; partner records and contacts;
  adding, importing, editing or deactivating people.
- **Everything else:** calendar links; the Outbox; anything only an admin does.

When someone opens one of these with no connection, the app says plainly
that the task needs a connection. For an absence, it also says to call or
text the point person.

### 3.4 Not in version 1

- Photos or audio attached to documentation.
- Offline use of the web version beyond keeping an open form's draft (O1).

## 4. How it works (outline, not code)

### 4.1 Where the app lives

Offline needs the app's code on the phone, so the app opens with no
connection. That means an installed Android and iPhone app.

**How to build it is not decided yet.** One option is Capacitor around a
static build of the front end. Nothing on issue #30 or in the docs has
discussed or chosen it, contrary to what v0.1 said.

A static build can't use the web app's Next.js server actions. The installed
app would call Supabase directly, through the same Row Level Security and
database functions. The platform strategy prepares for exactly that: shared
types and validation in `src/shared`, and rules in the database.

On the web, an open form keeps its unsent draft in the browser and warns
before the page closes (O1).

### 4.2 The outbox

Every offline submission becomes one row in an **outbox** on the phone. The
outbox is the phone's own storage, not a database table:

| Field | Purpose |
|---|---|
| `id` | Unique ID made on the phone (a UUID). Becomes the record's `id` in the database, so other queued items can refer to it (e.g. a log that names a resident added offline) |
| `kind` | Which action: log an activity, submit a report, and so on |
| `payload` | The form's contents |
| `payload_version`, `app_version` | So the database knows what shape to expect (4.5) |
| `state` | `saved`, `sending`, `sent`, `needs_attention` (phone-side words only) |
| `attempts`, `last_error` | For retries and for the person's view |

The outbox is stored encrypted on the phone (SQLite through a plugin, or the
platform's secure storage), and only when the phone's screen lock is on
(O12).

### 4.3 Sending

- The app tries to send when the connection returns, when the app comes to
  the foreground, and when the person taps **Send now**.
- Items go **in the order they were created**, one at a time, so an
  activity that names a resident added offline arrives after that
  resident.
- Each kind of item goes through **one database function** that does the
  whole job in one transaction and is safe to repeat. If a record with that
  `id` exists, it returns the existing record and changes nothing. If the
  `id` exists with different contents, it refuses.
- **Times:** the database's own clock decides everything, through
  `created_at` and `submitted_at` as today. The phone's clock decides
  nothing (O2, O3). `AuditLog` records the arrival like any other write.
- **Temporary failures** (no signal, a timeout, a server error) retry with
  growing waits. They never count against the person.
- **Permanent refusals** move the item to **Needs attention** with a plain
  explanation. Examples:
  - a permission rule;
  - an approved week ("this week has been approved and can no longer be
    edited", v0.29);
  - a canceled session;
  - a deactivated account;
  - a failed check, such as a resident name already taken.

  The item stays until the person fixes and resends it, or discards it.

### 4.4 Refreshing the cached copy

When online, the app refreshes the cached copy at sign-in, when the app
comes to the foreground, and after the outbox empties. A refresh never
overwrites anything still in the outbox, and it drops anything the person
can no longer see (a roster ended, a site changed).

### 4.5 App updates

Payloads carry a version. After an update, database functions keep
accepting the previous payload version for a stated period, so an item
queued on the old app still arrives. A `Setting`, `min_app_version`, holds
the oldest app version allowed; older apps must update before they send, and
the outbox survives the update.

## 5. Rules that need deciding

| ID | Question | Proposal | What changes with the other choice | Verdict |
|---|---|---|---|---|
| **O1** | Should the web version work offline? | No. The installed app is the offline tool. On the web, an open form keeps an unsent draft in the browser and warns before the page closes; nothing more | App-wide offline on the web means a service worker, more testing, and weaker promises on iPhone browsers | **Adopt.** This is the "Offline-friendly drafts" bullet (`CLAUDE.md`, `REQUIREMENTS.md` 5.1) for the web. It isn't built yet |
| **O2** | Which time counts for the Tuesday 17:00 deadline (D7)? | The phone's time counts if the item arrives within 72 hours; after that, the arrival time. Both times are shown to the point person | Using only the arrival time is simpler and can't be gamed, but it punishes people for where they work | **Replace.** The deadline is met by **Submit my week**, which is online-only (O6) and stamps `TimeEntry.submitted_at` with the database's clock. The on-time metric and `missing_work` reminders already use that. No grace setting, and no second time on records |
| **O3** | What if the phone's clock is wrong? | Flag items with odd phone times for the point person | Refusing outright loses real work | **Drop.** After O2, the phone's clock decides nothing. Dates the musician states (`RelationshipActivity.occurred_on`) are checked on arrival as today ("logged after it happens") |
| **O4** | What if the record was approved, locked or canceled while the person was offline? | The database refuses; the item goes to **Needs attention**, and the point person sees a notice | Accepting the late change would break "set it and lock it" | **Adopt.** Already enforced: v0.29 approved weeks are final (admins correct them, logged); reports exist only for past, non-canceled sessions (`SessionReport` invariant). The point person's notice can reuse **Follow-up** (`missing_work`) rather than a new message |
| **O5** | Can musicians add a resident offline? | Yes. On arrival the database checks the same uniqueness rule (`display_name` + `disambiguator` per `Site`). If the name is taken, the item goes to **Needs attention**, and the person picks the existing resident or adds a disambiguator | Online-only is simpler and avoids near-duplicates, but blocks logging at the moment it matters | **Ask** (resident data, `CLAUDE.md`). D14 has musicians add residents while logging; it doesn't say whether that may happen offline. **Recommended: yes, as proposed** |
| **O6** | Can **Submit my week** be queued? | No. Hours can be edited offline, but submitting needs a connection | Queuing it means the check can fail hours later | **Adapt.** Submit my week stays online-only, as proposed. But hours are never typed (v0.24): there are no hours to edit offline, only the documentation they're calculated from |
| **O7** | Which residents live on the phone? | Residents at sites on the person's current rosters; `display_name` and `disambiguator` only; refreshed on each sync. Each download is one `AuditLog` read entry | Not caching residents means names are typed fresh offline, inviting duplicates (O5) | **Ask** (resident data; D14 says **every view** is logged, and offline views can't be). Also depends on **B5**: `audit_log` accepts only insert and update today, so no read is logged yet, online or offline. **Recommended: yes, as proposed, with one log entry per download, once B5 lets `audit_log` record reads** |
| **O8** | How long can someone work offline before signing in again? | Up to 7 days since the last successful sign-in; then the app keeps the outbox but asks the person to sign in before writing more | Longer is friendlier; shorter limits damage from a lost phone | **Ask** (sign-in and permissions, Ryan's area). **Recommended: 7 days**, enforced on the phone, plus Supabase's session time limit (Pro) as the server-side backstop. Recorded as the `Setting` `offline_signin_max_days` |
| **O9** | What happens on the phone when someone's access ends (R9.5)? | At the next connection the database refuses the account; the app then wipes all local data, outbox included. The deactivation screen warns the admin to collect any unsent work first | Keeping the outbox for an admin means holding resident names on a phone Iris no longer controls | **Adopt.** R9.5 and `Person` ("hides all data … at once"); deactivation already blocks sign-in (`user_banned`), which is the app's signal to wipe |
| **O10** | Two phones for one person? | One phone at a time for offline work; warn if the first still has unsent items | Two phones lead to refusals under O4 and O11 | **Adapt.** No rule is needed. Each phone has its own outbox, and the database handles overlap: a second report for the same session is refused (unique `session_id`), and O11 keeps offline edits to unsent work. Keep the warning only |
| **O11** | What if a report was edited online while the leader edited it offline? | Each editable record carries a version number; a changed version refuses the offline edit and shows both side by side | "Last one wins" silently discards work | **Replace.** Offline edits apply only to work **still on the phone**. Changing a record already in the database is online-only (3.3), so there is nothing to merge, and no `version` attribute. A second offline report for a session already documented is refused, and goes to **Needs attention** |
| **O12** | Should the app require a passcode or Face ID / fingerprint? | Require the phone's own screen lock before offline data is stored; an app-level lock is optional for version 1 | An app lock adds protection and friction every time | **Adopt.** R9.4 |
| **O13** | When is local data purged? | On sign-out (after warning about unsent items); on deactivation (O9); and for the cached copy (not the outbox) after 30 days without a sync | Keeping it longer helps someone offline for weeks | **Adopt.** R9.1, R9.5 |

**Tally:** principles: 6 Adopt, 1 Adapt. Proposals O1–O13: 5 Adopt (O1, O4,
O9, O12, O13), 2 Adapt (O6, O10), 2 Replace (O2, O11), 1 Drop (O3), 3 Ask
(O5, O7, O8).

## 6. What the person sees

- A **banner** whenever the phone is offline: _"You're offline. Your work
  is saved on this phone and will send when you're back online."_
- Every item shows its state in plain words: **Saved on this phone**,
  **Sending**, **Sent**, **Needs attention**.
- A **count** of unsent items on the home screen, and **"Last synced
  [day, time]."**
- A **Needs attention** list that says what went wrong and what to do,
  with **Fix and resend** and **Discard** (discard asks for confirmation).
- A warning before **Sign out** while items are unsent.
- After the queue empties: _"All caught up. 3 items sent."_

(Wording and layout are Lauren's to design.)

## 7. Privacy and security

| Requirement | How offline meets it |
|---|---|
| R9.1 Collect the minimum | The cached copy holds only what 3.2 and O7 list. No health information, offline or online |
| R9.2 Need-to-know | The cached copy follows the person's current rosters (D14, D16); it shrinks at the next sync when a roster changes |
| R9.3 Access logged | Downloads of resident lists are logged (O7, after B5); queued writes are logged on arrival like any other write |
| R9.4 Encrypted | Local storage is encrypted; the phone's screen lock is required (O12); traffic stays HTTPS only |
| R9.5 Access ends immediately | Server-side at once; on the phone at the next connection, with the wipe in O9. The sign-in limit (O8) bounds the gap |
| R9.7 Row Level Security | Unchanged: queued work goes through the same policies and functions |

Nothing in this spec stores secrets on the phone beyond the person's own
sign-in session.

## 8. Testing (Ryan's side)

Each scenario becomes a database, browser or device test before offline
ships:

1. Submit in airplane mode, close the app, reopen, reconnect: the item
   arrives once.
2. Send the same item twice (a retry after a timeout): one record.
3. Kill the app in the middle of sending: no loss and no duplicate.
4. Queue an activity that names a resident added offline: both arrive in
   order (if O5 is yes).
5. Approve the week online while the phone is offline, then reconnect: the
   item goes to **Needs attention** (O4, v0.29).
6. Document the same session on two phones: the second is refused and goes
   to **Needs attention** (O10, O11).
7. Phone clock a day ahead or a week behind: nothing changes on arrival
   (O2, O3).
8. Deactivate the account while the phone is offline, then reconnect:
   wipe (O9).
9. Update the app with items still queued from the old version (4.5).
10. Exceed the sign-in limit (O8).
11. Try Submit my week offline: the app says it needs a connection (O6).

The database functions get their own permission tests, as every table
does now.

## 9. Changes this would make to the domain model

None until the Asks are settled. Once they are, expect these, each recorded
in `DOMAIN-MODEL.md` in the same change as the code:

- **No new columns for offline sends.** The phone's ID becomes the record's
  `id` (principle 4). Times come from the database's clock, as today (O2,
  O3). No `version` attribute is needed (O11).
- **One idempotent database function per offline action:**
  - log a `RelationshipActivity`, with its residents and shared musicians,
    in one transaction;
  - create a `SessionReport`;
  - save or submit a `MonthlyReflection`;
  - add a `Resident` (only if O5 is yes).
- **New `Setting`s:** `min_app_version` (4.5), and `offline_signin_max_days`
  (if O8 is settled as recommended).
- **`AuditLog`** accepts read entries, so resident-list downloads can be
  logged (O7). This waits on the **B5** decision.

## 10. Order of work

1. Lauren and Ryan settle the Asks (O5, O7, O8) on issue #30. Record answers
   here, then in `DOMAIN-MODEL.md`.
2. Pilot on the web app as it is. Ask pilot musicians where and how often
   they lose signal; adjust this spec. Build the web form drafts (O1).
3. Choose how to build the installed app (4.1), designed around the outbox
   from the start.
4. Add the idempotent functions, with tests, before any offline screen
   exists. They help the web app too, making double taps and flaky
   connections harmless.
5. Android with offline, then iPhone from the same code.
