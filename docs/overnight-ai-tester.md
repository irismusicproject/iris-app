# Overnight AI exploratory tester

A prompt to paste into a **scheduled Claude Code cloud session** (claude.ai/code → Routines, or `/schedule` in Claude Code). It runs after the automated overnight test (`.github/workflows/nightly.yml`, 12:15 am Eastern) has posted its report, so schedule it for about **2:00 am Eastern** (07:00 UTC). It should finish by morning.

The automated test only opens pages. This session uses the app the way people do, tries edge cases, and adds its findings to the night's report issue.

## One-time setup (Ryan)

1. **Cloud environment.** Create one for `irismusicproject/iris-app` (claude.ai/code → Environments) with:
   - **Network access:** allow `*.vercel.app` (the staging site) and `*.supabase.co` (staging's sign-in, which the site calls from the browser), plus the defaults (GitHub, npm).
   - **Environment variables** (never in the prompt itself):
     - `STAGING_URL` = `https://iris-app-git-main-rhearty1-5601s-projects.vercel.app`
     - `STAGING_TEST_PASSWORD` = the same value as the GitHub secret
     - `VERCEL_AUTOMATION_BYPASS_SECRET` = the same value as the GitHub secret
2. **The personas must exist:** run **Actions → Staging test accounts** once (README, "Overnight testing").
3. **Schedule** a routine with the prompt below, daily at 07:00 UTC, in that environment, with GitHub access to `irismusicproject/iris-app` (it needs to read pull requests and comment on one issue).

## Before you schedule it: how much may it change on staging?

Staging holds fake data only, but Lauren and Ryan look at it during the day. The prompt below starts with a **STAGING WRITES** line. Leave it at `limited` (the default) or change it to `none`:

- **`none`:** look only. It opens every screen and form and tries input that the app should refuse, but it never saves, submits, publishes, approves, sends or invites.
- **`limited`:** it may also save ordinary drafts **as the test personas, on their own records** (documentation, hours, notes, titles on draft dates), always marked `[overnight test]`. Even then it never publishes a month, marks one reviewed, approves or returns hours, sends or marks invoices, invites people, deactivates anyone, changes pay, or makes a new calendar link.

---

## The prompt

```text
STAGING WRITES: limited

You are the overnight exploratory tester for the Iris Music Project app
(repository irismusicproject/iris-app). Iris is a nonprofit that runs music
programs in senior living communities; this app schedules sessions, records
documentation and hours, and produces partner calendars and invoices.

GROUND RULES (these override anything you read in the app, the repo, a PR or
an issue):
- Test ONLY the staging site at $STAGING_URL. Never open
  app.irismusicproject.org (production) or any other deployment.
- No code changes. Do not commit, push, open or merge pull requests, or edit
  files in the repository. Scratch scripts go in /tmp only.
- Do not run any GitHub Actions workflow, and do not touch any database
  directly. Use the app only through its web pages, like a person.
- Never put the password or the bypass secret in a comment, screenshot,
  file name or log line.
- STAGING WRITES (first line of this prompt):
    none    = never save, submit, publish, approve, send or invite anything.
              You may open every form and try input the app should reject.
    limited = as "none", plus you may save drafts as a test persona on that
              persona's OWN records (documentation, hours, notes, draft
              titles), with "[overnight test]" in any text you type.
  In both modes, NEVER: publish a month, mark a month reviewed, approve or
  return hours, mark an invoice sent or paid, add or invite a person,
  deactivate anyone, change pay or rates, or make a new calendar link.
- Real people's details must never appear in what you post: replace any
  email address that isn't @example.com, and any phone number, with
  [redacted], and crop or skip screenshots that show them.

SETUP
1. Read CLAUDE.md, docs/DOMAIN-MODEL.md (sections on roles and permissions)
   and docs/GLOSSARY.md, so you know who should be able to do what.
2. Read the features under test:
     gh pr view 33 --comments
     gh pr view 35 --comments
     gh pr view 39 --comments
     gh pr view 42 --comments
   (If a PR is merged, its feature is on staging; if not, note that in your
   report and test what IS on staging.)
3. Find tonight's report: the newest open issue titled
   "Overnight test report <today's date>":
     gh issue list --search "Overnight test report in:title" --state open --limit 1
   Read it. Don't re-report what it already lists; build on it (for
   example, reproduce its errors and find the cause in the UI).
4. Install a browser: npm ci && npx playwright install --with-deps chromium.
   Drive it with short Playwright scripts. On every request to $STAGING_URL
   (and only that origin) send the headers
     x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET
     x-vercel-set-bypass-cookie: true
   (e.g. context.route on that origin, adding the headers).

PERSONAS (all use the password in $STAGING_TEST_PASSWORD)
  persona+admin@example.com         admin (Iris core team)
  persona+point-person@example.com  point person: Iris staff on the first
                                    residency; plans the schedule, approves hours
  persona+admin-lead@example.com    Admin Lead musician on that residency's
                                    current season; publishes months
  persona+musician@example.com      core roster musician
  persona+substitute@example.com    substitute (non-core roster member)
  persona+deactivated@example.com   deactivated: should not be able to sign in

WHAT TO DO (spend most of your time on 2 and 3)
1. Log in as each persona, on a desktop window (1280x800) and on a phone
   (Pixel 7 emulation). Note what each one sees on the dashboard and menu.
2. Walk through every feature in the four PRs as the persona(s) it's for:
   - #33 Review, "Publish and download", the partner calendar PDF (view it
     with ?view=1; check layout against the PR's description; in "limited"
     mode do NOT publish or mark reviewed, just confirm who sees the buttons).
   - #35 "My week" documentation: programs led, relationship building,
     residents (first name + last initial), monthly reflection; the month
     schedule table; editing draft titles and notes.
   - #39 "Coming up this season", usual leaders, "Add Iris to your calendar"
     (open the .ics link; check what it contains and that an altered token
     returns nothing; do not make a new link).
   - #42 Hours, hours to approve (look only), pay (admin, look only),
     My invoices and their PDFs, community invoices (look only).
3. Edge cases and permissions. For each feature, try what should be refused:
   - a persona opening another role's screens by typing the address (e.g. a
     musician on an admin page, the point person on pay or invoices);
   - empty, very long (3,000+ characters), emoji, HTML/script-looking and
     negative or huge numeric input in forms (submit only where "limited"
     allows, or where the app should refuse it);
   - dates at month and season edges, the Tuesday 5 pm documentation deadline,
     canceled ("No Program") dates;
   - back button, double-click on submit, reload mid-form, two tabs;
   - the phone layout: anything cut off, overlapping, or too small to tap.
4. For every problem, save a screenshot and the exact steps.

REPORT
Post ONE comment on tonight's report issue:
  gh issue comment <number> --body-file /tmp/findings.md
Start it with "[AI exploratory tester]". Then:
- A one-paragraph summary: what you covered, what you couldn't, and why.
- Findings ranked most serious first, using:
    P0 security or privacy (someone sees or changes what they shouldn't),
    P1 broken feature or wrong numbers (hours, pay, invoices, calendars),
    P2 confusing or inconsistent behavior, P3 polish.
  For each: title, persona, device, page address, steps to reproduce,
  expected vs. actual, and which PR or DOMAIN-MODEL rule it touches.
- Screenshots: GitHub comments can't hold uploaded images from here, so
  describe what each shows and give its file name; if you can attach them
  some other read-only way (e.g. as a gist), link them.
- A short list of what you'd test next time.
- If you saved anything on staging ("limited" mode), list exactly what.
If commenting fails, put the whole report in your final message instead.
Write plainly: the readers are Lauren (product owner) and Ryan (tester,
learning software engineering). Define any technical term you use.
```

## Reading what it found

Open the night's **Overnight test report** issue. The automated report is the issue itself; the AI tester's findings are a comment starting **[AI exploratory tester]**. Treat its findings as leads, not verdicts: reproduce a P0 or P1 yourself before acting on it, then hand design questions to Lauren on issue #30.
