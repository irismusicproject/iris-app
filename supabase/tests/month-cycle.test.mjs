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
r = await as(P, `select public.open_schedule_month('${RES}', null, '2027-02-01') as n`); check("point person opens February for every building (1)", r.ok && r.rows[0].n === 1, r);
r = await as(P, `select public.open_schedule_month('${RES}', null, '2027-02-01') as n`); check("opening again changes nothing", r.ok && r.rows[0].n === 0, r);
r = await as(A, `select team_due_on::text, final_due_on::text from public.schedule_month`); check("due the 10th and 15th of January", r.ok && r.rows[0].team_due_on === "2027-01-10" && r.rows[0].final_due_on === "2027-01-15", r);
r = await as(A, `select count(*)::int as n from public.notification where kind='month_opened'`); check("the musicians playing are emailed", r.ok && r.rows[0].n === 2, r);
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

// ---- Confirm (point person), undo
r = await as(L, `select public.confirm_schedule_month(${M})`); check("the Admin Lead can't confirm", !r.ok, r);
r = await as(P, `select public.confirm_schedule_month(${M})`); check("point person confirms the team's version", r.ok && (await stage()) === "team_confirmed", r);
r = await as(M1, `update public.session set title='Late idea' where id='${sessions[1]}'`); check("confirmed: musicians are locked out", !r.ok, r);
r = await as(P, `select public.undo_confirm_schedule_month(${M})`); check("point person can undo confirming before sending", r.ok && (await stage()) === "team_editing", r);
r = await as(A, `select count(*)::int as n from public.calendar_export`); check("…which removes the reviewed calendar version", r.ok && r.rows[0].n === 0, r);

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
