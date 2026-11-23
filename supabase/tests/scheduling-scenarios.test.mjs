// Whole-story scheduling scenarios, database only (no browser), as each
// persona: admin, point person, support staff, Admin Lead, roster musicians
// playing / not playing a date, a non-core substitute, an outsider, a point
// person of another program, someone who left the roster, a deactivated
// person, and anon.
//
// Source of truth: docs/DOMAIN-MODEL.md v0.23 (§3 "Who does what (v0.18)",
// Session, SessionAssignment, CalendarFeed, CalendarExport; §7). Expectations
// are computed from those rules in plain JavaScript, never read back from the
// SQL under test. Where the code breaks a documented rule the check is tagged
// KNOWN BUG; where the docs are ambiguous, QUESTION (see FINDINGS in
// scheduling-harness.mjs). Tagged checks are reported, not failed.
//
// Dates are relative to today, so the file keeps working as time passes.
// Run with: node supabase/tests/scheduling-scenarios.test.mjs
import { createDb, runner, checker, addMonths, addDays, lastDay, seriesDates, isoDow } from "./scheduling-harness.mjs";

const db = await createDb();
const { as, su } = runner(db);
const { check, flag, summary } = checker();
const ok = async (uid, sql) => { const r = await as(uid, sql); if (!r.ok) throw new Error(`setup failed (${uid}): ${sql}\n${r.err}`); return r; };
const ins = async (sql) => (await su(sql))[0].id;
let r;

// ---------------------------------------------------------------------------
// Dates (relative to today). The season runs from last month to B+3, so it
// has past dates (for "from today on") and future months to publish.
// ---------------------------------------------------------------------------
const TODAY = (await su(`select current_date::text as d`))[0].d;
const THIS = TODAY.slice(0, 8) + "01";
const PREV = addMonths(THIS, -1);
const B = addMonths(THIS, 2), B1 = addMonths(B, 1), B2 = addMonths(B, 2), B3 = addMonths(B, 3);
const END = lastDay(B3);
const SEASON_MONTHS = [PREV, THIS, addMonths(THIS, 1), B, B1, B2, B3];
const Y = Number(B.slice(0, 4)) + 1; // a whole future year for the time-zone residency
const NY = "America/New_York";
console.log(`today ${TODAY}; season ${PREV}..${END}; main month B=${B}; time-zone year ${Y}`);

// ---------------------------------------------------------------------------
// People (all made up)
// ---------------------------------------------------------------------------
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = id(1), P = id(2), P2 = id(3), Q = id(4), L = id(5), M1 = id(6), M2 = id(7), M3 = id(8),
  S = id(9), O = id(10), X = id(11), LF = id(12), N = id(13), T = id(14);
const people = [[A, "Ada Admin", "{admin}"], [P, "Pat Point", "{}"], [P2, "Sue Support", "{}"], [Q, "Quinn Elsewhere", "{}"],
  [L, "Lee Lead", "{}"], [M1, "Mia One", "{}"], [M2, "Mo Two", "{}"], [M3, "Max Three", "{}"], [S, "Sam Sub", "{}"],
  [O, "Oli Outside", "{}"], [X, "Xan Former", "{}"], [LF, "Liv Left", "{}"], [N, "Nia Other", "{}"], [T, "Tam Zone", "{}"]];
await su(`insert into auth.users values ${people.map(([u, n]) => `('${u}','${n.split(" ")[0].toLowerCase()}@example.org')`).join(",")};
insert into public.person (id,name,email,employment_type,system_roles) values
${people.map(([u, n, ro]) => `('${u}','${n}','${n.split(" ")[0].toLowerCase()}@example.org','contractor_1099','${ro}')`).join(",\n")};`);

// ---- Places and programs (set up as the database owner; admin permissions
// for these tables are covered by rls.test.mjs and scheduling.test.mjs)
const PT = await ins(`insert into public.partner (legal_name,display_name) values ('Example Living Inc.','Example Living') returning id`);
const SITE = await ins(`insert into public.site (partner_id,name,display_name,timezone) values ('${PT}','Maple House','Maple House','${NY}') returning id`);
const R1 = await ins(`insert into public.location (site_id,name,display_name) values ('${SITE}','Library','Library') returning id`);
const R2 = await ins(`insert into public.location (site_id,name,display_name) values ('${SITE}','Lounge','Lounge') returning id`);
const PT2 = await ins(`insert into public.partner (legal_name,display_name) values ('Other Org','Other Org') returning id`);
const SITE2 = await ins(`insert into public.site (partner_id,name,display_name,timezone) values ('${PT2}','Elm Court','Elm Court','${NY}') returning id`);
const R9 = await ins(`insert into public.location (site_id,name,display_name) values ('${SITE2}','Hall','Hall') returning id`);

const RES = await ins(`insert into public.residency (partner_id,name,display_name,status) values ('${PT}','Example Maple','Iris Music Project at Maple House','active') returning id`);
await su(`insert into public.residency_site values ('${RES}','${SITE}')`);
const SEA = await ins(`insert into public.season (residency_id,name,starts_on,ends_on) values ('${RES}','Test season','${PREV}','${END}') returning id`);
await su(`insert into public.roster_member (season_id,person_id,is_core,is_admin_lead,joined_on) values
  ('${SEA}','${L}',true,true,'${PREV}'),('${SEA}','${M1}',true,false,'${PREV}'),('${SEA}','${M2}',true,false,'${PREV}'),
  ('${SEA}','${M3}',true,false,'${PREV}'),('${SEA}','${X}',true,false,'${PREV}');
insert into public.roster_member (season_id,person_id,is_core,joined_on,left_on) values ('${SEA}','${LF}',true,'${PREV}','${addDays(TODAY, -1)}');
insert into public.staff_assignment (residency_id,person_id,role,starts_on) values
  ('${RES}','${P}','point_person','${PREV}'),('${RES}','${P2}','support','${PREV}');`);

const RES2 = await ins(`insert into public.residency (partner_id,name,display_name,status) values ('${PT2}','Other Elm','Iris at Elm Court','active') returning id`);
await su(`insert into public.residency_site values ('${RES2}','${SITE2}')`);
const SEA2 = await ins(`insert into public.season (residency_id,name,starts_on,ends_on) values ('${RES2}','Other season','${PREV}','${END}') returning id`);
await su(`insert into public.roster_member (season_id,person_id,joined_on) values ('${SEA2}','${N}','${PREV}');
insert into public.staff_assignment (residency_id,person_id,role,starts_on) values ('${RES2}','${Q}','point_person','${PREV}');`);
// X was on the roster and is now deactivated.
await su(`update public.person set active=false where id='${X}'`);

// Helpers that read the truth as the database owner.
const monthSql = (first, tz = NY) => `date_trunc('month', starts_at at time zone '${tz}')::date = '${first}'`;
async function sessionsOf(series, first, tz = NY) {
  return (await su(`select id, (starts_at at time zone '${tz}')::date::text as d from public.session where series_id='${series}' and ${monthSql(first, tz)} order by starts_at`));
}
async function leadersOf(session) {
  return (await su(`select person_id from public.session_assignment where session_id='${session}' and role='leader' and status<>'absent' order by person_id`)).map((x) => x.person_id);
}
async function stateOf(session) { return (await su(`select schedule_state, cancellation_reason, canceled_at, title from public.session where id='${session}'`))[0]; }
const list = (ids) => ids.map((x) => `'${x}'`).join(",");

// ===========================================================================
// 1. Setting up programs (Series): point person and admins only (v0.18)
// ===========================================================================
const cafeDef = { weekdays: [2, 4], from: PREV };
const seriesInsert = (who, title, extra) => as(who, `insert into public.series (residency_id,title,default_location_id,weekdays,start_time,minutes,active_from${extra?.cols ?? ""})
  values ('${RES}','${title}','${extra?.loc ?? R1}','${extra?.weekdays ?? "{2,4}"}',${extra?.time ?? "'14:00'"},${extra?.minutes ?? 45},'${PREV}'${extra?.vals ?? ""}) returning id`);
for (const [who, label] of [[L, "Admin Lead"], [M1, "roster musician"], [O, "outsider"], [Q, "another program's point person"], [P2, "support staff"], [X, "deactivated person"], [null, "anon"]]) {
  r = await seriesInsert(who, "Music Café");
  check(`v0.18: ${label} can't set up a weekly program`, !r.ok, r);
}
r = await seriesInsert(P, "Music Café", { loc: R9 }); check("a program's room must be at one of its sites", !r.ok, r);
r = await seriesInsert(P, "Music Café"); check("point person sets up a weekly program (Tue/Thu 2 pm)", r.ok, r);
const CAFE = r.rows?.[0]?.id;
r = await as(P, `insert into public.series_default_person values ('${CAFE}','${M1}'),('${CAFE}','${M2}')`); check("point person sets the usual musicians", r.ok, r);
r = await as(L, `insert into public.series_default_person values ('${CAFE}','${M3}')`); check("Admin Lead can't change usual musicians", !r.ok, r);
r = await as(P, `insert into public.series_default_person values ('${CAFE}','${O}')`);
check("usual musicians must be on the roster (outsider refused)", !r.ok, r) /* fixed K1, migration 20261209 */;
if (r.ok) await su(`delete from public.series_default_person where series_id='${CAFE}' and person_id='${O}'`);

// Monthly programs (v0.18): the 1st-4th of one weekday.
r = await seriesInsert(P, "Fourth Monday Sing", { weekdays: "{1}", time: "'13:30'", minutes: 60, cols: ",recurrence,week_of_month", vals: ",'monthly',4" });
check("point person sets up a monthly program (4th Monday 1:30)", r.ok, r); const SING = r.rows?.[0]?.id;
const singDef = { weekdays: [1], from: PREV, week_of_month: 4 };
r = await seriesInsert(P, "Bad monthly", { weekdays: "{1,3}", cols: ",recurrence,week_of_month", vals: ",'monthly',1" }); check("a monthly program has exactly one weekday", !r.ok, r);
r = await seriesInsert(P, "Bad monthly", { weekdays: "{1}", cols: ",recurrence,week_of_month", vals: ",'monthly',5" }); check("there's no 5th-weekday monthly program", !r.ok, r);
r = await seriesInsert(P, "Bad monthly", { weekdays: "{1}", cols: ",recurrence", vals: ",'monthly'" }); check("a monthly program needs its week of the month", !r.ok, r);
r = await seriesInsert(L, "Sing", { weekdays: "{1}", cols: ",recurrence,week_of_month", vals: ",'monthly',1" }); check("Admin Lead can't set up a monthly program", !r.ok, r);
await ok(P, `insert into public.series_default_person values ('${SING}','${M2}'),('${SING}','${M3}')`);
await ok(P, `update public.series set default_leader_id='${M3}' where id='${SING}'`);

r = await seriesInsert(P, "Open Rehearsal", { weekdays: "{3}", time: "'10:00'", minutes: 60 }); const OPEN = r.rows?.[0]?.id;
const openDef = { weekdays: [3], from: PREV };
await ok(P, `insert into public.series_default_person values ('${OPEN}','${M1}'),('${OPEN}','${M3}')`);
r = await as(P, `insert into public.series (residency_id,kind,title,default_location_id,weekdays,active_from) values ('${RES}','relationship_building','Lessons','${R2}','{2}','${PREV}') returning id`);
check("point person sets up weekly Lessons with no set time", r.ok, r); const LES = r.rows?.[0]?.id;
const lesDef = { weekdays: [2], from: PREV };
await ok(P, `insert into public.series_default_person values ('${LES}','${M1}')`);
const DEFS = [[CAFE, cafeDef], [SING, singDef], [OPEN, openDef], [LES, lesDef]];

// Usual leader before filling (v0.15/v0.16).
r = await as(L, `select public.set_series_leader('${CAFE}','${M1}')`); check("Admin Lead can't set a program's season leader", !r.ok, r);
r = await as(M1, `select public.set_series_leader('${CAFE}','${M1}')`); check("musician can't set a program's season leader", !r.ok, r);
r = await as(P, `select public.set_series_leader('${CAFE}','${M1}') as n`); check("point person sets the usual leader before any dates exist (0 dates changed)", r.ok && r.rows[0].n === 0, r);

// ===========================================================================
// 2. Filling a month, all programs at once, and the whole season
// ===========================================================================
for (const [who, label] of [[L, "Admin Lead"], [M1, "musician"], [O, "outsider"], [Q, "other program's point person"], [P2, "support staff"]]) {
  r = await as(who, `select public.generate_series_month('${CAFE}','${B}')`); check(`${label} can't fill a program's month`, !r.ok, r);
  r = await as(who, `select public.generate_residency_month('${RES}','${B}')`); check(`${label} can't fill all programs for a month`, !r.ok, r);
  r = await as(who, `select public.generate_season('${SEA}')`); check(`${label} can't fill the season`, !r.ok, r);
}
const expect = (def, m) => seriesDates(def, m).length;
r = await as(P, `select public.generate_series_month('${CAFE}','${PREV}') as n`);
check(`point person fills last month's Music Café (${expect(cafeDef, PREV)} Tue/Thu)`, r.ok && r.rows[0].n === expect(cafeDef, PREV), r);
r = await as(P, `select public.generate_series_month('${SING}','${B}') as n`); check("monthly program fills exactly one date", r.ok && r.rows[0].n === 1, r);
const singB = await sessionsOf(SING, B);
check("…on the 4th Monday", singB.length === 1 && singB[0].d === seriesDates(singDef, B)[0] && isoDow(singB[0].d) === 1 && Number(singB[0].d.slice(8)) >= 22, singB);
r = await as(P, `select public.generate_series_month('${CAFE}','${B}') as n`);
check(`point person fills Music Café for month B (${expect(cafeDef, B)})`, r.ok && r.rows[0].n === expect(cafeDef, B), r);
const wantB1 = DEFS.reduce((t, [, d]) => t + expect(d, B1), 0);
r = await as(P, `select public.generate_residency_month('${RES}','${B1}') as n`); check(`fill month B+1 for every program at once (${wantB1})`, r.ok && r.rows[0].n === wantB1, r);
const created = expect(cafeDef, PREV) + 1 + expect(cafeDef, B) + wantB1;
const wantAll = DEFS.reduce((t, [, d]) => t + SEASON_MONTHS.reduce((u, m) => u + expect(d, m), 0), 0);
r = await as(P, `select public.generate_season('${SEA}') as n`); check(`fill the whole season adds the rest (${wantAll - created})`, r.ok && r.rows[0].n === wantAll - created, r);
r = await as(P, `select public.generate_season('${SEA}') as n`); check("filling the season again adds nothing", r.ok && r.rows[0].n === 0, r);
r = await as(A, `select public.generate_residency_month('${RES}','${B}') as n`); check("an admin can fill a month too (nothing left to add)", r.ok && r.rows[0].n === 0, r);
let countsOk = true; const countDetail = [];
for (const [sid, def] of DEFS) for (const m of SEASON_MONTHS) {
  const got = (await sessionsOf(sid, m)).map((x) => x.d), want = seriesDates(def, m);
  if (JSON.stringify(got) !== JSON.stringify(want)) { countsOk = false; countDetail.push({ sid, m, got, want }); }
}
check("every program has exactly its documented dates in every season month", countsOk, countDetail);
r = await su(`select bool_and(schedule_state='draft') as ok from public.session where residency_id='${RES}'`); check("everything filled is a draft", r[0].ok === true, r);
r = await su(`select bool_and((starts_at at time zone '${NY}')::time = '14:00' and scheduled_minutes=45 and has_set_time) as ok from public.session where series_id='${CAFE}'`);
check("Music Café dates are 2:00 pm site time, 45 minutes", r[0].ok === true, r);
r = await su(`select bool_and(not has_set_time and scheduled_minutes is null and kind='relationship_building') as ok from public.session where series_id='${LES}'`);
check("Lessons dates have no set time and no length", r[0].ok === true, r);
r = await su(`select count(*)::int as n from public.session s where series_id='${CAFE}' and (select count(*) from public.session_assignment a where a.session_id=s.id and a.role='leader') <> 1`);
check("every Music Café date got the usual leader", r[0].n === 0, r);
r = await su(`select count(*)::int as n from public.session s where series_id='${OPEN}' and exists (select 1 from public.session_assignment a where a.session_id=s.id and a.role='leader')`);
check("a program without a usual leader is left without leaders", r[0].n === 0, r);
r = await su(`select count(*)::int as n from public.session_assignment a join public.session s on s.id=a.session_id where s.series_id='${CAFE}' and a.person_id not in ('${M1}','${M2}')`);
check("only the usual musicians were added", r[0].n === 0, r);

// Season leader after filling (v0.16): every draft date from today on; earlier dates keep theirs.
const cafeAll = await su(`select id, (starts_at at time zone '${NY}')::date::text as d from public.session where series_id='${CAFE}' order by starts_at`);
const future = cafeAll.filter((x) => x.d > TODAY), past = cafeAll.filter((x) => x.d < TODAY);
r = await as(P, `select public.set_series_leader('${CAFE}','${M2}') as n`);
check("point person sets Mo as Music Café's season leader", r.ok, r);
let futOk = true, pastOk = true;
for (const s of future) if (JSON.stringify(await leadersOf(s.id)) !== JSON.stringify([M2])) futOk = false;
for (const s of past) if (JSON.stringify(await leadersOf(s.id)) !== JSON.stringify([M1])) pastOk = false;
check(`all ${future.length} later dates now led by Mo`, futOk, null);
check(`the ${past.length} earlier dates keep their leader`, past.length > 0 && pastOk, past.length);
r = await su(`select count(*)::int as n from public.session_assignment a join public.session s on s.id=a.session_id where s.series_id='${CAFE}' and a.person_id='${M1}' and (s.starts_at at time zone '${NY}')::date > '${TODAY}' and a.role='participant'`);
check("the previous leader stays on as a participant", r[0].n === future.length, r);

// ===========================================================================
// 3. Musicians edit DRAFT dates they play in (v0.18)
// ===========================================================================
const cafeB = (await sessionsOf(CAFE, B)).map((x) => x.id);
const openB = (await sessionsOf(OPEN, B)).map((x) => x.id);
const d0 = cafeB[0];
r = await as(M1, `update public.session set title='Music Café: Motown' where id='${d0}'`); check("musician playing a draft edits its title", r.ok && r.n === 1, r);
r = await as(M1, `update public.session set location_id='${R2}' where id='${d0}'`); check("…its room", r.ok && r.n === 1, r);
r = await as(M1, `update public.session set internal_note='Bring the songbooks' where id='${d0}'`); check("…its notes", r.ok && r.n === 1, r);
r = await as(M1, `update public.session set location_id='${R9}' where id='${d0}'`); check("…but not to another partner's room", !r.ok, r);
for (const [col, val, label] of [["public_note", "'x'", "partner-facing note"], ["billable", "false", "billable"], ["starts_at", "starts_at + interval '1 hour'", "time of a regular date"],
  ["scheduled_minutes", "60", "length of a regular date"], ["is_special_event", "true", "special-event flag"], ["is_extra", "true", "extra flag"]]) {
  r = await as(M1, `update public.session set ${col}=${val} where id='${d0}'`); check(`musician can't change the ${label}`, !r.ok, r);
}
for (const [who, label] of [[M3, "roster musician not playing that date"], [L, "Admin Lead not playing that date"], [O, "outsider"], [X, "deactivated roster musician"], [LF, "musician who left the roster"], [P2, "support staff"]]) {
  r = await as(who, `update public.session set title='Nope' where id='${d0}'`); check(`${label} edits nothing (0 rows)`, r.ok && r.n === 0, r);
}
flag("Q8", "§7 says the Admin Lead edits draft sessions; v0.18 (and the code) says only drafts they play in");
r = await as(null, `update public.session set title='Nope' where id='${d0}'`); check("anon edits nothing", !r.ok || r.n === 0, r);
r = await as(M1, `insert into public.session_assignment (session_id,person_id) values ('${d0}','${M3}') returning id`); check("musician adds a roster musician to a draft they play in", r.ok, r);
const asgM3 = r.rows?.[0]?.id;
r = await as(M1, `insert into public.session_assignment (session_id,person_id) values ('${d0}','${O}')`); check("…but not someone off the roster", !r.ok, r);
r = await as(M3, `insert into public.session_assignment (session_id,person_id) values ('${cafeB[1]}','${M3}')`); check("musician can't add themselves to a draft they don't play in", !r.ok, r);
const auditBefore = (await su(`select count(*)::int as n from public.audit_log where row_id='${asgM3}'`))[0].n;
r = await as(M3, `delete from public.session_assignment where id='${asgM3}'`); check("musician removes themselves (a participant) from a draft", r.ok && r.n === 1, r);
const auditAfter = (await su(`select count(*)::int as n from public.audit_log where row_id='${asgM3}'`))[0].n;
check("removing a musician from a draft is logged", auditAfter > auditBefore, { auditBefore, auditAfter }, "Q6");
r = await as(M1, `delete from public.session_assignment where session_id='${d0}' and person_id='${M2}'`); check("musician can't remove the leader (0 rows)", r.ok && r.n === 0, r);
r = await as(M1, `update public.session_assignment set status='absent' where session_id='${d0}' and person_id='${M1}'`); check("musician can't change a status directly", !r.ok, r);

// Pick or swap the leader (after the point person set it).
const d1 = cafeB[1];
r = await as(M1, `update public.session_assignment set role='leader' where session_id='${d1}' and person_id='${M1}'`); check("two leaders on one date are refused", !r.ok, r);
r = await as(M3, `update public.session_assignment set role='participant' where session_id='${d1}' and person_id='${M2}'`); check("musician not on the date can't touch its leader (0 rows)", r.ok && r.n === 0, r);
r = await as(M1, `update public.session_assignment set role='participant' where session_id='${d1}' and person_id='${M2}'`);
const r2 = await as(M1, `update public.session_assignment set role='leader' where session_id='${d1}' and person_id='${M1}'`);
check("musician swaps the leader to themselves (demote, then promote)", r.ok && r.n === 1 && r2.ok && r2.n === 1 && JSON.stringify(await leadersOf(d1)) === JSON.stringify([M1]), [r, r2]);

// Q1: naming a leader where the point person hasn't set one.
r = await as(M1, `update public.session_assignment set role='leader' where session_id='${openB[0]}' and person_id='${M1}'`);
check("musician can't name a leader before the point person has (Open Rehearsal)", r.ok && r.n === 0 || !r.ok, r, "Q1");
r = await as(P, `update public.session_assignment set role='leader' where person_id='${M1}' and session_id in (${list(openB)})`);
check(`point person sets the Open Rehearsal leaders (${openB.length})`, r.ok && r.n === openB.length, r);

// Special events: the Admin Lead adds them; musicians playing them move date and time.
const evDay = addDays(B, 19);
r = await as(M1, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes,is_special_event) values ('${RES}','Concert','${R1}',timestamp '${evDay} 19:00' at time zone '${NY}',90,true)`);
check("musician can't add a session", !r.ok, r);
r = await as(L, `insert into public.session (residency_id,series_id,title,location_id,starts_at,scheduled_minutes) values ('${RES}','${CAFE}','Extra café','${R1}',timestamp '${evDay} 10:00' at time zone '${NY}',45)`);
check("Admin Lead can't add dates to a weekly program", !r.ok, r);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes,is_special_event) values ('${RES}','Spring Concert','${R1}',timestamp '${evDay} 19:00' at time zone '${NY}',90,true) returning id`);
check("Admin Lead adds a one-time special event (draft)", r.ok, r); const EV = r.rows?.[0]?.id;
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes) values ('${RES}','x','${R9}',now(),45)`); check("…not in another partner's room", !r.ok, r);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes,schedule_state) values ('${RES}','x','${R1}',now(),45,'published')`); check("a new session can't start published", !r.ok, r);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes) values ('${RES2}','x','${R9}',now(),45)`); check("Admin Lead can't add events to another program", !r.ok, r);
r = await as(L, `insert into public.session_assignment (session_id,person_id,role) values ('${EV}','${M1}','leader'),('${EV}','${M2}','participant')`);
check("Admin Lead staffs the new event (nobody on it yet)", r.ok, r);
r = await as(M2, `update public.session set starts_at = starts_at + interval '1 day 30 minutes', scheduled_minutes=120 where id='${EV}'`); check("musician playing a special event moves its date and time", r.ok && r.n === 1, r);
r = await as(M3, `update public.session set starts_at = starts_at + interval '1 hour' where id='${EV}'`); check("musician not playing it can't (0 rows)", r.ok && r.n === 0, r);
r = await as(M2, `update public.session set starts_at = starts_at + interval '2 years' where id='${EV}'`);
check("a special event can't move to a date outside its musicians' season", !r.ok || r.n === 0, r) /* fixed K5, migration 20261209 */;
if (r.ok && r.n === 1) await su(`update public.session set starts_at = starts_at - interval '2 years' where id='${EV}'`);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes) values ('${RES}','Pop-up Choir','${R2}',timestamp '${addDays(B, 20)} 15:00' at time zone '${NY}',45) returning id`);
const EV2 = r.rows?.[0]?.id;
r = await as(M3, `insert into public.session_assignment (session_id,person_id) values ('${EV2}','${M3}')`);
check("roster musician can't put themselves on an empty draft they don't play in", !r.ok, r, "Q2");
await ok(P, `insert into public.session_assignment (session_id,person_id,role) values ('${EV2}','${M3}','leader') on conflict (session_id,person_id) do update set role='leader'`);
r = await as(P, `insert into public.session_assignment (session_id,person_id) values ('${EV2}','${X}') returning id`);
check("a deactivated musician (still on the roster) can't be put on a date", !r.ok, r, "Q9");
if (r.ok) await su(`delete from public.session_assignment where id='${r.rows[0].id}'`);

// ===========================================================================
// 4. "No Program" and restoring (v0.17, v0.18, D11)
// ===========================================================================
const d2 = cafeB[2], d3 = cafeB[3], d4 = cafeB[4];
r = await as(M2, `update public.session set schedule_state='canceled', cancellation_reason='musician' where id='${d2}'`);
check("the draft date's leader makes it No Program", r.ok && r.n === 1, r);
let st = await stateOf(d2); check("…canceled, with the reason and a time stamp", st.schedule_state === "canceled" && st.cancellation_reason === "musician" && st.canceled_at, st);
r = await as(M2, `update public.session set schedule_state='draft' where id='${d2}'`); check("the leader can't restore it (0 rows)", r.ok && r.n === 0, r);
r = await as(M1, `update public.session set schedule_state='draft' where id='${d2}'`); check("another musician on it can't restore it (0 rows)", r.ok && r.n === 0, r);
r = await as(P, `update public.session set schedule_state='draft' where id='${d2}'`); check("point person restores it", r.ok && r.n === 1, r);
st = await stateOf(d2); check("…back to draft, reason and time cleared", st.schedule_state === "draft" && st.cancellation_reason === null && st.canceled_at === null, st);
check("…with its musicians and leader", JSON.stringify(await leadersOf(d2)) === JSON.stringify([M2]) && (await su(`select count(*)::int as n from public.session_assignment where session_id='${d2}'`))[0].n === 2, null);
r = await su(`select actor_id, before->>'schedule_state' as b, after->>'schedule_state' as a from public.audit_log where table_name='session' and row_id='${d2}' order by id desc limit 1`);
check("…and the restore is logged with who did it", r[0]?.actor_id === P && r[0]?.b === "canceled" && r[0]?.a === "draft", r);

r = await as(M1, `update public.session set schedule_state='canceled', cancellation_reason='musician' where id='${d3}'`); check("a musician who isn't the leader can't make it No Program", !r.ok, r);
r = await as(M3, `update public.session set schedule_state='canceled', cancellation_reason='musician' where id='${d3}'`); check("a musician not on it can't either (0 rows)", r.ok && r.n === 0, r);
r = await as(M2, `update public.session set schedule_state='canceled', cancellation_reason='partner', canceled_at='2000-01-01' where id='${d3}' returning canceled_at > now() - interval '5 minutes' as fresh`);
check("the leader makes another date No Program", r.ok && r.n === 1, r);
check("…and can't type in when it was canceled (canceled_at is the recording time)", r.ok && r.rows[0]?.fresh === true, r) /* fixed K3, migration 20261209 */;
r = await as(L, `update public.session set schedule_state='draft' where id='${d3}'`); check("the Admin Lead restores a No Program date (v0.17)", r.ok && r.n === 1, r);
r = await as(L, `update public.session set schedule_state='canceled', cancellation_reason='musician' where id='${d4}'`);
check("the Admin Lead (not playing) cancels a draft date for a planned absence (D11)", r.ok && r.n === 1, r, "Q3");
if (!(r.ok && r.n === 1)) {
  r = await as(P, `update public.session set schedule_state='canceled' where id='${d4}'`); check("cancel needs a reason", !r.ok, r);
  r = await as(P, `update public.session set schedule_state='canceled', cancellation_reason='musician' where id='${d4}'`); check("point person makes a draft date No Program (planned absence)", r.ok && r.n === 1, r);
}

// ===========================================================================
// 5. Review → publish (D5, v0.18)
// ===========================================================================
const markRev = (who, m = B, site = SITE, res = RES) => as(who, `select public.mark_month_reviewed('${res}','${site}','${m}') as id`);
const publish = (who, m = B, site = SITE, res = RES) => as(who, `select public.publish_month('${res}','${site}','${m}') as id`);
const newVer = (who, m = B, fb = null, site = SITE, res = RES) => as(who, `select public.new_calendar_version('${res}','${site}','${m}',${fb ? `'${fb}'` : "null"}) as id`);
r = await publish(L); check("can't publish before review", !r.ok && /review/.test(r.err), r);
for (const [who, label] of [[L, "Admin Lead"], [M1, "musician"], [Q, "other program's point person"], [P2, "support staff"], [O, "outsider"]]) {
  r = await markRev(who); check(`${label} can't mark the month reviewed`, !r.ok, r);
}
r = await markRev(P); check("point person marks the month reviewed", r.ok, r);
r = await su(`select version, state, reviewed_by, reviewed_at is not null as at, generated_at from public.calendar_export where residency_id='${RES}' and month='${B}'`);
check("…version 1, state reviewed, reviewed by the point person, not generated", r.length === 1 && r[0].version === 1 && r[0].state === "reviewed" && r[0].reviewed_by === P && r[0].at && r[0].generated_at === null, r);
r = await markRev(P); check("…only once", !r.ok, r);
r = await as(P, `update public.session_assignment set role='participant' where session_id='${cafeB[5]}' and role='leader'`); check("point person takes a leader off before publishing", r.ok && r.n === 1, r);
r = await publish(L); check("publishing refuses a group session with no leader", !r.ok && /leader/.test(r.err), r);
await ok(P, `update public.session_assignment set role='leader' where session_id='${cafeB[5]}' and person_id='${M2}'`);
for (const [who, label] of [[M1, "musician"], [O, "outsider"], [P2, "support staff"], [Q, "other program's point person"], [X, "deactivated person"]]) {
  r = await publish(who); check(`${label} can't publish`, !r.ok, r);
}
const bAll = await su(`select id, schedule_state from public.session where residency_id='${RES}' and ${monthSql(B)}`);
r = await publish(L); check("the Admin Lead clicks Publish and download", r.ok, r);
const bAfter = await su(`select id, schedule_state from public.session where residency_id='${RES}' and ${monthSql(B)}`);
check("every draft of the month is published; No Program dates stay canceled",
  bAfter.every((x) => x.schedule_state === (bAll.find((y) => y.id === x.id).schedule_state === "canceled" ? "canceled" : "published")), bAfter);
r = await su(`select count(*)::int as n from public.session where residency_id='${RES}' and ${monthSql(B1)} and schedule_state<>'draft'`); check("next month is untouched", r[0].n === 0, r);
r = await su(`select state, generated_by, sent_at is not null as sent from public.calendar_export where residency_id='${RES}' and month='${B}'`);
check("version 1 is now sent, generated by the Admin Lead", r.length === 1 && r[0].state === "sent" && r[0].generated_by === L && r[0].sent, r);
r = await su(`select count(*)::int as n from public.session s where residency_id='${RES}' and schedule_state='published' and kind='group_session'
  and (select count(*) from public.session_assignment a where a.session_id=s.id and a.role='leader' and a.status<>'absent') <> 1`);
check("every published group session has exactly one playing leader", r[0].n === 0, r);
r = await publish(L); check("can't publish twice", !r.ok, r);
r = await as(P, `update public.session set schedule_state='draft' where id='${cafeB[6]}'`); check("published can't go back to draft", !r.ok, r);
r = await as(M1, `update public.session set title='Late change' where id='${cafeB[6]}'`); check("musicians can't edit once published (0 rows)", r.ok && r.n === 0, r);
r = await as(M1, `insert into public.session_assignment (session_id,person_id) values ('${cafeB[6]}','${M3}')`); check("…can't add musicians", !r.ok, r);
r = await as(M1, `delete from public.session_assignment where session_id='${cafeB[6]}' and person_id='${M1}'`); check("…can't remove themselves", r.ok && r.n === 0, r);
r = await as(M1, `update public.session_assignment set role='leader' where session_id='${cafeB[6]}' and person_id='${M1}'`); check("…can't change the leader", r.ok && r.n === 0, r);
r = await as(A, `delete from public.session_assignment where session_id='${cafeB[6]}'`); check("even admins can't remove musicians from a published date (0 rows)", r.ok && r.n === 0, r);
r = await as(M1, `insert into public.calendar_export (residency_id,site_id,month,version,state,generated_at) values ('${RES}','${SITE}','${B}',9,'sent',now())`); check("nobody writes calendar versions directly", !r.ok, r);
r = await as(A, `update public.calendar_export set version=7`); check("nobody edits calendar versions directly", !r.ok || r.n === 0, r);

// ===========================================================================
// 6. The Admin Lead updates published dates (v0.18)
// ===========================================================================
const d6 = cafeB[6], d7 = cafeB[7];
r = await as(L, `update public.session set starts_at=starts_at + interval '30 minutes', location_id='${R2}', title='Café in the Lounge', public_note='Moved to the Lounge', internal_note='partner asked' where id='${d6}'`);
check("Admin Lead changes a published date's time, room, title and notes", r.ok && r.n === 1, r);
r = await su(`select actor_id from public.audit_log where table_name='session' and row_id='${d6}' order by id desc limit 1`); check("…logged with the Admin Lead as actor", r[0]?.actor_id === L, r);
for (const [col, val, label] of [["billable", "false", "billable"], ["is_special_event", "true", "special-event flag"], ["is_extra", "true", "extra flag"], ["kind", "'relationship_building'", "kind"], ["series_id", "null", "program it belongs to"], ["residency_id", `'${RES2}'`, "program (residency)"]]) {
  r = await as(L, `update public.session set ${col}=${val} where id='${d6}'`); check(`Admin Lead can't change a published date's ${label}`, !r.ok, r);
}
r = await as(L, `update public.session set schedule_state='draft' where id='${d6}'`); check("Admin Lead can't send a published date back to draft", !r.ok, r);
r = await as(L, `update public.session_assignment set role='participant' where session_id='${d6}' and person_id='${M2}'`);
const r6 = await as(L, `update public.session_assignment set role='leader' where session_id='${d6}' and person_id='${M1}'`);
check("Admin Lead swaps the leader on a published date (v0.37, answers Q4)", r.ok && r.n === 1 && r6.ok && r6.n === 1, [r, r6]);
await su(`update public.session_assignment set role='participant' where session_id='${d6}' and role='leader'; update public.session_assignment set role='leader' where session_id='${d6}' and person_id='${M2}'`);
r = await as(L, `update public.session set schedule_state='canceled', cancellation_reason='partner' where id='${d7}' returning canceled_at > now() - interval '5 minutes' as fresh`);
check("Admin Lead makes a published date No Program (partner's request)", r.ok && r.n === 1 && r.rows[0].fresh, r);
r = await as(L, `update public.session set canceled_at='2000-01-01 08:00' where id='${d7}'`);
const ca = (await stateOf(d7)).canceled_at;
check("…and can't rewrite when the cancellation was recorded", !r.ok || r.n === 0 || new Date(ca) > new Date(Date.now() - 5 * 60e3), { r, ca }) /* fixed K3, migration 20261209 */;
r = await as(L, `update public.session set schedule_state='draft' where id='${d7}'`); check("Admin Lead restores it (back to draft until the next version)", r.ok && r.n === 1, r);
st = await stateOf(d7); check("…reason and time cleared", st.schedule_state === "draft" && st.cancellation_reason === null && st.canceled_at === null, st);

// Another program's published date, for the cross-program checks.
const OTHER = (await ok(Q, `insert into public.series (residency_id,title,default_location_id,weekdays,start_time,minutes,active_from,default_leader_id) values ('${RES2}','Elm Sing','${R9}','{5}','11:00',45,'${PREV}','${N}') returning id`)).rows[0].id;
r = await as(Q, `select public.generate_series_month('${OTHER}','${B}') as n`); check("another point person fills their own program", r.ok && r.rows[0].n === seriesDates({ weekdays: [5], from: PREV }, B).length, r);
r = await as(P, `select public.generate_series_month('${OTHER}','${B1}')`); check("…and our point person can't fill theirs", !r.ok, r);
await ok(Q, `select public.mark_month_reviewed('${RES2}','${SITE2}','${B}')`);
r = await as(Q, `select public.publish_month('${RES2}','${SITE2}','${B}')`); check("the point person can publish (v0.18)", r.ok, r);
const otherPub = (await sessionsOf(OTHER, B))[0].id;
r = await as(L, `update public.session set title='x' where id='${otherPub}'`); check("Admin Lead can't touch another program's published dates (0 rows)", r.ok && r.n === 0, r);
r = await as(P, `update public.session set title='x' where id='${otherPub}'`); check("point person can't touch another program's dates (0 rows)", r.ok && r.n === 0, r);
r = await as(L, `select public.new_calendar_version('${RES2}','${SITE2}','${B}',null)`); check("Admin Lead can't make another program's calendar", !r.ok, r);
r = await as(Q, `select public.mark_month_reviewed('${RES}','${SITE2}','${B1}')`); check("a site has to belong to the program to be reviewed", !r.ok, r);

// ===========================================================================
// 7. Updated calendar versions (D5 step 5; F1 fix)
// ===========================================================================
r = await newVer(M1); check("musician can't make an updated calendar", !r.ok, r);
r = await newVer(L, B2); check("no updated calendar before version 1 is sent", !r.ok && /version 1/.test(r.err), r);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes) values ('${RES}','Sing-along','${R1}',timestamp '${addDays(B, 22)} 15:00' at time zone '${NY}',45) returning id`);
check("Admin Lead adds a one-time date to a published month (draft)", r.ok, r); const EV3 = r.rows?.[0]?.id;
r = await newVer(L); check("an updated calendar refuses a new date with no leader (F1)", !r.ok && /leader/.test(r.err), r);
r = await as(L, `insert into public.session_assignment (session_id,person_id,role) values ('${EV3}','${L}','leader')`); check("Admin Lead leads the new date (nobody on it yet)", r.ok, r);
r = await newVer(L, B, "Partner asked to move one date"); check("Admin Lead downloads the updated calendar", r.ok, r);
r = await su(`select version, state, generated_by, partner_feedback, reviewed_by from public.calendar_export where residency_id='${RES}' and month='${B}' order by version`);
check("…version 2, sent, with the partner's feedback, no new review", r.length === 2 && r[1].version === 2 && r[1].state === "sent" && r[1].generated_by === L && r[1].partner_feedback === "Partner asked to move one date" && r[1].reviewed_by === null && r[0].state === "sent", r);
check("…the new date and the restored date are published with it", (await stateOf(EV3)).schedule_state === "published" && (await stateOf(d7)).schedule_state === "published", null);
r = await newVer(P); check("the point person can make version 3", r.ok, r);
r = await su(`select array_agg(version order by version) as v from public.calendar_export where residency_id='${RES}' and month='${B}'`); check("versions go 1, 2, 3", JSON.stringify(r[0].v) === "[1,2,3]", r);

// Next month: the season leader changes drafts only; published dates keep theirs.
const pubLeaders = {}; for (const s of cafeB) pubLeaders[s] = await leadersOf(s);
r = await as(P, `select public.set_series_leader('${CAFE}','${M1}') as n`); check("point person changes the season leader back to Mia", r.ok, r);
let pubSame = true; for (const s of cafeB) if (JSON.stringify(await leadersOf(s)) !== JSON.stringify(pubLeaders[s])) pubSame = false;
check("published (and No Program) dates keep their leaders", pubSame, pubLeaders);
const cafeB1 = (await sessionsOf(CAFE, B1)).map((x) => x.id);
let draftNew = true; for (const s of cafeB1) if (JSON.stringify(await leadersOf(s)) !== JSON.stringify([M1])) draftNew = false;
check("next month's drafts are now led by Mia", draftNew, null);
await ok(P, `update public.session_assignment set role='leader' where person_id='${M1}' and session_id in (select id from public.session where series_id='${OPEN}' and ${monthSql(B1)})`);
await ok(P, `select public.mark_month_reviewed('${RES}','${SITE}','${B1}')`);
r = await publish(P, B1); check("the point person publishes month B+1 (v0.18)", r.ok, r);
r = await as(P, `update public.session_assignment set role='participant' where session_id='${cafeB1[0]}' and role='leader'`);
const demoted = r.ok && r.n === 1;
check("a published date can't be left without a leader", !demoted, r, "Q7");
if (demoted) {
  r = await newVer(L, B1); check("an updated calendar refuses a published group session with no leader", !r.ok && /leader/.test(r.err ?? ""), r) /* fixed K4, migration 20261209 */;
  await ok(P, `update public.session_assignment set role='leader' where session_id='${cafeB1[0]}' and person_id='${M1}'`);
}

// ===========================================================================
// 8. Substitutes (D11, D16): only on published dates
// ===========================================================================
const sub = (who, s, p) => as(who, `select public.mark_absent_with_substitute('${s}','${p}') as id`);
r = await sub(M1, (await sessionsOf(CAFE, B2))[0].id, S); check("no subs on draft dates", !r.ok && /published/.test(r.err), r);
r = await sub(M1, d4, S); check("no subs on No Program dates", !r.ok, r);
r = await sub(M1, d0, S); check("Mia (participant) names an outside musician as her sub", r.ok, r);
r = await su(`select is_core from public.roster_member where season_id='${SEA}' and person_id='${S}'`); check("the sub joins the season's roster as non-core", r.length === 1 && r[0].is_core === false, r);
r = await as(S, `select id from public.session where id='${d0}'`); check("…and can now see the program's dates", r.ok && r.rows.length === 1, r);
r = await su(`select person_id, status, role, substitute_for_id from public.session_assignment where session_id='${d0}'`);
check("Mia absent; Sam substitute for Mia; Mo still the one leader", r.some((x) => x.person_id === M1 && x.status === "absent") && r.some((x) => x.person_id === S && x.status === "substitute" && x.substitute_for_id === M1) && JSON.stringify(await leadersOf(d0)) === JSON.stringify([M2]), r);
r = await sub(M1, d1, M3); check("the leader names a sub", r.ok, r);
r = await su(`select role, status from public.session_assignment where session_id='${d1}' and person_id='${M3}'`);
check("…who takes over as leader (still exactly one)", r[0]?.role === "leader" && r[0]?.status === "substitute" && JSON.stringify(await leadersOf(d1)) === JSON.stringify([M3]), r);
r = await sub(M2, d6, X); check("a deactivated person can't be a sub", !r.ok, r);
r = await sub(M2, d6, M2); check("you can't be your own sub", !r.ok, r);
r = await sub(M2, d0, S); check("the sub can't already be on the date", !r.ok, r);
r = await sub(O, d6, S); check("someone not on the date can't mark absent", !r.ok, r);
r = await sub(X, d6, S); check("a deactivated person can't mark absent", !r.ok, r);
r = await sub(M1, d0, M3); check("someone already absent can't do it again", !r.ok, r);
r = await sub(null, d6, S); check("anon can't mark absent", !r.ok, r);

// ===========================================================================
// 9. Private calendar links (v0.15)
// ===========================================================================
r = await as(M1, `insert into public.calendar_feed (person_id) values ('${M1}') returning token`); check("a musician creates their own calendar link", r.ok && r.rows[0].token.length >= 32, r);
let tokM1 = r.rows?.[0]?.token;
r = await as(M1, `insert into public.calendar_feed (person_id) values ('${M2}')`); check("…but not someone else's", !r.ok, r);
const tokM2 = (await ok(M2, `insert into public.calendar_feed (person_id) values ('${M2}') returning token`)).rows[0].token;
const tokS = (await ok(S, `insert into public.calendar_feed (person_id) values ('${S}') returning token`)).rows[0].token;
const tokL = (await ok(L, `insert into public.calendar_feed (person_id) values ('${L}') returning token`)).rows[0].token;
r = await as(M1, `select person_id from public.calendar_feed`); check("a musician sees only their own link", r.ok && r.rows.length === 1 && r.rows[0].person_id === M1, r);
r = await as(X, `insert into public.calendar_feed (person_id) values ('${X}')`); check("a deactivated person can't create a link", !r.ok, r);
const feed = async (tok, who = null) => { const x = await as(who, `select * from public.calendar_feed_events('${tok}')`); return x.ok ? x.rows : null; };
// Expected feed, from the DOMAIN-MODEL rule: published or canceled sessions the
// person plays in (not absent), plus special events of programs they're on
// (current roster), from 60 days ago to a year ahead. Drafts never appear.
async function expectedFeed(person) {
  const sess = await su(`select id, schedule_state, is_special_event, residency_id, extract(epoch from starts_at)::float8 as t, extract(epoch from now())::float8 as now from public.session`);
  const asg = await su(`select session_id from public.session_assignment where person_id='${person}' and status<>'absent'`);
  const onRoster = (await su(`select distinct s.residency_id from public.roster_member rm join public.season s on s.id=rm.season_id
    where rm.person_id='${person}' and s.ends_on>=current_date and (rm.left_on is null or rm.left_on>=current_date)`)).map((x) => x.residency_id);
  const mine = new Set(asg.map((x) => x.session_id));
  return sess.filter((s) => s.schedule_state !== "draft" && s.t >= s.now - 60 * 86400 && s.t <= s.now + 366 * 86400 &&
    (mine.has(s.id) || (s.is_special_event && onRoster.includes(s.residency_id)))).map((s) => s.id).sort();
}
const ids = (rows) => (rows ?? []).map((x) => x.session_id).sort();
for (const [who, tok, label] of [[M1, tokM1, "Mia"], [M2, tokM2, "Mo"], [S, tokS, "Sam (sub)"], [L, tokL, "Lee (Admin Lead)"]]) {
  const got = ids(await feed(tok)), want = await expectedFeed(who);
  check(`${label}'s link shows exactly their published dates and the program's special events`, JSON.stringify(got) === JSON.stringify(want), { got: got.length, want: want.length });
}
let rows = await feed(tokM1);
check("Mia's link leaves out the date she's absent from", !ids(rows).includes(d0), null);
check("Sam's link shows the date he subs on", ids(await feed(tokS)).includes(d0), null);
check("the Admin Lead's link shows the special event they don't play in", ids(await feed(tokL)).includes(EV), null);
rows = await feed(tokS); const sRow = rows.find((x) => x.session_id === d0);
check("the musicians listed leave out the absent one, leader first", sRow && sRow.musicians.startsWith("Mo") && !sRow.musicians.includes("Mia") && sRow.musicians.includes("Sam"), sRow);
check("each row carries the site's time zone", rows.every((x) => x.timezone === NY), rows.map((x) => x.timezone));
r = await su(`select id from public.session where residency_id='${RES}' and schedule_state='draft'`);
const drafts = new Set(r.map((x) => x.id));
const allFeedRows = [];
for (const tok of [tokM1, tokM2, tokS, tokL]) allFeedRows.push(...(await feed(tok)));
check("no link shows a draft (though drafts exist that these musicians play in)", drafts.size > 0 && allFeedRows.length > 0 && allFeedRows.every((x) => !drafts.has(x.session_id)), allFeedRows.length);
r = await as(null, `select count(*)::int as n from public.calendar_feed_events('${tokM1}')`); check("calendar apps (anon) read the feed with the token", r.ok && r.rows[0].n === (await feed(tokM1)).length, r);
for (const [tok, label] of [["nope", "a wrong token"], [tokM1.slice(0, 31), "a shortened token"], [tokM1.slice(0, -1) + (tokM1.endsWith("a") ? "b" : "a"), "a token one letter off"], ["", "an empty token"]]) {
  r = await as(null, `select count(*)::int as n from public.calendar_feed_events('${tok}')`); check(`${label} shows nothing`, r.ok && r.rows[0].n === 0, r);
}
r = await as(M1, `update public.calendar_feed set token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') where person_id='${M1}' returning token`);
check("Mia makes a new link", r.ok && r.n === 1, r);
const oldTok = tokM1; tokM1 = r.rows?.[0]?.token;
check("…the old link stops working", (await feed(oldTok)).length === 0 && (await feed(tokM1)).length > 0, null);
r = await as(M2, `update public.calendar_feed set token='x' where person_id='${M1}'`); check("nobody resets someone else's link (0 rows)", r.ok && r.n === 0, r);
const tokX = (await su(`insert into public.calendar_feed (person_id) values ('${X}') returning token`))[0].token;
check("a deactivated person's link shows nothing", (await feed(tokX)).length === 0, null);
const tokLF = (await su(`insert into public.calendar_feed (person_id) values ('${LF}') returning token`))[0].token;
check("someone who left the roster no longer sees its special events", (await feed(tokLF)).length === 0, await feed(tokLF));
// Q5: a "No Program" date in a month that isn't published yet.
const b2first = (await sessionsOf(CAFE, B2))[0].id;
r = await as(M1, `update public.session set schedule_state='canceled', cancellation_reason='musician' where id='${b2first}'`);
check("the leader makes a date in an unpublished month No Program", r.ok && r.n === 1, r);
check("…and it doesn't show on calendar links before the month is published", !ids(await feed(tokM1)).includes(b2first), null, "Q5");

// ===========================================================================
// 10. Time zones: Phoenix has no daylight saving time; Chicago does
// ===========================================================================
const PTZ = await ins(`insert into public.partner (legal_name,display_name) values ('Desert and Lake LLC','Desert and Lake') returning id`);
const PHX = await ins(`insert into public.site (partner_id,name,display_name,timezone) values ('${PTZ}','Saguaro','Saguaro','America/Phoenix') returning id`);
const CHI = await ins(`insert into public.site (partner_id,name,display_name,timezone) values ('${PTZ}','Lakeside','Lakeside','America/Chicago') returning id`);
const RP = await ins(`insert into public.location (site_id,name,display_name) values ('${PHX}','Patio','Patio') returning id`);
const RC = await ins(`insert into public.location (site_id,name,display_name) values ('${CHI}','Parlor','Parlor') returning id`);
const RTZ = await ins(`insert into public.residency (partner_id,name,display_name,status) values ('${PTZ}','Desert and Lake','Iris at Desert and Lake','active') returning id`);
await su(`insert into public.residency_site values ('${RTZ}','${PHX}'),('${RTZ}','${CHI}')`);
const STZ = await ins(`insert into public.season (residency_id,name,starts_on,ends_on) values ('${RTZ}','Year ${Y}','${Y}-01-01','${Y}-12-31') returning id`);
await su(`insert into public.roster_member (season_id,person_id,joined_on) values ('${STZ}','${T}','${TODAY}');
insert into public.staff_assignment (residency_id,person_id,role,starts_on) values ('${RTZ}','${P}','point_person','${PREV}');`);
const tzSeries = async (title, loc, wd, time, from, until = null) => (await ok(P, `insert into public.series (residency_id,title,default_location_id,weekdays,start_time,minutes,active_from,active_until,default_leader_id)
  values ('${RTZ}','${title}','${loc}','${wd}','${time}',30,'${from}',${until ? `'${until}'` : "null"},'${T}') returning id`)).rows[0].id;
const SPHX = await tzSeries("Desert Tuesday", RP, "{2}", "14:00", `${Y}-01-01`);
const SCHI = await tzSeries("Lake Tuesday", RC, "{2}", "14:00", `${Y}-01-01`);
const SLATE = await tzSeries("Late Night Jazz", RC, "{1,2,3,4,5,6,7}", "23:30", `${Y}-01-01`, `${Y}-01-31`);
for (const m of [`${Y}-01-01`, `${Y}-03-01`, `${Y}-10-01`, `${Y}-11-01`]) await ok(P, `select public.generate_residency_month('${RTZ}','${m}')`);
// US daylight saving: second Sunday of March to first Sunday of November.
const sundays = (m) => seriesDates({ weekdays: [7], from: "0000-01-01" }, m);
const dstStart = sundays(`${Y}-03-01`)[1], dstEnd = sundays(`${Y}-11-01`)[0];
const tzRows = await su(`select series_id, (starts_at at time zone st.timezone)::date::text as d, (starts_at at time zone st.timezone)::time::text as local,
  extract(hour from starts_at at time zone 'UTC')::int as utc_h from public.session se join public.location l on l.id=se.location_id join public.site st on st.id=l.site_id where se.residency_id='${RTZ}'`);
const phxRows = tzRows.filter((x) => x.series_id === SPHX), chiRows = tzRows.filter((x) => x.series_id === SCHI);
check("Phoenix dates are 2:00 pm local all year", phxRows.length > 0 && phxRows.every((x) => x.local === "14:00:00"), phxRows);
check("…which is 21:00 UTC in winter and summer alike (no DST)", phxRows.every((x) => x.utc_h === 21), phxRows.map((x) => [x.d, x.utc_h]));
check("Chicago dates are 2:00 pm local all year", chiRows.length > 0 && chiRows.every((x) => x.local === "14:00:00"), chiRows);
check("…20:00 UTC in standard time and 19:00 UTC in daylight time", chiRows.every((x) => x.utc_h === (x.d >= dstStart && x.d < dstEnd ? 19 : 20)), chiRows.map((x) => [x.d, x.utc_h]));
check("the dates really cover both clock changes (March has both offsets; late October 19, after the November change 20)",
  chiRows.some((x) => x.d.slice(5, 7) === "03" && x.utc_h === 20) && chiRows.some((x) => x.d.slice(5, 7) === "03" && x.utc_h === 19) &&
  chiRows.some((x) => x.d.slice(5, 7) === "10" && x.utc_h === 19) && chiRows.some((x) => x.d > dstEnd && x.utc_h === 20), { dstStart, dstEnd });
const lateRows = tzRows.filter((x) => x.series_id === SLATE);
check("a nightly 11:30 pm program in Chicago has all 31 January dates (local)", lateRows.length === 31 && lateRows.every((x) => x.d.slice(0, 7) === `${Y}-01` && x.local === "23:30:00"), lateRows.length);
r = await su(`select count(*)::int as n from public.month_sessions('${RTZ}','${CHI}','${Y}-01-01')`);
const chiJan = seriesDates({ weekdays: [2], from: `${Y}-01-01` }, `${Y}-01-01`).length;
check("January at the Chicago site counts its Jan 31 11:30 pm date (Feb 1 in UTC)", r[0].n === 31 + chiJan, r);
await ok(P, `select public.mark_month_reviewed('${RTZ}','${CHI}','${Y}-01-01')`);
r = await as(P, `select public.publish_month('${RTZ}','${CHI}','${Y}-01-01')`); check("point person publishes January for the Chicago site", r.ok, r);
r = await su(`select st.timezone, se.schedule_state, count(*)::int as n from public.session se join public.location l on l.id=se.location_id join public.site st on st.id=l.site_id
  where se.residency_id='${RTZ}' and date_trunc('month', se.starts_at at time zone st.timezone)::date='${Y}-01-01' group by 1,2 order by 1,2`);
check("…all Chicago January dates published, Phoenix January still draft (one calendar per site)",
  JSON.stringify(r) === JSON.stringify([{ timezone: "America/Chicago", schedule_state: "published", n: 31 + chiJan }, { timezone: "America/Phoenix", schedule_state: "draft", n: seriesDates({ weekdays: [2], from: `${Y}-01-01` }, `${Y}-01-01`).length }]), r);
r = await su(`select count(*)::int as n from public.session se where se.series_id='${SLATE}' and schedule_state='published'`); check("…including the one that is February in UTC", r[0].n === 31, r);
r = await su(`select count(*)::int as n from public.calendar_export where residency_id='${RTZ}' and site_id='${PHX}'`); check("Phoenix has no calendar version yet", r[0].n === 0, r);

// ===========================================================================
// 11. Filling a season that starts and ends mid-month (K2)
// ===========================================================================
const RMID = await ins(`insert into public.residency (partner_id,name,display_name,status) values ('${PT}','Maple Spring','Iris at Maple (spring)','active') returning id`);
await su(`insert into public.residency_site values ('${RMID}','${SITE}')`);
const midStart = addDays(B, 14), midEnd = addDays(B2, 13);
const SMID = await ins(`insert into public.season (residency_id,name,starts_on,ends_on) values ('${RMID}','Mid-month season','${midStart}','${midEnd}') returning id`);
await su(`insert into public.roster_member (season_id,person_id,joined_on) values ('${SMID}','${M3}','${midStart}');
insert into public.staff_assignment (residency_id,person_id,role,starts_on) values ('${RMID}','${P}','point_person','${PREV}');`);
const SFRI = (await ok(P, `insert into public.series (residency_id,title,default_location_id,weekdays,start_time,minutes,active_from) values ('${RMID}','Friday Strings','${R1}','{5}','09:00',45,'${PREV}') returning id`)).rows[0].id;
await ok(P, `insert into public.series_default_person values ('${SFRI}','${M3}')`);
r = await as(P, `select public.generate_season('${SMID}') as n`);
const wantMid = [B, B1, B2].flatMap((m) => seriesDates({ weekdays: [5], from: PREV }, m)).filter((d) => d >= midStart && d <= midEnd).length;
check("filling the season works", r.ok, r);
const midRows = await su(`select (starts_at at time zone '${NY}')::date::text as d, (select count(*)::int from public.session_assignment a where a.session_id=s.id) as people from public.session s where series_id='${SFRI}' order by 1`);
check(`filling a mid-month season creates only the season's ${wantMid} dates`, midRows.every((x) => x.d >= midStart && x.d <= midEnd) && midRows.length === wantMid,
  { outside: midRows.filter((x) => x.d < midStart || x.d > midEnd).map((x) => `${x.d} (${x.people} musicians)`) }, "K2");

// ===========================================================================
// 12. Who sees what
// ===========================================================================
const TABLES = ["residency", "residency_site", "season", "roster_member", "staff_assignment", "series", "series_default_person", "session", "session_assignment", "calendar_export"];
for (const [who, label] of [[O, "outsider"], [X, "deactivated person"], [LF, "someone who left the roster"]]) {
  let total = 0; for (const t of TABLES) { const x = await as(who, `select count(*)::int as n from public.${t}`); total += x.ok ? x.rows[0].n : 0; }
  check(`${label} reads zero scheduling rows`, total === 0, total);
  r = await as(who, `select count(*)::int as n from public.residency_people('${RES}')`); check(`${label} sees no program names`, r.ok && r.rows[0].n === 0, r);
}
for (const t of TABLES) { r = await as(null, `select count(*)::int as n from public.${t}`); check(`anon reads no ${t}`, !r.ok || r.rows[0].n === 0, r); }
r = await as(Q, `select count(*)::int as n from public.session where residency_id='${RES}'`); check("another program's point person sees none of our dates", r.ok && r.rows[0].n === 0, r);
r = await as(N, `select count(*)::int as n from public.calendar_export where residency_id='${RES}'`); check("another program's musician sees none of our calendars", r.ok && r.rows[0].n === 0, r);
r = await as(P2, `select count(*)::int as n from public.session where residency_id='${RES}'`); check("support staff can see the program's dates", r.ok && r.rows[0].n > 0, r);
r = await as(P2, `update public.session set title='x' where residency_id='${RES}'`); check("…but not edit them (0 rows)", r.ok && r.n === 0, r);
r = await as(M3, `select count(*)::int as n from public.session where residency_id='${RES}'`); const all = (await su(`select count(*)::int as n from public.session where residency_id='${RES}'`))[0].n;
check("a roster musician sees all the program's dates, drafts included", r.ok && r.rows[0].n === all, r);
r = await as(M1, `select email from public.person where id='${M2}'`); check("musicians don't see each other's email", r.ok && r.rows.length === 0, r);

// ===========================================================================
// 13. Audit and nothing deleted
// ===========================================================================
r = await su(`select count(*)::int as n from public.session s where not exists (select 1 from public.audit_log a where a.table_name='session' and a.row_id=s.id and a.action='insert')`);
check("every session's creation is in the audit log", r[0].n === 0, r);
r = await su(`select count(*)::int as n from public.calendar_export c where not exists (select 1 from public.audit_log a where a.table_name='calendar_export' and a.row_id=c.id and a.action='insert')`);
check("every calendar version's creation is in the audit log", r[0].n === 0, r);
r = await su(`select count(*)::int as n from public.session_assignment c where not exists (select 1 from public.audit_log a where a.table_name='session_assignment' and a.row_id=c.id and a.action='insert')`);
check("every assignment's creation is in the audit log", r[0].n === 0, r);
r = await as(L, `select count(*)::int as n from public.audit_log`); check("non-admins can't read the audit log", r.ok && r.rows[0].n === 0, r);
r = await as(A, `update public.audit_log set actor_id=null`); check("nobody edits the audit log", !r.ok, r);
for (const t of ["session", "calendar_export", "series", "season", "roster_member", "residency", "staff_assignment", "residency_site", "audit_log"]) {
  r = await as(A, `delete from public.${t}`); check(`nobody deletes ${t} (not even admins)`, !r.ok, r);
}

const res = summary();
process.exit(res.fail ? 1 : 0);
