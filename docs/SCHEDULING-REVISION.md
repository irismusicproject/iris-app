# Scheduling revision for v0.9 (D19)

_Draft v0.2, November 27, 2026 (v0.2: point 2 corrected, the Lead Musician's leader rule is v0.18, not a gap; Q14 done; Q15 added). A plan for Lauren's approval; no code changes
until she approves it. Decisions D19-a to D19-j are Lauren's and Ryan's (Nov
27, 2026); where one conflicts with an earlier rule, D19 wins and the section
below says which rule it revises. DOMAIN-MODEL.md stays the authority for
what is built; it changes in the same pull requests as the code._

**In one paragraph.** The app's monthly cycle (D17, v0.41) asks people to wait
for each other: the Iris Supervisor fills the month, then opens it, then
musicians may mark "I can't play", then the Iris Supervisor confirms, which
locks the month. Lauren's review of the workbooks says the opposite works
better: everyone playing at a building shapes the draft, at any time, until
the calendar goes to the partner, and the Iris Supervisor keeps track by
**seeing** every change, not by approving it. The plan removes four gates
(opening a month, the confirm lock, leader-swap approval, "I can't play" only
while a month is open), adds one screen (a season grid per building, the
workbook tab stretched across the season), and makes the change log visible.
Sending the calendar to the partner stays the one moment that locks dates
for musicians.

Contents: 1. What makes the workbooks work · 2. What the app does today
(points 1–7, checked) · 3. The changes, decision by decision · 4. A
spreadsheet in the app? · 5. The meeting · 6. Pull requests, in order ·
7. Left for later · 8. Questions for Lauren and Ryan.

---

## 1. What makes the workbooks work (step 1)

Twelve monthly workbooks for CESLC (January to December 2026) were read for
layout only. They hold real names; none is copied here or anywhere in the
repository.

- **One file per month, all in one folder.** Musicians open next month's file
  as easily as this month's, so looking ahead costs nothing.
- **The same tabs every month:** "Notes and instructions"; one tab per
  building or building group (Ring House; Landow with two smaller buildings
  in sections of the same tab; Revitz; Hebrew Home groups; Hebrew Home
  one-to-ones); one
  documentation tab per musician; documentation instructions; an **"All"**
  tab that stacks every building's tab; and a hidden validation tab with the
  drop-down lists.
- **Each building tab is the partner calendar plus two columns.** A header
  ("Month: December 2026 · Ring House Programming"), then **Day, Time, Program
  Title, Program Leader, Notes**. **Special events first**, then "Regular
  programming", one block per weekly slot with **every date of the month**,
  blocks separated by a blank row. A date that won't happen stays in place as
  **"No Program"** with "-" as leader.
- **Notes carry the reasons and the availability**, in a few words: "Break",
  holidays ("Thxg", "Memorial Day", "Yom Kippur"), a musician's absence
  ("No [name]", "[initials] PTO", "Off"), a partner's request ("[staff name]
  request"), Iris business ("Donor meeting", "strategic planning"), logistics
  ("2nd floor", "half hour then go to Landow"), and for special events the
  other musicians ("with [name]").
- **One name in Program Leader.** The title already says "with [names]".
- **The instructions tab sets the norms:** "Sign up to lead 2–3 Landow, Ring
  or Revitz programs per month" (musicians _sign up_; nobody assigns), what
  the lead does (leads the interactive program, reports attendance, brings
  the laptop), the year's special events, the holidays and other key dates.
  Scheduling pages are due by the 10th of the month before.
- **Dates are brainstormed in the cells.** A title can say "title TBD", a
  note "date/time might change" or "program we missed from snow storm?".
  Nothing in the sheet keeps two candidate dates apart; people use notes.
- **Building-specific extras:** the Hebrew Home group tab has an "Anticipated
  Cost" column and a list of the partner's available time slots; the
  one-to-ones tab lists each musician's hours per building. Neither is part
  of this revision (section 7).

What makes the sheets work is **visibility and low friction**: one layout
everyone knows, every date visible, anyone can type, and reasons sit next to
the date. What they lack is exactly what the app adds: a change log, alerts,
deadlines, and rules that stop mistakes (one leader, no names on the partner
calendar, no edits after sending).

---

## 2. What the app does today (step 2)

**How this was checked.** Docker isn't installed on this Mac, so `npm run
dev:local` couldn't start and the screens weren't clicked through. Instead:
(a) the website and phone screens were traced in the code; (b) every rule
below that the database enforces was run against the real migrations in the
same in-memory database the permission tests use (PGlite), with the test
harness's made-up people. **Not verified in a browser or on the emulator**;
Ryan's side should click through points 2, 3 and 5 once Docker is set up.

Examples below use the seed's made-up people (Violet Viola, Cal Cello).

### Point 1: an overview of the whole season

- **Lauren's observation holds.** The website has two views:
  - **Building month** (`src/app/residencies/[id]/month/[month]/page.tsx`):
    one building, one month, laid out like the workbook tab (Day, Time,
    Program title, Leader, Notes; special events, then a block per weekly
    program). Previous/next month buttons and building tabs at the top.
  - **Season view** (`season/page.tsx`): a count per month ("12 published · 3
    No Program · 2 need a leader"), each weekly program's usual leader, and
    the season's special events. **No dates** and no titles: to see February
    you open February.
- No view crosses buildings (the workbook's "All" tab) or months.
- The phone's Calendar tab (`mobile/src/app/(tabs)/calendar.tsx`) shows one
  month at a time, every building the musician plays at, each with its stage.

### Point 2: seeing and editing who leads

- **Partly corrected.** A date's leader can only be set once the date exists,
  and dates exist only after the Iris Supervisor (or an admin) fills the
  month or the whole season (`generate_series_month`, "Fill the whole
  season"). Musicians can't fill dates.
- **Musicians never set a leader**, in any month or stage. Since v0.43 the
  trigger `assignment_month_rules` refuses it ("propose a leader swap; the
  point person approves it"). They can only **propose a swap**
  (`request_leader_swap`), and only when the date **already has a leader**.
- On the season view the Iris Supervisor sets a weekly program's leader for
  the whole season (usual leader); otherwise leaders are set per date.
- The Lead Musician sets leaders on **published** dates (v0.18, v0.37) and,
  like any musician, on draft dates they play; on other drafts, setting
  leaders is the Iris Supervisor's and admins' (DOMAIN-MODEL section 7,
  pinned by `scheduling.test.mjs`). _Corrected Nov 27, 2026: v0.1 of this
  plan called this a gap; it is the v0.18 rule, and v0.46's "leaders set
  only by the point person, admins and the Admin Lead" is shorthand for it._
- No screen counts dates led per musician per month (the "2–3" norm).

### Point 3: marking "I can't play"

- **Holds, with a correction.** `set_unavailable` (migration
  `20261227120000_requests_absences_tasks.sql`) works **only while the
  building's month is in team editing**, which needs the Iris Supervisor to
  open it first. Before opening, after the confirm, and for months further
  ahead it says "dates you can't play are marked while the month is open for
  the team; after that, call the point person". On the website the button is
  under **More** on each date; on the phone it's on the date's screen.
- **The Iris Supervisor is told every time** it works: an email
  ("[Name] can't play [date]") and a To do task. So "an internal note might
  not reach the Iris Supervisor" is true only of the **Notes** field:
  changing a date's note emails nobody (checked: no notification is queued).
- There's no way to mark a run of dates (holidays, PTO). `Closure` (scope
  person, "blackout dates", D13) is in DOMAIN-MODEL but **was never built**:
  no table exists.

### Point 4: brainstorming dates

- **Holds.** A one-time date has one date and time. Musicians on a draft
  special event may move it (v0.12); nothing holds two options at once.
  People would use Notes, as in the workbook.

### Point 5: titles and "No Program" ahead of time

- **Corrected: more works before opening than Lauren describes, but not the
  part that matters most.** On **draft** dates that exist, before the month
  is opened (and before any review): the date's leader changes the title;
  any musician playing it changes notes, room and who plays, and can make it
  "No Program". The database allows a leader-swap proposal too, but the
  website and phone hide that button until the month is open.
- What needs the month opened: **"I can't play"**, and the swap button.
- **Lauren's example, reproduced** (in seed terms): Violet leads a date, Cal
  plays it. Violet marks "I can't play". Her assignment becomes absent but
  keeps the leader role; the date shows **"Leader: Not set"** in orange. Cal
  **can't** take the lead: setting himself is refused, and proposing a swap
  is refused ("this date has no leader yet; the point person sets one"). The
  Iris Supervisor's email and task say **"Find cover, or make the date 'No
  Program'"** ("They were leading it, so it needs a new leader"). The
  wording points at cancelling when the fix is one tap by Cal.
- Once the Iris Supervisor confirms the month, everything locks for
  musicians ("this month has been reviewed; ask the point person").

### Point 6: where rooms are set

- **Rooms (`Location`) are added and renamed only by admins**: Admin →
  Partners → the building's page (`src/app/admin/partners/`), or the Import
  spreadsheet. The row policies on `location` are admin-only; the probe
  confirmed the Iris Supervisor and the Lead Musician are refused.
- A weekly program's **usual room** is set by the Iris Supervisor or an admin
  when setting the program up; filled dates copy it.
- On a **draft** date, any musician playing it picks a different room from
  the building's existing rooms (website, under More). On the phone, only the
  Lead Musician changes a room, and only during partner changes.
- **Answer to Lauren:** yes, if each building's rooms and each weekly
  program's usual room are set correctly ahead of time, the current approach
  works; the gap is that only admins can add a missing room (D19-j fixes it),
  and musicians can't change a draft's room on the phone.

### Point 7: oversight

- **Every change to a date or who plays is recorded** in `audit_log` (who,
  when, before, after), but **only admins can read it, and no screen shows
  it**. The Iris Supervisor sees nothing of it (checked: zero rows).
  Removing a musician from a draft isn't recorded (decided in v0.28, Q6), and
  rooms (`location`) and weekly programs (`series`) have no log at all.
- **Emails the Iris Supervisor gets today:** "No Program" (each time),
  "can't play", "I wasn't there", leader-swap and sub requests, and "everyone
  is done reviewing". **Not** titles, notes, rooms or musicians added.

Also noticed (small): the building month page still told musicians they can
edit the "leader" on draft dates; since v0.43 they can't. Fixed Nov 27, 2026.

---

## 3. The changes, decision by decision (step 3)

Each item: the workbook's strength, what the app does now, the change, which
rules it revises or keeps, and what it touches. Permissions are named in
plain words; the database functions keep enforcing them (README: rules live
in Supabase), so web and phone behave the same.

### D19-a Release

- v0.8 (v0.8.1, live) keeps the current scheduling. Everything below is
  v0.9. Nobody uses the live app until v1.0, so no live month is caught
  half-way through a change; the expand-then-contract rule (CLAUDE.md) still
  applies to phones running an older build.

### D19-b The season grid: one building, the whole season, editable in place

- **Workbook:** the building tab; with every month's file in one folder,
  looking ahead is easy.
- **Now:** building month (one month) and season view (counts only).
- **Change:** a new **Season** page per building, reached from the program
  page and from each month: every date of the season at that building, month
  after month on one page, each month laid out like its workbook tab:
  month header (with its stage and due dates), **special events**, then **one
  block per weekly program** (every date of the month), then other one-time
  dates. Columns: **Day, Time, Program Title, Program Leader, Notes**, plus a
  small line with who plays and the room (as the month view shows today).
  "No Program" dates stay in place.
- **Editable in place**: each cell is a field when the viewer may change it,
  plain text when not. Musicians and staff see the same grid; the rules decide
  which cells open. Changes save as you leave the cell, with "Saved" or the
  database's reason ("Only this date's leader changes its title").
- **Helpers on the grid:** jump to a month; filters "My dates", "Needs a
  leader", "Can't play", "Changed since…"; a dot on cells changed since you
  last looked (from the change log, D19-c and point 7).
- **On the phone:** the same content as a scrolling list (month, then block,
  then date), "My dates" on by default; tapping a date opens today's date
  screen. The Calendar tab gets a "Season" switch.
- **Replaces:** the season view's "Month by month" counts become the grid's
  month headers; the building month view stays as the one-month version of
  the same layout (and the place the Iris Supervisor sets up weekly programs,
  v0.34).
- **Revises:** v0.16 and v0.34 (what the season view shows). **Keeps:** the
  partner calendar layout (GLOSSARY Part B), D12 (titles without names).
- **Touches:** new `src/app/residencies/[id]/season/[site]/` (or a building
  switch on the season page), shared row component with `session-card.tsx`;
  phone `calendar.tsx`; one read function (e.g. `season_grid(residency,
  site, season)`) so web and phone get the same rows; browser and phone
  journeys (Ryan's side).

### D19-c Leaders: any musician playing a date sets or changes its leader

- **Workbook:** musicians sign up to lead and fix the column themselves.
- **Now:** only the Iris Supervisor, admins and (on dates they play) the Lead
  Musician set leaders; musicians propose swaps for approval, and only when a
  leader is already set (v0.25, v0.28 Q1, v0.41, v0.43).
- **Change:** until the calendar is sent to the partner, **any musician
  playing a date** (not absent) can make **any musician playing it** its
  Program Leader, including themselves and including a date with no leader
  (or whose leader can't play). One database function, e.g.
  `set_session_leader(session, person)`, swaps the role in one step, so a
  date never has two leaders; the date still has **exactly one** leader
  (invariant kept). **No approval.** Each change is logged and the Iris
  Supervisor is emailed (question Q4 on per-change versus a daily digest).
- **When the leader marks "I can't play"**: the date shows **"Needs a
  leader"** (not "Not set", never "No Program"); the other musicians on it
  get a To do ("Lead [date]?") and the Iris Supervisor's notice reads
  "[Name] can't play [date]; it needs a leader. [Cal] is still playing." Only
  a date left with **nobody** playing reads "Find cover, or make it 'No
  Program'".
- **After sending:** as now (the Lead Musician and Iris Supervisor change
  leaders as partner changes; after final, a request the Iris Supervisor
  approves).
- **Revises:** v0.25 / D5 Nov 22 ("musicians only swap a leader the point
  person set"), v0.28 Q1, v0.41 and v0.43 (leader swap as a `ChangeRequest`
  before sending), the trigger rule in `assignment_month_rules`. Whether the
  Lead Musician also sets leaders on draft dates they don't play is Q15.
  **Keeps:** one leader per
  group session; relationship-building dates need none; D3 (the leader
  documents; hours come from documentation, so who leads doesn't change
  anyone's pay).
- **Retires:** `ChangeRequest(kind = leader_swap)` before sending.
  `request_leader_swap` stays callable for older phones (expand, then
  contract later), but the new screens don't use it.
- **Touches:** migration (new function, trigger rule, row policy for
  leaders on drafts); `session-card.tsx` leader cell for musicians;
  `mobile/src/app/date/[id].tsx` and `mobile/src/lib/date-rules.ts`;
  `my_tasks` (drop leader-swap approvals before sending, add "Lead
  [date]?"); tests `month-actions`, `month-cycle`, `scheduling-scenarios`
  (Q1), `tests/unit/date-rules.test.ts`, the `cant-play` phone journey.

### D19-d Leader tally (Iris Admins and Iris Supervisors only)

- **Workbook:** "Sign up to lead 2–3 … programs per month".
- **Now:** nothing.
- **Change:** on the season grid, for admins and the residency's Iris
  Supervisor only: a small table, one row per roster musician, one column per
  month, **dates led** (group sessions, not "No Program", leader not absent),
  **under 2 and over 3 highlighted**. Not shown to musicians.
- **Who sees it:** the code already has the right test: `can_schedule` means
  "an admin, or this residency's current point person" (the Iris
  Supervisor), and **not** the Lead Musician. A point person need not be an
  admin (DOMAIN-MODEL `StaffAssignment`), so the distinction is real; the plan
  reads D19-d as admins and Iris Supervisors (Q2 confirms).
- **Caveat:** musicians can already see every date's leader, so they could
  count it themselves; the tally hides the summary, not the facts.
- **Touches:** a read function guarded by `can_schedule`; the grid; the norm
  as a `Setting` (Q3).

### D19-e "I can't play" on any date, as soon as it exists

- **Workbook:** "No [name]" typed in Notes whenever someone knows.
- **Now:** only while the month is in team editing (point 3).
- **Change:** a musician marks "I can't play" on **any date they play, as soon
  as the date exists**, until the calendar is sent. No approval, no limit (as
  v0.41). The Iris Supervisor is emailed, as now, and gets the "cover" task
  only when the date has nobody left to play it; otherwise D19-c's "Needs a
  leader" applies. After sending: "Ask for a sub" or call, as now (Q5).
- **Per date only.** No ranges.
- **`Closure` (scope = person):** not built (no table). The plan proposes
  **dropping blackout dates from version 1** (it revises D13's "blackout dates
  in"); per-date "I can't play" replaces them. Holidays and partner closures
  (`Closure` with the other scopes) stay **for later**, unbuilt (Q6).
- **Revises:** v0.41 ("only while the month is in team editing"), D13.
  **Keeps:** D11 (a musician records their own sub; missed-session count).
- **Touches:** `set_unavailable`; the website and phone buttons (shown
  whenever the date is a draft I play); `my_tasks` "cover"; tests
  `month-actions`, `phone-calls`, `date-rules`, the `cant-play` journey.

### D19-f Candidate dates for one-time dates

- **Workbook:** notes like "date/time might change".
- **Now:** one date per one-time event.
- **Change:** a one-time date (e.g. a concert) can have **two or more
  candidate dates**. Proposed model (Q7): each candidate is an ordinary draft
  `Session`, so it carries its own musicians, rooms and "I can't play"
  marks, and availability shows with no new machinery; candidates of one
  event share a new optional attribute, e.g. `Session.candidate_group_id`.
  The grid shows them together ("Spring concert: 2 candidate dates") with
  who can play each. **Choose this date** turns that one into a normal draft
  and **deletes the others** (one-time dates can already be deleted, logged,
  v0.37).
- **Never outward:** candidates are left out of `publish_month`, the partner
  calendar, calendar links (`CalendarFeed`), exports and invoices. Sending a
  month that still has candidates (Q8): the plan recommends the send step
  names them and sends without them, so they stay internal and can be chosen
  later as a partner change.
- **New in DOMAIN-MODEL:** the attribute and its rules (needs Lauren's
  approval, as any new attribute does).
- **Touches:** migration (column, publish and feed exclusions, a `choose`
  function); grid and phone date screen; tests for "never on the partner
  calendar" (Ryan's side, important: outward documents).

### D19-g No lock at the meeting; sending locks

- **Workbook:** the meeting looks at the sheet; people keep typing after.
- **Now:** the Iris Supervisor's **Confirm** moves the month to
  `team_confirmed` and locks it for musicians (it writes calendar version 1
  "reviewed", which is the lock). Months not opened through the cycle keep
  the older "Mark reviewed, then Publish" panel, which locks the same way.
- **Change:** musicians keep editing their dates (titles by the date's
  leader, Notes, "No Program", leaders, "I can't play", rooms as now) **until
  the calendar is sent to the partner**. Sending is the lock.
- **`team_confirmed` and Confirm (proposal):** stop using the stage. Keep an
  optional **"We met and agree"** mark on the month (who and when, using the
  existing `ScheduleMonth.confirmed_at` and `confirmed_by` columns, so no new
  column) that **locks nothing**, shows on the grid and can be cleared. The
  enum value `team_confirmed` stays in the database for older phones and is
  no longer set (contract later). The point person's To do "Review and
  confirm" goes away (Q9).
- **The older review-and-publish path retires** once every month is in the
  cycle (D19-h): one way to send, not two. `ScheduleCheck` ("Done
  reviewing", v0.35) has no job once nothing waits for it; Q10.
- **Revises:** v0.25 and v0.35 (locked after review), D5 Nov 22 ("drafts lock
  for musicians once the month is marked reviewed"), v0.41 (`team_confirmed`
  locks). **Keeps:** the later stages unchanged (sent to partner, partner
  changes, final), the 10th and 15th deadlines (D7), the Lead Musician's
  send.
- **Touches:** `confirm_schedule_month` (becomes the mark), `session_guard`
  and `session_assignment_review_lock` (lock on "sent", not on "reviewed"),
  `is_session_month_reviewed` callers, `stage-panel.tsx`, `publish-panel.tsx`
  (retired), phone `month-review.tsx`, `my_tasks`,
  `queue_month_reminders`; tests `schedule-month`, `month-cycle`,
  `scheduling-scenarios` (v0.25 lock).

### D19-h Months open themselves

- **Workbook:** a month's file exists when someone makes it; everyone can
  type at once.
- **Now:** the Iris Supervisor clicks "Open [month] for the team", and some
  actions wait for it (point 3).
- **Proposal:** a building's month is **open for the team as soon as its
  first date exists**: the database makes its `ScheduleMonth` row (stage
  `team_editing`, the same deadlines) when a date is added there, instead of
  on a click. Filling the whole season at its start, which the season view
  already offers, then opens every month at once, like the folder of
  workbooks. The "Open [month]" task and button go away.
- **The email that said "January is open"** becomes a reminder the scheduler
  sends on the 1st of the month before, to musicians playing that month:
  "January at [building]: titles due Tuesday, December 10" (so the rhythm
  survives without the gate). Q11.
- **Revises:** v0.41 and v0.42 (opening), v0.47 ("As soon as possible" for a
  month opened late: with no opening, the reminder always names the date or
  says "As soon as possible" if it's already past). **Keeps:** the Iris
  Supervisor and admins fill dates and set up weekly programs (v0.34).
- **Touches:** a trigger on `session` insert (or `generate_series_month` and
  one-time event functions), `open_schedule_month` kept for older phones,
  `my_tasks`, `queue_month_reminders`, `stage-panel.tsx`; tests
  `schedule-month`, `reminders`.

### D19-i New names (display only)

| Today on screen | From v0.9 | Identifier (unchanged) |
|---|---|---|
| Point person | **Iris Supervisor** | `StaffAssignment.role = point_person` |
| Admin Lead, admin lead | **Lead Musician** | `RosterMember.is_admin_lead` |
| Iris Admin, admin | Iris Admin (unchanged) | `Person.system_roles ∋ admin` |
| Program leader, leader | Program Leader (unchanged) | `SessionAssignment.role = leader` |

- Everywhere people read them: website, phone app, To do, reminder and staff
  emails (many are written inside database functions, so a new migration
  re-creates those functions with the new wording), partner-facing calendar
  emails. About 65 files mention the old names.
- GLOSSARY Part A: "Lead Musician" (one per residency season, the
  contractor who sends the calendar and enters partner changes) and "Program
  Leader" (one per date, leads it and documents it) in separate rows that
  say which is which; "point person" and "admin lead" kept as former team
  words that map to the same objects.
- **Touches:** text only; phone journeys that find buttons by text ("Send to
  the point person") need the new words. Its own pull request.

### D19-j Rooms: the Iris Supervisor and the Lead Musician add and edit them

- **Now:** admins only (point 6).
- **Change:** the residency's current Iris Supervisor and Lead Musician add
  and rename rooms (`Location`) at **their residency's buildings**, and
  retire them (never delete). Every change is logged: `location` gets the
  same audit trigger as dates. Musicians keep choosing among existing rooms
  on drafts they play; the phone gets the same room choice as the website.
- **Revises:** DOMAIN-MODEL section 7 ("See and edit `Partner`, `Site`,
  `Location`: admins"), for `Location` only. **Keeps:** partners and
  buildings admin-only.
- **Touches:** row policies on `location`, audit trigger, a rooms card on the
  building month and season grid, phone date screen; permission tests.

### Point 7 and the guiding principle: oversight through visibility

- **Change:** a **"Recent changes"** list per building, on the season grid:
  who changed what, when, old and new value, newest first ("Cal made himself
  leader of Music Café, Tue Feb 3", "Violet: can't play Feb 10", "Room
  changed to Library"). Read from `audit_log` through one function that
  checks the reader is an admin or that residency's Iris Supervisor (Q12 on
  musicians seeing it). The grid marks cells changed since you last looked.
- **Fill the log's gaps:** record removing a musician from a draft (revises
  v0.28 Q6), rooms and weekly programs.
- **Emails:** as now, plus leader changes (D19-c). For titles, notes and rooms
  a daily summary to the Iris Supervisor rather than one email each (Q4).
- **Touches:** a read function over `audit_log` (resident data is never
  in these tables; the function returns schedule rows only), the grid,
  `notification` kinds, tests.

---

## 4. A spreadsheet in the app, or something better?

**Recommendation: a season grid that looks and edits like the workbook tab,
not a general spreadsheet.**

- A real spreadsheet (free cells, formulas, copy and paste anywhere) can't
  enforce the rules the app exists for: one leader per date, who may change
  what, no names in titles, nothing outward before it's sent, a log of every
  change. Each cell would need its own permission and still let people break
  the layout. And it's unusable on a phone, where musicians mostly work.
- The grid keeps what the workbook does well (one layout everyone knows,
  every date of the season visible, type straight into the cell, reasons in
  Notes next to the date) and adds what the sheets lack (who changed what,
  alerts, deadlines, rules that stop mistakes). Spreadsheet habits that help
  can come with it: Tab and Enter move between cells, changes save as you
  go, "My dates" and "Needs a leader" filters. Copy-down and paste from
  Excel can come later if people miss them.

---

## 5. The meeting

- The team still meets face to face; the app supports the meeting and locks
  nothing.
- **Meeting view** on the season grid (a button): wide layout, larger text
  for a shared screen, starting at the month being planned; "Changed since
  the last meeting" highlighted; filters "Needs a leader" and "Can't play";
  for admins and the Iris Supervisor, the leader tally beside the grid.
  Anyone can edit during the meeting, and afterwards (titles that
  afternoon or the next day).
- At the end, the Iris Supervisor may click **"We met and agree"** (D19-g):
  a dated mark on the month, nothing more.
- A **printable** version of a month (the partner layout plus Leader and
  Notes) for anyone who wants paper.

---

## 6. Pull requests, in order

Each small, one concern. Lauren's side prototypes screens on feature branches
(run locally); Ryan's side reviews migrations and permission rules, adds the
tests and merges. DOMAIN-MODEL, GLOSSARY and the CLAUDE.md D17/D19 rows
change in the same pull request as the code they describe, with the version
notes bumped.

| # | Pull request | Side | Depends on |
|---|---|---|---|
| 0 | **This plan** and the D19 row in CLAUDE.md (docs only) | Ryan | – |
| 1 | **Names** (D19-i): display text on web, phone and emails; GLOSSARY | Either | – |
| 2 | **Visibility first** (point 7): log the missing changes (draft removals, rooms, weekly programs), the "Recent changes" read function and list | Ryan (database), Lauren (list) | – |
| 3 | **Months open themselves; sending locks** (D19-h, D19-g): automatic `ScheduleMonth`, no lock on confirm, "We met and agree", retire the older review-and-publish path | Ryan | 2 |
| 4 | **Leaders and "I can't play"** (D19-c, D19-e): one-step leader change by any musician on the date, "Needs a leader", "I can't play" until sending, tasks and emails | Ryan (database), Lauren (buttons) | 3 |
| 5 | **Rooms** (D19-j) | Ryan | 2 |
| 6 | **Season grid on the website** (D19-b), meeting view, leader tally (D19-d) | Lauren prototypes, Ryan tests | 3, 4 (can start in parallel on today's rules) |
| 7 | **Season list on the phone**, room choice on drafts | Lauren prototypes, Ryan tests | 6 |
| 8 | **Candidate dates** (D19-f) | Ryan (database), Lauren (screens) | 6 |

Doing visibility (2) before removing gates (3, 4) means the Iris Supervisor
can see every change from the first day musicians have the new freedom.

---

## 7. Left for later

- An **"All buildings"** grid for a residency with many buildings (the
  workbook's "All" tab), and printing it.
- **Copy-down and paste** from Excel into the grid.
- **Ranges** of "I can't play" and `Closure` (holidays, partner closures,
  blackout dates): not in v0.9.
- The Hebrew Home tab's **"Anticipated Cost"** per date and its list of the
  partner's available time slots, and the one-to-ones tab's hours per
  musician: budgeting and partner rules, not scheduling; worth their own
  conversation.
- Removing `team_confirmed`, `request_leader_swap` and `open_schedule_month`
  for good, once `min_app_version` is past every phone that uses them.

---

## 8. Questions for Lauren and Ryan

Permissions are involved in almost every item, so each needs a yes even where
D19 seems to settle it (CLAUDE.md stop-and-ask). A recommendation follows each
question.

1. **D19-c, who may be made leader:** any musician playing the date
   (themselves or another), or only themselves ("I'll lead")? _Recommend:
   any musician playing it, as the workbook allows._
2. **D19-d, who sees the tally:** Iris Admins and the residency's Iris
   Supervisor (who may not be an admin), not the Lead Musician? _Recommend:
   yes, exactly those two (the code's `can_schedule`)._
3. **D19-d, how to count:** across all the residency's buildings or per
   building, and which buildings? The workbook's norm names Landow, Ring and
   Revitz, not Hebrew Home. And is "2–3" one setting for all of Iris or per
   residency? _Recommend: per residency, all its buildings, with an admin
   setting per residency (default 2–3) and a per-building breakdown on
   hover._
4. **Emails to the Iris Supervisor:** one email per leader change (D19-c),
   and a daily summary for titles, notes and rooms; or a daily summary for
   everything except "I can't play"? _Recommend: immediate for "I can't
   play" and leader changes, a daily summary for the rest._
5. **D19-e after sending:** once the calendar is sent, "I can't play"
   becomes "Ask for a sub" or a call, as now? _Recommend: yes; sending is the
   lock (D19-g)._
6. **`Closure`:** drop blackout dates (scope person) from version 1 (this
   revises D13), and leave holidays and partner closures for later?
   _Recommend: yes; per-date "I can't play" covers blackout dates._
7. **D19-f, the model:** each candidate as a draft date sharing a
   `candidate_group_id`, rather than a separate candidates table? Who adds
   candidates and who chooses? _Recommend: the shared-group model; the people
   who add one-time events today (Iris Supervisor, admins, Lead Musician) add
   candidates and choose; musicians on a candidate mark "I can't play" on
   it._
8. **D19-f, sending with candidates left:** send without them and say so, or
   refuse to send until one is chosen? _Recommend: send without them, naming
   them in the confirmation._
9. **D19-g, Confirm:** keep it as an optional "We met and agree" mark that
   locks nothing, or drop it entirely? _Recommend: keep the mark; it costs
   nothing and records that the meeting happened._
10. **"Done reviewing" (`ScheduleCheck`, v0.35):** keep it (each musician
    says "my dates are right"), or retire it now that nothing waits for it?
    _Recommend: retire it; the change log and the meeting do its job._
11. **D19-h, opening:** months open as soon as their first date exists, with
    a reminder email on the 1st of the month before instead of the
    "January is open" email? And should saving a weekly program fill its
    dates for the whole season automatically, so nobody has to remember
    "Fill the whole season"? _Recommend: yes to both._
12. **Recent changes:** only the Iris Supervisor and admins, or the whole
    roster too (they already see every date)? _Recommend: the whole roster
    sees changes to their building's dates, without anyone's email or
    phone; the tally stays for admins and the Iris Supervisor._
13. **D19-j, rooms:** may the Iris Supervisor and the Lead Musician retire a
    room, or only add and rename? _Recommend: add, rename and retire (never
    delete), logged._
14. **The "leader" text on the month page** (point 5, small): _Fixed Nov 27,
    2026 at Ryan's request; no longer a question._
15. **Lead Musician and drafts:** today (v0.18) the Lead Musician sets
    leaders only on published dates and on drafts they play. With D19-c, should
    they also set leaders on draft dates they don't play, as the Iris Supervisor
    does? _Recommend: yes; the Lead Musician coordinates the season, and the
    change is logged like any other._
