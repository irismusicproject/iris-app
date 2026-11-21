# Iris App — Requirements (Draft v0.7)

_Status: draft for discussion. Owner: Lauren Latessa. Last updated: November 2026._

Objects are defined in [DOMAIN-MODEL.md](DOMAIN-MODEL.md) (authoritative); team and partner-facing words are translated in [GLOSSARY.md](GLOSSARY.md). _Sections 4–5 still use v0.2 wording and will be revised against the domain model once the open decisions in TERMINOLOGY-REVIEW.md are settled._

## 1. Purpose

Iris Music Project runs Ensemble-in-Residence music programs in senior living
communities. Today our scheduling, documentation and invoicing live in many
Google Sheets and are re-entered by hand.

The Iris App is one place, on computer and phone, where:

- **musicians** see and document their work,
- **admins** plan, staff and oversee every program across every community, and
- **the app** turns that work into partner calendars and invoices automatically.

**Guiding principle: enter information once, use it everywhere.** A scheduled
program becomes the calendar entry, the documentation record, and a line on
both the musician's and the community's invoice.

## 2. Goals

1. **A better experience for musicians (independent contractors).**
   - Clear, stable schedules: once a schedule is published, it doesn't shift
     under them, and they can't accidentally break it (see 4.6).
   - Visible targets for their ensemble, so they know what success looks like.
   - Reminders of holidays, closures and upcoming special events, and their
     progress toward collaboration goals each time they document (D2).
   - Invoices generated for them, instead of built by hand.
2. **Less administrative work and more visibility for the core team.**
   Every program, community and musician in one view, with partner calendars
   and invoices produced from data already entered.
3. **Healthy programs.** Early signals when a program is drifting from its
   targets, losing attendance or short on coverage.

## 3. Values → what they mean for the design

| Value | Design implication |
|---|---|
| **Handbook compliance** | The app enforces handbook rules where it can (e.g. documentation deadlines, required fields, approval steps) and links to the handbook where it can't. |
| **Ecosystem health of each program** | Each residency has a health view built on the Ensemble-in-Residence model's terms (see Glossary, "Ecosystem health"): balance across the three types of programming, continuity, depth, co-creation, emergence, and progress toward targets. |
| **Worker purpose and satisfaction** | Musicians see the impact of their work (sessions, residents reached, targets met), not just tasks. Forms are short; nothing is asked twice. |
| **Safety and privacy (HIPAA)** | Resident information is minimal, access-controlled, and logged (see section 6). |
| **Administrative ease and observability** | Admins can see everything, filter by community/musician/date, and export. Every change is logged with who and when. |
| **Accessibility** | Works on phone and computer; meets WCAG 2.1 AA (readable type, contrast, keyboard and screen-reader support). |

## 4. Functional requirements

Priority: **P1** = needed for the first version; **P2** = soon after; **P3** = later.

### 4.1 Accounts and roles

| Role | Who | Can do |
|---|---|---|
| **Admin** | Core team members | Everything: create and edit communities, programs and schedules; assign program leaders and personnel; add/deactivate people; set targets and rates; approve documentation; generate invoices; see all programs across all communities |
| **Musician** | Contractors and staff musicians | See their own schedule and ensemble; propose or schedule programs and events (within the rules in 4.6); document sessions; view their targets and invoices |

- **R1.1 (P1)** Each person signs in with their own login, on phone or computer.
- **R1.2 (P1)** Admins can add and deactivate people (never delete). Deactivated
  people keep their history (past sessions, invoices) but can no longer sign in.
  _Built Nov 2026: People screen at `/admin/people`._
- **R1.3 (P2)** Admin permissions can be limited to certain communities or
  ensembles (e.g. a coordinator who oversees only some teams).

### 4.2 Scheduling: weekly programs and special events

- **R2.1 (P1)** Create **recurring weekly programs** (e.g. "Music Café,
  Tuesdays 2:00–2:45") and **one-time special events** (concerts,
  collaborative events, holidays programs).
- **R2.2 (P1)** For each program or event: title, community, location within
  the community (many sites have several buildings or rooms), date/time,
  duration, **program leader**, and **personnel** (other musicians).
- **R2.3 (P1)** Edit a single occurrence (change the title, swap personnel,
  cancel) without changing the whole series.
- **R2.4 (P1)** Locations are set up once per community and picked from a list.
- **R2.7 (P1) Absences and subs (D11).** An absence known before the 10th
  with no sub makes that session "No Program" on the partner calendar. When a
  sub is needed, the musician records it on their session, picking any
  active musician (admins add people from outside the Iris network); the
  admin lead and point person are notified. The app counts each musician's
  missed sessions per season and warns past an admin-set limit.
- **R2.6 (P1)** Musicians enter their blackout dates, which show when
  scheduling (D13).
- **R2.5 (P2)** Holidays and community closures can be entered once and
  automatically shown on, or remove, affected sessions.

### 4.3 Monthly partner calendar

- **R3.1 (P1)** Generate a readable **monthly calendar for each community**
  from the schedule: program titles, times, locations, and musicians.
- **R3.2 (P1)** Export as **PDF** and **Word (.docx)**, with Iris branding.
- **R3.3 (P2)** Choose what appears (e.g. hide internal notes or personnel
  names) before exporting.
- **R3.4 (P3)** Email the calendar directly to a community's contacts.

### 4.4 Documentation (after each session)

Each scheduled session turns into a documentation form that musicians complete
after the program. The form is pre-filled from the schedule.

- **R4.1 (P1)** Fields:
  - **Program type**: chosen by the session leader from the 2026
    documentation list (Music Instructional Programs, Lecture/Discussion,
    Interdisciplinary Program, Open Rehearsal, Performance, Other). Not set
    on the schedule (D2)
  - **Collaboration**: none, co-facilitated or co-led (D6). Not set on the
    schedule
  - **Location**: pre-filled from the schedule, editable if it moved
  - **Attendance**: one headcount of everyone present (residents, staff,
    family, guests) (D15)
  - **Program length**: start/stop timer in the app, or enter start and end
    times manually
  - Personnel who actually played (pre-filled; editable for substitutions)
  - Notes
- **R4.2 (P1) Relationship-building activities**, logged after they happen
  (they're often unscheduled) and never shown on partner calendars (D2). For
  each activity:
  - Resident(s): picked from the site's list, or added on the spot (first
    name + last initial). The list builds up as musicians work; nothing is
    preloaded (D14). At Hebrew Home, musicians also keep the partner's
    "Bedside Melodies" workbook up to date
  - Type of engagement (picked from a defined list, e.g. listening, singing,
    playing along, conversation, request)
  - Length of engagement (minutes)
- **R4.3 (P1)** Musicians can complete the form on a phone in a few minutes.
- **R4.4 (P1)** Documentation and hours share one deadline: **5 pm Tuesday
  of the following week** (D7, an admin setting). The app reminds musicians
  and flags overdue items to admins.
- **R4.5 (P1)** Admins review and approve documentation. Community invoices
  are built from approved session documentation and relationship-building
  logs (D9); musician pay comes from weekly hours (D3).
- **R4.6** After submitting documentation, the musician sees where they and
  their residency stand on this season's goals (e.g. co-led sessions so far
  this semester). Priority to be set with 4.7.
- **R4.7 (P1)** Monthly reflections: each musician writes highlights and
  successes, and challenges and suggestions, for each residency each month
  (D13).

### 4.5 Invoicing

- **R5.1 (P1) Musician invoices** (what Iris pays each contractor): approved
  weekly hours × the musician's rate, plus stipend installments and approved
  adjustments, for a two-week pay period (D3).
  Musicians can view and download their own invoices.
- **R5.2 (P1) Community invoices** (what Iris charges each partner): one
  invoice **per contract, per site, per month**, built from approved sessions
  × that contract's rates (D4). Most sites have one contract; Hebrew Home has
  three. Billable hours are the same everywhere: documented session hours
  plus relationship-building time at that site (D9). Partners on quarterly
  installments still get a monthly invoice showing hours delivered against
  the contract and the amount due that month.
- **R5.3 (P1)** From the admin view, admins can easily change, per contract:
  a) the partner's hourly rate; b) whether musicians' stipends are billed;
  c) an overhead percentage (e.g. 15%); d) whether overhead is billed on the
  site invoice or on a **separate invoice to the partner's corporate
  office**. Musicians' hourly rates are set per musician contract (D9).
  Changes don't rewrite invoices already generated.
- **R5.6 (P1)** Canceled sessions aren't paid to musicians. They're billed
  to the partner only when the partner cancels after 9 am that day, unless
  the contract says otherwise (D9).
- **R5.4 (P1)** Invoices export as PDF, and as a spreadsheet for bookkeeping.
- **R5.5 (P2)** Invoice status tracking: draft → sent → paid.
- Note: W-2 staff hours are tracked for reporting but are paid through
  payroll, not invoices.

### 4.6 Protecting the schedule and the record ("set it and lock it")

- **R6.1 (P1)** Schedules have two states: **draft** (editable) and
  **published** (locked). Once published, musicians can't edit them; they can
  **request a change**, which an admin approves or declines.
- **R6.2 (P1)** Approved documentation is locked. Corrections go through an
  admin and are recorded in the change log.
- **R6.3 (P1)** Every change to schedules, documentation, rates and invoices
  is logged (who, what, when).

### 4.7 Targets and program health

- **R7.1 (P2)** Admins set **targets for each ensemble** (the team of musicians
  at a community): e.g. relationship-building activities per week, small-group programs per month,
  collaborative events per quarter. Goals change, so admins can edit them at
  any time from the admin view.
- **R7.2 (P2)** Musicians see their ensemble's progress toward targets on
  their home screen.
- **R7.3 (P2)** Admins see a health view per program and ensemble: progress
  toward targets, attendance trends, documentation completeness, coverage gaps.

### 4.8 Reminders

- **R8.1 (P2)** Calendar reminders for holidays and closures, upcoming special
  events, and documentation and hours due. Collaboration progress is shown
  when musicians document (R4.6), not as advance reminders (D2).
- **R8.2 (P2)** Reminders by email; option to add the schedule to a personal
  calendar (Google, Apple, Outlook).

## 5. Platform and other requirements

### 5.1 Platform strategy

We're building a **web prototype** at app.irismusicproject.org first, and
**Android and iPhone apps** later. Until then, we build so the native apps
can reuse the same backend:

- **Business rules and permissions live in Supabase** (Row Level Security
  policies and database functions), not in page code, so every client
  behaves the same.
- **Shared TypeScript types and validation** for each domain object, which
  native apps can reuse.
- **Phone-first musician screens.**
- **An installable web app** (home-screen manifest) until the native apps
  exist.
- **A single notification layer** that starts with email and can add push
  notifications later.
- **Offline-friendly drafts** for documentation, submitted when the device
  is back online.
- **Sign-in by email and password** (12 characters or more), with an
  emailed one-time code as the fallback. Both work on web and native.

### 5.2 Other requirements

- **Phone and computer:** the web app works well in a phone browser and on a
  computer, with no app-store install needed during the prototype.
- **Current stack (already live at app.irismusicproject.org):** Next.js on
  Vercel; Supabase for sign-in and data; Resend for email. Sign-in is
  invite-only, by email and password, so contractors don't need Iris Google
  accounts.
- **Exports:** PDF, Word (.docx), and spreadsheet/CSV.
- **Data ownership:** admins can export all data at any time.
- **Cost:** free or nonprofit-discounted services wherever possible.
- **Maintainable by a small team:** managed services and well-known tools.
- **Transition:** data can be imported from, and exported to, our current
  Google Sheets during the changeover.

## 6. Privacy, safety and HIPAA

Documenting relationship-building activities by resident name makes this app hold personal
information about older adults. Whether or not HIPAA applies to Iris legally,
we should design as if it does, and as our community partners would expect:

- **R9.1** Collect the minimum: resident first name + last initial (D14; see
  Q1) and the type and length of the engagement. **No health information**:
  no diagnoses, medications, room-level care notes.
- **R9.2** Only people who need resident information can see it: the
  musicians on that site's current roster, the residency's point person, and
  admins (D14). Partner calendars and invoices never
  include resident names.
- **R9.3** All access to resident records is logged.
- **R9.4** Data is encrypted in transit and at rest, backed up, and hosted with
  a provider that will sign a Business Associate Agreement (BAA) if we need one.
- **R9.5** When a musician leaves, their access ends immediately.
- **R9.6** The code repository is public. No passwords, keys or real
  people's data are ever committed to it, and no handbooks, contracts,
  workbooks or timesheets (the docs in `docs/` may summarize them).
- **R9.7** Row Level Security is on for every Supabase table from the day it is
  created, so each person can reach only what their role allows. Resident
  tables get the strictest rules.

## 7. Phasing

1. **Version 1 (P1):** accounts, scheduling (with musicians' blackout
   dates), partner calendar export, documentation with relationship-building
   activities and monthly reflections, schedule/record locking, musician and
   community invoices. **Not in version 1 (D13):** repertoire planning
   (later), weekly meeting notes (kept outside the app).
2. **Version 2 (P2):** targets and program health, reminders, invoice status,
   community-limited admins.
3. **Pilot:** one ensemble for a month before rolling out to everyone.

## 8. Open questions

- **Q1 Resident names.** _Format decided (D14): first name + last initial._
  Still open: is each partner comfortable with Iris recording residents this
  way, and does any partner require a BAA or confidentiality agreement? Check
  with a partner before real residents are entered at its sites.
- **Q2 Who schedules?** Can musicians create new programs and events
  themselves (then an admin publishes), or only edit within what admins set up?
- **Q3 Rates.** How are musicians paid (per session, per hour, flat per
  residency)? How are communities billed?
- **Q4 Periods.** Pay periods for musicians and billing cycles for communities.
- **Q5 Handbook rules.** Which handbook rules should the app enforce
  (documentation deadlines, minimum program lengths, sub procedures, etc.)?
- **Q6 Targets.** What targets are set today, per ensemble?
- **Q7 Contractor status.** Locked schedules and set targets give Iris more
  control over contractors' work. Worth a quick check with our accountant or
  employment advisor that this stays consistent with 1099 classification.
- **Q8 Hosting and BAA.** If we need a BAA (Q1), confirm which Supabase and
  Vercel plans offer one, and what they cost.
