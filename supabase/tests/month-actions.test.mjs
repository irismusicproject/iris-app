// Tests for the monthly scheduling cycle, part 2 (migration
// 20261227120000_requests_absences_tasks, DOMAIN-MODEL v0.43): change
// requests, "I can't play", "I wasn't there", taking the lead to document,
// "Canceled day-of" and the To do list. Several of these change pay and
// partner billing, so the approved-weeks lock (v0.29) is checked on each
// (Ryan's side, Nov 24). Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays, weekStart } from "./money-harness.mjs";

const T = reporter();
const { check, knownBug, question } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const w = await buildPlaces(env, addDays(TODAY, -120), addDays(TODAY, 150));
const { A, P, L, M1, M2, O } = P_;

// Dates in the past (they happened) at Maple House, published, L leads, M1 plays.
// New dates start as drafts; publish them the way publishing does (iris.publishing).
const mk = async (title, d, time = "14:00") => {
  const id = (await su(`insert into public.session (residency_id, title, location_id, starts_at, scheduled_minutes)
    values ('${w.RES}','${title}','${w.R1}', '${d} ${time} America/New_York', 60) returning id`))[0].id;
  await su(`select set_config('iris.publishing', 'on', false)`);
  await su(`update public.session set schedule_state='published' where id='${id}'`);
  await su(`select set_config('iris.publishing', 'off', false)`);
  return id;
};
const staff = (s) => su(`insert into public.session_assignment (session_id, person_id, role) values ('${s}','${L}','leader'),('${s}','${M1}','participant')`);
const st = async (s, p) => (await su(`select status::text as status, role::text as role from public.session_assignment where session_id='${s}' and person_id='${p}'`))[0];
const call = (who, sql) => as(who, `select ${sql}`);

// ---------------------------------------------------------------------------
// 1. "I wasn't there" (mark_not_there)
// ---------------------------------------------------------------------------
const past1 = await mk("Music Café", addDays(TODAY, -3)); await staff(past1);
let r = await call(O, `public.mark_not_there('${past1}', true)`); check("someone not on the date can't mark it", !r.ok, r);
r = await call(M1, `public.mark_not_there('${past1}', true)`); check("M1 marks that they weren't there", r.ok && (await st(past1, M1)).status === "absent", r);
r = await call(M1, `public.mark_not_there('${past1}', false)`); knownBug("MA2", "…and can undo their own mark ('I was there after all')", r.ok && (await st(past1, M1)).status === "assigned", r);
const future1 = await mk("Next week", addDays(TODAY, 5)); await staff(future1);
r = await call(M1, `public.mark_not_there('${future1}', true)`); check("a date that hasn't happened can't be marked 'wasn't there'", !r.ok, r);

// Pay loophole check: M1 named a sub (M2) for the date (D11), so M2 is paid for it.
// Can M1 then mark that they WERE there, so both are paid and both billed?
const past2 = await mk("Sing-along", addDays(TODAY, -2)); await staff(past2);
await su(`update public.session_assignment set status='absent' where session_id='${past2}' and person_id='${M1}'`);
await su(`insert into public.session_assignment (session_id, person_id, role, status, substitute_for_id) values ('${past2}','${M2}','participant','substitute','${M1}')`);
r = await call(M1, `public.mark_not_there('${past2}', false)`);
const both = (await su(`select count(*)::int as n from public.session_assignment where session_id='${past2}' and status <> 'absent' and person_id in ('${M1}','${M2}')`))[0].n;
question("MQ2", "(open while MA2 blocks every undo) someone who named a sub can't mark themselves 'there' again while the sub still plays (both would be paid and billed)", !r.ok || both < 2, { r, playingCount: both });

// Approved weeks are final (v0.29).
const past3 = await mk("Jam", addDays(TODAY, -15)); await staff(past3);
const wk = weekStart(addDays(TODAY, -15));
await su(`insert into public.time_entry (person_id, residency_id, week_starting, time_category_id, hours, state, approved_by, approved_at)
          values ('${M1}','${w.RES}','${wk}','${w.CAT_PROG}',1,'approved','${P}',now())`);
r = await call(M1, `public.mark_not_there('${past3}', true)`); check("'wasn't there' is refused once the week is approved", !r.ok && /approved/.test(r.err), r);

// ---------------------------------------------------------------------------
// 2. Taking the lead to document (the leader wasn't there)
// ---------------------------------------------------------------------------
const past4 = await mk("Strings", addDays(TODAY, -1)); await staff(past4);
r = await call(M1, `public.take_lead_to_document('${past4}')`); check("while the leader played, nobody else takes the lead", !r.ok, r);
r = await call(L, `public.mark_not_there('${past4}', true)`); check("the leader marks that they weren't there", r.ok && (await st(past4, L)).role === "participant", r);
r = await call(O, `public.take_lead_to_document('${past4}')`); check("an outsider can't take the lead", !r.ok, r);
r = await call(M1, `public.take_lead_to_document('${past4}')`); check("M1, who played, takes the lead to document it", r.ok && (await st(past4, M1)).role === "leader", r);

// ---------------------------------------------------------------------------
// 3. "Canceled day-of" (cancel_day_of)
// ---------------------------------------------------------------------------
const past5 = await mk("Choir", addDays(TODAY, -1)); await staff(past5);
r = await call(M1, `public.cancel_day_of('${past5}', 'partner')`); check("a musician who isn't the leader can't record it", !r.ok, r);
r = await call(L, `public.cancel_day_of('${future1}', 'partner')`); check("a later date can't be canceled 'day-of'", !r.ok, r);
r = await call(L, `public.cancel_day_of('${past5}', null)`); check("a reason is required", !r.ok, r);
r = await call(L, `public.cancel_day_of('${past5}', 'partner')`);
const c = (await su(`select schedule_state::text as s, cancellation_reason::text as why, canceled_at = starts_at as at_start from public.session where id='${past5}'`))[0];
check("the leader records it: No Program, reason kept, counted at the start time (v0.43)", r.ok && c.s === "canceled" && c.why === "partner" && c.at_start, { r, c });
question("MQ1", "a musician's chosen reason ('partner') makes the partner billable for a late cancellation without the point person confirming it", false, c);
const past6 = await mk("Bells", addDays(TODAY, -15)); await staff(past6);
r = await call(L, `public.cancel_day_of('${past6}', 'weather')`); check("…not in a week that's approved (M1's week)", !r.ok && /approved/.test(r.err), r);

// ---------------------------------------------------------------------------
// 4. Change requests
// ---------------------------------------------------------------------------
const future2 = await mk("Later", addDays(TODAY, 8)); await staff(future2);
r = await call(O, `public.request_change('${future2}', 'sub', '${M2}', 'out of town')`); check("only a musician playing the date can ask", !r.ok, r);
r = await call(M1, `public.request_change('${future2}', 'sub', '${O}', 'out of town')`); check("a sub must be on the season's roster", !r.ok, r);
r = await call(M1, `public.request_change('${future2}', 'sub', '${M2}', 'out of town') as id`);
const REQ = r.rows?.[0]?.id;
check("M1 asks for M2 to sub", r.ok && !!REQ, r);
r = await call(M1, `public.decide_change_request('${REQ}', true)`); check("a musician can't approve their own request", !r.ok, r);
r = await call(L, `public.decide_change_request('${REQ}', true)`); check("the Admin Lead doesn't decide requests (point person, admins)", !r.ok, r);
r = await call(M2, `public.withdraw_change_request('${REQ}')`); check("only the requester can withdraw it", !r.ok, r);
r = await call(P, `public.decide_change_request('${REQ}', true, 'OK')`);
check("the point person approves: M2 plays as M1's sub", r.ok && (await st(future2, M2))?.status === "substitute", { r, m2: await st(future2, M2) });
r = await call(P, `public.decide_change_request('${REQ}', false)`); check("a decided request can't be decided again", !r.ok, r);

// ---------------------------------------------------------------------------
// 5. To do is private
// ---------------------------------------------------------------------------
r = await as(M1, `select * from public.my_tasks()`); check("M1 can read their own To do list", r.ok, r);
r = await as(null, `select * from public.my_tasks()`); check("signed out: no To do list", !r.ok || (r.rows ?? []).length === 0, r);

// Admins can still correct approved weeks (v0.29).
r = await as(A, `update public.session_assignment set status='absent' where session_id='${past3}' and person_id='${M1}'`);
check("an admin can still correct an approved week", r.ok && r.n === 1, r);

process.exit(T.summary("month-actions") ? 1 : 0);
