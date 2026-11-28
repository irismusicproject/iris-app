import { PGlite } from "@electric-sql/pglite";
// The monthly scheduling cycle (DOMAIN-MODEL ScheduleMonth, v0.41): stages, who
// moves them, and the locks they enforce. Same setup as scheduling.test.mjs,
// run in an in-memory Postgres (PGlite) like rls.test.mjs. Made-up data only.
// Run with: npm run test:db
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const db = new PGlite();
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrations = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`);
for (const f of migrations) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

// People (all made up). A admin; L admin lead; P point person (not an admin);
// M1, M2 roster musicians; O and S active musicians not on the roster;
// X deactivated.
const id = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const A = id("a1"), L = id("b1"), P = id("c1"), M1 = id("d1"), M2 = id("d2"), O = id("e1"), S = id("e2"), X = id("f1"), Z = id("f2");
const people = [[A,"Ada Admin","{admin}"],[L,"Lee Lead","{}"],[P,"Pat Point","{}"],[M1,"Mia One","{}"],
  [M2,"Mo Two","{}"],[O,"Oli Outside","{}"],[S,"Sam Sub","{}"],[X,"Xan Former","{}"],[Z,"Zed Elsewhere","{}"]];
await db.exec(`insert into auth.users values ${people.map(([u,n])=>`('${u}','${n.split(" ")[0].toLowerCase()}@example.org')`).join(",")};
insert into public.person (id,name,email,employment_type,system_roles) values
${people.map(([u,n,r])=>`('${u}','${n}','${n.split(" ")[0].toLowerCase()}@example.org','contractor_1099','${r}')`).join(",\n")};
update public.person set active=false where id='${X}';`);

let pass = 0, fail = 0;
async function as(uid, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ""}',false);`);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec("reset role"); }
}
function check(name, cond, detail) {
  if (cond) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name, JSON.stringify(detail)); }
}
const one = async (uid, sql) => (await as(uid, sql)).rows?.[0];
let r;

// ---- Setup by an admin: partner, site, room, residency, season, roster, point person
const PT = (await one(A, `insert into public.partner (legal_name,display_name) values ('Example Living Inc.','Example Living') returning id`)).id;
const SITE = (await one(A, `insert into public.site (partner_id,name,display_name,timezone) values ('${PT}','Maple House','Maple House','America/New_York') returning id`)).id;
const ROOM = (await one(A, `insert into public.location (site_id,name,display_name) values ('${SITE}','Library','Library') returning id`)).id;
const ROOM_B = (await one(A, `insert into public.location (site_id,name,display_name) values ('${SITE}','Lounge','Lounge') returning id`)).id;
const PT2 = (await one(A, `insert into public.partner (legal_name,display_name) values ('Other Org','Other Org') returning id`)).id;
const SITE2 = (await one(A, `insert into public.site (partner_id,name,display_name) values ('${PT2}','Elm Court','Elm Court') returning id`)).id;
const ROOM2 = (await one(A, `insert into public.location (site_id,name,display_name) values ('${SITE2}','Hall','Hall') returning id`)).id;

r = await as(A, `insert into public.residency (partner_id,name,display_name,status) values ('${PT}','Example Maple','Iris Music Project at Maple House','active') returning id`);
check("admin creates residency", r.ok, r); const RES = r.rows?.[0]?.id;
r = await as(A, `insert into public.residency_site values ('${RES}','${SITE}')`); check("admin links residency to its partner's site", r.ok, r);
r = await as(A, `insert into public.residency_site values ('${RES}','${SITE2}')`); check("site of another partner rejected", !r.ok, r);
r = await as(A, `insert into public.season (residency_id,name,starts_on,ends_on,kind) values ('${RES}','Spring 2027','2027-01-01','2027-06-30','semester') returning id`);
check("admin creates season", r.ok, r); const SEA = r.rows?.[0]?.id;
r = await as(A, `insert into public.roster_member (season_id,person_id,is_core,is_admin_lead) values ('${SEA}','${L}',true,true),('${SEA}','${M1}',true,false),('${SEA}','${M2}',true,false)`);
check("admin adds roster", r.ok, r);
r = await as(A, `insert into public.roster_member (season_id,person_id,is_admin_lead) values ('${SEA}','${S}',true)`);
check("second admin lead in a season rejected", !r.ok, r);
r = await as(A, `insert into public.staff_assignment (residency_id,person_id,role,starts_on) values ('${RES}','${P}','point_person','2026-01-01')`);
check("admin assigns point person", r.ok, r);
r = await as(L, `insert into public.roster_member (season_id,person_id) values ('${SEA}','${O}')`); check("admin lead can't add roster members", !r.ok, r);


// ---- A weekly program in February 2027 with a leader on every date, and a partner calendar contact
const SER = (await one(P, `insert into public.series (residency_id,title,default_location_id,weekdays,start_time,minutes,active_from)
  values ('${RES}','Music Café','${ROOM}','{2,4}','14:00',45,'2027-01-01') returning id`)).id;
await as(P, `insert into public.series_default_person values ('${SER}','${M1}'),('${SER}','${M2}')`);
await as(P, `select public.generate_series_month('${SER}','2027-02-01')`);
const sessions = (await as(P, `select id from public.session where series_id='${SER}' order by starts_at`)).rows.map((x) => x.id);
r = await as(P, `update public.session_assignment set role='leader' where person_id='${M1}' and session_id in (select id from public.session where series_id='${SER}')`);
check("point person sets M1 as leader of all 8 dates", r.ok && r.n === 8, r);
await db.exec(`insert into public.partner_contact (id,partner_id,name,email,receives) values ('${id("99")}','${PT}','Dana Director','dana@example.org','{calendar}');
insert into public.partner_contact_site values ('${id("99")}','${SITE}');`);
const M = `'${RES}','${SITE}','2027-02-01'`;
const stage = async () => (await one(A, `select stage from public.schedule_month where residency_id='${RES}' and site_id='${SITE}' and month='2027-02-01'`))?.stage;

// ---- Opening the month (point person or admin)
r = await as(M1, `select public.open_schedule_month('${RES}', null, '2027-02-01')`); check("a musician can't open a month", !r.ok, r);
r = await as(L, `select public.open_schedule_month('${RES}', null, '2027-02-01')`); check("the Admin Lead can't open a month", !r.ok, r);
// D20 (Nov 27, 2026): a month opens by itself when its first date is added.
check("February's dates opened it for the team by themselves (D20)", (await stage()) === "team_editing" || new Date() > new Date("2027-02-28"));
r = await as(P, `select public.open_schedule_month('${RES}', null, '2027-02-01') as n`); check("the older Open button still works for older phones", r.ok && (await stage()) === "team_editing", r);
r = await as(P, `select public.open_schedule_month('${RES}', null, '2027-02-01') as n`); check("opening again changes nothing", r.ok && r.rows[0].n === 0, r);
r = await as(A, `select team_due_on::text, final_due_on::text from public.schedule_month`); check("due the 10th and 15th of January", r.ok && r.rows[0].team_due_on === "2027-01-10" && r.rows[0].final_due_on === "2027-01-15", r);
await db.exec(`select public.queue_month_opened('2027-01-02 12:00-05')`);
r = await as(A, `select count(*)::int as n from public.notification where kind='month_opened'`); check("the musicians playing are emailed once, by the 1st of the month before", r.ok && r.rows[0].n === 2, r);
await db.exec(`select public.queue_month_opened('2027-01-03 12:00-05')`);
r = await as(A, `select count(*)::int as n from public.notification where kind='month_opened'`); check("…and not again", r.ok && r.rows[0].n === 2, r);
r = await as(M1, `select stage from public.schedule_month`); check("musicians see the stage", r.ok && r.rows[0]?.stage === "team_editing", r);
r = await as(O, `select * from public.schedule_month`); check("someone off the roster sees nothing", r.ok && r.rows.length === 0, r);
r = await as(null, `select * from public.schedule_month`); check("anon sees nothing", !r.ok || r.rows.length === 0, r);
r = await as(P, `insert into public.schedule_month (residency_id,site_id,month,team_due_on,final_due_on) values (${M.replace("'2027-02-01'", "'2027-03-01'")},'2027-02-10','2027-02-15')`);
check("nobody writes stages directly", !r.ok, r);

// ---- Titles while the team edits: the date's leader only
r = await as(M2, `update public.session set title='Motown' where id='${sessions[0]}'`); check("a musician who doesn't lead the date can't change its title", !r.ok && /leader/.test(r.err), r);
r = await as(M1, `update public.session set title='Motown' where id='${sessions[0]}'`); check("the date's leader changes its title", r.ok && r.n === 1, r);
r = await as(M2, `update public.session set internal_note='Bring stands' where id='${sessions[0]}'`); check("other musicians still change notes", r.ok && r.n === 1, r);
r = await as(M2, `update public.session set location_id='${ROOM_B}' where id='${sessions[0]}'`); check("…and the room", r.ok && r.n === 1, r);

// ---- No confirm step (D20, Nov 27, 2026): musicians keep editing until the
// Lead Musician sends; older phones calling confirm get a plain message.
r = await as(P, `select public.confirm_schedule_month(${M})`); check("confirming is no longer a step", !r.ok && /no longer needed/.test(r.err) && (await stage()) === "team_editing", r);
r = await as(M1, `update public.session set internal_note='Late idea' where id='${sessions[1]}'`); check("musicians still edit before sending", r.ok && r.n === 1, r);

// ---- Send (Admin Lead may send without the confirm step; sending confirms)
r = await as(M1, `select public.send_schedule_month(${M})`); check("a musician can't send", !r.ok, r);
r = await as(L, `select public.send_schedule_month(${M}) as j`);
const sent = r.rows?.[0]?.j;
check("the Admin Lead sends straight from team editing", r.ok && (await stage()) === "sent_to_partner", r);
check("…to the building's calendar contact", sent?.to?.length === 1 && sent.to[0].email === "dana@example.org", sent);
check("…copying the point person and the Admin Lead", ["pat@example.org", "lee@example.org"].every((e) => sent?.cc?.includes(e)), sent);
r = await as(A, `select confirmed_by = '${L}' as ok from public.schedule_month`); check("…and is recorded as having confirmed it", r.ok && r.rows[0].ok, r);
r = await as(A, `select count(*)::int as n from public.session where series_id='${SER}' and schedule_state='published'`); check("…and the dates are published", r.ok && r.rows[0].n === 8, r);
r = await as(L, `select public.send_schedule_month(${M})`); check("can't send twice", !r.ok, r);

// ---- Partner changes (Admin Lead)
r = await as(L, `update public.session set title='Motown Classics' where id='${sessions[0]}'`); check("the Admin Lead enters a partner change", r.ok && r.n === 1, r);
check("…which moves the month to partner changes", (await stage()) === "partner_changes", await stage());

// ---- Final
r = await as(M1, `select public.finalize_schedule_month(${M})`); check("a musician can't mark final", !r.ok, r);
r = await as(L, `select public.finalize_schedule_month(${M}) as j`);
check("the Admin Lead marks February final", r.ok && (await stage()) === "final", r);
check("…with a new calendar version after the change", r.rows?.[0]?.j?.version === 2, r.rows?.[0]?.j);
r = await as(L, `update public.session set title='Too late' where id='${sessions[1]}'`); check("final: the Admin Lead can't change dates", !r.ok && /final/.test(r.err), r);
r = await as(L, `update public.session_assignment set status='absent' where session_id='${sessions[1]}' and person_id='${M2}'`); check("final: nor who plays", !r.ok || r.n === 0, r);
r = await as(P, `update public.session set internal_note='Point person fix' where id='${sessions[1]}'`); check("final: the point person still can", r.ok && r.n === 1, r);
r = await as(L, `select public.schedule_month_send_info(${M}) as j`); check("the Admin Lead can get the final version to email again", r.ok && r.rows[0].j.final === true && r.rows[0].j.version === 2, r);
r = await as(M1, `select public.schedule_month_send_info(${M})`); check("…a musician can't", !r.ok, r);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes,is_special_event) values ('${RES}','Surprise','${ROOM}','2027-02-20 19:00-05',60,true)`);
check("final: the Admin Lead can't add a date to the month", !r.ok && /final/.test(r.err), r);

// ===========================================================================
// Part 2: requests, "I can't play", "I wasn't there", "Canceled day-of", To do
// ===========================================================================
await as(P, `select public.generate_series_month('${SER}','2027-03-01')`);
const march = (await as(P, `select id from public.session where series_id='${SER}' and starts_at >= '2027-03-01' order by starts_at`)).rows.map((x) => x.id);
await as(P, `update public.session_assignment set role='leader' where person_id='${M1}' and session_id in (${march.map((x) => `'${x}'`).join(",")})`);
await as(P, `select public.open_schedule_month('${RES}', null, '2027-03-01')`);

// Leader swaps
r = await as(M2, `update public.session_assignment set role='leader' where session_id='${march[0]}' and person_id='${M2}'`);
check("a musician can't make themselves leader", !r.ok && /leader swap/.test(r.err), r);
r = await as(O, `select public.request_leader_swap('${march[0]}','${M2}')`); check("someone not on the date can't propose a swap", !r.ok, r);
r = await as(M2, `select public.request_leader_swap('${march[0]}','${O}')`); check("…nor swap to someone not playing it", !r.ok, r);
r = await as(M2, `select public.request_leader_swap('${march[0]}','${M2}') as id`); const SW = r.rows?.[0]?.id;
check("a musician on the date proposes themselves as leader", r.ok && !!SW, r);
r = await as(M2, `select public.request_leader_swap('${march[0]}','${M2}')`); check("one open swap per person and date", !r.ok, r);
r = await as(A, `select count(*)::int as n from public.notification where kind='change_requested'`); check("the point person is emailed", r.ok && r.rows[0].n === 1, r);
r = await as(M1, `select id from public.change_request`); check("the program's people see the request", r.ok && r.rows.length === 1, r);
r = await as(O, `select id from public.change_request`); check("…others don't", r.ok && r.rows.length === 0, r);
r = await as(L, `select public.decide_change_request('${SW}', true)`); check("the Admin Lead can't approve requests", !r.ok, r);
r = await as(P, `select kind from public.my_tasks() where kind='approve'`); check("the point person's To do has 'Approve leader swap'", r.ok && r.rows.length === 1, r);
r = await as(P, `select public.decide_change_request('${SW}', true)`); check("the point person approves it", r.ok, r);
r = await as(A, `select person_id from public.session_assignment where session_id='${march[0]}' and role='leader' and status<>'absent'`);
check("…and M2 now leads, still exactly one leader", r.ok && r.rows.length === 1 && r.rows[0].person_id === M2, r);
r = await as(A, `select count(*)::int as n from public.notification where kind='change_decided' and person_id='${M2}'`); check("…and M2 is emailed", r.ok && r.rows[0].n === 1, r);
r = await as(P, `select public.decide_change_request('${SW}', false)`); check("a decided request can't be decided again", !r.ok, r);

// "I can't play": on the date, while the team edits, no approval
r = await as(M2, `select public.set_unavailable('${march[1]}', true) as n`); check("M2 marks a March date they can't play (1 this season)", r.ok && r.rows[0].n === 1, r);
r = await as(A, `select status from public.session_assignment where session_id='${march[1]}' and person_id='${M2}'`); check("…recorded at once", r.rows?.[0]?.status === "absent", r);
r = await as(P, `select title from public.my_tasks() where kind='cover'`); check("…and the point person gets 'Mo Two can't play …'", r.ok && r.rows.length === 1 && /Mo Two/.test(r.rows[0].title), r);
r = await as(M2, `select public.set_unavailable('${march[1]}', false) as n`); check("…they can undo it", r.ok && r.rows[0].n === 0, r);
r = await as(M2, `select public.set_unavailable('${sessions[2]}', true)`); check("February is final: can't mark it any more", !r.ok && /Iris Supervisor/.test(r.err), r);
r = await as(O, `select public.set_unavailable('${march[1]}', true)`); check("someone not on the date can't mark it", !r.ok, r);

// To do for each role
r = await as(M1, `select kind from public.my_tasks()`); check("M1's To do: titles for the March dates they lead", r.ok && r.rows.some((x) => x.kind === "titles"), r);
r = await as(P, `select kind from public.my_tasks()`); check("the Iris Supervisor's To do has no 'review and confirm' (D20)", r.ok && !r.rows.some((x) => x.kind === "confirm"), r);
r = await as(L, `select kind from public.my_tasks()`); check("the Admin Lead's To do: send March", r.ok && r.rows.some((x) => x.kind === "send"), r);
r = await as(O, `select kind from public.my_tasks()`); check("someone off the roster has nothing to do", r.ok && r.rows.length === 0, r);

// After final: a sub is a request the point person approves
r = await as(M2, `select public.mark_absent_with_substitute('${sessions[3]}','${L}')`); check("final: a musician can't record a sub directly", !r.ok, r);
r = await as(M2, `select public.request_change('${sessions[3]}','sub','${O}')`); check("…a sub must be on the roster", !r.ok, r);
r = await as(M2, `select public.request_change('${sessions[3]}','other', null, '')`); check("…another change needs a note", !r.ok, r);
r = await as(M2, `select public.request_change('${sessions[3]}','sub','${L}') as id`); const SUB = r.rows?.[0]?.id; check("…they ask for Lee as sub", r.ok && !!SUB, r);
r = await as(P, `select public.decide_change_request('${SUB}', true)`); check("the point person approves the sub", r.ok, r);
r = await as(A, `select person_id, status, substitute_for_id from public.session_assignment where session_id='${sessions[3]}' order by status`);
check("…M2 absent, Lee substitute for M2", r.ok && r.rows.some((x) => x.person_id === M2 && x.status === "absent") && r.rows.some((x) => x.person_id === L && x.status === "substitute" && x.substitute_for_id === M2), r);

// Dates that have happened: "I wasn't there", taking the lead to document, "Canceled day-of"
const FALL = (await one(A, `insert into public.season (residency_id,name,starts_on,ends_on,kind) values ('${RES}','Fall 2026','2026-09-01','2026-12-31','semester') returning id`)).id;
await as(A, `insert into public.roster_member (season_id,person_id,is_core) values ('${FALL}','${M1}',true),('${FALL}','${M2}',true)`);
const past = async (t) => {
  const sid = (await one(P, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes,is_special_event) values ('${RES}','${t}','${ROOM}','2026-11-02 14:00-05',45,true) returning id`)).id;
  await as(P, `insert into public.session_assignment (session_id,person_id,role) values ('${sid}','${M1}','leader'),('${sid}','${M2}','participant')`);
  return sid;
};
const P1 = await past("Past one"), P2 = await past("Past two"), P3 = await past("Past three");
r = await as(M2, `select public.mark_not_there('${P1}', true)`); check("M2 marks 'I wasn't there' on a date that happened", r.ok, r);
r = await as(A, `select status from public.session_assignment where session_id='${P1}' and person_id='${M2}'`); check("…counted at once (absent)", r.rows?.[0]?.status === "absent", r);
r = await as(A, `select count(*)::int as n from public.notification where kind='not_there'`); check("…and the point person is emailed", r.ok && r.rows[0].n === 1, r);
r = await as(M2, `select public.mark_not_there('${march[2]}', true)`); check("'I wasn't there' only after the date", !r.ok, r);
r = await as(M1, `select public.mark_not_there('${P3}', true)`); check("the leader wasn't there either (P3)", r.ok, r);
r = await as(M2, `select public.take_lead_to_document('${P3}')`); check("…so M2, who played, takes the lead to document it", r.ok, r);
r = await as(A, `select person_id from public.session_assignment where session_id='${P3}' and role='leader' and status<>'absent'`); check("…and is now its one leader", r.rows?.length === 1 && r.rows[0].person_id === M2, r);
r = await as(M2, `select public.cancel_day_of('${P2}','partner')`); check("only the leader records a day-of cancellation", !r.ok, r);
r = await as(M1, `select public.cancel_day_of('${P2}', null)`); check("…a reason is required", !r.ok, r);
r = await as(M1, `select public.cancel_day_of('${march[3]}','weather')`); check("…not for a later date", !r.ok, r);
r = await as(M1, `select public.cancel_day_of('${P2}','partner')`); check("the leader records 'Canceled day-of' (partner)", r.ok, r);
r = await as(A, `select schedule_state, cancellation_reason, canceled_at = starts_at as at_start from public.session where id='${P2}'`);
check("…No Program, reason partner, counted at the start time", r.rows?.[0]?.schedule_state === "canceled" && r.rows[0].cancellation_reason === "partner" && r.rows[0].at_start === true, r);
r = await as(M1, `select public.cancel_day_of('${P2}','partner')`); check("…only once", !r.ok, r);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
