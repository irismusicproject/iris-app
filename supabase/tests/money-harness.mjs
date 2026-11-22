// Shared set-up for the money tests (money-scenarios.test.mjs and
// money-invariants.test.mjs): documentation, hours, approvals and invoices
// (DOMAIN-MODEL sections 4, 5 and 7, v0.23). Runs every migration in an
// in-memory Postgres (PGlite) with a stub of Supabase's auth schema, like
// rls.test.mjs. Made-up people and places only.
//
// Reporting:
//   check(name, cond)            a rule the code keeps; a failure fails the run.
//   knownBug(id, name, cond)     the docs say `cond` should hold, the code
//                                breaks it today. Reported, doesn't fail the
//                                run. If it starts passing, the run FAILS until
//                                it is turned into a plain check().
//   question(id, name, cond)     the docs are ambiguous; `cond` is the reading
//                                we'd expect. Reported, doesn't fail the run.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function boot() {
  const db = new PGlite();
  const dir = path.join(here, "..", "migrations");
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
  // Signed in as `uid` (role authenticated), or anon when uid is null.
  async function as(uid, sql) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ""}',false);`);
    await db.exec(uid ? "set role authenticated" : "set role anon");
    try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows }; }
    catch (e) { return { ok: false, err: e.message }; }
    finally { await db.exec("reset role"); }
  }
  // Ground truth, read past Row Level Security (the test's own eyes only).
  async function su(sql) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
    return (await db.query(sql)).rows;
  }
  return { db, as, su };
}

export function reporter() {
  let pass = 0, fail = 0;
  const known = [], questions = [], fixed = [];
  const fmt = (d) => { try { return JSON.stringify(d)?.slice(0, 600); } catch { return String(d); } };
  return {
    check(name, cond, detail) {
      if (cond) { pass++; console.log("PASS", name); }
      else { fail++; console.log("FAIL", name, fmt(detail)); }
      return !!cond;
    },
    knownBug(id, name, cond, detail) {
      // Strict: a known bug that now passes fails the run, so the fix must turn
      // this knownBug(...) into a plain check(...) in the same change.
      if (cond) { fail++; fixed.push(`${id} ${name}`); console.log(`FAIL (KNOWN BUG ${id} now passes: change it to check(...))`, name); }
      else { known.push(`${id} ${name}`); console.log(`KNOWN BUG ${id}`, name, fmt(detail)); }
      return !!cond;
    },
    question(id, name, cond, detail) {
      if (cond) { pass++; console.log(`PASS (QUESTION ${id} reading holds)`, name); }
      else { questions.push(`${id} ${name}`); console.log(`QUESTION ${id}`, name, fmt(detail)); }
      return !!cond;
    },
    get failures() { return fail; },
    summary(label) {
      const uniq = (a) => [...new Set(a)];
      console.log(`\n${label}: ${pass} passed, ${fail} failed, ${uniq(known).length} known bugs, ${uniq(questions).length} questions`);
      for (const k of uniq(known)) console.log("  KNOWN BUG", k);
      for (const q of uniq(questions)) console.log("  QUESTION ", q);
      for (const f of uniq(fixed)) console.log("  NOW PASSING (was known bug)", f);
      return fail;
    },
  };
}

// ---- Dates. Everything is relative to today (Iris time, America/New_York),
// so the tests keep working as the calendar moves. Pay periods are two weeks
// from the anchor Monday, Nov 2, 2026 (Setting pay_period_anchor, v0.19).
export const ANCHOR = "2026-11-02";
export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function weekStart(date) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10);
}
export function payPeriodStart(date, anchor = ANCHOR) {
  const days = Math.round((Date.parse(`${weekStart(date)}T12:00:00Z`) - Date.parse(`${anchor}T12:00:00Z`)) / 86_400_000);
  return addDays(weekStart(date), -(((days % 14) + 14) % 14));
}
export const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
export const monthOf = (date) => `${date.slice(0, 7)}-01`;
export const round2 = (n) => Math.round(n * 100) / 100;

export const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// ---- The made-up world -------------------------------------------------------
// A  Ada Admin      admin, W-2 (core team)
// P  Pat Point      point person of RES, not an admin
// Q  Quinn Point    point person of RES2, not an admin
// L  Lee Lead       contractor, RES Admin Lead
// M1 Mia One        contractor, RES
// M2 Mo Two         contractor, RES and RES2 (two contracts, two rates)
// W  Wren Wage      W-2 musician on RES (no contract, no invoice)
// X  Xan Former     contractor on RES, deactivated later in the story
// O  Oli Outside    active contractor on no roster
export const P_ = {
  A: id("a1"), P: id("c1"), Q: id("c2"), L: id("b1"), M1: id("d1"), M2: id("d2"), W: id("d3"), X: id("f1"), O: id("e1"),
};
export async function buildPeople({ db }) {
  const people = [
    [P_.A, "Ada Admin", "employee_w2", "{admin}"], [P_.P, "Pat Point", "employee_w2", "{}"], [P_.Q, "Quinn Point", "employee_w2", "{}"],
    [P_.L, "Lee Lead", "contractor_1099", "{}"], [P_.M1, "Mia One", "contractor_1099", "{}"], [P_.M2, "Mo Two", "contractor_1099", "{}"],
    [P_.W, "Wren Wage", "employee_w2", "{}"], [P_.X, "Xan Former", "contractor_1099", "{}"], [P_.O, "Oli Outside", "contractor_1099", "{}"],
  ];
  const mail = (n) => `${n.split(" ")[0].toLowerCase()}@example.org`;
  await db.exec(`insert into auth.users values ${people.map(([u, n]) => `('${u}','${mail(n)}')`).join(",")};
insert into public.person (id,name,email,employment_type,system_roles) values
${people.map(([u, n, e, r]) => `('${u}','${n}','${mail(n)}','${e}','${r}')`).join(",\n")};`);
}

// Places, residencies, seasons, rosters, point people and contracts, set up
// the way the app does it (as an admin). Returns ids and the season window.
export async function buildPlaces({ as }, seasonStart, seasonEnd) {
  const one = async (sql) => { const r = await as(P_.A, sql); if (!r.ok) throw new Error(`${r.err}\n${sql}`); return r.rows?.[0]; };
  const w = {};
  w.PT = (await one(`insert into public.partner (legal_name,display_name,billing_address,billing_email) values ('Example Living Inc.','Example Living','1 Main St','billing@example.org') returning id`)).id;
  w.S1 = (await one(`insert into public.site (partner_id,name,display_name,timezone) values ('${w.PT}','Maple House','Maple House','America/New_York') returning id`)).id;
  w.S2 = (await one(`insert into public.site (partner_id,name,display_name,timezone) values ('${w.PT}','Birch Hall','Birch Hall','America/Chicago') returning id`)).id;
  w.R1 = (await one(`insert into public.location (site_id,name,display_name) values ('${w.S1}','Library','Library') returning id`)).id;
  w.R2 = (await one(`insert into public.location (site_id,name,display_name) values ('${w.S2}','Lounge','Lounge') returning id`)).id;
  w.PT2 = (await one(`insert into public.partner (legal_name,display_name) values ('Other Org','Other Org') returning id`)).id;
  w.T1 = (await one(`insert into public.site (partner_id,name,display_name,timezone) values ('${w.PT2}','Elm Court','Elm Court','America/New_York') returning id`)).id;
  w.R3 = (await one(`insert into public.location (site_id,name,display_name) values ('${w.T1}','Hall','Hall') returning id`)).id;
  w.RES = (await one(`insert into public.residency (partner_id,name,display_name,status) values ('${w.PT}','Example Maple','Iris Music Project at Maple House','active') returning id`)).id;
  w.RES2 = (await one(`insert into public.residency (partner_id,name,display_name,status) values ('${w.PT2}','Other Elm','Iris Music Project at Elm Court','active') returning id`)).id;
  await one(`insert into public.residency_site values ('${w.RES}','${w.S1}'),('${w.RES}','${w.S2}'),('${w.RES2}','${w.T1}') returning 1`);
  w.SEA = (await one(`insert into public.season (residency_id,name,starts_on,ends_on,kind) values ('${w.RES}','Maple season','${seasonStart}','${seasonEnd}','season') returning id`)).id;
  w.SEA2 = (await one(`insert into public.season (residency_id,name,starts_on,ends_on,kind) values ('${w.RES2}','Elm season','${seasonStart}','${seasonEnd}','season') returning id`)).id;
  await one(`insert into public.roster_member (season_id,person_id,is_core,is_admin_lead) values
    ('${w.SEA}','${P_.L}',true,true),('${w.SEA}','${P_.M1}',true,false),('${w.SEA}','${P_.M2}',true,false),
    ('${w.SEA}','${P_.W}',false,false),('${w.SEA}','${P_.X}',false,false),('${w.SEA2}','${P_.M2}',true,false) returning 1`);
  await one(`insert into public.staff_assignment (residency_id,person_id,role,starts_on) values
    ('${w.RES}','${P_.P}','point_person','${seasonStart}'),('${w.RES2}','${P_.Q}','point_person','${seasonStart}') returning 1`);
  const cat = async (name) => (await one(`select id from public.time_category where name='${name}'`)).id;
  w.CAT_PROG = await cat("Programs"); w.CAT_RB = await cat("Relationship Building"); w.CAT_CONC = await cat("Concerts");
  w.IT_PERF = (await one(`select id from public.interaction_type where name='Performance'`)).id;
  w.IT_MIP = (await one(`select id from public.interaction_type where name='Music Instructional Program'`)).id;
  return w;
}
