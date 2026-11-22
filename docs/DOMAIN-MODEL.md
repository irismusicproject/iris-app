# Iris App — Domain Model (Language 1: the code)

_Draft v0.19, November 22, 2026 (v0.19: musician hours and invoices built: hours entered on My week, the point person approves, admins set rates and stipends, invoices per two-week pay period; "Collab?" is Yes/No and every Yes counts as co-led; the collaboration target is set per season by the point person or an admin. v0.18: roles narrowed: the point person plans, the Admin Lead publishes and updates published dates, musicians edit drafts they play in and pick leaders; monthly programs. v0.17: "No Program" dates can be restored. v0.16: season view for the point person. v0.15: usual leaders, season reminders, private calendar links. v0.14: documentation from the CESLC workbook sample, weekly; musicians write draft notes; schedule laid out like the workbook tab. v0.13: people in a program can see each other's names, nothing else. v0.12: every roster musician edits draft titles, rooms and musicians; the point person assigns leaders. v0.11: `Partner`, `Site`, `Location` built; see section 1. v0.10: scheduled relationship building (e.g. Lessons) and the partner calendar layout; v0.9: partner permission for resident names confirmed; v0.8: decisions D14 and D15 settled: residents and attendance; v0.7: decisions D10, D11 and D16 settled: events, extras, absences, substitutes and the roster; v0.6: both D9 billing details confirmed; v0.5: decisions D9 and D13 settled: partner billing and version 1 scope; v0.4: decisions D2, D4, D6, D7 and D8 settled; v0.3: decisions D1, D3 and D5 settled, including how a month's schedule is reviewed, published and sent; v0.2: `Person` rules confirmed and built; see section 7). This is the **authoritative** definition of the
app's objects. GLOSSARY.md translates the team's language (Language 2) and
our partner-facing language (Language 3) into these objects._

## The three languages

| | Language | Who uses it | Can it change? | Rule |
|---|---|---|---|---|
| **1** | **Domain model** (this file) | The code, the database, developers | Yes: we design it | One name, one meaning. No overloading, ever. |
| **2** | **Team language** | Iris staff and musicians, day to day | No: it is set | The app's screens may *display* team words, but every team word must map to exactly one object **in context** (GLOSSARY Part A). |
| **3** | **Outward language** | Partners, residents, funders: calendars, invoices, reports | No: it is set | Generated documents use partner-facing words and names. Templates map each printed field to an object attribute (GLOSSARY Part B). |

**Rules for Language 1**
1. **The word "program" is never used as an identifier** in code, database
   tables, columns or APIs. It is a display word only (Languages 2 and 3).
   Likewise "community" and "residency" (except `Residency`, defined
   below with one meaning) are not used loosely.
2. Every object below has one definition. If a new concept doesn't fit an
   existing definition, it becomes a new object. We don't stretch an old one.
3. Lists that people edit (types, categories) are **data**, not code, and are
   **versioned**: values are retired, never deleted, so old records keep their
   meaning.
4. Where a decision in TERMINOLOGY-REVIEW.md is still open, the model takes a
   default, marked **Assumption (D#)**. Changing an assumption changes this
   file first.

---

## Object map

```mermaid
erDiagram
  Partner ||--o{ Site : operates
  Partner ||--o{ PartnerContact : has
  Partner ||--o{ PartnerAgreement : signs
  Site ||--o{ Location : contains
  Site ||--o{ Resident : "is home to"
  Partner ||--o{ Residency : hosts
  Residency }o--o{ Site : serves
  Residency ||--o{ Season : "runs in"
  Season ||--o{ RosterMember : staffs
  Person ||--o{ RosterMember : "is on"
  Season ||--o{ Contract : "pays via"
  Person ||--o{ Contract : holds
  Residency ||--o{ StaffAssignment : "overseen by"
  Person ||--o{ StaffAssignment : oversees
  Residency ||--o{ Series : offers
  Series ||--o{ Session : generates
  Residency ||--o{ Session : schedules
  Session ||--o{ SessionAssignment : staffed_by
  Person ||--o{ SessionAssignment : plays_in
  Session ||--o| SessionReport : "documented by"
  SessionReport }o--|| InteractionType : "records a"
  PartnerAgreement ||--o{ Session : covers
  PartnerAgreement ||--o{ PartnerInvoice : "billed by"
  Person ||--o{ RelationshipActivity : logs
  RelationshipActivity }o--o{ Resident : with
  RelationshipActivity }o--o| Session : "prepares for"
  Person ||--o{ TimeEntry : records
  Person ||--o{ MonthlyReflection : writes
  Person ||--o{ MusicianInvoice : "is paid by"
  MusicianInvoice ||--o{ InvoiceLine : contains
  Partner ||--o{ PartnerInvoice : "is billed by"
  PartnerInvoice ||--o{ InvoiceLine : contains
  Residency ||--o{ Target : "measured by"
  Residency ||--o{ SpecialProject : "may fund"
  Session ||--o{ ChangeRequest : "may receive"
```

---

## 1. Partners and places

### `Partner`
The organization Iris contracts with and bills (e.g. Charles E. Smith Life
Communities; Comprehensive Housing Assistance; Mather; Winter Growth; Asbury
Methodist Village). Also covers non-senior-living partners (a community
center, a 50+ center).

| Attribute | Type | Notes |
|---|---|---|
| `legal_name` | text | As on contracts and invoices |
| `display_name` | text | As printed on calendars (Language 3) |
| `billing_address`, `billing_email` | text | For `PartnerInvoice` |
| `active` | bool | |

### `Site`
A building or campus where programming happens (e.g. Ring House, Weinberg
Manors, Mather Tysons, Winter Growth Olney). Belongs to exactly one `Partner`.

| Attribute | Type | Notes |
|---|---|---|
| `partner_id` | → Partner | Required |
| `name`, `display_name` | text | |
| `care_levels` | set of enum | `independent`, `assisted`, `memory_care`, `skilled_nursing`, `adult_day`, `affordable_housing`, `other` |
| `address`, `city`, `state`, `timezone` | text | Timezone matters: sites span ET, CT and MST (Tucson) |
| `active` | bool | |

**Multi-building partners (decided by Ryan, Nov 2026).** There is no object between `Partner` and `Site`. A partner with several buildings, such as CESLC, is one `Partner` with one `Site` per building that has its own care level or calendar (independent living, assisted living, memory care…). How near the buildings are to each other (walking distance, a short drive, farther) is not stored; each `Site` has an address and time zone, and distance can be derived later if pay or scheduling needs it. A `Residency` may span several `Site`s.

**Built (Nov 2026):** `Partner`, `Site` and `Location` are retired (`active = false`), never deleted. `Site.timezone` must be a real time zone. Names are unique within their parent. A `Site` can't move to another `Partner`, and a `Location` can't move to another `Site`. `Partner.billing_address` and `billing_email` are optional; invoices go one per contract, per site, per month (D4).

Partners vary: one building with a single care level is one `Site`; a building shared by two care levels is one `Site` with both `care_levels`.


### `Location`
A specific room, unit or floor within a `Site` (an auditorium, a named
building on a campus, a unit). Belongs to exactly one `Site`.

| Attribute | Type | Notes |
|---|---|---|
| `site_id` | → Site | Required |
| `name`, `display_name` | text | |
| `active` | bool | |

### `PartnerContact`
A person at a partner who receives calendars or invoices. Does **not** sign in.

| Attribute | Type | Notes |
|---|---|---|
| `partner_id` | → Partner | |
| `site_ids` | → Site (many) | Which sites they cover; empty = all |
| `name`, `title`, `email`, `phone` | text | |
| `receives` | set of enum | `calendar`, `invoice` |

### `Resident`
An older adult at a `Site` with whom musicians build relationships. Minimal
by design. **Never** holds health information.

| Attribute | Type | Notes |
|---|---|---|
| `site_id` | → Site | Required. A resident belongs to one site |
| `display_name` | text | **First name + last initial** (e.g. "Ruth K."), as musicians know them (D14) |
| `disambiguator` | text | Optional short note to tell residents with the same name apart (e.g. unit or "violin student"). **No health details** |
| `active` | bool | Deactivate when a resident moves or passes away; never delete (history) |

**Invariant:** `display_name` + `disambiguator` is unique within a `Site`.

**Decided (D14, Nov 21, 2026)**
- **No preloaded list.** The resident list for a site is built by
  musicians as they work: when logging a `RelationshipActivity`, a musician
  picks a resident already on the site's list or adds a new one (first name
  + last initial, plus a disambiguator if the name is taken).
- **Who can see a site's residents:** musicians on the current roster of a
  residency serving that site (including subs who joined it, D16), that
  residency's point person, and admins. **Every view is logged**
  (`AuditLog`).
- **Hebrew Home** keeps its own "Bedside Melodies" workbook, which the
  partner's team also edits. Musicians there log relationship building in
  **both** places; the app doesn't import or sync the workbook.
- **Partner permission (REQUIREMENTS Q1), confirmed by Lauren, Nov 21,
  2026:** partners are comfortable with Iris recording residents this way,
  because only minimal information is kept and none of it is shared. If a
  partner later asks for a confidentiality agreement or BAA, revisit
  REQUIREMENTS Q8 (hosting).

---

## 2. Residencies, seasons and people

### `Residency`
**Iris's ongoing engagement with one Partner at one or more of its Sites,
delivered by a roster of musicians.** This is what the team calls "the
program at Mather" (Language 2) and what the workbooks call an "Iris Ensemble
Program". The code uses `Residency` because the team no longer uses that word
day to day, so it carries exactly one meaning here, and it names the
Ensemble-in-Residence model. **Decided (D1, Nov 21, 2026):** the code name
is `Residency`; screens and documents still say "program".

| Attribute | Type | Notes |
|---|---|---|
| `partner_id` | → Partner | Required, exactly one |
| `site_ids` | → Site (many, ≥1) | All must belong to `partner_id` |
| `name` | text | Internal, e.g. "Mather Evanston/Wilmette" |
| `display_name` | text | For outward documents, e.g. "Iris Music Project at Ring House" |
| `status` | enum | `planned`, `active`, `paused`, `ended` |
| `started_on`, `ended_on` | date | |

**Invariants:** a `Residency` belongs to one `Partner`. Each `Site` may host
several residencies over time, but they don't overlap within the same
`Season` dates unless an admin allows it.

### `Season`
A dated period of a `Residency` during which a roster, contracts, targets
and stipend installments apply (e.g. "Asbury Feb–May 2027", "Weinberg Manors
Fall 2026").

| Attribute | Type | Notes |
|---|---|---|
| `residency_id` | → Residency | |
| `name` | text | |
| `starts_on`, `ends_on` | date | |
| `kind` | enum | `semester`, `season`, `summer_session`, `other` |

**Decided (D8, Nov 21, 2026):** seasons are set **per residency**, with
each residency's own dates. A semester is a `Season` with `kind = semester`;
"twice per semester" stipends and per-semester targets attach to `Season`.

### `Person`
Anyone who signs in: musicians, staff, volunteers. One record per human.

| Attribute | Type | Notes |
|---|---|---|
| `name`, `email` (login), `phone` | text | Email is the sign-in identity (Supabase) |
| `employment_type` | enum | `contractor_1099`, `employee_w2`, `volunteer` |
| `instruments` | set of text | |
| `system_roles` | set of enum | `admin` (see section 7): the Iris core (salaried) team, who get the admin view across every residency (D5). Empty for most musicians |
| `job_title` | text | Org-chart title, e.g. "Director of Programs", "Musician in Residence 1". **Display only. Grants no permissions** |
| `active` | bool | Deactivated people keep history and cannot sign in |
| `certified_on` | date | Creative Aging Practitioner certification, if completed |

**Rules (confirmed by Ryan, Nov 21, 2026; built in `supabase/migrations`):**
- People are **deactivated, never deleted**. Deactivating blocks sign-in and hides all data from that person at once (R9.5).
- A person may change only their own `phone` and `instruments`. Everything else is admin-only.
- `email` can't be changed in the app: it's the sign-in identity.
- An admin can't remove their own `admin` role or deactivate themselves, so Iris can't be locked out by accident.

### `RosterMember`
A `Person`'s membership on a `Residency` for one `Season`. **Decided (D16,
Nov 21, 2026):** the roster is everyone who plays at the residency that
season: the core ensemble (`is_core`) and everyone else, including
substitutes. A substitute who isn't on the roster **joins it as a non-core
member** when they're named as a sub, so they see the residency's sessions
and residents like other roster members.

| Attribute | Type | Notes |
|---|---|---|
| `season_id` | → Season | |
| `person_id` | → Person | |
| `is_core` | bool | Part of the core ensemble ("the ensemble", "the Trio") vs. occasional players and substitutes (D16) |
| `is_admin_lead` | bool | The handbook's "administrative project lead". **At most one per Season**, covering all of the residency's sites (D5) |
| `joined_on`, `left_on` | date | |

### `StaffAssignment`
An Iris staff member responsible for a `Residency` (the handbook's
"designated Iris staff member"; the team says "point person").

| Attribute | Type | Notes |
|---|---|---|
| `residency_id` | → Residency | |
| `person_id` | → Person | Must have `system_roles ∋ admin` or be explicitly granted |
| `role` | enum | `point_person` (approves), `support` (view only) |
| `starts_on`, `ends_on` | date | Effective dating keeps history through org changes (2028, 2029) |

**Invariant:** each active `Residency` has exactly one current
`point_person`.

### `Contract`
The agreement under which Iris pays a contractor for one `Season` of one
`Residency`. **Decided (D9, Nov 21, 2026):** the hourly rate lives on each
contract, so a musician working in two regions can have two rates.

| Attribute | Type | Notes |
|---|---|---|
| `person_id`, `season_id` | → | Unique together |
| `hourly_rate` | money | Flat rate, prep time included |
| `estimated_weekly_hours` | number | |
| `stipends` | list of `StipendInstallment {kind, due_on, amount}` | `kind`: `project_support`, `admin_lead`, `training`, `other`. Built v0.19 as one row per payment |
| `signed_on` | date | |
| `status` | enum | `draft`, `sent`, `signed`, `ended` |

W-2 employees have no `Contract`. They are paid through payroll.

**Built (v0.19, decided by Lauren Nov 22, 2026):** admins set each
contractor's hourly rate and stipend payments on the program page, per
season. Only the musician and admins can see a contract; **the point person
never sees pay.** `signed_on` and `status` are not built yet.

---

## 3. Scheduling

### `InteractionType`
The admin-managed, versioned list of kinds of group session, chosen **only
when documenting** a session (`SessionReport`), not when scheduling it.

**Decided (D2, Nov 21, 2026):** the starting list is the 2026 documentation
pages' list, kept for organization-wide stats and evaluation:

| Starting value | `model_type` |
|---|---|
| Music Instructional Program | `small_group` |
| Lecture/Discussion | `small_group` |
| Interdisciplinary Program | `small_group` |
| Open Rehearsal | `performance` |
| Performance | `performance` |
| Other | set by an admin |

One-to-ones, mini-group sessions and resident co-facilitation are **not**
interaction types. One-to-ones and mini-groups are `RelationshipActivity`
records; co-facilitation is `SessionReport.resident_involvement` (D6).
Pay categories are a separate list (`TimeCategory`).

| Attribute | Type | Notes |
|---|---|---|
| `name` | text | |
| `model_type` | enum `ModelType` | `performance`, `small_group`, `one_to_one`. Maps to the JAAH model's three types |
| `default_time_category` | → TimeCategory | Used to pre-fill time entries |
| `active` | bool | Retired, never deleted |
| `description` | text | Shown to musicians as guidance |

### `Series`
**A titled, recurring offering within a `Residency`** (Language 2: "the
Music Café program", "Tuesday open rehearsals"). A `Series` is a template;
it doesn't happen. Its `Session`s happen.

| Attribute | Type | Notes |
|---|---|---|
| `residency_id` | → Residency | |
| `kind` | enum `SessionKind` | `group_session` (default) or `relationship_building` (e.g. "Lessons"). See below |
| `title` | text | **Title only.** Never personnel or location (D12) |
| `default_location_id` | → Location | Must be at one of the residency's sites |
| `recurrence` | rule | **Weekly** on chosen weekdays (e.g. Wednesdays 11:00, 120 minutes), or **monthly** on the 1st–4th of one weekday (`week_of_month`, e.g. the 4th Monday at 1:30; v0.18). Monthly programs print under Regular programming. Time and length are **optional** for `relationship_building` |
| `default_personnel` | → Person (many) | Must be on the current roster |
| `default_leader_id` | → Person | Optional **usual leader** (v0.15): made leader on every date when a month is filled in. Weekly programs without one are left for the point person |
| `active_from`, `active_until` | date | |

### `Session`
**One scheduled occurrence on a specific date and time.** The unit of
scheduling, partner calendars, documentation and partner billing. A session
either comes from a `Series` or stands alone (a special event, a concert,
an extra program).

| Attribute | Type | Notes |
|---|---|---|
| `residency_id` | → Residency | Required |
| `series_id` | → Series | Optional. Null = one-time session |
| `kind` | enum `SessionKind` | Copied from the series. `group_session` or `relationship_building` |
| `title` | text | Copied from the series and editable per session |
| `location_id` | → Location | |
| `starts_at` | datetime (site timezone) | The date, and the time when there is one |
| `has_set_time` | bool | False for a `relationship_building` session with no set time: it prints with a blank time |
| `scheduled_minutes` | int | Optional for `relationship_building` |
| `call_time` | time | Optional (concerts) |
| `is_special_event` | bool | Shown in the "Special events" section of partner calendars. Concerts are special events (D10) |
| `is_extra` | bool | An "extra program": outside contracted hours, separately negotiated pay, and musicians may decline. **Billed to the partner like any session (D10)** |
| `billable` | bool | Default true. An admin can set it false for a session Iris doesn't bill (e.g. a gift to the community) (D10) |
| `special_project_id` | → SpecialProject | Optional |
| `partner_agreement_id` | → PartnerAgreement | The contract the session falls under. Defaults to the residency's only agreement for the season; required when there are several (D4) |
| `schedule_state` | enum | `draft`, `published`, `canceled` |
| `cancellation_reason` | enum | `partner`, `weather`, `musician`, `other`. Required if canceled |
| `canceled_at` | datetime | When the cancellation was recorded. Compared with `Setting.cancellation_notice_time` to tell a late partner cancellation (D9) |
| `public_note` | text | May print on partner calendars |
| `internal_note` | text | Never prints |

**Scheduled relationship building (decided Nov 21, 2026).** Some weekly
offerings are relationship building, not group sessions: e.g. "Lessons with
[musicians]" on Tuesdays, often without a set time. They're a `Series` with
`kind = relationship_building`, set up once and filled in each month like
any other weekly program, and they print on the partner calendar (blank
time if none). They're **documented as `RelationshipActivity` records**
(linked through `RelationshipActivity.session_id`), not by a
`SessionReport`; they need no leader, and their hours come only from those
logged activities, so nothing is counted twice. Unscheduled relationship
building (one-to-ones that happen organically) never prints (D2).

**Invariants**
- `location.site` ∈ `residency.sites`.
- A non-canceled `group_session` has **exactly one** playing
  `SessionAssignment` with `role = leader`. `relationship_building`
  sessions need none.
- Once `published`, only admins, the point person and the Admin Lead can
  edit it. Every edit is logged in `AuditLog`, and the session's musicians
  are notified. Others submit a `ChangeRequest`. (D5) Exception: a musician
  assigned to the session can mark themselves absent and name their sub (D11).
- A canceled session stays in the record. Musicians aren't paid for it
  (handbook). Partner billing follows `PartnerAgreement.bill_canceled`.
- **Restoring a "No Program" date (v0.17, decided by Lauren Nov 22, 2026).**
  Calendars take back-and-forth (e.g. a musician marks a date "No Program",
  then the point person asks for a sub instead). The Admin Lead, point person
  or an admin can restore it: it comes back as a **draft** with its
  musicians and leader, its cancellation reason cleared, and the change
  logged. It's published with its month, or with the next calendar version
  if the month was already sent.
- **Planned absences (D11).** When a musician's absence is known before the
  10th (`Setting.schedule_internal_due_day`) and no sub is arranged, the
  Admin Lead cancels that session in the draft with `cancellation_reason =
  musician`. The partner calendar prints that slot as **"No Program"**.

### `SessionAssignment`
A `Person` assigned to play in a `Session`.

| Attribute | Type | Notes |
|---|---|---|
| `session_id`, `person_id` | → | Unique together |
| `role` | enum | `leader`, `participant` |
| `status` | enum | `assigned`, `absent`, `substitute` |
| `substitute_for_id` | → Person | Required when `status = substitute` |

The program leader is **per session** and is expected to rotate among
participating musicians (handbook). The app can report rotation balance.

**Absences and substitutes (decided, D11 and D16, Nov 21, 2026)**
- Subs are rare. The musician arranges their own sub (handbook), then
  **records it in the app themselves** on their published session: their
  assignment becomes `absent`, and a new assignment with `status =
  substitute` and `substitute_for_id` = the absent musician is added.
- The sub can be **any active `Person`**. If the sub isn't on the
  season's roster, they're added as a non-core `RosterMember`. Someone
  outside the Iris network must first be added as a `Person` by an admin.
- The change is logged, and the Admin Lead and point person are notified.
- Each musician's missed sessions this season are counted; when the count
  passes `Setting.max_musician_absences_per_season`, the Admin Lead and
  point person get a warning.
- If the absent musician was the session's leader, the sub or another
  participant must become leader (a session keeps exactly one leader).

### `ChangeRequest`
A request to change a published `Session`.

| Attribute | Type | Notes |
|---|---|---|
| `session_id`, `requested_by` | → | |
| `proposed_changes` | structured | Any of title, time, location, personnel, cancellation |
| `reason` | text | |
| `status` | enum | `open`, `approved`, `declined` |
| `decided_by`, `decided_at` | | |

### `Closure`
Dates when sessions don't run (Iris holidays, partner closures, blackout
dates). Musicians' blackout dates (`scope = person`) are **in version 1
(D13)** and show when scheduling.

| Attribute | Type | Notes |
|---|---|---|
| `scope` | enum + id | `all_iris`, `partner`, `site`, `residency`, `person` (a musician's blackout dates) |
| `starts_on`, `ends_on` | date | |
| `reason` | text | |

### `CalendarFeed`
A musician's **private calendar link** (v0.15, decided by Lauren Nov 22,
2026). Google, Apple and Outlook calendars subscribe to it and refresh on
their own.

| Attribute | Type | Notes |
|---|---|---|
| `person_id` | → Person | One link per person |
| `token` | text | Secret. The person can replace it ("Make a new link"), which stops the old one |

**Shows:** published (and canceled, as "No Program") sessions the person
plays in (not absent), plus special events of programs they're on; from 60
days ago to a year ahead. Drafts never appear. **Security review pending
(Ryan's side):** the feed is readable by anyone holding the link.

**Season view (v0.16, decided by Lauren Nov 22, 2026).** The point person
(and Admin Lead, admins) sees a whole `Season` at once: each weekly
program's **leader for the whole season** (setting it makes them the usual
leader and the leader of every draft date from today on; published months
don't change), month-by-month status (published, drafts, "No Program",
dates still needing a leader), and **Fill the whole season**. Some weekly
programs have one leader all season (e.g. Orchestra); others are picked per
date.

**Season reminders (v0.15).** Each month's schedule shows a "Coming up this
season" box: the program's special events in later months (often planned
at the start of a season), so musicians see them every month until they
happen.

### `CalendarExport`
One version of a monthly partner calendar for one site (Language 3
document). A month can have several versions as the partner gives feedback.

| Attribute | Type | Notes |
|---|---|---|
| `residency_id`, `site_id` | → | |
| `month` | year-month | |
| `version` | int | 1, 2, 3… per residency × site × month. Unique together |
| `state` | enum | `reviewed` (version 1 only: reviewed, not yet published), `sent` |
| `reviewed_by`, `reviewed_at` | → Person, datetime | Version 1 only: the point person (or an admin) after reviewing the draft with the Admin Lead |
| `format` | enum | `pdf`, `docx` |
| `generated_at`, `generated_by` | | Who clicked "Publish and download" (version 1) or "Download updated calendar" (later versions) |
| `sent_at` | datetime | Set when generated. The Admin Lead emails the file from their own email, cc'ing the point person; the app doesn't send it |
| `partner_feedback` | text | Optional. A summary of the partner's reply that led to the next version. **Internal: never prints** |
| `file` | storage ref | |

Built only from `published` sessions.

**Who does what (v0.18, decided by Lauren Nov 22, 2026; supersedes the
drafting rules below where they differ)**

| Who | Can do |
|---|---|
| **Point person, admins** | Everything: set up weekly and monthly programs (in the season view), fill months and the season, add events, set leaders, "No Program" and restore, mark a month reviewed |
| **Admin Lead** | Publish and download; update **published** dates after the partner's staff asks (time, room, title, notes, "No Program" or restore) and download the updated calendar; add one-time events. Not: fill months or the season, set up programs |
| **Every roster musician** (Admin Lead included) | On **draft dates they play in**: title, notes, room, who plays, and **pick or swap the leader** (after the point person has set it); date and time of special events they play in. **A draft date's leader can make it "No Program"** (restoring stays with the point person and Admin Lead) |

**Publishing a month (decided, D5, Nov 21, 2026; drafting updated Nov 22)**

Roles: the **point person** is Iris staff (`StaffAssignment`); the **Admin
Lead** is the roster musician leading the project, still an independent
contractor (`RosterMember.is_admin_lead`).

1. **Auto-fill.** Weekly programs (`Series`) fill in the month's draft
   sessions with their dates, times, rooms and default musicians, all
   weekly programs at once, so nothing is re-entered month to month.
   The Admin Lead (or point person, or an admin) adds one-time sessions
   and special events.
2. **Musicians edit the draft.** Every musician on the residency's current
   roster can edit any draft session in that residency: its **title**
   (each date has its own, e.g. this week's theme), **internal notes**
   (e.g. "Ben off", never printed; v0.14), **room**, and **who plays**
   (adding or removing roster musicians as participants). Titles are typed
   without musicians' names; the calendar adds "with [first names]" (D12).
   The schedule screen is laid out like the workbook scheduling tab: Day,
   Time, Program Title, Program Leader, Notes. Titles lock when the month is
   published (decided Nov 22, 2026). For **special events** they can also change the **date
   and time**. They can't set leaders, cancel, or change anything else.
   **Assumption:** creating new special events stays with the Admin Lead,
   point person and admins.
3. **Leaders, then review.** The point person assigns each group session's
   leader, then reviews the draft with the Admin Lead (often on a call) and
   marks it reviewed. This creates version 1 with `state = reviewed`.
   Afterwards the Admin Lead can swap a leader if needed (e.g. after a
   sub); admins always can.
3. The Admin Lead clicks **Publish and download**. All of that site's draft
   sessions for the month become `published`, the PDF is generated, and
   version 1 becomes `sent`. **Musicians treat the schedule as final from
   here.** Version 1 can't be generated before step 2.
4. The Admin Lead emails the PDF to the partner from their own email, with
   the point person cc'd.
5. If the partner sends feedback, the Admin Lead edits the published
   sessions (each change logged; musicians notified), optionally records
   `partner_feedback`, and clicks **Download updated calendar**, which
   creates the next version with `state = sent`. Later versions don't need
   another review.

---

## 4. Documentation

### `SessionReport`
The documentation of one `Session`, written by its **leader**. **Decided (D3):** other musicians at the session don't document it; each logs their own `RelationshipActivity`, `TimeEntry` and `MonthlyReflection`.

| Attribute | Type | Notes |
|---|---|---|
| `session_id` | → Session | One report per session |
| `author_id` | → Person | The session leader (or an admin) |
| `actual_minutes` | int | Length, pre-filled from the schedule; used for billable session hours (D9). An in-app timer may come later |
| `attendance` | int | **Everyone present**: residents, staff, family and guests, counted together (D15) |
| `interaction_type_id` | → InteractionType | Chosen by the leader when documenting (D2) |
| `resident_involvement` | enum `ResidentInvolvement` | `none`, `co_facilitated`, `co_led`. What actually happened. **Revised v0.19 (Lauren, Nov 22, 2026):** the leader answers "Collab?" Yes or No only; **Yes is stored as `co_led`** and every Yes counts as collaborative and toward the season's target. `co_facilitated` is kept for older records but no longer offered |
| `notes` | text | No health information |
| `submitted_at` | datetime | |

Approval (`state`, `approved_by`, `approved_at`) comes later.

**Documented weekly (decided Nov 22, 2026).** Each musician has a **"My
week"** page (Monday–Sunday) showing the programs they led, their
relationship-building activities, and the month's reflection, due Tuesday
5 pm the following week (D7). The workbook's "Collab?" column is
`resident_involvement`: No / Yes (v0.19).

**Invariants:** exists only for sessions that are not canceled and are in
the past. Locked once `approved`; corrections go through an admin and are
logged.

**After submitting** (D2 follow-up), the musician sees where they and their
residency stand on this season's `Target`s (e.g. co-led sessions so far
this semester, average attendance). Interaction type and collaboration are
captured only here, never on the schedule.

### `RelationshipActivity`
One logged instance of relationship building with one or more residents
(Language 2: "relationship-building activity", formerly "one-to-one").
**Logged after it happens** (they're often organic and unscheduled), and
**never shown on partner calendars** (D2).

| Attribute | Type | Notes |
|---|---|---|
| `person_id` | → Person | The musician |
| `residency_id` | → Residency | |
| `site_id` | → Site | Required. One of the residency's sites; needed because relationship-building time is billed per site (D9) |
| `occurred_on` | date | |
| `location_id` | → Location | Optional; must be at `site_id` |
| `kind` | enum | `one_to_one`, `mini_group` (2–8 residents), `hallway_concert` (decided Nov 22, 2026) |
| `minutes` | int | **Required** (decided Nov 22, 2026): billed per site (D9) and pre-fills weekly hours |
| `collaborative` | bool | The workbook's "Collab?" (decided Nov 22, 2026) |
| `resident_ids` | → Resident (many) | All at `site_id`. At least one, except **Assumption:** a hallway concert may have none (played for whoever is there) |
| `session_id` | → Session | Optional: the scheduled `relationship_building` session it happened in. **Not asked on the form (v0.19, Lauren removed "part of a scheduled lesson")** |
| `prepares_session_id` | → Session | Optional: planning a co-led session (handbook: ≥5 meetings) |
| `note` | text | One sentence. **No health information** |
| `state` | enum | `submitted`, `approved` |

### `EngagementType`
**Not in version 1** (decided Nov 22, 2026): the activity's `kind` is
enough for now. May return later as an admin-managed list.

### `MonthlyReflection`
A musician's monthly narrative for one `Residency`. **In version 1 (D13).**

| Attribute | Type | Notes |
|---|---|---|
| `person_id`, `residency_id`, `month` | | Unique together |
| `highlights` | text | "What am I most proud of this month?" |
| `challenges` | text | "What were my biggest barriers to success this month?" |
| `state` | enum | `draft`, `submitted` |

---

## 5. Time and pay

### `TimeCategory`
Admin-managed, versioned list of pay categories (Language 2: "Programs",
"Relationship Building", "Concerts"; possibly training/meetings).
Attributes: `name`, `description` (the handbook's definition), `paid_hourly`
(bool), `active`.

### `TimeEntry`
Hours a musician worked in one week, for one `Residency`, in one category.
**This is what pay is calculated from. Decided (D3, option A, Nov 21, 2026):** time entries are pre-filled from documented sessions and activities, and the musician adjusts them.

| Attribute | Type | Notes |
|---|---|---|
| `person_id`, `residency_id` | → | |
| `week_starting` | date (Monday) | |
| `time_category_id` | → TimeCategory | |
| `hours` | decimal | |
| `source` | enum | `prefilled` (from sessions and activities), `manual` |
| `state` | enum | `draft`, `submitted`, `approved` |

**Invariant:** unique per person × residency × week × category. The app
flags a week when submitted hours differ sharply from documented sessions
and activities (not built yet).

**Built (v0.19, decided by Lauren Nov 22, 2026):** musicians enter hours on
**My week**, pre-filled from the programs they played (Programs), special
events (Concerts) and logged relationship building, and submit them with
their documentation. The **point person approves** each musician's week for
their program, or sends it back with a note (`returned_note`). Approved
hours are locked. Admins can also approve.

### `PayPeriod`
A two-week, Monday–Sunday period. Attributes: `starts_on`, `ends_on`,
`pay_date`.

**Decided (v0.19, Lauren, Nov 22, 2026):** periods are counted every 14 days from the
`Setting` `pay_period_anchor` (Monday, November 2, 2026), not stored as rows.
`pay_date` is not built yet.

### `PayAdjustment`
A one-off payment outside hourly pay and stipends: special pay, an extra
program, a special project fee, a reimbursement.

| Attribute | Type | Notes |
|---|---|---|
| `person_id`, `residency_id` | → | |
| `kind` | enum | `special_pay`, `extra_program`, `special_project`, `reimbursement`, `other` |
| `amount` | money | |
| `session_id` / `special_project_id` | → | Optional link |
| `state` | enum | `proposed`, `approved` |

### `MusicianInvoice`
What Iris pays one contractor for one `PayPeriod` (Language 3: the musician's
invoice to Iris).

| Attribute | Type | Notes |
|---|---|---|
| `person_id`, `pay_period_id` | → | Unique together |
| `lines` | → InvoiceLine (many) | |
| `total` | money | Sum of lines |
| `state` | enum | `draft`, `approved`, `paid` |

**Calculation:** approved `TimeEntry` hours in the period × `Contract.hourly_rate`
(per residency), + stipend installments due in the period, + approved
`PayAdjustment`s. Only `employment_type = contractor_1099`.

**Built (v0.19):** "My invoices" shows each pay period's invoice, computed
live (not stored yet, so `state` isn't built), with a PDF billed to Iris
Music Project. `PayAdjustment`s are not included yet.

### `PartnerAgreement`
A contract under which Iris charges a `Partner` for services at one or more
`Site`s of a `Residency` in a `Season`. Usually one per residency season;
a site can have several (e.g. Hebrew Home has three contracts for different
services).

| Attribute | Type | Notes |
|---|---|---|
| `partner_id`, `residency_id`, `season_id` | → | |
| `site_ids` | → Site (many, ≥1) | Sites this contract covers; all in the residency |
| `name` | text | Internal, e.g. which service it covers |
| `billing_basis` | enum | `per_hour` (most partners), `installments` (e.g. one partner pays quarterly) |
| `hourly_rate` | money | For `per_hour`. Admin-editable |
| `contracted_hours` | number | Hours the contract commits to for the season. Shown on every invoice as progress |
| `installments` | list of `{due_on, amount}` | For `installments`, e.g. four quarterly payments |
| `bill_stipends` | bool | Also bill the musicians' stipend installments due that month (from their `Contract`s for this residency season) |
| `overhead_percent` | decimal | Optional, e.g. 15. **Decided (D9):** applied to billable hours plus billed stipends |
| `overhead_billing` | enum | `same_invoice` or `separate_invoice` (e.g. billed to a corporate office) |
| `overhead_bill_to_id` | → PartnerContact | Required when `overhead_billing = separate_invoice`: the corporate office's billing contact |
| `site_bill_to_id` | → PartnerContact | Who receives the site invoices; defaults to the partner's billing contact |
| `bill_canceled` | rule | Default: bill a session's scheduled hours only when `cancellation_reason = partner` and it was canceled after `Setting.cancellation_notice_time` that day. Weather, musician and on-time partner cancellations aren't billed. Admins can override per contract |

**Decided (D9, Nov 21, 2026): billable hours.** Every site tracks the same
billable hours: **documented session hours** (`SessionReport` actual length,
group sessions only) plus **relationship-building minutes** logged at that
site, including those logged against scheduled relationship building
(`RelationshipActivity.site_id`). What each partner pays for those hours
varies, so it's set per contract above. Admins can change the rate, turn
on overhead (e.g. 15%), and send overhead to a separate corporate invoice
from the admin view. Changes apply to invoices generated afterwards; past
invoice lines keep their amounts. Every change is logged.

### `PartnerInvoice`
What Iris bills a `Partner` under one `PartnerAgreement`, for one `Site`,
for one month (Language 3 document, the "community invoice").

**Decided (D4, Nov 21, 2026):** one invoice **per contract, per site, per
month**. Most sites have one contract, so that's one invoice per site per
month. A site with several contracts (Hebrew Home) gets one per contract.
**Added (D9):** when a contract sends overhead to a separate invoice, it
also gets one `overhead` invoice per month, to `overhead_bill_to_id`.

| Attribute | Type | Notes |
|---|---|---|
| `kind` | enum | `site` (the usual invoice), `overhead` (separate corporate invoice) |
| `partner_id`, `partner_agreement_id` | → | |
| `site_id` | → Site | Required for `kind = site`; empty for `overhead` |
| `bill_to_id` | → PartnerContact | Copied from the contract when generated |
| `month` | year-month | Unique with `partner_agreement_id`, `kind` and `site_id` |
| `lines` | → InvoiceLine (many) | |
| `total` | money | |
| `state` | enum | `draft`, `sent`, `paid` |

**What a `site` invoice contains (D9)**
- **`per_hour`:** billable hours for the month × `hourly_rate`; billed
  stipends (if `bill_stipends`); overhead (if `overhead_billing =
  same_invoice`); late partner cancellations per `bill_canceled`.
- **`installments`:** hours delivered this month and season to date against
  `contracted_hours`, and the installment due that month ("$0 due this
  month" when none is due). Partners on installments still get a monthly
  invoice so they can see the residency is on track.
- **Every invoice** shows hours this month and to date against
  `contracted_hours`.
- **Decided (D9):** when a contract covers several sites, billed
  stipends and overhead go on one separate invoice to `site_bill_to_id`
  rather than being split across site invoices.

### `InvoiceLine`
One line on either kind of invoice: `description`, `quantity`, `unit`,
`unit_amount`, `amount`, plus a `source` reference (`TimeEntry`, stipend
installment, `PayAdjustment`, `Session`, `RelationshipActivity`, partner
installment, or overhead) so every amount traces back to its record.

---

## 6. Goals, projects and oversight

### `Target`
A goal set by an admin.

| Attribute | Type | Notes |
|---|---|---|
| `scope` | enum + id | `residency`, `roster_member` (per musician) |
| `season_id` | → Season | |
| `metric` | enum | `avg_attendance` (default 7, handbook; counts everyone present, D15), `co_led_sessions_per_musician` (default 2 per semester, handbook; built v0.19 as `collaborative_programs_per_musician`, per season), `relationship_minutes_per_week`, `sessions_by_model_type`, `other` |
| `value` | number | Admins can change targets at any time from the admin view; changes are logged in `AuditLog`. **v0.19 (Lauren, Nov 22, 2026):** the collaboration target is also set by the **point person**, on the season view, because it varies by project |

### `SpecialProject`
A one-time, mission-aligned initiative proposed and funded outside regular
contracted hours (handbook: "Special Projects"). Can link sessions,
activities and pay adjustments. Emergent projects such as a festival are
modeled here, including emergent projects like *Voices of Ring House*.
**Decided (D10, Nov 21, 2026).** One-time sessions (concerts, holiday
programs) are `Session`s with no `Series`; a special project groups related
sessions, activities and pay adjustments.

| Attribute | Type | Notes |
|---|---|---|
| `residency_id` | → Residency | |
| `title`, `proposal` | text | The one-page proposal |
| `estimated_hours`, `budget` | number, money | |
| `state` | enum | `proposed`, `approved`, `declined`, `complete` |

### `Setting`
Admin-editable rules from the handbook, so compliance is data.
**Decided (D7, Nov 21, 2026):**

| Setting | Value |
|---|---|
| `schedule_internal_due_day` | 10th of the prior month (draft ready for review) |
| `schedule_partner_due_day` | 15th of the prior month (version 1 sent to the partner) |
| `documentation_and_time_due` | **One deadline** for `SessionReport`s, `RelationshipActivity` logs and `TimeEntry` hours: **Tuesday 17:00 of the following week** |
| `cancellation_notice_time` | 09:00 the same day, for illness or emergency |
| `max_musician_absences_per_season` | Set by admins; **no default yet**. Passing it warns the Admin Lead and point person (D11) |
| `pay_period_anchor` | A Monday that starts a pay period; **2026-11-02** (decided by Lauren, Nov 22, 2026) |

**Assumption (D7):** a `MonthlyReflection` is due by the same Tuesday
17:00 deadline in the week after the month ends.

### `AuditLog`
Every create, change or approval of schedules, reports, activities, time,
contracts and invoices: `who`, `when`, `object`, `before`, `after`.
Resident-record **reads** are logged too.

---

## 7. Permissions (who can do what)

Permissions come from **relationships**, not job titles.

| Capability | Granted by |
|---|---|
| Everything | `Person.system_roles ∋ admin` |
| Approve a residency's reports, activities and time | Current `StaffAssignment.role = point_person` |
| Edit draft and published sessions; publish a month and download its partner calendar (after review) | `RosterMember.is_admin_lead` (current season); the current point person; admins |
| Mark a month's draft schedule reviewed | Current `StaffAssignment.role = point_person`; admins |
| Edit a draft session's title, internal notes, room and who plays (participants); for special events also date and time | Any current `RosterMember` of the residency |
| See the **names** (only) of the people on a program's rosters and staff | Anyone who can see that residency: its current roster, its Iris staff, admins (decided by Lauren, Nov 22, 2026). Email, phone and the rest of `Person` stay private |
| Create, see and replace their own calendar link | The person (while `active`) |
| Assign session leaders | The current point person and admins; the Admin Lead may swap leaders afterwards |
| See a residency's sessions and community info | Any current `RosterMember` |
| See and edit `Partner`, `Site`, `Location` | `Person.system_roles ∋ admin`. **For now admins only;** roster members get read access to their residency's sites once `RosterMember` exists |
| See a site's residents; add residents while logging | Current `RosterMember` of a residency serving that site; that residency's point person (see only); admins. Every view is logged (D14) |
| Document a session | That session's leader; admins |
| See own time, invoices, contract | The person |
| Mark self absent on a published session and name a substitute (any active person; joins the roster if needed) | A musician assigned to that session (D11) |
| Add a new person (e.g. a sub from outside the Iris network) | Admins |
| See and edit any `Person`; add, deactivate and reactivate people | `Person.system_roles ∋ admin` |
| See own `Person` record; change own `phone` and `instruments` | The person (while `active`) |

---

## 8. What is deliberately **not** an object

- **"Program."** Not an object. Depending on context it is a `Residency`, a
  `Series`, a `Session`, or a `TimeCategory` (GLOSSARY Part A).
- **"Community."** Not an object. A `Partner`, a `Site`, or the people of a
  site.
- **"Ensemble."** Not an object. The core `RosterMember`s of a `Season`.
- **"Workbook" and "timesheet."** These are today's spreadsheets. Their
  contents map to `Session`, `SessionReport`, `RelationshipActivity`,
  `MonthlyReflection` and `TimeEntry`.
- **Repertoire planning** (pieces, composers, timings, rehearsal dates).
  Not in version 1 (D13); to be modeled later.
- **Weekly meeting notes.** Not in version 1 (D13); kept outside the app.
- **Ecosystem health.** Not stored. Computed from the objects above (see
  GLOSSARY Part C).
