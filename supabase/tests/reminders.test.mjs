// Tests for the scheduled reminders (DOMAIN-MODEL v0.24 deadline reminders,
// v0.43 To do reminders): queue_deadline_reminders and queue_month_reminders,
// which the hourly Vercel schedule calls (src/app/api/schedules/notifications).
// Both take the time as a parameter, so each check pretends it is a given
// hour instead of waiting for the clock. They decide WHO gets WHAT and WHEN;
// whether an email actually goes out is NOTIFICATIONS_ENABLED (lib/notify.ts).
// Ryan's side, Nov 25, 2026. Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays, weekStart } from "./money-harness.mjs";

const T = reporter();
const { check, question } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const w = await buildPlaces(env, addDays(TODAY, -120), addDays(TODAY, 150));
const { A, P, L, M2, O } = P_;

// Elm Court (RES2) has one building, in Eastern time: M2 led a program there
// last week and hasn't documented it, so M2 has missing work for that week.
const MON = weekStart(TODAY);           // this week's Monday
const LAST = addDays(MON, -7);          // last week's Monday: due this Tuesday at 5 pm
const at = (date, time) => `'${date} ${time} America/New_York'::timestamptz`;
const s = (await su(`insert into public.session (residency_id, title, location_id, starts_at, scheduled_minutes, schedule_state)
  values ('${w.RES2}','Music Café','${w.R3}', '${addDays(LAST, 2)} 14:00 America/New_York', 60, 'draft') returning id`))[0].id;
await su(`select set_config('iris.publishing', 'on', false)`);
await su(`update public.session set schedule_state='published' where id='${s}'`);
await su(`select set_config('iris.publishing', 'off', false)`);
await su(`insert into public.session_assignment (session_id, person_id, role) values ('${s}','${M2}','leader')`);

const queue = async (when) => (await su(`select public.queue_deadline_reminders(${when}) as n`))[0].n;
const count = async (kind, person = M2) =>
  (await su(`select count(*)::int as n from public.notification where kind='${kind}' and person_id='${person}'`))[0].n;

// ---------------------------------------------------------------------------
// 1. Deadline reminders (documentation and hours, due Tuesday 5 pm)
// ---------------------------------------------------------------------------
await queue(at(MON, "11:00"));
check("Monday morning: no reminder yet (they start at noon)", (await count("deadline_reminder")) === 0);
await queue(at(MON, "13:00"));
check("Monday 1 pm: M2 gets one 'due tomorrow at 5 pm' reminder", (await count("deadline_reminder")) === 1);
const body = (await su(`select subject, body, email from public.notification where kind='deadline_reminder' and person_id='${M2}'`))[0];
check("…saying a program still needs documenting, with a link to My week",
  /due tomorrow/.test(body.subject) && /1 program\(s\) you led still need documenting/.test(body.body) && /\/documentation\?week=/.test(body.body), body);
await queue(at(MON, "15:00"));
check("an hourly run later the same day doesn't queue it again", (await count("deadline_reminder")) === 1);
check("nobody without missing work gets one (the point person, an outsider)",
  (await count("deadline_reminder", P)) === 0 && (await count("deadline_reminder", O)) === 0);

await queue(at(addDays(MON, 1), "16:00"));
check("Tuesday 4 pm, before the deadline: no 'missed' notice", (await count("deadline_missed")) === 0);
await queue(at(addDays(MON, 1), "18:00"));
check("Tuesday 6 pm: one 'missed deadline' notice", (await count("deadline_missed")) === 1);
await queue(at(addDays(MON, 1), "21:00"));
check("…only once", (await count("deadline_missed")) === 1);

await queue(at(addDays(MON, 3), "07:00"));
check("Thursday 7 am: no nudge before 8", (await count("deadline_nudge")) === 0);
await queue(at(addDays(MON, 3), "09:00"));
await queue(at(addDays(MON, 3), "10:00"));
check("Thursday: one 'still needed' nudge, however many runs", (await count("deadline_nudge")) === 1);
await queue(at(addDays(MON, 4), "09:00"));
check("Friday: another nudge (one a day while it's missing)", (await count("deadline_nudge")) === 2);

// Documenting the program and submitting the week ends the reminders.
await su(`insert into public.session_report (session_id, author_id, attendance, interaction_type_id, actual_minutes)
  values ('${s}', '${M2}', 12, '${w.IT_PERF}', 60)`).catch((e) => console.log("setup:", e.message));
const documented = (await su(`select count(*)::int as n from public.session_report where session_id='${s}'`))[0].n === 1;
if (documented) {
  await su(`insert into public.time_entry (person_id, residency_id, week_starting, time_category_id, hours, state)
    values ('${M2}','${w.RES2}','${LAST}','${w.CAT_PROG}',1,'submitted')`);
  await queue(at(addDays(MON, 5), "09:00"));
  check("once documented and submitted, the nudges stop", (await count("deadline_nudge")) === 2);
} else {
  check("(setup) the test could document the program", false, "session_report insert failed; check its columns");
}

// A musician (or anyone signed in) can't run the queue: only the server can.
let r = await as(M2, `select public.queue_deadline_reminders()`);
check("a musician can't run the deadline reminders", !r.ok, r);
r = await as(A, `select public.queue_month_reminders()`);
check("not even an admin's session can run the To do reminders (server only)", !r.ok, r);
r = await as(M2, `select count(*)::int as n from public.notification`);
check("a musician can't read the outbox", r.ok && r.rows[0].n === 0, r);
r = await as(A, `select count(*)::int as n from public.notification`);
check("an admin can (the Outbox screen)", r.ok && r.rows[0].n > 0, r);

// A program with buildings in two time zones: Maple (RES) has Maple House
// (Eastern) and Birch Hall (Central). The function uses the zone whose name
// sorts first, so Maple's deadline is 5 pm Central, 6 pm Eastern. Open on
// issue #30 (which zone decides deadlines for Mather).
const tz = (await su(`select st.timezone from public.residency_site rs join public.site st on st.id = rs.site_id
  where rs.residency_id = '${w.RES}' order by st.timezone limit 1`))[0].timezone;
question("TZ1", "a two-time-zone program's deadlines follow its first building's zone, not 'the one sorting first alphabetically'", tz === "America/New_York", { chosen: tz });

// ---------------------------------------------------------------------------
// 2. To do reminders for the monthly cycle (Maple House, next month)
// ---------------------------------------------------------------------------
const next = new Date(`${TODAY}T12:00:00Z`); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
const MONTH = next.toISOString().slice(0, 10);
r = await as(P, `select public.open_schedule_month('${w.RES}','${w.S1}','${MONTH}')`);
check("(setup) the point person opens next month", r.ok, r);
const sm = (await su(`select team_due_on::text as team, final_due_on::text as fin from public.schedule_month
  where residency_id='${w.RES}' and site_id='${w.S1}' and month='${MONTH}'`))[0];
const queueMonth = async (date) => (await su(`select public.queue_month_reminders(${at(date, "12:00")}) as n`))[0].n;
const monthly = async (person, like) =>
  (await su(`select count(*)::int as n from public.notification where kind='month_reminder' and person_id='${person}' and subject like '${like}'`))[0].n;

await queueMonth(addDays(sm.team, -2));
check("two days before the team's due date: no reminder", (await monthly(P, "Reminder: confirm%")) === 0);
await queueMonth(addDays(sm.team, -1));
await queueMonth(addDays(sm.team, -1));
check("the day before: the point person gets one 'confirm' reminder", (await monthly(P, "Reminder: confirm%")) === 1);
await queueMonth(sm.team);
check("on the due date: the Admin Lead gets one 'send to the partner' reminder", (await monthly(L, "Today: send%")) === 1);
check("…and the point person doesn't", (await monthly(P, "Today: send%")) === 0);

process.exit(T.summary("reminders") ? 1 : 0);
