// The database functions the phone app calls that had no tests of their own
// (Ryan's side, Nov 24). Most show personal or pay data, so these checks are
// about who may see what: documented minutes (pay), roster phone numbers,
// the staff directory, "Done reviewing" (schedule checks) and the Admin Lead
// test. Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays, weekStart } from "./money-harness.mjs";

const T = reporter();
const { check } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const w = await buildPlaces(env, addDays(TODAY, -120), addDays(TODAY, 150));
const { A, P, Q, L, M1, M2, X, O } = P_;
const rows = (r) => (r.ok ? r.rows : null);
const deactivate = (p) => su(`update public.person set active=false where id='${p}'`);
const reactivate = (p) => su(`update public.person set active=true where id='${p}'`);

await su(`update public.person set phone='555-0101' where id='${M1}'`);
await su(`update public.person set phone='555-0202', job_title='Program Director' where id='${P}'`);

// ---------------------------------------------------------------------------
// 1. documented_minutes: a musician's documented work for a week (pay)
// ---------------------------------------------------------------------------
const WK = weekStart(addDays(TODAY, -7));
await as(M1, `insert into public.relationship_activity (person_id,residency_id,site_id,occurred_on,kind,minutes) values ('${M1}','${w.RES}','${w.S1}','${addDays(WK, 1)}','one_to_one',30)`);
const dm = (who, person) => as(who, `select category, minutes from public.documented_minutes('${person}','${w.RES}','${WK}')`);
const rb = (r) => Number((rows(r) ?? []).find((x) => x.category === "Relationship Building")?.minutes ?? -1);
let r = await dm(M1, M1); check("a musician sees their own documented minutes", rb(r) === 30, r);
r = await dm(M2, M1); check("…but not another musician's", (rows(r) ?? []).length === 0, r);
r = await dm(P, M1); check("the point person sees them", rb(r) === 30, r);
r = await dm(Q, M1); check("another program's point person doesn't", (rows(r) ?? []).length === 0, r);
r = await dm(A, M1); check("an admin does", rb(r) === 30, r);
r = await dm(O, M1); check("an outsider doesn't", (rows(r) ?? []).length === 0, r);
await deactivate(M1);
r = await dm(M1, M1); check("a deactivated person doesn't see even their own (R9.5)", (rows(r) ?? []).length === 0, r);
await reactivate(M1);

// ---------------------------------------------------------------------------
// 2. residency_roster_contacts: roster phone numbers and instruments (v0.27)
// ---------------------------------------------------------------------------
const rc = (who) => as(who, `select * from public.residency_roster_contacts('${w.RES}')`);
r = await rc(M2); check("a roster musician sees the program's phone numbers", (rows(r) ?? []).some((x) => x.phone === "555-0101"), r);
check("…and never an email address", r.ok && r.rows.every((x) => !("email" in x)), r);
r = await rc(P); check("the point person sees them", (rows(r) ?? []).length > 0, r);
r = await rc(Q); check("another program's point person doesn't", (rows(r) ?? []).length === 0, r);
r = await rc(O); check("an outsider doesn't", (rows(r) ?? []).length === 0, r);
await deactivate(M2);
r = await rc(M2); check("a deactivated musician doesn't", (rows(r) ?? []).length === 0, r);
await reactivate(M2);
r = await as(null, `select * from public.residency_roster_contacts('${w.RES}')`); check("signed out: refused", !r.ok, r);

// ---------------------------------------------------------------------------
// 3. staff_directory: admins and current point people, for everyone signed in (v0.26)
// ---------------------------------------------------------------------------
r = await as(M1, `select person_id, phone from public.staff_directory()`);
const ids = (rows(r) ?? []).map((x) => x.person_id);
check("a musician sees the Iris staff (admins and point people)", ids.includes(A) && ids.includes(P), r);
check("…and no musicians' contact details (staff only)", !ids.includes(M2) && !ids.includes(L), ids);
await deactivate(O);
r = await as(O, `select * from public.staff_directory()`); check("a deactivated person sees nothing", (rows(r) ?? []).length === 0, r);
await reactivate(O);
r = await as(null, `select * from public.staff_directory()`); check("signed out: refused", !r.ok, r);

// ---------------------------------------------------------------------------
// 4. is_current_admin_lead
// ---------------------------------------------------------------------------
const lead = async (who) => (await as(who, `select public.is_current_admin_lead('${w.RES}') as v`)).rows?.[0]?.v;
check("the Admin Lead is recognized", (await lead(L)) === true);
check("a musician isn't", (await lead(M1)) === false);
await deactivate(L);
check("a deactivated Admin Lead isn't", (await lead(L)) === false);
await reactivate(L);

// ---------------------------------------------------------------------------
// 5. "Done reviewing" (mark_schedule_checked / undo_schedule_checked)
// ---------------------------------------------------------------------------
const next = new Date(`${TODAY}T12:00:00Z`); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
const MONTH = next.toISOString().slice(0, 10);
const s = (await su(`insert into public.session (residency_id, title, location_id, starts_at, scheduled_minutes)
  values ('${w.RES}','Music Café','${w.R1}','${MONTH.slice(0, 8)}12 14:00 America/New_York',60) returning id`))[0].id;
await su(`insert into public.session_assignment (session_id, person_id, role) values ('${s}','${L}','leader'),('${s}','${M1}','participant')`);
const mark = (who) => as(who, `select public.mark_schedule_checked('${w.RES}','${w.S1}','${MONTH}') as v`);
r = await mark(O); check("an outsider can't mark a month reviewed", !r.ok, r);
r = await mark(M2); check("a roster musician not playing that month can't", !r.ok, r);
r = await mark(M1); check("a musician playing that month marks it 'Done reviewing'", r.ok, r);
check("…recorded for M1 only", (await su(`select count(*)::int as n from public.schedule_check where person_id='${M1}'`))[0].n === 1);
r = await as(M1, `select public.undo_schedule_checked('${w.RES}','${w.S1}','${MONTH}')`); check("…and can undo it", r.ok && (await su(`select count(*)::int as n from public.schedule_check where person_id='${M1}'`))[0].n === 0, r);
await deactivate(M1);
r = await mark(M1); check("a deactivated musician can't", !r.ok, r);
await reactivate(M1);

process.exit(T.summary("phone-calls") ? 1 : 0);
