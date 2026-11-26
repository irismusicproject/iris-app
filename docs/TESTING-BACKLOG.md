# Testing backlog

_Started November 25, 2026. The rules for using this list are in
`CLAUDE.md`, "Testing habits." Each session takes one item when nothing
more urgent is on; cross it off with the date and PR. Add an item whenever a
journey breaks for a fragile reason or a rule goes unpinned._

## Test IDs (habit 4)

Journeys that find things by text, scrolling or screen position break when
staging's data or the screen size changes. Each item: give the element a
`testID`, and point the journey at it.

- [ ] **Calendar date rows** (`mobile/src/app/(tabs)/calendar.tsx`): an ID
  per date, built from the date and time (e.g. `cal-2026-12-24-1430`). Gus
  and the tour now hunt rows by text with slow scrolls (Nov 25: fast swipes
  flung past the row).
- [ ] **Today's date cards** (`(tabs)/index.tsx`): same scheme; the tour's
  "soon" date is found by title.
- [ ] **Date screen buttons** (`date/[id].tsx`): "I can't play this date",
  "Marked: I can't play (tap to undo)", the leader choice and "Send to the
  point person."
- [ ] **My week** (`week.tsx`): "Log an activity", "Document", the "Due"
  label and the "Not sent yet" list.
- [ ] **Log relationship building** (`log.tsx`): the building choices and
  "30 min" (Violet's form is taller with two programs; scrolling from the
  middle landed on the Minutes box, Nov 25).
- [ ] **Account**: "Log out."

## Journeys that depend on whatever staging holds

- [ ] **The tour's "soon" date and Dex's documented date**: the prep scripts
  look for them and skip the step when there's none (Nov 25: none existed,
  and the tour hunted for "undefined"). Make `prepare-staging.mjs` and
  `prepare-dex.mjs` create the date they need, and remove it afterwards, as
  `prepare-gus.mjs` does.

## Unit tests to add (habit 5)

Pinned so far (`tests/unit/`): which session the phone trusts on opening
(`session-choice`), site time zones (`time`), the 14 days (`sign-in-limit`), form line breaks (`form`), the date screen's buttons (`date-rules`).

- [x] **The 14-day offline limit** (Nov 25, `sign-in-limit`) (`mobile/src/lib/offline/outbox.tsx`,
  `signInNeeded`): move it into a pure function; test 13 days, 15 days,
  never confirmed, online.
- [x] **Line breaks from forms** (Nov 25, `form`) (`src/shared/domain/form.ts`, `formText`):
  CRLF and CR become LF (#103).
- [ ] **"Today" for a musician at several sites** (the earliest local date,
  #94).
- [x] **The month's stage and who may edit titles** (Nov 25, `date-rules`; also fixed the title hint, which said "Partner change" to a leader titling a month outside the cycle) (`date/[id].tsx`:
  `titleWindow`, reviewed months): move into a pure function and test each
  stage.
- [ ] **Gus's calendar line format** (`prepare-gus.mjs` `fmt`): "Thursday,
  December 24 · 2:30", across Intl versions.

## Local runs

- [x] **An Android emulator on this Mac** (Nov 25, Ryan approved):
  `run-local.sh` runs the same `run-ci.sh` as GitHub on a local emulator,
  with the app file GitHub built. The iPhone simulator (`--ios`) stays for
  the journeys it can run; its quirks: the Keychain survives a reinstall,
  "Save Password?" pop-ups, password autofill eating typed text, no airplane
  mode or clock changes.
- [ ] **App improvement for Lauren**: Return on the sign-in email box could
  move to the password box (now it does nothing in password mode). Tests
  would then type without tapping between fields.
