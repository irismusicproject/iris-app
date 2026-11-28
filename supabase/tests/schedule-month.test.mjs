// Tests for the monthly scheduling cycle, part 1 (migration
// 20261226120000_schedule_month, DOMAIN-MODEL v0.41 / D17): a building's month
// moves team_editing → team_confirmed → sent_to_partner → partner_changes →
// final, one checked database function per step, with locks on dates and on
// who plays. Website and phone call the same functions, so these checks cover
// both (Ryan's side, Nov 24). Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays } from "./money-harness.mjs";

const T = reporter();
const { check } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const w = await buildPlaces(env, addDays(TODAY, -120), addDays(TODAY, 150));
const { A, P, Q, L, M1, M2, O } = P_;

const next = new Date(`${TODAY}T12:00:00Z`); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
const MONTH = next.toISOString().slice(0, 10);          // first of next month
const day = (n) => `${MONTH.slice(0, 8)}${String(n).padStart(2, "0")}`;
const fn = (who, name, extra = "") => as(who, `select public.${name}('${w.RES}','${w.S1}','${MONTH}'${extra}) as r`);
const stage = async () => (await su(`select stage::text as s from public.schedule_month where residency_id='${w.RES}' and site_id='${w.S1}' and month='${MONTH}'`))[0]?.s ?? null;

// Two dates next month at Maple House: L leads, M1 plays.
const mk = async (title, d) => (await su(`insert into public.session (residency_id, title, location_id, starts_at, scheduled_minutes)
  values ('${w.RES}','${title}','${w.R1}', '${d} 14:00 America/New_York', 60) returning id`))[0].id;
const s1 = await mk("Music Café", day(9));
const s2 = await mk("Sing-along", day(16));
for (const s of [s1, s2]) await su(`insert into public.session_assignment (session_id, person_id, role) values ('${s}','${L}','leader'),('${s}','${M1}','participant')`);

// ---------------------------------------------------------------------------
// 1. Opening the month (point person, admins)
// ---------------------------------------------------------------------------
let r = await fn(M1, "open_schedule_month"); check("a musician can't open a month", !r.ok, r);
r = await fn(L, "open_schedule_month"); check("the Admin Lead can't open a month", !r.ok, r);
r = await fn(Q, "open_schedule_month"); check("another program's point person can't", !r.ok, r);
r = await fn(O, "open_schedule_month"); check("an outsider can't", !r.ok, r);
r = await as(null, `select public.open_schedule_month('${w.RES}','${w.S1}','${MONTH}')`); check("signed out can't", !r.ok, r);
r = await as(P, `select public.open_schedule_month('${w.RES}','${w.T1}','${MONTH}') as r`); check("a site that isn't this program's is refused", !r.ok, r);
r = await fn(P, "open_schedule_month"); check("the point person opens the month: team editing", r.ok && (await stage()) === "team_editing", r);
// The "month is open" notice: a date before the team's deadline, "As soon as
// possible" after it (Lauren, Nov 27, 2026; migration 20261229120000).
await su(`select public.queue_month_opened()`); // D20: the email comes from the scheduled run
const opened = async (month) => (await su(`select n.body from public.notification n
  where n.kind='month_opened' and n.person_id='${M1}' and n.dedupe_key like '%:${month}:%'`))[0]?.body ?? "";
const due = (await su(`select team_due_on::text as d from public.schedule_month where residency_id='${w.RES}' and site_id='${w.S1}' and month='${MONTH}'`))[0].d;
const late = due < TODAY;
check(late ? "opened after the team's deadline: the notice says 'As soon as possible'" : "opened before the team's deadline: the notice names the date",
  late ? /As soon as possible:/.test(await opened(MONTH)) && !/By /.test(await opened(MONTH)) : /By \w+day, /.test(await opened(MONTH)), { due, body: await opened(MONTH) });
const AHEAD = addDays(MONTH, 62).slice(0, 8) + "01";    // two months on: its deadline is always ahead
const sAhead = await mk("Music Café", `${AHEAD.slice(0, 8)}09`);
await su(`insert into public.session_assignment (session_id, person_id, role) values ('${sAhead}','${M1}','participant')`);
r = await as(P, `select public.open_schedule_month('${w.RES}','${w.S1}','${AHEAD}')`);
await su(`select public.queue_month_opened('${addDays(AHEAD, -25)} 12:00-05')`);
check("a month opened in good time names its deadline ('By Tuesday, …')", r.ok && /is open\. By \w+day, \w+ \d+:/.test(await opened(AHEAD)), { r, body: await opened(AHEAD) });
r = await as(M2, `select stage from public.schedule_month where month='${MONTH}'`); check("the program's musicians can see the stage", r.ok && r.rows.length === 1, r);
r = await as(O, `select * from public.schedule_month`); check("an outsider sees no months", r.ok && r.rows.length === 0, r);
r = await as(P, `update public.schedule_month set stage='final'`); check("nobody changes the stage directly (only the functions)", !r.ok || r.n === 0, r);

// ---------------------------------------------------------------------------
// 2. Titles while the team edits: only the date's leader (v0.41)
// ---------------------------------------------------------------------------
r = await as(M1, `update public.session set title='Jazz' where id='${s1}'`); check("a musician playing (not the leader) can't change the title", !r.ok || r.n === 0, r);
r = await as(L, `update public.session set title='Jazz Café' where id='${s1}'`); check("the date's leader changes the title", r.ok && r.n === 1, r);

// ---------------------------------------------------------------------------
// 3. Confirm, undo, send
// ---------------------------------------------------------------------------
r = await fn(M1, "confirm_schedule_month"); check("a musician can't confirm", !r.ok, r);
r = await fn(P, "confirm_schedule_month"); check("the point person confirms: team confirmed", r.ok && (await stage()) === "team_confirmed", r);
r = await fn(P, "undo_confirm_schedule_month"); check("…and can undo it before sending", r.ok && (await stage()) === "team_editing", r);
r = await fn(P, "finalize_schedule_month"); check("final before sending is refused", !r.ok && /send the calendar/.test(r.err), r);
r = await fn(M1, "send_schedule_month"); check("a musician can't send the calendar", !r.ok, r);
r = await fn(M2, "schedule_month_send_info"); check("a musician can't read who the calendar goes to", !r.ok, r);
r = await fn(L, "send_schedule_month"); check("the Admin Lead sends (sending also confirms): sent to partner", r.ok && (await stage()) === "sent_to_partner", r);
check("…both dates are published", (await su(`select count(*)::int as n from public.session where id in ('${s1}','${s2}') and schedule_state='published'`))[0].n === 2);
r = await fn(L, "send_schedule_month"); check("sending twice is refused", !r.ok, r);
r = await fn(L, "undo_confirm_schedule_month"); check("no undo after sending", !r.ok, r);

// The first change after sending moves the month to partner changes.
r = await as(P, `update public.session set internal_note='Room may change' where id='${s2}'`);
check("a change after sending: partner changes", r.ok && (await stage()) === "partner_changes", r);

// ---------------------------------------------------------------------------
// 4. Final: locked for everyone but the point person and admins
// ---------------------------------------------------------------------------
r = await fn(L, "finalize_schedule_month"); check("the Admin Lead marks the month final", r.ok && (await stage()) === "final", r);
r = await as(L, `update public.session set title='Late change' where id='${s1}'`); check("after final, the Admin Lead can't change a date", !r.ok, r);
r = await as(L, `insert into public.session_assignment (session_id, person_id) values ('${s1}','${M2}')`); check("…or who plays", !r.ok, r);
r = await as(M1, `update public.session set internal_note='x' where id='${s1}'`); check("…nor can a musician", !r.ok || r.n === 0, r);
r = await as(P, `update public.session set internal_note='Partner moved it' where id='${s1}'`); check("the point person still can", r.ok && r.n === 1, r);
r = await as(A, `update public.session set internal_note='Admin fix' where id='${s1}'`); check("…and so can an admin", r.ok && r.n === 1, r);

// Deactivated point person (R9.5).
await su(`update public.person set active=false where id='${P}'`);
r = await as(P, `select public.open_schedule_month('${w.RES}','${w.S1}','${addDays(MONTH, 40)}')`); check("a deactivated point person can't open a month", !r.ok, r);
await su(`update public.person set active=true where id='${P}'`);

process.exit(T.summary("schedule-month") ? 1 : 0);
