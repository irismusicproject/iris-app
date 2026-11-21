import { PGlite } from "@electric-sql/pglite";
// Scheduling permission and rule tests (supabase/migrations/*_scheduling.sql),
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
const A = id("a1"), L = id("b1"), P = id("c1"), M1 = id("d1"), M2 = id("d2"), O = id("e1"), S = id("e2"), X = id("f1");
const people = [[A,"Ada Admin","{admin}"],[L,"Lee Lead","{}"],[P,"Pat Point","{}"],[M1,"Mia One","{}"],
  [M2,"Mo Two","{}"],[O,"Oli Outside","{}"],[S,"Sam Sub","{}"],[X,"Xan Former","{}"]];
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

// ---- Who can see the residency
r = await as(O, `select * from public.residency`); check("outsider reads no residency", r.ok && r.rows.length === 0, r);
r = await as(M1, `select * from public.residency`); check("roster musician reads residency", r.ok && r.rows.length === 1, r);
r = await as(P, `select * from public.residency`); check("point person reads residency", r.ok && r.rows.length === 1, r);
r = await as(M1, `select id from public.site`); check("roster musician reads only the residency's site", r.ok && r.rows.length === 1 && r.rows[0].id === SITE, r);
r = await as(M1, `select id from public.location order by name`); check("roster musician reads only the residency's rooms", r.ok && r.rows.length === 2 && r.rows.every((x) => [ROOM, ROOM_B].includes(x.id)), r);
r = await as(X, `select * from public.residency`); check("deactivated person reads nothing", r.ok && r.rows.length === 0, r);
r = await as(null, `select * from public.session`); check("anon reads no sessions", !r.ok || r.rows.length === 0, r);

// ---- Series and generating a month (Feb 2027: Tue + Thu = 8 dates)
const seriesSql = (who, loc) => as(who, `insert into public.series (residency_id,title,default_location_id,weekdays,start_time,minutes,active_from)
  values ('${RES}','Music Café','${loc}','{2,4}','14:00',45,'2027-01-01') returning id`);
r = await seriesSql(M1, ROOM); check("musician can't create a series", !r.ok, r);
r = await seriesSql(L, ROOM2); check("series at another partner's room rejected", !r.ok, r);
r = await seriesSql(L, ROOM); check("admin lead creates a series", r.ok, r); const SER = r.rows?.[0]?.id;
r = await as(L, `insert into public.series_default_person values ('${SER}','${M1}'),('${SER}','${M2}')`); check("admin lead sets default musicians", r.ok, r);
r = await as(L, `select public.generate_series_month('${SER}','2027-02-01') as n`);
check("generate Feb 2027 creates 8 draft sessions", r.ok && r.rows[0].n === 8, r);
r = await as(L, `select public.generate_series_month('${SER}','2027-02-01') as n`); check("generating again adds nothing", r.ok && r.rows[0].n === 0, r);
r = await as(M1, `select public.generate_series_month('${SER}','2027-03-01') as n`); check("musician can't generate sessions", !r.ok, r);
r = await as(L, `select count(*)::int as n from public.session_assignment`); check("default musicians added (16 assignments)", r.ok && r.rows[0].n === 16, r);
r = await as(L, `select bool_and((starts_at at time zone 'America/New_York')::time = '14:00') as ok from public.session`);
check("sessions start 2:00 pm site time", r.ok && r.rows[0].ok === true, r);
const sessions = (await as(L, `select id from public.session where series_id='${SER}' order by starts_at`)).rows.map((x) => x.id);

// ---- Scheduled relationship building ("Lessons"): weekly, no set time, no leader
r = await as(L, `insert into public.series (residency_id,kind,title,default_location_id,weekdays,active_from)
  values ('${RES}','group_session','No Time','${ROOM}','{2}','2027-01-01')`);
check("group session series needs a time", !r.ok, r);
r = await as(L, `insert into public.series (residency_id,kind,title,default_location_id,weekdays,active_from)
  values ('${RES}','relationship_building','Lessons','${ROOM}','{2}','2027-01-01') returning id`);
check("admin lead creates a weekly Lessons series with no time", r.ok, r); const LES = r.rows?.[0]?.id;
r = await as(L, `insert into public.series_default_person values ('${LES}','${M1}'),('${LES}','${M2}')`);
r = await as(L, `select public.generate_series_month('${LES}','2027-02-01') as n`); check("Lessons fills Feb's 4 Tuesdays", r.ok && r.rows[0].n === 4, r);
r = await as(L, `select bool_and(not has_set_time and kind='relationship_building' and scheduled_minutes is null) as ok from public.session where series_id='${LES}'`);
check("Lessons sessions have no set time", r.ok && r.rows[0].ok === true, r);

// ---- Editing rules
r = await as(O, `update public.session set title='Hacked'`); check("outsider can't edit sessions (0 rows)", r.ok && r.n === 0, r);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes,schedule_state) values ('${RES}','Concert','${ROOM}','2027-02-20 19:00-05','60','published')`);
check("new session can't start published", !r.ok, r);
r = await as(L, `update public.session set schedule_state='published' where id='${sessions[0]}'`); check("can't publish one session directly", !r.ok, r);
r = await as(L, `insert into public.session_assignment (session_id,person_id) values ('${sessions[0]}','${O}')`); check("can't assign someone off the roster", !r.ok, r);
r = await as(L, `update public.session set schedule_state='canceled' where id='${sessions[7]}'`); check("cancel needs a reason", !r.ok, r);
r = await as(L, `update public.session set schedule_state='canceled', cancellation_reason='musician' where id='${sessions[7]}' returning canceled_at is not null as stamped`);
check("cancel for a planned absence (No Program) stamps canceled_at", r.ok && r.rows[0]?.stamped === true, r);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes,is_special_event) values ('${RES}','Winter Concert','${ROOM}','2027-02-20 19:00-05',60,true) returning id`);
check("admin lead adds a one-time special event", r.ok, r); const EVT = r.rows?.[0]?.id;
r = await as(L, `insert into public.session_assignment (session_id,person_id,role) values ('${EVT}','${M1}','leader'),('${EVT}','${M2}','participant')`);
check("admin lead staffs the special event", r.ok, r);

// ---- Every roster musician edits drafts (DOMAIN-MODEL v0.12)
r = await as(M2, `update public.session set title='Jam Band: Motown' where id='${sessions[0]}'`); check("roster musician edits a draft title", r.ok && r.n === 1, r);
r = await as(M2, `update public.session set location_id='${ROOM_B}' where id='${sessions[0]}'`); check("roster musician changes a draft's room", r.ok && r.n === 1, r);
r = await as(M2, `update public.session set location_id='${ROOM2}' where id='${sessions[0]}'`); check("…but not to another partner's room", !r.ok, r);
r = await as(M2, `update public.session set starts_at = starts_at + interval '1 hour' where id='${sessions[0]}'`); check("musician can't move a regular session's time", !r.ok, r);
r = await as(M2, `update public.session set starts_at='2027-02-21 19:00-05' where id='${EVT}'`); check("musician moves a special event's date and time", r.ok && r.n === 1, r);
r = await as(M2, `update public.session set schedule_state='canceled', cancellation_reason='other' where id='${sessions[1]}'`); check("musician can't cancel", !r.ok, r);
r = await as(M2, `update public.session set internal_note='x' where id='${sessions[1]}'`); check("musician can't edit other fields", !r.ok, r);
r = await as(O, `update public.session set title='Nope' where id='${sessions[1]}'`); check("outsider edits no drafts (0 rows)", r.ok && r.n === 0, r);
r = await as(M2, `insert into public.session_assignment (session_id,person_id) values ('${sessions[1]}','${L}')`); check("roster musician adds a musician to a draft", r.ok, r);
r = await as(M2, `insert into public.session_assignment (session_id,person_id,role) values ('${sessions[2]}','${L}','leader')`); check("musician can't add a leader", !r.ok, r);
r = await as(M2, `delete from public.session_assignment where session_id='${sessions[1]}' and person_id='${L}'`); check("roster musician removes a musician from a draft", r.ok && r.n === 1, r);
r = await as(M2, `update public.session_assignment set role='leader' where session_id='${sessions[1]}' and person_id='${M2}'`); check("musician can't make themselves leader (0 rows)", r.ok && r.n === 0, r);
r = await as(P, `update public.session_assignment set role='leader' where session_id='${sessions[1]}' and person_id='${M2}'`); check("point person assigns a leader", r.ok && r.n === 1, r);
r = await as(M1, `delete from public.session_assignment where session_id='${sessions[1]}' and person_id='${M2}'`); check("musician can't remove a leader (0 rows)", r.ok && r.n === 0, r);
r = await as(L, `update public.session_assignment set role='participant' where session_id='${sessions[1]}' and person_id='${M2}'`); check("admin lead can swap a leader back", r.ok && r.n === 1, r);

// ---- Review and publish (D5)
r = await as(L, `select public.publish_month('${RES}','${SITE}','2027-02-01')`); check("can't publish before review", !r.ok && /review/.test(r.err), r);
r = await as(L, `select public.mark_month_reviewed('${RES}','${SITE}','2027-02-01')`); check("admin lead can't mark reviewed", !r.ok, r);
r = await as(P, `select public.mark_month_reviewed('${RES}','${SITE}','2027-02-01')`); check("point person marks month reviewed", r.ok, r);
r = await as(P, `select public.mark_month_reviewed('${RES}','${SITE}','2027-02-01')`); check("can't review the same month twice", !r.ok, r);
r = await as(L, `select public.publish_month('${RES}','${SITE}','2027-02-01')`); check("can't publish with sessions missing a leader", !r.ok && /leader/.test(r.err), r);
r = await as(L, `update public.session_assignment set role='leader' where person_id='${M1}' and session_id in (${sessions.map((s) => `'${s}'`).join(",")})`);
check("admin lead sets leaders", r.ok && r.n === 8, r);
r = await as(L, `update public.session_assignment set role='leader' where person_id='${M2}' and session_id='${sessions[0]}'`);
check("two playing leaders on one session rejected", !r.ok, r);
r = await as(M1, `select public.publish_month('${RES}','${SITE}','2027-02-01')`); check("musician can't publish", !r.ok, r);
r = await as(L, `select public.publish_month('${RES}','${SITE}','2027-02-01')`); check("admin lead publishes the month", r.ok, r);
r = await as(L, `select schedule_state, count(*)::int as n from public.session group by 1 order by 1`);
check("12 published (incl. 4 Lessons without a leader), 1 canceled", r.ok && JSON.stringify(r.rows) === JSON.stringify([{ schedule_state: "published", n: 12 }, { schedule_state: "canceled", n: 1 }]), r);
r = await as(M1, `select version, state from public.calendar_export`); check("musician sees calendar version 1 sent", r.ok && r.rows.length === 1 && r.rows[0].state === "sent", r);
r = await as(L, `select public.publish_month('${RES}','${SITE}','2027-02-01')`); check("can't publish twice", !r.ok, r);
r = await as(L, `update public.session set schedule_state='draft' where id='${sessions[0]}'`); check("published can't go back to draft", !r.ok, r);
r = await as(L, `update public.session set public_note='Moved to the Library' where id='${sessions[1]}'`); check("admin lead edits a published session", r.ok && r.n === 1, r);
r = await as(M2, `update public.session set title='Late change' where id='${sessions[1]}'`); check("musicians can't edit once published (0 rows)", r.ok && r.n === 0, r);
r = await as(M2, `delete from public.session_assignment where session_id='${sessions[4]}'`); check("nobody removes musicians from published sessions (0 rows)", r.ok && r.n === 0, r);
r = await as(M1, `insert into public.calendar_export (residency_id,site_id,month,version,state,generated_at) values ('${RES}','${SITE}','2027-02-01',9,'sent',now())`);
check("nobody writes calendar versions directly", !r.ok, r);

// ---- Substitutes (D11, D16)
r = await as(M2, `select public.mark_absent_with_substitute('${sessions[2]}','${O}')`); check("musician names an outside musician as sub", r.ok, r);
r = await as(O, `select is_core from public.roster_member where person_id='${O}'`); check("sub joined the roster as non-core and can see it", r.ok && r.rows.length === 1 && r.rows[0].is_core === false, r);
r = await as(L, `select person_id, status, substitute_for_id from public.session_assignment where session_id='${sessions[2]}' order by status`);
check("M2 absent, O substitute for M2", r.ok && r.rows.some((x) => x.person_id === M2 && x.status === "absent") && r.rows.some((x) => x.person_id === O && x.status === "substitute" && x.substitute_for_id === M2), r);
r = await as(M1, `select public.mark_absent_with_substitute('${sessions[3]}','${S}')`); check("leader names a sub", r.ok, r);
r = await as(L, `select role from public.session_assignment where session_id='${sessions[3]}' and person_id='${S}'`); check("sub takes over as leader", r.ok && r.rows[0]?.role === "leader", r);
r = await as(M1, `select public.mark_absent_with_substitute('${sessions[4]}','${X}')`); check("deactivated person can't be a sub", !r.ok, r);
r = await as(O, `select public.mark_absent_with_substitute('${sessions[4]}','${S}')`); check("can't mark absent on a session you're not in", !r.ok, r);
r = await as(L, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes) values ('${RES}','Sing-along','${ROOM}','2027-02-27 15:00-05',45) returning id`);
check("admin lead adds a session after publishing (draft)", r.ok, r); const LATE = r.rows?.[0]?.id;
r = await as(L, `insert into public.session_assignment (session_id,person_id,role) values ('${LATE}','${M1}','leader')`);
r = await as(M1, `select public.mark_absent_with_substitute('${LATE}','${S}')`); check("subs only on published sessions", !r.ok, r);
r = await as(M2, `update public.session_assignment set status='absent' where session_id='${sessions[5]}' and person_id='${M2}'`);
check("musician can't edit assignments directly (0 rows)", r.ok && r.n === 0, r);

// ---- Fill a whole month at once: March 2027 = 9 Tue/Thu + 5 Tuesday Lessons
r = await as(M1, `select public.generate_residency_month('${RES}','2027-03-01') as n`); check("musician can't fill a month", !r.ok, r);
r = await as(P, `select public.generate_residency_month('${RES}','2027-03-01') as n`); check("point person fills March for all weekly programs (14)", r.ok && r.rows[0].n === 14, r);

// ---- Partner feedback → version 2
r = await as(L, `select public.new_calendar_version('${RES}','${SITE}','2027-02-01','Partner asked to move one date')`);
check("admin lead downloads updated calendar (v2)", r.ok, r);
r = await as(L, `select schedule_state from public.session where id='${LATE}'`); check("new draft session published with v2", r.ok && r.rows[0]?.schedule_state === "published", r);
r = await as(L, `select max(version)::int as v from public.calendar_export`); check("calendar now at version 2", r.ok && r.rows[0].v === 2, r);

// ---- Audit and no deletes
r = await as(A, `select count(*)::int as n from public.audit_log where table_name='session'`); check("session changes are logged", r.ok && r.rows[0].n > 0, r);
r = await as(L, `select * from public.audit_log`); check("non-admins can't read the audit log", r.ok && r.rows.length === 0, r);
r = await as(A, `delete from public.session_assignment sa using public.session ss where ss.id = sa.session_id and ss.schedule_state = 'published'`);
check("even admins can't remove musicians from published sessions (0 rows)", r.ok && r.n === 0, r);
for (const tbl of ["session", "roster_member", "residency", "season", "calendar_export"]) {
  r = await as(A, `delete from public.${tbl}`); check(`nobody deletes ${tbl}`, !r.ok, r);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
