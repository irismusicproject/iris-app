# Acceptance checklist: does each feature work as intended?

_Started November 24, 2026 (Ryan's side). Covers what DOMAIN-MODEL
v0.35–v0.46 says is built: the monthly scheduling cycle, the phone app's
musician screens, and offline logging. Each line is one promise from the
domain model, written as something a person can do and see. The columns say
what proves it today._

**How to read it**
- **DB:** a database test proves the rule (`supabase/tests/…`, runs on every PR).
- **Web:** a browser test proves it on the website (`e2e/…`).
- **Phone:** a phone test proves it in the Android app (`mobile/.maestro/…`).
- **Hand:** someone checked it on staging; write the date and initials.
- ✅ proven · ⚠ proven, with a known problem · — not proven yet

A line with no ✅ is the next thing to test. When a test finds a problem,
note it here and on issue #30.

**Where to try things by hand:** staging only (fake data). The website at
https://staging.irismusicproject.org and the Android test build, signed in as
a fake person (`persona+musician@example.com`, `persona+point-person@…`,
`persona+admin-lead@…`, `persona+admin@…`; password from Lauren).

## 1. Opening and confirming a month (v0.41–v0.42)

| # | Promise | DB | Web | Phone | Hand |
|---|---|---|---|---|---|
| M1 | The point person (or an admin) opens a month for the team with one click; musicians, the Admin Lead and other programs' point people can't | ✅ schedule-month | ✅ month-cycle | — | |
| M2 | While the team edits, only the date's leader changes its title (plus the point person and admins) | ✅ schedule-month | — | — | |
| M3 | The point person confirms the month; it locks for musicians; they can undo it until the calendar is sent | ✅ schedule-month | — | — | |
| M4 | Every musician on the roster can see each building's stage for the month | ✅ schedule-month | — | — | |
| M5 | The To do list shows "Open [month]", "Add titles…", "Review and confirm…" to the right people, with due dates | — | — | — | |

## 2. "I can't play" (v0.41, v0.43)

| # | Promise | DB | Web | Phone | Hand |
|---|---|---|---|---|---|
| C1 | A musician marks "I can't play" on a draft date they play, while the month is open for the team; no approval; it counts at once | ✅ month-actions (refusals) | ✅ month-cycle | — | |
| C2 | Before the month is opened, or after it's confirmed, "I can't play" isn't offered | ✅ month-actions | ✅ month-cycle | — | Finding (Nov 24): before opening, musicians see the earlier "Done reviewing" steps with no word about the cycle (v0.46 by design); asked on #30 |
| C3 | The musician's own calendar shows the date as "can't play" (phone: orange) | — | — | — | Ryan, Nov 24: didn't turn orange (cause unknown; see #30) |
| C4 | The point person sees them as not playing that date (website: struck through) and gets an email | ✅ email queued | ✅ month-cycle | — | |
| C5 | The point person gets a task: find cover or make it "No Program" | — | — | — | |
| C6 | The calendar shows how many dates the musician has marked this season | — | — | — | |
| C7 | The musician can undo it while the month is still open | — | ✅ month-cycle | — | |

## 3. Leader swaps and change requests (v0.41, v0.43)

| # | Promise | DB | Web | Phone | Hand |
|---|---|---|---|---|---|
| R1 | Musicians no longer set leaders directly; they propose a swap to someone playing the date | ✅ scheduling, month-actions | — | — | |
| R2 | The point person approves or declines a request in one tap from To do; the leader changes in one step | ✅ month-actions | — | — | |
| R3 | After final, a musician asks for a sub (must be on the season's roster) or another change; the point person approves | ✅ month-actions | — | — | |
| R4 | The requester can withdraw an open request; nobody else can | ✅ month-actions | — | — | |
| R5 | The point person is emailed about each request, and the musician about the decision | ⚠ request email only | — | — | |

## 4. Sending, partner changes, final (v0.41–v0.44)

| # | Promise | DB | Web | Phone | Hand |
|---|---|---|---|---|---|
| S1 | The Admin Lead (or point person, admin) sends the calendar; sending also confirms; the dates are published | ✅ schedule-month | — | — | |
| S2 | The app makes the PDF and emails it to the building's calendar contacts, copying the point person and Admin Lead; on staging it says plainly that email is off | — | — | — | |
| S3 | The first change after sending moves the month to "partner changes"; the Admin Lead enters changes on phone or computer | ✅ schedule-month | — | — | |
| S4 | The date's musicians are emailed about each partner change | — | — | — | |
| S5 | "Mark final and send" locks the month; after that only the point person and admins change dates, everyone else asks | ✅ schedule-month | — | — | |

## 5. The day itself and after (v0.41, v0.43)

| # | Promise | DB | Web | Phone | Hand |
|---|---|---|---|---|---|
| D1 | Each date shows "Canceling today? Call [point person]" with their phone number | — | — | — | |
| D2 | The leader records "Canceled day-of" with a required reason instead of documenting; it becomes No Program, counted at the start time | ✅ month-actions | — | — | |
| D3 | The point person is emailed and can undo a day-of cancellation | — | — | — | |
| D4 | A musician marks "I wasn't there" on their week; they aren't paid and the partner isn't billed for them; refused once the week is approved | ✅ month-actions | — | — | |
| D5 | They can undo "I wasn't there" | ⚠ known bug MA2 (always fails; waiting on Lauren's pay decision, #30) | — | — | |
| D6 | When the leader wasn't there, the first musician who played and documents it becomes the leader | ✅ month-actions | — | — | |

## 6. The phone app for musicians (v0.39, v0.45)

| # | Promise | DB | Web | Phone | Hand |
|---|---|---|---|---|---|
| P1 | Three tabs: To do, Today, Calendar; My week and Account one tap away | — | n/a | — | |
| P2 | Sign in by password or emailed code; the sign-in is kept encrypted on the phone | — | ✅ auth (web) | — | Ryan, Nov 22 ✅ (password) |
| P3 | Today: document a program, log relationship building, "I wasn't there" | ✅ (rules) | n/a | — | |
| P4 | Date details show who's playing with instruments and phone numbers, to the program's people only | ✅ phone-calls | — | — | |
| P5 | My week shows the calculated hours and Submit my week, with the same rules as the website | ✅ money-scenarios | — | — | |
| P6 | Test builds say they're the staging test version | n/a | n/a | — | |

## 7. Offline (v0.40)

| # | Promise | DB | Web | Phone | Hand |
|---|---|---|---|---|---|
| O1 | With no signal, a relationship-building log or program report is saved on the phone and sent once there's signal | ✅ offline (sending) | n/a | — | |
| O2 | Sending twice never makes two records; a refused item leaves nothing half-saved | ✅ offline | n/a | — | |
| O3 | Nothing is kept on a phone without a screen lock; everything is wiped at sign-out and when access ends | — | n/a | — | |
| O4 | A refused item shows under "Needs attention" with a plain reason | — | n/a | — | |
| O5 | My week and Upcoming open offline, showing "Last updated" | — | n/a | — | |

## What's next (Ryan's side)

1. Browser journey tests for sections 1–2 (opening a month, "I can't play").
2. Phone journey tests with Maestro for the same steps, so both apps prove the same promise.
3. "A month in the life" on staging: the whole cycle scripted through both apps, with screenshots at each step.
4. A random (property) test for the month cycle.
