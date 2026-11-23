# Iris App — Glossary (Languages 2 and 3)

_Draft v0.21, November 22, 2026 (v0.21: "Done reviewing"; v0.20: skip a week, end or delete a weekly program; v0.19: pre-adding people and import; v0.18: roster phone and instruments; v0.17: community contacts, staff directory, links; v0.16: shared logs, building, follow-up, outbox; v0.15: custom invoices; v0.14: community invoices built, billable hours per musician; v0.13: usual type and lengths, Submit my week, daily one-to-one notes document; v0.12: Collab? Yes/No, hours approval and musician invoices; v0.11: monthly programs; v0.10: usual leader, calendar link; v0.9: documentation words from the CESLC workbook; v0.8: partner calendar layout from the Dec 2026 sample; "Lessons"; v0.7: D14, D15 settled; v0.6: D10, D11, D16 settled; "No Program" and roster words added; v0.5: D9, D13 settled: partner billing words added; v0.4: D2, D4, D6, D7, D8 settled; v0.3: D1, D3, D5 settled; schedule review and sending words added). Translates the words people use into the objects
defined in DOMAIN-MODEL.md (Language 1), which is authoritative._

- **Part A: Team language.** How Iris staff and musicians talk, and which object each word means.
- **Part B: Outward language.** What appears on calendars, invoices and reports for partners, and where each printed field comes from.
- **Part C: The Ensemble-in-Residence model.** The JAAH papers' concepts and how the app measures them.

Our team and outward languages are set; we don't try to change them. The app
**displays** these words, but it resolves each one to a single object from
context. When a word is ambiguous in a new context, we add a row here
before we write code.

Sources: **[JAAH 2021]** Latessa & Oh, *Journal of Applied Arts & Health*
12:3, https://doi.org/10.1386/jaah_00083_1 · **[JAAH 2025]** Latessa, *Journal
of Applied Arts & Health*, Notes from the Field,
https://doi.org/10.1386/jaah_00185_7 · **[CH]** Independent Contractor
Handbook (Sept. 2025) · **[SH]** 2027 DRAFT Staff Handbook · **[WB]** current
workbooks and timesheets.

---

## Part A — Team language → objects

### "Program" (overloaded on purpose; resolved by context)

| When someone says… | They mean | Object |
|---|---|---|
| "the program at Mather", "our Asbury program", "Iris Ensemble Program" [WB] | Iris's whole engagement with a partner | `Residency` |
| "the Music Café program", "Eating together", "a weekly program" | A titled, recurring offering | `Series` |
| "I have a program at 2 today", "the program was canceled" | One occurrence | `Session` |
| "special events", "concerts" (in a schedule) | A one-time occurrence | `Session` with `series_id = null` and `is_special_event` (concerts always are) (D10) |
| "Programs" on a timesheet: "workshops, presentations, music committee meetings, open rehearsals and performances" [CH] | A pay category | `TimeCategory` "Programs" |
| "programming hours" [WB] | All paid hours for the week | Sum of `TimeEntry.hours` |
| "programming" [JAAH] | Everything an ensemble offers | Not an object (see Part C) |
| "extra programs" [CH] | Work beyond contracted hours, separately paid; musicians may decline | `Session.is_extra` + `PayAdjustment(kind = extra_program)`. Billed to the partner like any session unless `billable = false` (D10) |
| "individually led programs" / "programs with multiple musicians" [CH] | Sessions with one vs. several musicians | Derived from the count of musicians who played (not `absent`); nothing extra to enter (**Decided, D15**) |
| "resident led programs" [CH] | Sessions co-designed and co-led with residents | `SessionReport.resident_involvement = co_led` |

**App display rule:** the screen for a `Residency` is labeled "Program"
(e.g. "Mather Tysons program"). Within it, `Series` appear as "Weekly
programs" and `Session`s as dated entries. The word is never shown without
enough context to tell which object it is.

### Places and partners

| Team word | Object | Notes |
|---|---|---|
| "community" (an organization) | `Partner` | e.g. CESLC, Mather, Winter Growth |
| "community" (a building/campus), "site", "house" | `Site` | e.g. Ring House, Weinberg Manors |
| "complex", "campus" (a partner with several buildings, e.g. CESLC) | `Partner` with several `Site`s | One `Site` per building with its own care level. Not a separate object |
| "location", "unit", "floor", "Community (Other)" [WB] | `Location` | |
| "community" (the people), "community members" | Not an object | Prose only |
| "community partner", "partner staff" | `PartnerContact` | |
| "residency" (legacy) [CH] | `Residency` | Still used in the handbook; little used in speech |

### People and roles

| Team word | Object | Notes |
|---|---|---|
| "musician", "Musicians-in-Residence" [CH] | `Person` on a `RosterMember` | The handbook's plural means all on-site musicians |
| "Musician in Residence 1 / 2" (org chart) | `Person.job_title` | A title only; permissions come from `StaffAssignment` |
| "MIR" (e.g. on a repertoire sheet) [WB] | A specific `Person` | Shorthand |
| "the Trio", "the ensemble" | The core `RosterMember`s (`is_core`) of a `Season` | (D16) |
| "roster" | All `RosterMember`s of a `Season`: core players, occasional players and subs | Subs join as non-core (D16) |
| "program leader", "program lead" [CH][WB] | `SessionAssignment.role = leader` | Per session; rotates [CH] |
| "administrative project lead", "Project Admin Lead", "admin lead" [CH][WB] | `RosterMember.is_admin_lead` | One per residency season, covering all its sites (D5); stipend via `Contract` |
| "point person", "designated Iris staff member" [CH] | `StaffAssignment.role = point_person` | |
| "admin", "core team", "core salaried team" | `Person.system_roles ∋ admin` | Sees and does everything across every residency, with its own admin view (D5). In scheduling talk, "the admin" usually means the **admin lead**; check context |
| "sub", "substitute", "Musician Absent" [WB] | `SessionAssignment.status` = `substitute` / `absent` | Recorded by the absent musician; any active person; joins the roster (D11, D16) |
| "No Program" | A canceled `Session` (any reason; e.g. a planned absence before the 10th, D11, or a holiday) | Prints as "No Program" on the partner calendar. Can be restored as a draft (v0.17) |
| "Lessons" (on a schedule) | A `Series`/`Session` with `kind = relationship_building`, often without a set time | Documented as `RelationshipActivity` records, not a session report |
| "missed sessions" | A musician's `absent` assignments and musician-reason cancellations in a season | Warning past `Setting.max_musician_absences_per_season` (D11) |
| "resident" | `Resident` | First name + last initial; added by musicians as they work (D14) |
| "Bedside Melodies" (Hebrew Home) | Not an object | The partner's own workbook; stays outside the app. Musicians log in both (D14) |

### Documentation

| Team word | Object | Notes |
|---|---|---|
| "documentation" (of a program) | `SessionReport` | Written by the session leader only (D3) |
| "relationship building", "relationship-building activities" | `RelationshipActivity` (the logged instance); `TimeCategory` "Relationship Building" (the hours) | |
| "one-to-ones" (former term) [CH] | `RelationshipActivity(kind = one_to_one)` | Logged after it happens; never on partner calendars (D2) |
| "mini-group session" (2–8 residents) [WB] | `RelationshipActivity(kind = mini_group)` | |
| "hallway concert" | `RelationshipActivity(kind = hallway_concert)` | Relationship building, not a program type (decided Nov 22, 2026) |
| "Collab?" on a relationship-building log [WB] | `RelationshipActivity.collaborative` | Yes/No |
| "we did it together", "other musicians" (on a log) | `RelationshipActivity.musicians` | Each credited and billed; documented once (v0.16) |
| "building" (when documenting a program) | `SessionReport.site_id` | One of the program's sites (v0.16) |
| "Follow-up", "who's missing" | `missing_work` + metrics on the Follow-up page | Point person and admins (v0.16) |
| "reminder", "nudge", "Outbox" | `Notification` | Sent through the one notification module (v0.16) |
| "community contact", "our contact at the building" | `PartnerContact` (with its `Site`) | Point person or admins edit; the program's people see (v0.17) |
| "staff list", "Iris staff" (with phones) | Staff directory: admins and current point people | Everyone signed in (v0.17) |
| "roster" (with phones and instruments) | `RosterMember` + `Person.phone`, `Person.instruments` | The program's people see them (v0.18) |
| "add without inviting", "pre-populate", "set up before roll-out" | `Person` with empty `invited_at`; the admin Import page | Nobody is emailed until "Send invite" (v0.19) |
| "photo links", "Drive / Dropbox folder" | `ResourceLink` | On Home; admins edit (v0.17) |
| "usual type" (of a program) | `Series.default_interaction_type_id` | Pre-selected when documenting (v0.13) |
| "usual length" (one-to-one, mini-group, hallway concert) | `ActivityLength.minutes` | Fills Minutes on the log form (v0.13) |
| "Submit my week" | Submitting the week's `TimeEntry` rows for every program | Only once every program the musician led is documented (v0.13) |
| "one-to-one notes", "daily notes for the partner" | `RelationshipActivity.note` at a `Site` with `detailed_relationship_notes`; the daily Word document | One day, one site (v0.13) |
| "monthly program", "4th Monday concert" | `Series` with monthly recurrence (`week_of_month` 1–4) | Prints under Regular programming (v0.18) |
| "canceled once a month", "most Mondays, but one Monday a month we're at Revitz" | Weekly `Series.skip_weeks_of_month` (e.g. the 2nd), plus a monthly `Series` at the other building | The skipped date prints "No Program" (v0.20) |
| "end a weekly program", "the program stops mid-season" | **End**: `Series.active_until`; later draft dates removed | Published later dates stay until made "No Program" (v0.20) |
| "delete a weekly program", "duplicate program" | **Delete**: the `Series` and all its `Session`s removed | Only while none is documented, logged against or in an approved week (v0.20) |
| "usual leader" | `Series.default_leader_id` | Auto-fills each date's leader; otherwise the point person assigns |
| "calendar link", "add Iris to my calendar" | `CalendarFeed` | Private; on "My week" |
| "coming up this season" | Later special events of the program | Shown at the top of each month's schedule |
| "Notes" (scheduling tab) [WB] | `Session.internal_note` | Any roster musician, on drafts; never prints |
| "My week" | The weekly documentation page | Due Tuesday 5 pm (D7) |
| "resident co-facilitation" [WB] | `SessionReport.resident_involvement = co_facilitated` | Not an interaction type (D2) |
| "Collab? = Yes" [WB], "collaborative" | `SessionReport.resident_involvement = co_led` | **Decided (D6, revised v0.12):** Yes/No only; every Yes is stored and counted as co-led. Recorded when documenting, not when scheduling |
| "collaborative event" | A `Session` whose `SessionReport.resident_involvement` is not `none` | **Decided (D6)** |
| "collaborative target", "collab goal" | `Target(metric = collaborative_programs_per_musician)` for a `Season` | Default 2; the point person or an admin sets it per season (v0.12) |
| "approve hours", "send hours back" | `TimeEntry.state` → `approved`, or back to `draft` with `returned_note` | Done by the point person (or an admin), per musician per week (v0.12) |
| "interaction type", "program type" (in documentation) [WB] | `InteractionType` on `SessionReport` | The 2026 documentation list (D2). Chosen only when documenting |
| "type of engagement" | `EngagementType` | For relationship-building activities |
| "attendance" | `SessionReport.attendance` | Everyone present together: residents, staff, family, guests (**Decided, D15**). The target of 7 uses this |
| "highlights and successes", "challenges and suggestions" [WB] | `MonthlyReflection` | |
| "rep" | Repertoire (not in version 1, D13; not yet modeled) | |
| "blackout dates" [WB] | `Closure(scope = person)` | |
| "goals", "semester goals" | `Target` | Shown to musicians after they submit documentation; admins edit them anytime |
| "deadline" (documentation, hours) | `Setting.documentation_and_time_due` | Tuesday 5 pm of the following week (D7) |
| "holidays", "closures" | `Closure` | |

### Scheduling and the monthly calendar

| Team word | Object | Notes |
|---|---|---|
| "draft the schedule", "the draft" | `Session`s with `schedule_state = draft` | Drafted by the admin lead |
| "done reviewing", "I've checked my dates" (a musician) | `ScheduleCheck` for that building and month | The point person sees a checklist and gets one email when all are done (v0.21) |
| "review the schedule" (with the point person) | `CalendarExport` version 1, `state = reviewed` | Point person marks it after the review call (D5) |
| "publish", "send the calendar to the community" | **Publish and download**: sessions become `published`; `CalendarExport` version 1, `state = sent` | The admin lead emails the PDF from their own email, point person cc'd |
| "partner feedback", "changes from the community" | `CalendarExport.partner_feedback`, then edits to published `Session`s | Internal; never prints |
| "updated calendar", "revised calendar" | The next `CalendarExport.version` | |
| "change request" (from a musician) | `ChangeRequest` | For published sessions |

### Time, pay and paperwork

| Team word | Object | Notes |
|---|---|---|
| "timesheet", "pay sheet" [CH] | `TimeEntry` records for a week | What pay is calculated from (D3) |
| "hours" | `TimeEntry.hours` | |
| "contract" (with a musician) | `Contract` | Contractors only; holds the musician's hourly rate (D9) |
| "contract" (with a partner), "Hebrew Home's contracts" | `PartnerAgreement` | Usually one per residency season; a site can have several (D4) |
| "stipend" (project support, admin lead, training) [CH] | `Contract.stipends[]` | |
| "special pay" [WB] | `PayAdjustment(kind = special_pay)` | |
| "special project" [CH] | `SpecialProject` | |
| "musician invoice" | `MusicianInvoice` | |
| "community invoice" | `PartnerInvoice(kind = site)` | One per contract, per site, per month (D4) |
| "custom invoice", "one-off invoice" (e.g. a concert for a non-partner, corporate overhead) | `CustomInvoice` | Typed by hand; optional program link (v0.15) |
| "billable hours", "contract hours delivered" | Per musician: documented session length × musicians present + each musician's relationship-building minutes at a site, once the point person approves their week | Same for every site (D9, revised v0.14) |
| "rate" (partner) | `PartnerAgreement.hourly_rate` | Admin-editable |
| "overhead", "15% overhead" | `PartnerAgreement.overhead_percent` | Optional per contract |
| "corporate office" (billing) | `PartnerContact` used as `overhead_bill_to_id` | Receives the separate overhead invoice |
| "overhead invoice", "corporate invoice" | `PartnerInvoice(kind = overhead)` | |
| "quarterly installments" (partner) | `PartnerAgreement.installments` (`billing_basis = installments`) | Monthly invoice still shows progress and the amount due |
| "late cancellation" (by a partner) | `Session` canceled with `cancellation_reason = partner` after 9 am that day | Billed by default (D9) |
| "pay period" | `PayPeriod` | Two weeks, Monday–Sunday |
| "semester", "season" | `Season` | Set per residency (**Decided, D8**); `kind` says which |
| "the workbook" | Not an object | Today's spreadsheet; its contents map to `Session`, `SessionReport`, `RelationshipActivity`, `MonthlyReflection` |

---

## Part B — Outward language → objects

Outward documents use the partner's names and Iris's public voice. They
**never** show resident names, internal notes, rates paid to musicians, or
internal codes.

### Monthly partner calendar (e.g. for Revitz House)

One per site per month (`CalendarExport`). Layout follows the calendars Iris
sends today (sample: Dec 2026), with the Iris logo added.

| Printed | Source |
|---|---|
| Iris logo | Brand assets (`public/brand/`) |
| "Month: [Month Year]" | `CalendarExport.month` |
| "[Site] Programming" (e.g. "Revitz House Programming") | `Site.display_name` |
| Columns: **Day**, **Time**, **Program Title**, **Musicians** | |
| "Special events" section | `Session`s with `is_special_event`; Day as "December 1" |
| "Regular programming" section | One **block per `Series`** (ordered by weekday, then time), with a row for **every date** the series falls on that month; then one-time sessions that aren't special events. Day as "Tuesday, December 1" |
| Time | `Session.starts_at` in the site's time zone (e.g. "3:00 PM"); **blank** when `has_set_time` is false (e.g. Lessons) |
| Program Title | `Session.title` + " with " + musicians' first names, e.g. "Jam Band with Ana", "Lessons with Ben and Cara", "Lessons with Ana, Ben, Cara" |
| Musicians | First names of `SessionAssignment`s that aren't `absent`, leader first; subs included |
| Canceled date | **"No Program"** in Program Title (any cancellation reason, e.g. holidays, breaks, absences); Musicians blank |
| Note | `Session.public_note` (never `internal_note`) |

**Rules:** only `published` sessions print. Every canceled session prints as
"No Program" at its usual date and time. Scheduled relationship building
(e.g. Lessons, `kind = relationship_building`) prints like any weekly
program. **Logged** relationship-building activities (one-to-ones,
mini-groups) never print (D2). The calendar never shows resident names,
internal notes, cancellation reasons or rates.

### Community invoice (to a partner)

| Printed | Source |
|---|---|
| Bill to | `Partner.legal_name` and the invoice's `bill_to_id` contact (the site's billing contact, or the corporate office for an overhead invoice). Until `PartnerContact` is built (v0.14): `Partner.legal_name`, `billing_address`, `billing_email` |
| Period | `PartnerInvoice.month` (one invoice per contract, per site, per month; D4) |
| Lines (e.g. "Programming, Ring House, [month]") | `InvoiceLine`s built from billable hours (`SessionReport`s and `RelationshipActivity`s at the site), billed stipends, overhead and installments per the `PartnerAgreement` |
| Invoice number, e.g. "IMP-202611-MH" | Month + site initials (`OH` overhead, `CT` contract) (v0.14) |
| Hours this month / to date / contracted | Billable hours, **per musician**, approved by the point person (v0.14); `PartnerAgreement.contracted_hours` |
| Total | `PartnerInvoice.total` |

### Musician invoice (contractor to Iris)

| Printed | Source |
|---|---|
| "Bill To: Iris Music Project" + address | Fixed |
| "From" | The musician's `Person.name` and email |
| Invoice number, e.g. "AR-20261102" | Initials + `PayPeriod.starts_on` (v0.12) |
| "For services from [start]–[end] (2-week period, Monday–Sunday)" | `PayPeriod` |
| Lines by residency and category, stipends, adjustments | `InvoiceLine`s |
| "TOTAL DUE" | `MusicianInvoice.total` |

### Reports for funders and evaluation

| Outward phrase | Source |
|---|---|
| "residents reached / served" | Distinct `Resident`s in `RelationshipActivity`. Session attendance is reported separately as "people at programs" because it includes staff and family (D15); never add the two |
| "programs / sessions delivered" | Count of completed `Session`s |
| "hours of programming" | Sum of `TimeEntry.hours` (or of `SessionReport` durations; **always say which**) |
| "resident-led programs" | `Session`s whose `SessionReport.resident_involvement = co_led` |

Evaluation exports are **de-identified**: `Resident` becomes a random code.

---

## Part C — The Ensemble-in-Residence model (and how the app measures it)

The team's mission language comes from the two JAAH papers. These are not
objects; they are **concepts the app measures** from objects.

**Ensemble-in-Residence model.** A small team of professional musicians
(two to three, [JAAH 2025]) commits to one community and engages deeply with
its residents, staff and caregivers over an extended time, offering frequent
and varied programming that is reshaped by what the community values
[JAAH 2021]. Depth of engagement takes priority over attendance numbers
[JAAH 2025]. → In the app: a `Residency`.

**Three types of programming** [JAAH 2021]. Performances and open rehearsals;
small group programs; one-to-ones. → `InteractionType.model_type`.

**Synergies** [JAAH 2021; JAAH 2025]. The types feed into one another, e.g. a
resident works with a musician over several one-to-ones on a lecture, and the
ensemble then performs a related piece. → `RelationshipActivity.prepares_session_id`;
`resident_involvement`.

**Community bonds** [JAAH 2025]. Relationships among residents, staff,
caregivers and musicians; loneliness as their absence. → Not directly
measured.

**Trust and continuity** [JAAH 2025]. Builds when the same musicians stay.
→ `RosterMember` tenure; substitution rate.

**Emergent musical experiences; co-creators** [JAAH 2025]. Projects that grow
from relationships, with residents as co-creators. → `SpecialProject`;
`resident_involvement = co_led`.

**Resident roles** [JAAH 2021; JAAH 2025]. Audience, presenter, performer,
coach, curator, collaborator, student, expert. → Not modeled in version 1.

**Music committee** [JAAH 2025]. Residents who advise the ensemble. → A
`Series` (its meetings are "Programs" time [CH]).

**Ecosystem health** (app term). Computed per `Residency` and `Season`, never
stored:

| Signal | Computed from |
|---|---|
| Balance | Share of completed `Session`s by `InteractionType.model_type`, plus relationship-building minutes |
| Continuity | `RosterMember` tenure; share of `SessionAssignment`s with `status = substitute` |
| Depth | Repeat residents in `RelationshipActivity`; relationship minutes per week |
| Co-creation | Sessions whose `SessionReport.resident_involvement` ≠ `none`; progress to the co-led target |
| Emergence | `SpecialProject`s; activities linked to sessions via `prepares_session_id` |
| Targets | `Target` progress, e.g. average attendance vs. 7 [CH] |
