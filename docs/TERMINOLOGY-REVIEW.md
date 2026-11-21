# Iris App: Terminology and Requirements Stress Test

_November 2026. Companion to GLOSSARY.md and REQUIREMENTS.md._

**Sources reviewed:** Independent Contractor Handbook (Sept. 2025); 2027 DRAFT
Staff Handbook; the two JAAH papers (2021, 2025); the original requirements
notes; current workbooks (Weinberg Manors Nov. 2026, Asbury Feb.–May 2027);
the Fall 2026 Manors timesheet; Asbury musician invoices (2026); the 2025
workbook archive.

**How to use this:** each item is a decision. The first eight (D1–D8) shape
the data model and should be settled **before building**. The rest can be
settled while building, but before the related feature.

---

## Must settle before building

### D1. "Program" has four meanings

> **Decided (Nov 21, 2026):** the code name is `Residency`.

> **Update:** DOMAIN-MODEL.md adopts this split but names meaning 1
> `Residency` in code (not "Ensemble Program"), so that no code name contains
> "program". Team and partner-facing language keep saying "program".

| # | Meaning | Where it appears |
|---|---|---|
| 1 | Iris's whole engagement at a partner ("the program at Mather") | Everyday usage; workbooks: "Iris Ensemble Program"; handbook: "residency" |
| 2 | A titled, usually recurring offering ("Eating together", "Open Rehearsal") | Workbook schedule: "Program Title", "Regular programming" |
| 3 | A **pay category** for group work, as opposed to Relationship Building | Timesheet row "Programs (workshops, discussions…)"; handbook, Section 4 |
| 4 | All paid contact time | Timesheet "Programming hours" (Programs + Relationship Building + Concerts); "programming" in the JAAH papers |

**Why it matters:** an app needs one name per object. If "program" means 1
and 2, every screen, report and database table becomes ambiguous.

**Recommendation:**
- Meaning 1 → **Ensemble Program** (the workbooks' own term). Saying "the
  Mather program" stays fine in conversation; the app always shows "Ensemble
  Program".
- Meaning 2 → **Series** (recurring, titled) and **Event** (one-time). Both
  produce **Sessions** (single occurrences).
- Meaning 3 → **time category: Group Programs** (see D2).
- Meaning 4 → **paid hours** (not a data term).
- Retire "Residency" as a data term (keep it as a historical synonym in the
  glossary, since the handbook still uses it).

### D2. There are three different "type" lists, and they don't line up

> **Decided (Nov 21, 2026):** keep the 2026 documentation list, used only
> when documenting a session (with its collaboration level), for stats and
> evaluation. The schedule carries neither. One-to-ones and other
> relationship building are logged after they happen and never appear on
> partner calendars. Musicians see goal progress after documenting.

| List | Values | Used for |
|---|---|---|
| **Model types** (JAAH 2021) | Performances and open rehearsals; Small group programs; One-to-ones | Describing the model; ecosystem balance |
| **Time categories** (timesheet; handbook Section 4) | Programs; Relationship Building; Concerts | Pay |
| **Interaction types** (workbook documentation) | Groups: Music Instructional Programs (2027: "Ensemble Rehearsal (older adults)"), Lecture/Discussion, Open Rehearsal, Performance, Interdisciplinary Program (dropped in 2027), Special Event (added in 2027), Hallway concert (one version), Other. Individuals and small groups: One to one, Mini-group session (2–8 residents), Resident co-facilitation, Other | Documentation |

**Correction to the glossary:** the handbook defines **Relationship Building**
much more broadly than one-to-ones. It covers *all collaborative work with
residents* (musical conversations, rehearsals, lessons, music for comfort), as
well as the 15 minutes before and after programs and one hour of concert
set-up. So it is a **time category**, not a synonym for a one-to-one visit.
The glossary entry has been corrected.

**Recommendation:**
- Keep **time category** (for pay) and **interaction type** (for
  documentation) as two separate fields.
- Maintain **one** admin-managed interaction-type list, with each value
  mapped to a model type so the ecosystem "balance" signal can be computed.
  Draft mapping:

| Interaction type | Model type |
|---|---|
| Performance; Open Rehearsal; Hallway concert; Special Event | Performances and open rehearsals |
| Music Instructional / Ensemble Rehearsal; Lecture/Discussion; Interdisciplinary | Small group programs |
| One to one; Mini-group session | One-to-ones (relationship building) |
| Resident co-facilitation | _Not a type; see D6_ |

- **Version the lists.** The workbook lists have drifted between versions; old
  records must keep their original meaning when a list changes.
- **Decide:** which interaction-type list is current.

### D3. Documentation and pay are separate today, and the requirements assume they aren't

> **Decided (Nov 21, 2026):** option A. Pay comes from weekly time entries;
> the session leader documents the session; each musician logs their own
> relationship building, time and monthly reflection.

Today:
- **Documentation** is **monthly, per musician**: group sessions with
  attendance, collaboration and interaction type; individual and small-group
  relationship building; and monthly highlights and challenges.
- **Pay** comes from a **weekly timesheet** of hours by time category, totaled
  into **biweekly** invoices.
- Relationship Building hours include time that isn't a session (before and
  after programs, concert set-up), and the flat rate includes prep time.

So paid hours **cannot be derived from sessions alone**. REQUIREMENTS R5.1
("invoices built from approved documentation") is wrong as written.

**Options:**
- **A.** Weekly **time entries** by category, kept separate from session
  documentation. The app pre-fills time entries from documented sessions and
  the musician adjusts them. The app flags weeks where the two disagree
  sharply.
- **B.** Derive all pay from sessions, which would require logging every
  before/after window and set-up block. That's more burden on musicians.

**Recommendation:** A.

**Also decide:** who documents a group session. The handbook says the
**program leader** documents the program and reports attendance, but in the
workbooks every musician's sheet lists the programs. Recommendation: the
leader documents the session (attendance, type, collaboration); each musician
logs their own relationship building and time; each musician writes a
**monthly reflection** (highlights and successes, challenges and suggestions).
The monthly reflection is missing from the requirements today.

### D4. "Community" mixes partner, site and room

> **Decided (Nov 21, 2026):** one community invoice per contract, per site,
> per month. Hebrew Home (one site, two buildings) has three contracts, so
> it gets three invoices a month.

The workbook "Community" list combines organization and building (e.g.
"Charles E. Smith Life Communities: Ring House (independent living)",
"Comprehensive Housing Assistance: Weinberg Manors"). It lists a single
"Winter Growth" even though Columbia and Olney have separate workbooks and
timesheets. It also includes partners that aren't senior living (a JCC, a 50+
center, a memory studio). The workbooks' "Community (Other)" column then
records the unit, floor or room. And the word "community" also means the
people ("community members", "community bonds").

An Ensemble Program can also span several buildings (the CESLC team works
across several houses; one Mather team covers Evanston and Wilmette).

**Recommendation:** three objects:
- **Partner:** the organization Iris contracts with and invoices (CESLC,
  Comprehensive Housing Assistance, Mather, Winter Growth, Asbury…).
- **Site:** a building or campus with a care level (Ring House, Weinberg
  Manors, Mather Tysons, Winter Growth Olney…).
- **Location:** a room or unit within a site.

An Ensemble Program belongs to one Partner and serves one or more Sites. Use
"community" in prose only, not as a data term.

**Decide:** are community invoices issued per Partner, per Site, or per
Ensemble Program?

### D5. Roles: "Musician in Residence" means three things, and leads are unnamed

> **Decided (Nov 21, 2026):** one Admin Lead per residency season (all its
> sites). The Iris core salaried team are admins. A month's schedule is
> drafted by the Admin Lead, reviewed with the point person, published, and
> emailed to the partner by the Admin Lead (point person cc'd); partner
> feedback produces updated versions. See `CalendarExport` in DOMAIN-MODEL.md.

- The handbook calls **all** on-site contract musicians "Musicians-in-Residence".
- The 2028–29 org charts use **Musician in Residence 1 and 2** as specific
  staff roles that coordinate teams.
- The Asbury repertoire sheet uses "MIR" for one particular musician.

Leadership roles in the handbook:
- **Program leader:** for any program with more than one musician, **rotating**
  among participating musicians. That makes it a role **per session**, not
  per program; the glossary currently says per program.
- **Administrative project lead:** one per site (paid a stipend). Coordinates
  with the partner, keeps the calendar, submits monthly calendars, writes
  meeting agendas and open-rehearsal sheets.
- **Designated Iris staff member / point person:** supervises the musicians.

**Recommendation:**
- **Musician:** anyone contracted or employed to play.
- **Program Leader:** per session. The app can show whether the role is
  rotating fairly, which supports handbook compliance.
- **Admin Lead:** per Ensemble Program. Can edit the draft schedule and
  submit the partner calendar. This mostly answers REQUIREMENTS Q2: Admin
  Leads build schedules and other musicians propose.
- **Point Person:** Iris staff responsible for an Ensemble Program. Approves
  schedules, documentation and time. Replaces "Team Coordinator" in the
  requirements.
- Reserve **Musician in Residence** for the org-chart job title only.

### D6. Four near-synonyms for resident involvement

> **Decided (Nov 21, 2026):** a collaborative event is a session documented
> as co-facilitated or co-led.

- **"Collab?"** (documentation): yes if a resident took part in creating and
  carrying out the program.
- **Resident co-facilitation** (an interaction type): any planned active
  participation, from reading a poem to full co-leadership.
- **Resident Led Programs** (handbook): each musician co-leads **at least two
  per semester**, with **at least five planning meetings** first, using
  relationship-building time.
- **Co-designed programmes / co-creators** (JAAH).

**Recommendation:** one field on each session, **resident involvement**, with
levels: *none* → *co-facilitated* (planned participation) → *co-led*
(co-designed and co-led; counts toward the handbook target). Planning
meetings are relationship-building entries linked to the session they
prepare.

**Decide:** whether "collaborative event" (from your original goals) means a
session with resident involvement of co-facilitated or above.

### D7. Deadlines conflict

> **Decided (Nov 21, 2026):** schedule internal by the 10th and to the
> partner by the 15th; documentation and hours share one deadline, 5 pm
> Tuesday of the following week; cancellations by 9 am the same day (illness
> or emergency).

| Deadline | Handbook | Workbook |
|---|---|---|
| Monthly schedule | Final and sent to partner by the **15th** of the prior month | Scheduling tabs updated by the **10th** |
| Documentation | "By the **30th**" and "end of the month" | End of each month |
| Hours | Tenet 8: timesheets by **Saturday noon**. Section 4: pay sheets by **5 pm Tuesday** of the following week | — |
| Cancellations | Musician and partner cancellations: by **9 am** the same day | — |

**Recommendation:** fix these in the handbook first. The app then stores each
deadline as an admin setting, which keeps "handbook compliance" checkable. If
the 10th is an internal deadline and the 15th is the partner deadline, keep
both. Use "last day of the month" for documentation, since February has no
30th.

### D8. Time periods need definitions

> **Decided (Nov 21, 2026):** seasons and semesters are set per residency.

The documents use: **week** (Monday–Sunday), **biweekly pay period**,
**month** (schedules, documentation), **semester** (stipends paid twice per
semester; the resident-led target is per semester), **season** (contracts;
training; W-2 musicians work 30–44 weeks), and the timesheet's **year start
date**.

**Decide:** what a semester and a season are, and whether they are set per
Ensemble Program (the Asbury workbook covers Feb.–May). Targets, stipends
and contracts all depend on this.

---

## Settle while building

### D9. Pay components need a Contract object

> **Decided (Nov 21, 2026):** musicians' hourly rate lives on each contract.
> Partners pay per hour (most) or in installments (one partner, quarterly),
> and every partner gets a monthly invoice showing hours against the
> contract. Billable hours everywhere are session hours plus relationship
> building at the site; each contract sets the rate, whether stipends are
> billed, an optional overhead (e.g. 15%), and whether overhead goes to a
> separate corporate-office invoice. Canceled sessions are billed only for
> late partner cancellations unless the contract says otherwise.

The handbook's pay elements:
- **Hourly pay:** a flat rate, prep time included, set per region (the
  timesheet uses one "normal hourly rate").
- **Project support stipend:** per contract, paid twice per semester.
- **Admin lead stipend.**
- **Special pay.**
- **Extra programs:** negotiated separately; musicians may decline.
- **Special projects:** proposed and funded separately.
- **Training stipend:** half paid up front.
- **Cancellations:** canceled sessions are not paid.

The handbook says contracts list term, estimated weekly hours, stipends and
payment dates.

**Recommendation:**
- A **Contract** object (musician × Ensemble Program × season) holds rates,
  stipends and estimated hours. The musician invoice = hours × rate +
  stipends due + approved extras. W-2 staff are paid through payroll and get
  no invoice.
- **Needed:** a sample partner contract, to model community invoices.

### D10. "Event", "concert", "extra", "special project", "project"

> **Decided (Nov 21, 2026):** as recommended. One-time sessions have no
> series; concerts are special events; emergent projects like *Voices of
> Ring House* are Special Projects. Extras are billed to the partner like
> any session unless an admin marks one not billable.

- Workbooks have a **Special events** section and a **Concerts** tab (with
  call times).
- The timesheet has a **Concerts** time category.
- The handbook has **Extra Programs** (beyond contracted hours) and **Special
  Projects** (proposal, special project funds).
- The glossary's **Project** means an emergent, multi-session effort.
- The handbook also uses "project" loosely: "project, term basis" contracts,
  "project materials", "project support stipend".

**Recommendation:**
- **Event:** a one-time session.
- **Concert:** an interaction type, and also a time category if the
  timesheet keeps that row.
- **Extra:** a flag on a session meaning outside contracted hours, with its
  own rate.
- **Special Project:** a funded proposal that can link sessions.

**Decide:** whether emergent projects like *Voices of Ring House* are Special
Projects, or need a separate object.

### D11. Absences, substitutes and cancellations

> **Decided (Nov 21, 2026):** an absence known before the 10th usually means
> no sub: the session is canceled (reason: musician) and prints as "No
> Program". When a sub is needed (rare), the musician records it in the app;
> the sub can be any active musician (an admin adds people from outside the
> Iris network). The app counts missed sessions per season and warns past an
> admin-set limit.

Workbooks track "Musician Absent", "Participating Musicians" and "Subs and
Notes". The handbook says musicians must arrange their own substitute and
notify Iris and the partner by 9 am; canceled sessions are unpaid; partners
notify Iris by 9 am and Iris tries to reschedule.

**Recommendation:**
- Each session's personnel have a status: *assigned* / *absent* /
  *substitute*.
- Canceled sessions record a reason: *partner*, *weather*, or *musician*. The
  reason drives pay, the community invoice and rescheduling.

### D12. Titles currently hold personnel and location

Titles like "Eating together with [three musicians]" and "Open Rehearsal at
[building]" embed personnel and location. In the app, **title**, **personnel**
and **location** are separate fields. The partner calendar combines them for
display, so a substitution never means retyping a title.

### D13. Workbook functions missing from the requirements

> **Decided (Nov 21, 2026):** monthly reflections and blackout dates are in
> version 1. Repertoire planning and weekly meeting notes are not.

The workbooks also hold:
- **Monthly reflections** (see D3)
- **Repertoire planning** per concert (composer, title, timing, personnel,
  rehearsal dates)
- **Weekly meeting notes**
- **Blackout dates**
- **Contact numbers**
- A **photo link** (the handbook allows photos only in the designated
  Dropbox)

**Decide:** in or out of version 1. **Recommendation:**
- Monthly reflections and blackout dates: version 1.
- Repertoire: version 2.
- Meeting notes: stay out.
- Photos: link to Dropbox; the app doesn't store them.

### D14. Residents are already tracked by name

> **Decided (Nov 21, 2026):** first name + last initial, entered by
> musicians as they work (no preloaded list). Visible to the site's current
> roster, the residency's point person and admins; every view logged.
> Hebrew Home's "Bedside Melodies" workbook stays outside the app and
> musicians log in both. Partners are comfortable with this, since only
> minimal information is kept and none is shared (confirmed Nov 21, 2026).

Relationship-building logs record residents by first name, with a short
description. The handbook says the shared template exists to **track
individuals served and avoid duplicating efforts**. So **Resident** must be
an object that is shared across musicians at a site, not free text. First
names alone will collide, so each resident needs a unique identifier within
the site. This also sharpens REQUIREMENTS Q1: the question is no longer
*whether* to record residents, but how to identify and protect them. Health
information stays out (handbook, "Confidentiality").

### D15. Attendance has a handbook target, and "individually led" is a category

> **Decided (Nov 21, 2026):** attendance is one count of everyone present
> (residents, staff, family, guests), and the target of 7 uses it.
> Individually led vs. multi-musician comes from how many musicians played.

The handbook expects **an average of 7 residents** at each individually led
program, with a strategy conversation if attendance stays below that. It also
treats programs with **several musicians** (which need a rotating program
leader) differently from **individually led** ones.

**Recommendation:**
- Make 7 the default attendance target.
- Classify a session as individually led vs multi-musician by its personnel
  count.
- **Decide:** whether attendance counts residents only, or staff and family
  too.

### D16. Ensemble vs. roster

> **Decided (Nov 21, 2026):** the roster is everyone who plays that season;
> the core ensemble is flagged on the roster; a sub not on the roster joins
> it as a non-core member.

The JAAH papers describe an ensemble of two to three musicians, but the Fall
2026 Manors timesheet pays eight contractors, with two to four at a session.

**Decide:** whether "Ensemble" means the core team or everyone contracted for
an Ensemble Program in a season. Recommendation: **Roster** = everyone
contracted; the core ensemble is the musicians flagged as core on the roster.

---

## What changes in the requirements once these are settled

- **4.1 Roles** → Musician, Program Leader (per session), Admin Lead, Point
  Person, Admin (D5).
- **4.2 Scheduling** → Ensemble Program → Series and Events → Sessions; title
  separate from personnel and location; absences and substitutes (D1, D11,
  D12).
- **4.4 Documentation** → session documentation by the leader;
  relationship-building logs linked to residents; monthly reflections; one
  versioned interaction-type list; resident involvement levels (D2, D3, D6,
  D14).
- **4.5 Invoicing** → weekly time entries by category; Contract object with
  rates and stipends; cancellation rules; billing entity (D3, D4, D9).
- **4.7 Targets** → handbook targets as defaults (2 co-led programs per
  musician per semester; average attendance of 7); defined periods (D6, D8,
  D15).
- **Handbook compliance** → deadlines as settings, once the conflicts are
  resolved (D7).
