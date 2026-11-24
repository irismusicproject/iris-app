# Test personas: how different musicians use the app

_Started November 24, 2026 (Ryan's side), at Ryan's request. Staging only;
every person here is fake, from `supabase/seed.sql`. A persona is a profile
across the twelve **variables** below (habits, pressures, relationships),
laid over a fake musician whose **role** on staging fits the journey. The
role-only test accounts in `e2e/overnight/personas.json` (Admin, Point
person, Admin Lead, Musician, Substitute, Deactivated) stay as they are;
they test permissions, these test journeys._

## 1. The process maps the personas walk

| Map | Steps | Where the rules live |
|---|---|---|
| **A. The month** | Point person opens it → team edits (titles by the leader, "I can't play", swap proposals) → point person confirms → Admin Lead sends to the partner → partner changes → final → after final, changes are requests | DOMAIN-MODEL v0.41–v0.46 (D17) |
| **B. The week** | Play → leader documents (or "Canceled day-of", "I wasn't there") → relationship building logged → hours calculated → Submit my week (Tuesday 5 pm) → point person approves → final | v0.19, v0.29, v0.36, D3, D7 |
| **C. The day** | Upcoming date → something goes wrong (sick, snow, leader missing) → call the point person → recorded afterwards | v0.43, D6, D11 |

## 2. The variables

Each variable pushes on particular rules (V13 was added after Fern's journey turned it up). The last column is how a test
imitates it.

| # | Variable | Values | What it stresses | How a test imitates it |
|---|---|---|---|---|
| V1 | **Comfort with apps** | low · medium · high | Wording of refusals and confirmations; double taps; forms left halfway; "back" in the middle of a step | Slow taps, double taps, leaving a form and returning |
| V2 | **Device habit** | phone only · computer only · both | The website and phone apps saying the same thing; a report on the phone that hasn't gone out yet | Do a step on one device, check it on the other |
| V3 | **Sign-in rhythm** | several times a day · daily · weekly (Tuesday) · every few weeks | Reminder emails; a To do list that piles up; "Last updated"; signing in again after 14 days away (O8) | Sign in only on the persona's days; move the phone's clock |
| V4 | **Note thoroughness** | one line · standard · long and detailed | Required notes and times at detailed-notes buildings (v0.36); long text; pasted text; notes drifting into health details, which the app must never keep | One-word notes, 2,000-character notes, pasted text with line breaks |
| V5 | **Calendar pressure** (other gigs) | light · moderate · heavy | Many "I can't play" marks; the missed-session warning (D11); subs asked for after final; two buildings on the same day | Mark many dates; overlap dates across buildings |
| V6 | **Relations at the building** | smooth · some friction · strained | Leader swaps proposed, declined, withdrawn (R1–R4); two people changing a title at once; the leader who never documents, so someone else takes the lead (D6) | Two sessions editing the same date; requests declined and re-proposed |
| V7 | **Timeliness** | right after playing · by the deadline · late | Tuesday 5 pm (D7); deadline reminders; approved weeks are final (v0.29) | Act at 4:59 pm and 5:01 pm Tuesday; open a week already approved |
| V8 | **Signal at their buildings** | good · patchy · none in the room | Saving on the phone and sending later (O1–O5) | Airplane mode on and off mid-journey |
| V9 | **Access needs** | none · large text · screen reader · color vision | Text that clips or overlaps; buttons without labels; meaning carried by color alone (orange and purple on the calendar) | Text at 200%; VoiceOver or TalkBack; grayscale screenshots |
| V10 | **Roles held** | plays · leads · substitute · Admin Lead · several buildings | Permissions that differ by building in the same month | One person, different roles at two buildings |
| V11 | **Tenure** | new this season · veteran used to the workbook | First sign-in from an invite; workbook habits (expecting to type hours, which are now calculated, D3) | Fresh account; look for words a workbook user expects |
| V12 | **How they communicate** | reads every email · skims · calls instead | The notification layer; whether the app works for someone who never reads email | Check what reached the outbox; finish a journey with no email read |
| V13 | **Phone's time zone** | the building's · another (traveling, or living across a time-zone line) | "Today" on the log form comes from the phone's clock; late in the evening it can be a day the building hasn't reached | Set the emulator's time zone ahead of the building's |

## 3. The personas

Comfort with apps (V1) is a variable, not a matter of age. Ages are here
because they shape habits, and older personas sit on both sides of it on
purpose.

| Variable | **Fern** Flute, 29 | **Hollis** Horn, 71 | **Dex** Drums, 45 | **Vera** Voice, 78 | **Clara** Clarinet, 34 | **Violet** Viola, 66 | **Gus** Guitar, 23 | **Harper** Harp, 52 |
|---|---|---|---|---|---|---|---|---|
| V1 comfort | high | low | high | low | high | medium-high | high, hurried | medium |
| V2 device | phone | computer, zoomed 200% | phone in the field, computer for paperwork | phone | whichever is closer | computer | phone | both |
| V3 sign-in | daily | Tuesday evenings | daily | every few days | daily | every few weeks | many times a day | weekly |
| V4 notes | standard | one line | standard | detailed when she leads | standard | standard | one line | long, detailed, drifts toward health details |
| V5 gigs | moderate | light (retired) | heavy (weekend band, teaching) | light | moderate | heavy (orchestra season, away for weeks) | heavy, last-minute calls | moderate |
| V6 relations | smooth | smooth | smooth | smooth | smooth | smooth | some friction: wants to lead more | strained with a co-leader over titles and leading |
| V7 timing | right after playing | by the deadline, sometimes 5:01 pm | phone right after, submits late Monday | by the deadline | early | late | late | by the deadline |
| V8 signal | none in one basement | (computer) | good | good | good | (computer) | patchy | good |
| V9 access | none | browser zoom | none | largest text | none | none | none | red-green color vision |
| V10 roles on staging | Admin Lead at Charles E. Smith; core at Splendido | core at 3 buildings | core at Charles E. Smith and Mather; sub at Saint Mary's | core at Charles E. Smith | Admin Lead at Winter Growth; sub at Asbury | Admin Lead at Arbor Place; sub at Mather | core at Mather | Admin Lead at Splendido; core at Winter Growth and Arbor Place |
| V11 tenure | veteran | veteran, used to the workbook | veteran | new (the phone was a gift) | veteran | veteran | new | veteran, used to the workbook |
| V12 communicates | reads email | reads every email | skims | calls | reads email | ignores email | ignores email | reads email |

**What each one is mainly for**
- **Fern:** offline documenting (O1–O5) and the Admin Lead's send and partner changes, all on a phone.
- **Hollis:** the whole week done at once on the website before the deadline; code sign-in; 200% zoom.
- **Dex:** one week split across two devices; a sub at one building and core at others.
- **Vera:** large text, double taps, forms left halfway; "Canceling today? Call …".
- **Clara:** two hats in the same month; permissions that must not leak between buildings.
- **Violet:** returning after weeks away (sign in again after 14 days; old data marked "Last updated"); a season that ended.
- **Gus:** the edges: many "I can't play" marks, swap proposals, late work, opening an approved week.
- **Harper:** detailed-notes buildings; notes that must not hold health details; two people editing the same title; calendar meaning without color.

## 4. Who walks which map, on which device

| Step | Fern | Hollis | Dex | Vera | Clara | Violet | Gus | Harper |
|---|---|---|---|---|---|---|---|---|
| A. "I can't play", undo | phone | web | either | **phone, large text** | web | web, many dates | **phone, many dates** | either |
| A. Titles, swap requests | phone | — | **web** | — | phone | — | **phone, proposes often** | **web, at the same time as a co-leader** |
| A. Send, partner changes, final | **phone** | — | — | — | **web, own building only** | web, late | — | web |
| B. Document | **phone, offline** | web, batch | **phone** | phone (rare) | either | web, late | phone, late, one line | **web, detailed notes** |
| B. Submit my week | phone | **web, 4:59 and 5:01 pm** | **web** | — | either | web | **phone, after approval** | web |
| C. Canceling today, day-of | phone | — | phone | **phone** | — | — | phone | — |
| Sign-in | password | **emailed code** | password | password | password | **again after 14 days** | password | password |

**Bold** = the journey that persona exists to test.

## 5. How each journey is tested

| Persona journey | How | Status |
|---|---|---|
| Vera, largest text | Musician's tour on Android with text at 200% (`phone-journeys.yml`); iOS by hand | Found on iOS Nov 24: calendar day numbers overlap, header titles clip, month name splits; fixed, waiting for a build to confirm |
| Fern, offline documenting | `fern-no-lock.yaml` (no screen lock: nothing kept, O3), then a PIN and `fern-offline.yaml` (airplane mode on, log, off: sent by itself, O1, O4); `check-offline-sent.mjs` asks staging that it arrived exactly once (O2) and deletes the run's test logs | written Nov 24; first run pending |
| Dex, phone then web | `prepare-dex.mjs` picks a date he led and documented in an unapproved week; `dex-phone.yaml` changes its attendance on the phone to a number unique to the run; `e2e/staging-journeys/dex-web.spec.ts` finds that number on the staging website, then sets the original back with the website's form and checks the database (so it can repeat; nobody can delete a report) | written Nov 24; website half dry-run against staging; first full run pending |
| Hollis, web at 200% zoom, the deadline | `e2e/hollis-deadline.spec.ts`: emailed-code sign-in at 200% zoom (nothing scrolls sideways); week A submitted at 4:59 pm, week B at 5:01 pm; the database's reminders run at Monday 12:30, Tuesday 4:59, 5:01 and 5:06 pm, and Thursday 8:30 am; the point person's Follow-up shows 1 on time, 1 late | ✅ passed its first run, Nov 24 |
| Clara, two hats | `supabase/tests/clara-two-hats.test.mjs` (in `npm run test:db`): Admin Lead at one building, substitute at another, same month. 31 checks: she sends, enters partner changes and marks final at her own building; at the other she only marks "I can't play" on dates she plays; none of her Admin Lead powers (send, recipients, partner changes, final, To do tasks) reach the other building, even when it sits at the same stage | ✅ passes, Nov 24 |
| Violet, 14 days away | `violet-away-1/2/3.yaml`: she logs a visit with no signal; the workflow moves the phone's clock 15 days ahead (root, automatic time off); the phone says it's been more than 14 days and still counts her saved visit; clock back and signal on, it sends by itself; `check-offline-sent.mjs --expect away=1` confirms it arrived once. Not covered yet: a second log refused after 14 days (needs My week to open in the new week), and her read-only history after a season ends (D5) | written Nov 24; first run pending |
| Gus, edges | `prepare-gus.mjs` picks three draft dates he plays in an open month; `gus-edges.yaml`: a double tap on "I can't play" marks once (not on and off), the season count goes 1 → 2 (C6), he proposes himself as leader with a double tap; `prepare-gus.mjs --cleanup` checks one request (not two), undoes leftovers and withdraws the proposal. Finding: no app has a Withdraw button for requests (R4 is database-only). Not covered yet: an approved week, the missed-session warning (no limit set, D11) | written Nov 24; first run pending |
| Harper, notes and color | Playwright with long notes at a detailed-notes building; two browsers editing one title; grayscale screenshot of the calendar | to build |

Findings go in `docs/ACCEPTANCE.md` and on issue #30.
