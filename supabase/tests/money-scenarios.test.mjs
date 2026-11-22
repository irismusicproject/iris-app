// Money scenarios: documentation, hours, approvals and invoices, told as one
// story (DOMAIN-MODEL v0.23 sections 4, 5 and 7; D3, D4, D9, D14, D15).
// Database only, no browser: every rule is checked through Row Level
// Security and the database functions, signed in as each person in turn.
// The community-invoice arithmetic is the shared module the app uses
// (src/shared/domain/partner-invoice.ts), fed by the database's numbers.
//
// Run with: node supabase/tests/money-scenarios.test.mjs
// Made-up data only. KNOWN BUG / QUESTION lines are reported but don't fail
// the run; see the PR description for the findings list.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, ANCHOR, addDays, payPeriodStart, monthOf, round2 } from "./money-harness.mjs";
import { buildPartnerInvoices, customLinesTotal } from "../../src/shared/domain/partner-invoice.ts";

const { db, as, su } = await boot();
const T = reporter();
const { check, knownBug, question } = T;
const { A, P, Q, L, M1, M2, W, X, O } = P_;
const num = (x) => (x === null || x === undefined ? x : Number(x));
const denied = (r) => !r.ok || r.n === 0;        // refused, or touched nothing
const none = (r) => !r.ok || r.rows.length === 0; // refused, or saw nothing
const must = async (who, sql) => { const x = await as(who, sql); if (!x.ok) throw new Error(`setup failed: ${x.err}\n${sql}`); return x.rows; };
let r;

// ---- Dates: the latest pay period that has fully ended (two weeks from the
// anchor Monday, Nov 2, 2026), its two weeks, and a season around them.
const PP = payPeriodStart(addDays(TODAY, -14));
const W1 = PP, W2 = addDays(PP, 7), PP_END = addDays(PP, 13);
const SEASON_START = addDays(PP, -70), SEASON_END = addDays(TODAY, 200);
console.log(`today ${TODAY}; pay period ${PP} to ${PP_END} (anchor ${ANCHOR})`);
check("pay period starts on a Monday a multiple of 14 days after the anchor (Nov 2, 2026)",
  Math.round((Date.parse(PP) - Date.parse(ANCHOR)) / 86_400_000) % 14 === 0 && new Date(`${PP}T12:00:00Z`).getUTCDay() === 1, PP);

await buildPeople({ db });
const w = await buildPlaces({ as }, SEASON_START, SEASON_END);
const { RES, RES2, S1, S2, T1, R1, R2, R3, SEA, SEA2, CAT_PROG, CAT_RB, IT_PERF, IT_MIP } = w;

// ============================================================================
// 1. Sessions: drafts, leaders, review, publish (the schedule the money hangs on)
// ============================================================================
// s1  W1 Tue 2 pm Maple, 60 min: L leads, M1 + M2 play
// s2  W1 Thu 2 pm Birch (Chicago time), 45 min: M1 leads, L plays (ran 50)
// les W1 Tue Maple, scheduled relationship building ("Lessons"), no time
// r1  W1 Wed 2 pm Elm Court (RES2), 60 min: M2 leads
// s7  W2 Mon 2 pm Maple, 60 min: W leads, never documented
// s3  W2 Tue 2 pm Maple, 60 min: L leads, M1 + M2 play; M2 later absent, W subs
// s5  W2 Wed 2 pm Maple, 60 min: M1 leads, L plays; not billable (a gift)
// s4  W2 Thu 2 pm Maple, 90 min: L leads, M1 plays; partner cancels at 10:30 am
// s6  W2 Fri 2 pm Maple, 60 min: L leads, M1 plays; partner cancels at 8 am
// fut today + 3, Maple: a future date (can't be documented yet)
const at = (date, tz = "America/New_York", time = "14:00:00") => `'${date} ${time} ${tz}'`;
const mk = async (title, loc, when, minutes, extra = "") => (await must(A, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes${extra ? "," + extra.split("=")[0] : ""})
  values ('${loc === R3 ? RES2 : RES}','${title}','${loc}',${when},${minutes}${extra ? "," + extra.split("=")[1] : ""}) returning id`))[0].id;
const s1 = await mk("Music Café", R1, at(addDays(W1, 1)), 60);
const s2 = await mk("Jam Band", R2, at(addDays(W1, 3), "America/Chicago"), 45);
const r1 = await mk("Elm Sing", R3, at(addDays(W1, 2)), 60);
const s7 = await mk("Monday Strings", R1, at(addDays(W2, 0)), 60);
const s3 = await mk("Music Café", R1, at(addDays(W2, 1)), 60);
const s5 = await mk("Gift Concert", R1, at(addDays(W2, 2)), 60, "billable=false");
const s4 = await mk("Music Café", R1, at(addDays(W2, 3)), 90);
const s6 = await mk("Music Café", R1, at(addDays(W2, 4)), 60);
const fut = await mk("Next Week", R1, at(addDays(TODAY, 3)), 60);
const les = (await must(A, `insert into public.session (residency_id,kind,title,location_id,starts_at,has_set_time)
  values ('${RES}','relationship_building','Lessons','${R1}',${at(addDays(W1, 1), "America/New_York", "00:00:00")},false) returning id`))[0].id;
const staff = async (sid, rows) => must(A, `insert into public.session_assignment (session_id,person_id,role) values ${rows.map(([p, role]) => `('${sid}','${p}','${role}')`).join(",")}`);
await staff(s1, [[L, "leader"], [M1, "participant"], [M2, "participant"]]);
await staff(s2, [[M1, "leader"], [L, "participant"]]);
await staff(r1, [[M2, "leader"]]);
await staff(s7, [[W, "leader"]]);
await staff(s3, [[L, "leader"], [M1, "participant"], [M2, "participant"]]);
await staff(s5, [[M1, "leader"], [L, "participant"]]);
await staff(s4, [[L, "leader"], [M1, "participant"]]);
await staff(s6, [[L, "leader"], [M1, "participant"]]);
await staff(fut, [[L, "leader"]]);
await staff(les, [[M1, "participant"]]);
// The point person reviews each month at each site; the Admin Lead publishes (D5).
const months = new Set();
for (const [sid, site] of [[s1, S1], [s2, S2], [s7, S1], [s3, S1], [s5, S1], [s4, S1], [s6, S1], [fut, S1], [les, S1]]) {
  const m = (await su(`select date_trunc('month', se.starts_at at time zone st.timezone)::date::text as m from public.session se join public.location l on l.id=se.location_id join public.site st on st.id=l.site_id where se.id='${sid}'`))[0].m;
  months.add(`${site}|${m}`);
}
for (const k of months) {
  const [site, m] = k.split("|");
  r = await as(P, `select public.mark_month_reviewed('${RES}','${site}','${m}')`); check(`point person reviews ${m} at ${site === S1 ? "Maple" : "Birch"}`, r.ok, r);
  r = await as(L, `select public.publish_month('${RES}','${site}','${m}')`); check(`admin lead publishes ${m} at ${site === S1 ? "Maple" : "Birch"}`, r.ok, r);
}
const r1m = (await su(`select date_trunc('month', starts_at at time zone 'America/New_York')::date::text as m from public.session where id='${r1}'`))[0].m;
r = await as(Q, `select public.mark_month_reviewed('${RES2}','${T1}','${r1m}')`); check("RES2 point person reviews Elm Court", r.ok, r);
r = await as(Q, `select public.publish_month('${RES2}','${T1}','${r1m}')`); check("RES2 point person publishes Elm Court", r.ok, r);
r = await as(M2, `select public.mark_absent_with_substitute('${s3}','${W}')`); check("M2 marks self absent on s3 and names W as sub (D11)", r.ok, r);
// The database records canceled_at itself (fix K3, migration 20261209), so the test
// cancels normally and then sets the recorded time behind the scenes to simulate it.
r = await as(P, `update public.session set schedule_state='canceled', cancellation_reason='partner' where id='${s4}'`);
check("point person records a late partner cancellation (10:30 am) on s4", r.ok && r.n === 1, r);
await su(`update public.session set canceled_at=${at(addDays(W2, 3), "America/New_York", "10:30:00")} where id='${s4}'`);
r = await as(P, `update public.session set schedule_state='canceled', cancellation_reason='partner' where id='${s6}'`);
check("point person records an on-time partner cancellation (8 am) on s6", r.ok && r.n === 1, r);
await su(`update public.session set canceled_at=${at(addDays(W2, 4), "America/New_York", "08:00:00")} where id='${s6}'`);

// ============================================================================
// 2. Pay: contracts and stipends (admins set them; the musician and admins see them)
// ============================================================================
const contract = (who, person, season, rate) => as(who, `insert into public.contract (person_id,season_id,hourly_rate) values ('${person}','${season}',${rate}) returning id`);
r = await contract(P, M1, SEA, 35); check("point person can't set a rate (v0.19)", !r.ok, r);
r = await contract(L, M1, SEA, 35); check("admin lead can't set a rate", !r.ok, r);
r = await contract(M1, M1, SEA, 99); check("musician can't write their own contract", !r.ok, r);
const C = {};
for (const [k, person, season, rate] of [["L", L, SEA, 40], ["M1", M1, SEA, 35], ["M2", M2, SEA, 30], ["M2b", M2, SEA2, 45], ["X", X, SEA, 33]]) {
  r = await contract(A, person, season, rate); check(`admin sets ${k}'s rate ($${rate}/h)`, r.ok, r); C[k] = r.rows?.[0]?.id;
}
r = await contract(A, M1, SEA, 50); check("one contract per person per season", !r.ok, r);
r = await as(A, `insert into public.contract (person_id,season_id,hourly_rate) values ('${O}','${SEA}',-1)`); check("negative rate rejected", !r.ok, r);
const stip = (who, c, kind, due, amt) => as(who, `insert into public.stipend_installment (contract_id,kind,due_on,amount) values ('${c}','${kind}','${due}',${amt}) returning id`);
r = await stip(P, C.L, "admin_lead", addDays(PP, 4), 150); check("point person can't add a stipend", !r.ok, r);
r = await stip(A, C.L, "admin_lead", addDays(PP, 4), 150); check("admin adds L's admin-lead stipend due in the period", r.ok, r); const ST_L1 = r.rows?.[0]?.id;
r = await stip(A, C.L, "admin_lead", addDays(PP, 30), 150); check("admin adds L's next stipend (a later period)", r.ok, r);
r = await stip(A, C.M1, "project_support", addDays(PP, 6), 100); check("admin adds M1's project-support stipend", r.ok, r); const ST_M1 = r.rows?.[0]?.id;
r = await stip(A, C.M1, "training", addDays(PP, 2), -5); check("negative stipend rejected", !r.ok, r);
r = await as(M1, `update public.contract set hourly_rate=99 where id='${C.M1}'`); check("musician can't raise their own rate (0 rows)", denied(r), r);
r = await as(M1, `update public.stipend_installment set amount=999 where id='${ST_M1}'`); check("musician can't change their stipend (0 rows)", denied(r), r);
r = await as(M1, `select id, hourly_rate from public.contract`); check("musician sees only their own contract", r.ok && r.rows.length === 1 && r.rows[0].id === C.M1, r);
r = await as(L, `select amount from public.stipend_installment`); check("admin lead sees only their own two stipends", r.ok && r.rows.length === 2, r);
for (const [who, name] of [[P, "point person"], [Q, "other point person"], [O, "outsider"], [W, "W-2 musician"]]) {
  r = await as(who, `select * from public.contract`); check(`${name} sees no contracts (never pay)`, none(r), r);
  r = await as(who, `select * from public.stipend_installment`); check(`${name} sees no stipends`, none(r), r);
}
r = await as(P, `select * from public.audit_log where table_name='contract'`); check("point person can't read pay through the audit log", none(r), r);
r = await su(`select count(*)::int as n from public.audit_log where table_name='contract'`); check("contract changes are logged (AuditLog)", r[0].n >= 5, r);
r = await su(`select count(*)::int as n from public.audit_log where table_name='stipend_installment'`);
check("[fixed B4, migration 20261208] stipend installments are logged when created or changed (AuditLog: 'contracts')", r[0].n >= 3, r);

// ============================================================================
// 3. Community contracts (admins only)
// ============================================================================
const agreement = async (name, sites, cols) => {
  const keys = Object.keys(cols), vals = Object.values(cols).map((v) => (v === null ? "null" : typeof v === "string" ? `'${v}'` : v));
  const id = (await must(A, `insert into public.partner_agreement (residency_id,season_id,name,${keys.join(",")}) values ('${RES}','${SEA}','${name}',${vals.join(",")}) returning id`))[0].id;
  await must(A, `insert into public.partner_agreement_site values ${sites.map((s) => `('${id}','${s}')`).join(",")}`);
  return id;
};
r = await as(P, `insert into public.partner_agreement (residency_id,season_id,name,hourly_rate) values ('${RES}','${SEA}','Sneaky',1)`); check("point person can't create a community contract", !r.ok, r);
const AG1 = await agreement("Maple programs", [S1], { billing_basis: "per_hour", hourly_rate: 60, contracted_hours: 100, bill_stipends: true, overhead_percent: 15, overhead_billing: "same_invoice", bill_late_cancellations: true });
const AG2 = await agreement("Birch programs", [S2], { billing_basis: "per_hour", hourly_rate: 50, contracted_hours: 20, bill_stipends: false, overhead_percent: 10, overhead_billing: "separate_invoice" });
r = await as(A, `insert into public.partner_agreement_site values ('${AG2}','${T1}')`); check("a contract can't cover another program's site", !r.ok, r);
r = await as(A, `insert into public.partner_agreement (residency_id,season_id,name,billing_basis) values ('${RES}','${SEA}','No rate','per_hour')`); check("a per-hour contract needs a rate", !r.ok, r);
for (const [who, name] of [[P, "point person"], [L, "admin lead"], [M1, "musician"], [O, "outsider"]]) {
  r = await as(who, `select * from public.partner_agreement`); check(`${name} sees no community contracts`, none(r), r);
  r = await as(who, `select * from public.partner_billable_minutes('${AG1}','${PP}','${PP_END}')`); check(`${name} gets no billable minutes`, none(r), r);
  r = await as(who, `select * from public.partner_billable_stipends('${AG1}','${PP}','${PP_END}')`); check(`${name} gets no billed stipends`, none(r), r);
}

// ============================================================================
// 4. Residents and relationship building (D14; no health information)
// ============================================================================
r = await su(`select array_agg(column_name::text order by column_name) as c from information_schema.columns where table_schema='public' and table_name='resident'`);
check("a resident record holds only name, disambiguator, site and bookkeeping (no health fields)",
  JSON.stringify(r[0].c) === JSON.stringify(["active", "created_at", "created_by", "disambiguator", "display_name", "id", "site_id"]), r);
const addRes = (who, site, name, dis = "") => as(who, `insert into public.resident (site_id,display_name,disambiguator,created_by) values ('${site}','${name}','${dis}','${who}') returning id`);
r = await addRes(M1, S1, "Ruth K."); check("roster musician adds a resident while logging", r.ok, r); const RUTH = r.rows?.[0]?.id;
r = await addRes(M2, S1, "ruth k."); check("same name at the same site needs a disambiguator", !r.ok, r);
r = await addRes(M2, S1, "Ruth K.", "violin student"); check("…with one it's fine", r.ok, r);
r = await addRes(P, S1, "Pat's Pick"); check("point person sees residents but can't add them", !r.ok, r);
r = await addRes(O, S1, "Olive O."); check("outsider can't add residents", !r.ok, r);
r = await addRes(M1, T1, "Elm E."); check("musician can't add residents at a site they don't serve", !r.ok, r);
r = await addRes(M1, S2, "Ann B."); const ANN = r.rows?.[0]?.id;
r = await addRes(M1, S2, "Bob C."); const BOB = r.rows?.[0]?.id;
r = await addRes(M2, T1, "Elm E."); check("M2 adds a resident at RES2's site", r.ok, r);
r = await as(P, `select id from public.resident where site_id in ('${S1}','${S2}')`); check("point person sees the program's residents", r.ok && r.rows.length === 4, r);
r = await as(P, `select id from public.resident where site_id='${T1}'`); check("point person doesn't see another program's residents", none(r), r);
r = await as(Q, `select id from public.resident where site_id='${S1}'`); check("other program's point person doesn't see Maple's residents", none(r), r);
r = await as(O, `select id from public.resident`); check("outsider sees no residents", none(r), r);
r = await as(M2, `select site_id from public.resident`); check("M2 (on both rosters) sees residents of both programs' sites", r.ok && r.rows.length === 5, r);
r = await su(`select count(*)::int as n from public.audit_log where table_name='resident' and action not in ('insert','update')`);
knownBug("B5", "every view of a site's residents is logged (D14, AuditLog: 'resident-record reads are logged too')", r[0].n > 0, r);
r = await as(M1, `delete from public.resident where id='${RUTH}'`); check("musician can't delete a resident", denied(r), r);
r = await as(A, `delete from public.resident where id='${RUTH}'`); check("admins can't delete a resident either (deactivate instead)", denied(r), r);

const logAct = (who, res, site, day, kind, minutes, collab = false, note = null) => as(who, `insert into public.relationship_activity (person_id,residency_id,site_id,occurred_on,kind,minutes,collaborative,note)
  values ('${who}','${res}','${site}','${day}','${kind}',${minutes},${collab},${note === null ? "null" : `'${note}'`}) returning id`);
const withRes = (who, act, res) => as(who, `insert into public.relationship_activity_resident values ('${act}','${res}')`);
r = await logAct(M1, RES, S1, addDays(W1, 1), "one_to_one", 30, true, "Played her favorite hymn."); check("M1 logs a one-to-one at Maple (Collab? Yes)", r.ok, r); const ACT_M1a = r.rows?.[0]?.id;
r = await withRes(M1, ACT_M1a, RUTH); check("…with Ruth K.", r.ok, r);
r = await logAct(M1, RES, S2, addDays(W2, 2), "mini_group", 45); check("M1 logs a mini-group at Birch", r.ok, r); const ACT_M1b = r.rows?.[0]?.id;
r = await withRes(M1, ACT_M1b, ANN); r = await withRes(M1, ACT_M1b, BOB); check("…with two Birch residents", r.ok, r);
r = await withRes(M1, ACT_M1b, RUTH); check("a resident from another site can't be added", !r.ok, r);
r = await logAct(M2, RES, S1, addDays(W1, 2), "hallway_concert", 20); check("M2 logs a hallway concert (no residents)", r.ok, r);
r = await logAct(L, RES, S1, addDays(W2, 1), "one_to_one", 15); check("L logs a one-to-one", r.ok, r); const ACT_L = r.rows?.[0]?.id;
r = await withRes(M1, ACT_L, RUTH); check("only the activity's owner adds its residents", !r.ok, r);
r = await logAct(X, RES, S1, addDays(W1, 3), "one_to_one", 25); check("X logs a one-to-one (before leaving)", r.ok, r); const ACT_X = r.rows?.[0]?.id;
r = await logAct(X, RES, S2, addDays(W2, 3), "one_to_one", 10); const ACT_X2 = r.rows?.[0]?.id;
r = await logAct(O, RES, S1, addDays(W1, 1), "one_to_one", 30); check("outsider can't log relationship building", !r.ok, r);
r = await as(M1, `insert into public.relationship_activity (person_id,residency_id,site_id,occurred_on,kind,minutes) values ('${M2}','${RES}','${S1}','${W1}','one_to_one',30)`);
check("musician can't log for someone else", !r.ok, r);
r = await logAct(M1, RES, T1, addDays(W1, 1), "one_to_one", 30); check("activity site must be one of the program's sites", !r.ok, r);
r = await logAct(M1, RES, S1, addDays(TODAY, 1), "one_to_one", 30); check("activities are logged after they happen", !r.ok, r);
r = await as(M1, `insert into public.relationship_activity (person_id,residency_id,site_id,occurred_on,kind) values ('${M1}','${RES}','${S1}','${W1}','one_to_one')`);
check("minutes are required (v0.21: billed per site)", !r.ok, r);
const longNote = "A".repeat(600);
r = await logAct(M1, RES, S1, addDays(W1, 1), "one_to_one", 1, false, longNote); check("a one-sentence note (500 characters) where detailed notes are off", !r.ok, r);
r = await as(A, `update public.site set detailed_relationship_notes=true where id='${S2}'`); check("admin switches on detailed notes at Birch", r.ok && r.n === 1, r);
r = await as(M1, `update public.relationship_activity set note='${longNote}' where id='${ACT_M1b}'`); check("…where a paragraph note is allowed (v0.21)", r.ok && r.n === 1, r);
r = await as(M1, `select person_id from public.relationship_activity`); check("musician sees only their own activities", r.ok && r.rows.length === 2 && r.rows.every((x) => x.person_id === M1), r);
r = await as(P, `select id from public.relationship_activity`); check("point person sees all of the program's activities", r.ok && r.rows.length === 6, r);
r = await as(Q, `select id from public.relationship_activity where residency_id='${RES}'`); check("another program's point person sees none of them", none(r), r);
r = await as(O, `select * from public.relationship_activity_resident`); check("outsider sees no activity–resident links", none(r), r);
// A musician on one roster moves their own activity into another program.
r = await as(M1, `update public.relationship_activity set residency_id='${RES2}', site_id='${T1}' where id='${ACT_M1a}'`);
check("[fixed B6, migration 20261208] a musician can't move their activity into a program they aren't on (insert requires the current roster; update doesn't)", denied(r), r);
await su(`update public.relationship_activity set residency_id='${RES}', site_id='${S1}' where id='${ACT_M1a}'`);

// ActivityLength and Target: the point person (and admins) set them (v0.19, v0.21).
r = await as(P, `insert into public.activity_length (residency_id,kind,minutes) values ('${RES}','one_to_one',30)`); check("point person sets the usual one-to-one length", r.ok, r);
r = await as(M1, `insert into public.activity_length (residency_id,kind,minutes) values ('${RES}','mini_group',40)`); check("musician can't set usual lengths", !r.ok, r);
r = await as(M1, `select minutes from public.activity_length`); check("musicians read the usual lengths (pre-fill)", r.ok && r.rows.length === 1, r);
r = await as(P, `insert into public.target (season_id,metric,value) values ('${SEA}','collaborative_programs_per_musician',3)`); check("point person sets the season's collaboration target", r.ok, r);
r = await as(M1, `update public.target set value=0`); check("musician can't change the target (0 rows)", denied(r), r);

// Monthly reflections: own; point person and admins read.
r = await as(M1, `insert into public.monthly_reflection (person_id,residency_id,month,highlights) values ('${M1}','${RES}','${monthOf(W1)}','Ruth sang along.')`); check("M1 writes a monthly reflection", r.ok, r);
r = await as(M2, `select * from public.monthly_reflection`); check("another musician can't read it", none(r), r);
r = await as(P, `select * from public.monthly_reflection`); check("point person reads it", r.ok && r.rows.length === 1, r);

// ============================================================================
// 5. Hours: "My week", Submit my week
// ============================================================================
// v0.24: hours are calculated from documentation, never typed. "Submit my week"
// is submit_week(); approve_week() refreshes the hours first. Expected hours
// below are worked out by hand from the story above (programs played and
// documented, relationship building logged), not read from the database.
const submit = (who, res, week) => as(who, `select public.submit_week('${res}','${week}')`);
const hoursOf = async (who, res, week) => Object.fromEntries((await su(`select tc.name, te.hours, te.state from public.time_entry te join public.time_category tc on tc.id=te.time_category_id
  where te.person_id='${who}' and te.residency_id='${res}' and te.week_starting='${week}'`)).map((x) => [x.name, { h: num(x.hours), state: x.state }]));
r = await as(M1, `insert into public.time_entry (person_id,residency_id,week_starting,time_category_id,hours) values ('${M1}','${RES}','${W1}','${CAT_PROG}',2)`);
check("musicians can't type hours (v0.24: calculated from documentation)", !r.ok, r);
r = await as(M1, `insert into public.time_entry (person_id,residency_id,week_starting,time_category_id,hours) values ('${M2}','${RES}','${W1}','${CAT_PROG}',1)`);
check("…nor for someone else", !r.ok, r);
r = await as(M1, `select public.submit_week('${RES}','${addDays(W1, 2)}')`); check("a week starts on a Monday", !r.ok && /Monday/.test(r.err), r);
r = await as(O, `select public.submit_week('${RES}','${W1}')`); check("outsider can't submit hours on a program", !r.ok, r);
// Submit my week is refused while a program the musician led that week has no report (v0.21).
r = await submit(L, RES, W1); check("L can't submit W1 while s1 (led by L) is undocumented", !r.ok && /document/.test(r.err), r);
r = await submit(M1, RES, W1); check("M1 can't submit W1 while s2 (led by M1) is undocumented", !r.ok, r);
r = await submit(W, RES, W2); check("W can't submit W2 while s7 (led by W) is undocumented", !r.ok, r);
r = await as(L, `select session_id from public.undocumented_led_sessions('${L}','${RES}','${W1}')`); check("L sees what's left to document", r.ok && r.rows.length === 1 && r.rows[0].session_id === s1, r);
r = await as(M2, `select * from public.undocumented_led_sessions('${L}','${RES}','${W1}')`); check("another musician can't list L's undocumented programs", none(r), r);
r = await submit(M2, RES, W1); let H = await hoursOf(M2, RES, W1);
check("M2 submits RES W1 (led nothing at RES): s1 isn't documented yet, so 0 h programs; hallway concert 20 min = 0.33 h", r.ok && H.Programs?.h === 0 && H["Relationship Building"]?.h === 0.33 && H.Programs?.state === "submitted", H);
r = await submit(M2, RES2, W1); check("M2 can't submit RES2 W1 while r1 is undocumented", !r.ok, r);
r = await as(P, `select public.approve_week('${M2}','${RES}','${W1}')`);
check("approval waits while a program M2 played that week (s1) has no report yet, and names its leader", !r.ok && /waiting for documentation from Lee Lead/.test(r.err), r);
r = await submit(W, RES, W1); H = await hoursOf(W, RES, W1); check("W submits W1 (no work that week: 0 h)", r.ok && Object.values(H).every((x) => x.h === 0), H);
r = await submit(X, RES, W1); H = await hoursOf(X, RES, W1); check("X submits W1: one-to-one 25 min = 0.42 h", r.ok && H["Relationship Building"]?.h === 0.42, H);
r = await as(M2, `update public.time_entry set hours=9 where person_id='${M2}' and residency_id='${RES}' and week_starting='${W1}'`); check("submitted hours can't be changed by the musician (0 rows)", denied(r), r);
r = await as(M2, `update public.time_entry set state='approved' where person_id='${M2}'`); check("musician can't approve their own hours (0 rows)", denied(r), r);

// ============================================================================
// 6. Documenting sessions (D3: the leader documents; v0.19, v0.20)
// ============================================================================
const report = (who, sid, minutes, att, it, inv = "none") => as(who, `insert into public.session_report (session_id,author_id,attendance,interaction_type_id,resident_involvement${minutes === null ? "" : ",actual_minutes"})
  values ('${sid}','${who}',${att},'${it}','${inv}'${minutes === null ? "" : "," + minutes}) returning actual_minutes`);
r = await report(M1, s1, 60, 12, IT_PERF); check("a participant can't document (the leader does, D3)", !r.ok, r);
r = await report(P, s1, 60, 12, IT_PERF); check("the point person can't document a session", !r.ok, r);
r = await report(O, s1, 60, 12, IT_PERF); check("outsider can't document", !r.ok, r);
r = await report(L, s1, null, 12, IT_PERF, "co_led");
question("Q4", "a report left without a length takes the session's scheduled length (v0.20: 'it is scheduled_minutes unless they choose Ran longer or shorter')", r.ok && r.rows[0].actual_minutes === 60, r);
if (!r.ok) { r = await report(L, s1, 60, 12, IT_PERF, "co_led"); check("leader documents s1 (pre-filled 60 min, Collab? Yes)", r.ok, r); }
r = await report(L, s1, 60, 12, IT_PERF); check("one report per session", !r.ok, r);
r = await report(M1, s2, 50, 8, IT_MIP); check("M1 documents s2, which ran longer (50 min)", r.ok, r);
r = await report(L, s3, 60, 9, IT_PERF); check("L documents s3", r.ok, r);
r = await report(M1, s5, 60, 30, IT_PERF); check("M1 documents the non-billable s5", r.ok, r);
r = await report(M2, r1, 60, 7, IT_PERF, "co_led"); check("M2 documents r1 at RES2", r.ok, r);
r = await report(L, s4, 90, 0, IT_PERF); check("a canceled session isn't documented", !r.ok, r);
r = await report(L, fut, 60, 5, IT_PERF); check("a session is documented only after it happens", !r.ok, r);
r = await report(A, les, 30, 5, IT_PERF); check("scheduled relationship building has no session report", !r.ok, r);
r = await report(M2, s3, 60, 9, IT_PERF); check("an absent musician can't document", !r.ok, r);
r = await as(L, `update public.session_report set attendance=13 where session_id='${s1}'`); check("the leader corrects attendance", r.ok && r.n === 1, r);
r = await as(M1, `update public.session_report set attendance=99 where session_id='${s1}'`); check("a participant can't change the report (0 rows)", denied(r), r);
r = await as(M2, `select attendance, resident_involvement from public.session_report where session_id='${s1}'`); check("roster musicians read the program's reports", r.ok && r.rows[0]?.attendance === 13, r);
r = await as(Q, `select * from public.session_report where session_id='${s1}'`); check("another program's point person doesn't", none(r), r);
r = await su(`select count(*) filter (where r.resident_involvement <> 'none')::int as collab, count(*)::int as n from public.session_report r join public.session s on s.id=r.session_id where s.residency_id='${RES}'`);
check("Collab? Yes is stored as co_led and counts as collaborative (v0.19)", r[0].collab === 1 && r[0].n === 4, r);
r = await su(`select count(*)::int as n from public.audit_log where table_name='session_report'`); check("reports are logged", r[0].n >= 5, r);
// Now the leaders can submit.
r = await submit(L, RES, W1); H = await hoursOf(L, RES, W1); check("L submits W1 once s1 is documented: s1 60 + s2 50 min = 1.83 h", r.ok && H.Programs?.h === 1.83, H);
r = await submit(L, RES, W2); H = await hoursOf(L, RES, W2); check("L submits W2: s3 60 + s5 60 = 2.0 h; one-to-one 15 min = 0.25 h", r.ok && H.Programs?.h === 2 && H["Relationship Building"]?.h === 0.25, H);
r = await submit(M1, RES, W1); H = await hoursOf(M1, RES, W1); check("M1 submits W1: s1 60 + s2 50 = 1.83 h; one-to-one 30 min = 0.5 h", r.ok && H.Programs?.h === 1.83 && H["Relationship Building"]?.h === 0.5, H);
r = await submit(M1, RES, W2); H = await hoursOf(M1, RES, W2); check("M1 submits W2: s3 60 + s5 60 = 2.0 h; mini-group 45 min = 0.75 h", r.ok && H.Programs?.h === 2 && H["Relationship Building"]?.h === 0.75, H);
r = await submit(M2, RES, W2); H = await hoursOf(M2, RES, W2); check("M2 submits RES W2: absent from s3, so 0 h", r.ok && H.Programs?.h === 0, H);
r = await submit(M2, RES2, W1); H = await hoursOf(M2, RES2, W1); check("M2 submits RES2 W1 once r1 is documented: 1.0 h", r.ok && H.Programs?.h === 1, H);
r = await as(M1, `select distinct person_id from public.time_entry`); check("musician sees only their own hours", r.ok && r.rows.length === 1 && r.rows[0].person_id === M1, r);
r = await as(L, `select distinct person_id from public.time_entry`); check("admin lead sees only their own hours", r.ok && r.rows.length === 1, r);
r = await as(P, `select distinct residency_id from public.time_entry`); check("point person sees the program's hours, not another program's", r.ok && r.rows.length === 1 && r.rows[0].residency_id === RES, r);
r = await as(Q, `select distinct person_id from public.time_entry`); check("other point person sees only RES2 hours (M2's)", r.ok && r.rows.length === 1 && r.rows[0].person_id === M2, r);
r = await as(O, `select * from public.time_entry`); check("outsider sees no hours", none(r), r);

// ============================================================================
// 7. Billable partner time before approval: nothing counts yet (D9 revised)
// ============================================================================
const minutes = async (ag, from = PP, to = PP_END) => {
  const rows = (await as(A, `select site_id, category, approved_minutes, waiting_minutes, undocumented from public.partner_billable_minutes('${ag}','${from}','${to}')`)).rows ?? [];
  const get = (site, cat, k) => Number(rows.find((x) => x.site_id === site && x.category === cat)?.[k] ?? NaN);
  return { rows, get };
};
let m1 = await minutes(AG1);
check("before approval: no program minutes count at Maple", m1.get(S1, "programs", "approved_minutes") === 0, m1.rows);
check("before approval: s1 + s3 per musician wait (3×60 + 3×60)", m1.get(S1, "programs", "waiting_minutes") === 360, m1.rows);
check("before approval: no relationship-building minutes count", m1.get(S1, "relationship_building", "approved_minutes") === 0 && m1.get(S1, "relationship_building", "waiting_minutes") === 90, m1.rows);
check("late partner cancellation bills scheduled length per assigned musician (90 × 2); the 8 am one doesn't", m1.get(S1, "late_cancellations", "approved_minutes") === 180, m1.rows);
check("undocumented past programs are flagged (s7)", m1.get(S1, "programs", "undocumented") === 1, m1.rows);

// ============================================================================
// 8. The point person approves or sends back (v0.19)
// ============================================================================
r = await as(Q, `select public.approve_week('${M1}','${RES}','${W1}')`); check("another program's point person can't approve", !r.ok, r);
r = await as(L, `select public.approve_week('${M1}','${RES}','${W1}')`); check("the admin lead can't approve hours", !r.ok, r);
r = await as(M1, `select public.approve_week('${M1}','${RES}','${W1}')`); check("a musician can't approve", !r.ok, r);
r = await as(O, `select public.return_week('${M1}','${RES}','${W1}','x')`); check("an outsider can't send hours back", !r.ok, r);
r = await as(P, `update public.time_entry set state='approved' where person_id='${M1}'`); check("the point person approves through approve_week, not by editing rows (0 rows)", denied(r), r);
// To change pay, fix the documentation (v0.24). The point person sends M1's W2
// back: the gift concert (s5, led by M1, not billable) ran 45 minutes, not 60.
r = await as(P, `select public.return_week('${M1}','${RES}','${W2}','The gift concert ran 45 minutes.')`); check("point person sends M1's W2 back with a note", r.ok && r.rows[0].return_week === 3, r);
r = await as(M1, `select state, returned_note from public.time_entry where week_starting='${W2}' and time_category_id='${CAT_PROG}'`);
check("M1 sees it back in draft with the note", r.ok && r.rows[0]?.state === "draft" && /45/.test(r.rows[0]?.returned_note), r);
r = await as(M1, `update public.session_report set actual_minutes=45 where session_id='${s5}'`); check("M1, s5's leader, corrects its length", r.ok && r.n === 1, r);
r = await submit(M1, RES, W2); H = await hoursOf(M1, RES, W2); check("M1 resubmits W2: s3 60 + s5 45 = 1.75 h", r.ok && H.Programs?.h === 1.75 && H.Programs?.state === "submitted", H);
for (const [who, res, week] of [[M1, RES, W1], [M1, RES, W2], [L, RES, W1], [L, RES, W2], [M2, RES, W1], [X, RES, W1], [W, RES, W1]]) {
  r = await as(P, `select public.approve_week('${who}','${res}','${week}') as n`); check(`point person approves a week (3 categories)`, r.ok && r.rows[0].n === 3, r);
}
H = await hoursOf(L, RES, W2); check("approving refreshes from documentation: L also played s5, so L's W2 is now 1.75 h", H.Programs?.h === 1.75 && H.Programs?.state === "approved", H);
H = await hoursOf(M2, RES, W1); check("…and M2's W1, submitted before s1 was documented, now has s1's 60 min (1.0 h)", H.Programs?.h === 1 && H.Programs?.state === "approved", H);
r = await as(Q, `select public.approve_week('${M2}','${RES2}','${W1}') as n`); check("RES2 point person approves M2's RES2 week", r.ok && r.rows[0].n === 3, r);
r = await as(P, `select public.approve_week('${M2}','${RES}','${W1}') as n`); check("approving again changes nothing", r.ok && r.rows[0].n === 0, r);
r = await as(P, `select public.return_week('${L}','${RES}','${W1}','too late')`); check("approved hours can't be sent back", r.ok && r.rows[0].return_week === 0, r);
r = await as(L, `update public.time_entry set hours=9 where person_id='${L}' and week_starting='${W1}'`); check("approved hours are locked for the musician", denied(r), r);
r = await su(`select bool_and(approved_by='${P}' and approved_at is not null) as ok from public.time_entry where state='approved' and residency_id='${RES}'`); check("approvals record who and when", r[0].ok === true, r);
r = await su(`select count(*)::int as n from public.audit_log where table_name='time_entry' and after->>'state'='approved'`); check("approvals are logged (8 weeks × 3 categories)", r[0].n >= 24, r);

// ============================================================================
// 9. Musician invoices: approved hours × rate + stipends, per pay period
// ============================================================================
const inv = async (who, person, start = PP) => {
  const x = await as(who, `select * from public.musician_invoice_lines('${person}','${start}')`);
  const lines = (x.rows ?? []).map((l) => ({ ...l, quantity: num(l.quantity), unit_amount: num(l.unit_amount), amount: num(l.amount) }));
  return { ...x, lines, total: round2(lines.reduce((n, l) => n + l.amount, 0)) };
};
const lineAmt = (i, desc, res) => i.lines.filter((l) => l.description === desc && (!res || l.residency_name === res)).reduce((n, l) => n + l.amount, 0);
let I = await inv(L, L);
check("L's invoice: Programs (1.83 + 1.75 = 3.58 h) × $40 = $143.20", lineAmt(I, "Programs") === 143.2, I.lines);
check("L's invoice: Relationship Building 0.25 h × $40 = $10", lineAmt(I, "Relationship Building") === 10, I.lines);
check("L's invoice: only the stipend due in the period ($150)", I.lines.filter((l) => l.unit === "payment").length === 1 && I.lines.find((l) => l.unit === "payment")?.amount === 150, I.lines);
check("L's invoice total = sum of lines = $303.20", I.total === 303.2, I);
I = await inv(M1, M1);
check("M1's invoice uses the corrected s5: (1.83 + 1.75) × $35 + (0.5 + 0.75) × $35 + $100 = $269.05", I.total === 269.05, I.lines);
I = await inv(M2, M2);
check("M2's invoice: only approved weeks, each program at its own rate (1 h × $30 + 0.33 h × $30 at RES, 1 h × $45 at RES2) = $84.90",
  I.total === 84.9 && lineAmt(I, "Programs", "Example Maple") === 30 && lineAmt(I, "Programs", "Other Elm") === 45, I.lines);
check("M2's submitted-but-unapproved W2 isn't paid", !I.lines.some((l) => l.quantity === 2), I.lines);
I = await inv(A, X); check("admin sees X's invoice: 0.42 h × $33 = $13.86", I.total === 13.86, I.lines);
I = await inv(A, W); check("W-2 staff get no musician invoice (contractors only)", I.ok && I.lines.length === 0, I);
for (const [who, name] of [[P, "point person"], [Q, "other point person"], [M2, "another musician"], [O, "outsider"], [L, "admin lead"]]) {
  I = await inv(who, M1); check(`${name} can't see M1's invoice`, none(I), I);
}
r = await as(null, `select * from public.musician_invoice_lines('${M1}','${PP}')`); check("anon can't call the invoice function", !r.ok, r);
const truth = await su(`select coalesce(sum(te.hours * c.hourly_rate),0)::numeric as v from public.time_entry te join public.contract c on c.person_id=te.person_id join public.season s on s.id=c.season_id and s.residency_id=te.residency_id
  where te.person_id='${M1}' and te.state='approved' and te.week_starting in ('${W1}','${W2}')`);
I = await inv(M1, M1); check("M1's hour lines equal approved hours × the rate in force", round2(I.lines.filter((l) => l.unit === "hours").reduce((n, l) => n + l.amount, 0)) === round2(Number(truth[0].v)), { I: I.lines, truth });
I = await inv(M1, M1, addDays(PP, 7));
question("Q6", "an invoice can be asked for only from a pay-period start (counted every 14 days from the anchor); a start a week off overlaps two periods",
  none(I), I.lines);
r = await as(A, `update public.contract set hourly_rate=37 where id='${C.M1}'`); check("admin raises M1's rate to $37", r.ok && r.n === 1, r);
I = await inv(M1, M1);
check("the live invoice follows the new rate (4.83 h × $37 + $100 = $278.71)", I.total === 278.71, I.lines);
question("Q5", "a rate change doesn't rewrite pay periods that have already ended (D9: 'changes apply to invoices generated afterwards; past invoice lines keep their amounts')", I.total === 269.05, I.lines);
await must(A, `update public.contract set hourly_rate=35 where id='${C.M1}'`);

// ============================================================================
// 10. Deactivated people see nothing (Person rules; R9.5)
// ============================================================================
r = await as(A, `update public.person set active=false where id='${X}'`); check("admin deactivates X", r.ok && r.n === 1, r);
r = await as(X, `select * from public.contract`); check("deactivated: no contract", none(r), r);
r = await as(X, `select * from public.resident`); check("deactivated: no residents", none(r), r);
r = await as(X, `select * from public.session_report`); check("deactivated: no reports", none(r), r);
r = await as(X, `select * from public.time_entry`); check("[fixed B1, migration 20261208] deactivated person can't read their own hours ('hides all data from that person at once')", none(r), r);
r = await as(X, `select * from public.relationship_activity`); check("[fixed B1, migration 20261208] deactivated person can't read their own relationship-building log", none(r), r);
I = await inv(X, X); check("[fixed B1, migration 20261208] deactivated person can't read their own invoice (musician_invoice_lines skips the active check)", none(I), I.lines);
r = await as(X, `update public.time_entry set hours=8 where person_id='${X}' and week_starting='${W2}'`); check("[fixed B1, migration 20261208] deactivated person can't change their own draft hours", denied(r), r);
r = await as(X, `delete from public.relationship_activity where id='${ACT_X2}'`); check("[fixed B1, migration 20261208] deactivated person can't delete their own activity", denied(r), r);
r = await as(X, `insert into public.time_entry (person_id,residency_id,week_starting,time_category_id,hours) values ('${X}','${RES}','${W2}','${CAT_RB}',1)`); check("deactivated: can't add hours", !r.ok, r);
// Undo whatever X managed, so the billing story below stays on known numbers.
await su(`update public.time_entry set hours=1.0 where person_id='${X}' and week_starting='${W2}'`);

// ============================================================================
// 11. Community invoices (v0.22, v0.23): live drafts, frozen when sent, paid
// ============================================================================
m1 = await minutes(AG1);
// Programs: s1 = L, M1, M2 (all W1 approved) = 180; s3 = L, M1 (W2 approved) = 120, W subbing (W2 not approved) waits 60; M2 absent.
check("after approval: Maple program minutes per musician = 300", m1.get(S1, "programs", "approved_minutes") === 300, m1.rows);
check("…W's subbing minutes still wait for W's week (60)", m1.get(S1, "programs", "waiting_minutes") === 60, m1.rows);
check("…an absent musician isn't billed; the non-billable gift (s5) isn't billed", m1.get(S1, "programs", "approved_minutes") + m1.get(S1, "programs", "waiting_minutes") === 360, m1.rows);
check("after approval: Maple relationship building = 30 + 20 + 15 + 25 = 90", m1.get(S1, "relationship_building", "approved_minutes") === 90, m1.rows);
let m2 = await minutes(AG2);
check("Birch: s2's documented 50 min × 2 musicians = 100 (Chicago time, still in the week)", m2.get(S2, "programs", "approved_minutes") === 100, m2.rows);
// X's unapproved W2 visit (10 min) waits, unless bug B1 let deactivated X delete it above.
const x2Left = (await su(`select count(*)::int as n from public.relationship_activity where id='${ACT_X2}'`))[0].n;
check("Birch: M1's mini-group (45) counts; X's unapproved W2 visit waits", m2.get(S2, "relationship_building", "approved_minutes") === 45 && m2.get(S2, "relationship_building", "waiting_minutes") === 10 * x2Left, m2.rows);

const agRow = async (ag) => {
  const a = (await as(A, `select * from public.partner_agreement where id='${ag}'`)).rows[0];
  return { ...a, hourly_rate: num(a.hourly_rate), contracted_hours: num(a.contracted_hours), overhead_percent: num(a.overhead_percent) };
};
const build = async (ag, sites, installmentsDue = []) => {
  const month = monthOf(addDays(PP, 1));
  const thisMonth = (await minutes(ag)).rows, toDate = (await minutes(ag, SEASON_START)).rows;
  const choice = (await as(A, `select excluded_stipend_ids from public.partner_invoice_choice where agreement_id='${ag}' and month='${month}'`)).rows[0];
  const excluded = new Set(choice?.excluded_stipend_ids ?? []);
  const stipends = ((await as(A, `select * from public.partner_billable_stipends('${ag}','${PP}','${PP_END}')`)).rows ?? []).filter((s) => !excluded.has(s.id));
  return { month, drafts: buildPartnerInvoices({ agreement: await agRow(ag), month, sites, thisMonth, toDate, stipends, installmentsDue }) };
};
const MAPLE = [{ id: S1, name: "Maple House" }], BIRCH = [{ id: S2, name: "Birch Hall" }];
let B = await build(AG1, MAPLE);
let site1 = B.drafts.find((d) => d.kind === "site");
check("Maple draft: one site invoice, overhead on the same invoice", B.drafts.length === 1 && site1.siteId === S1, B.drafts);
check("Maple draft: 5 h programs + 1.5 h relationship building + 3 h late cancellations, at $60",
  site1.lines.slice(0, 3).map((l) => l.amount).join() === "300,90,180", site1.lines);
check("Maple draft: both stipends due this period billed ($150 + $100)", site1.lines.filter((l) => /stipend/.test(l.description)).map((l) => l.amount).sort().join() === "100,150", site1.lines);
check("Maple draft: overhead 15% of hours + stipends = $123; total $943", site1.lines.at(-1).amount === 123 && site1.total === 943, site1);
check("Maple draft: hours this month 6.5, waiting 1, contracted 100", site1.summary.hoursThisMonth === 6.5 && site1.summary.waitingHours === 1 && site1.summary.contractedHours === 100, site1.summary);
// v0.23: leave M1's stipend off this month.
r = await as(P, `insert into public.partner_invoice_choice (agreement_id,month,excluded_stipend_ids) values ('${AG1}','${B.month}','{${ST_M1}}')`); check("point person can't choose invoice lines", !r.ok, r);
r = await as(A, `insert into public.partner_invoice_choice (agreement_id,month,excluded_stipend_ids) values ('${AG1}','${B.month}','{${ST_M1}}')`); check("admin leaves M1's stipend off this month", r.ok, r);
B = await build(AG1, MAPLE); site1 = B.drafts[0];
check("…the draft drops it and its overhead: $570 + $150 + 15% = $828", site1.total === 828 && !site1.lines.some((l) => l.amount === 100), site1.lines);
// v0.23: the "Charge overhead" switch (off = empty).
await must(A, `update public.partner_agreement set overhead_percent=null where id='${AG1}'`);
B = await build(AG1, MAPLE); check("overhead switched off: no overhead line, total $720", B.drafts[0].total === 720 && !B.drafts[0].lines.some((l) => /Overhead/.test(l.description)), B.drafts[0].lines);
await must(A, `update public.partner_agreement set overhead_percent=15 where id='${AG1}'`);
B = await build(AG1, MAPLE); site1 = B.drafts[0];
r = await su(`select count(*)::int as n from public.audit_log where table_name='partner_agreement' and action='update'`); check("contract changes (overhead switch) are logged", r[0].n >= 2, r);
// Mark as sent: the app stores the draft's lines, summary and total.
const send = (ag, d, month, total = d.total, site = d.siteId) => as(A, `insert into public.partner_invoice (agreement_id,kind,site_id,month,number,bill_to,lines,summary,total)
  values ('${ag}','${d.kind}',${site ? `'${site}'` : "null"},'${month}','IMP-TEST-${d.kind}','Example Living Inc.\n1 Main St','${JSON.stringify(d.lines).replace(/'/g, "''")}'::jsonb,'${JSON.stringify(d.summary)}'::jsonb,${total}) returning id, state`);
r = await send(AG1, site1, B.month); check("admin marks the Maple invoice as sent", r.ok && r.rows[0].state === "sent", r);
r = await as(P, `insert into public.partner_invoice (agreement_id,kind,site_id,month,number,bill_to,lines,total) values ('${AG1}','site','${S1}','${B.month}','X','x','[]',0)`);
check("point person can't send a community invoice", !r.ok, r);
const INV1 = (await su(`select id, total, lines from public.partner_invoice where agreement_id='${AG1}'`))[0];
check("admin marks the Maple invoice as sent: stored $828, state sent", INV1 && Number(INV1.total) === 828, INV1);
r = await send(AG1, site1, B.month); check("one invoice per contract, site and month (D4)", !r.ok, r);
for (const [who, name] of [[P, "point person"], [Q, "other point person"], [L, "admin lead"], [M1, "musician"], [X, "deactivated"], [O, "outsider"]]) {
  r = await as(who, `select * from public.partner_invoice`); check(`${name} sees no community invoices`, none(r), r);
}
r = await as(A, `update public.partner_invoice set total=1 where id='${INV1.id}'`); check("a sent invoice's total can't change", !r.ok, r);
r = await as(A, `update public.partner_invoice set lines='[]' where id='${INV1.id}'`); check("a sent invoice's lines can't change", !r.ok, r);
r = await as(A, `update public.partner_invoice set bill_to='Someone else' where id='${INV1.id}'`); check("a sent invoice's bill-to can't change", !r.ok, r);
r = await as(A, `delete from public.partner_invoice where id='${INV1.id}'`); check("a sent invoice can't be deleted", !r.ok || r.n === 0, r);
// Later changes don't reach the sent invoice: a rate change and a newly approved week.
await must(A, `update public.partner_agreement set hourly_rate=70 where id='${AG1}'`);
r = await as(P, `select public.approve_week('${W}','${RES}','${W2}')`); // W's W2 isn't submitted, so this approves nothing
r = await su(`select total, lines from public.partner_invoice where id='${INV1.id}'`);
check("rate changes after sending leave the sent invoice alone", Number(r[0].total) === 828 && JSON.stringify(r[0].lines) === JSON.stringify(INV1.lines), r);
B = await build(AG1, MAPLE); check("…while next month's draft would use the new rate", B.drafts[0].lines[0].unit_amount === 70, B.drafts[0].lines[0]);
r = await as(A, `update public.partner_invoice_choice set excluded_stipend_ids='{}' where agreement_id='${AG1}' and month='${B.month}'`);
check("[fixed B3, migration 20261208] a month's invoice choices can't change once an invoice for that month is sent (v0.23 PartnerInvoiceChoice; only the app checks)", denied(r), r);
r = await as(A, `update public.partner_invoice set state='paid' where id='${INV1.id}' returning paid_at`); check("admin marks it paid; paid_at is stamped", r.ok && r.rows[0].paid_at !== null, r);
r = await su(`select count(*)::int as n from public.audit_log where table_name='partner_invoice'`); check("sending and paying are logged", r[0].n >= 2, r);

// Birch: overhead on a separate invoice (e.g. a corporate office).
B = await build(AG2, BIRCH);
const bSite = B.drafts.find((d) => d.kind === "site"), bOh = B.drafts.find((d) => d.kind === "overhead");
check("Birch: a site invoice without overhead plus a separate overhead invoice", bSite && bOh && !bSite.lines.some((l) => /Overhead/.test(l.description)), B.drafts);
check("Birch: 1.67 h + 0.75 h at $50 = $121; overhead 10% = $12.10", bSite.total === 121 && bOh.total === 12.1, { bSite, bOh });
question("Q3", "minutes are rounded to hundredths of an hour before multiplying (145 min × $50/h bills $121.00, not $120.83)", bSite.total === round2((145 / 60) * 50), bSite.lines);
r = await send(AG2, bOh, B.month); check("admin sends the separate overhead invoice", r.ok, r);
r = await send(AG2, bSite, B.month); check("…and the Birch site invoice", r.ok, r);

// A contract covering both sites, billed in installments (v0.22): one installment per contract, stipends and overhead on a contract invoice.
const AG3 = await agreement("Whole program (quarterly)", [S1, S2], { billing_basis: "installments", contracted_hours: 40, bill_stipends: true, overhead_percent: 10, overhead_billing: "same_invoice" });
await must(A, `insert into public.partner_installment (agreement_id,due_on,amount) values ('${AG3}','${addDays(PP, 5)}',1000)`);
B = await build(AG3, [...BIRCH, ...MAPLE], [{ due_on: addDays(PP, 5), amount: 1000 }]);
const ct = B.drafts.filter((d) => d.kind === "contract"), sites3 = B.drafts.filter((d) => d.kind === "site");
check("installments over two sites: two site invoices and one contract invoice", sites3.length === 2 && ct.length === 1, B.drafts.map((d) => d.kind));
check("the installment is billed once ($1,000)", B.drafts.flatMap((d) => d.lines).filter((l) => /Installment/.test(l.description)).reduce((n, l) => n + l.amount, 0) === 1000, B.drafts);
check("contract invoice: stipends $250 + overhead 10% of ($1,000 + $250) = $375", ct[0].total === 375, ct[0].lines);
check("each site invoice shows that site's hours against the contract", sites3.find((d) => d.siteId === S1).summary.hoursThisMonth === 6.5, sites3.map((d) => d.summary));
r = await su(`select count(*)::int as n from public.audit_log where table_name='partner_installment'`);
check("[fixed B4, migration 20261208] partner installments are logged when created or changed (D9: 'every change is logged')", r[0].n > 0, r);

// D4: a site can have several contracts (Hebrew Home has three for different services). Each
// session falls under one contract (Session.partner_agreement_id), so a minute is billed once.
const m3 = await minutes(AG3);
knownBug("B2", "a session's minutes are billed under one contract only (D4: Session.partner_agreement_id isn't built, so AG1 and AG3 both bill Maple's 300 program minutes)",
  m3.get(S1, "programs", "approved_minutes") + m1.get(S1, "programs", "approved_minutes") === 300, { AG1: m1.get(S1, "programs", "approved_minutes"), AG3: m3.get(S1, "programs", "approved_minutes") });
const oldSea = (await must(A, `insert into public.season (residency_id,name,starts_on,ends_on,kind) values ('${RES}','Old season','${addDays(SEASON_START, -200)}','${addDays(SEASON_START, -1)}','season') returning id`))[0].id;
const AG_OLD = (await must(A, `insert into public.partner_agreement (residency_id,season_id,name,hourly_rate) values ('${RES}','${oldSea}','Last season',55) returning id`))[0].id;
await must(A, `insert into public.partner_agreement_site values ('${AG_OLD}','${S1}')`);
const mOld = await minutes(AG_OLD);
knownBug("B2", "a contract bills only time in its own season (last season's contract bills this season's sessions)", mOld.get(S1, "programs", "approved_minutes") === 0, mOld.rows);
r = await as(A, `insert into public.partner_invoice (agreement_id,kind,site_id,month,number,bill_to,lines,total) values ('${AG2}','site','${T1}','${B.month}','IMP-BAD','x','[]',0)`);
check("[fixed B7, migration 20261208] a site invoice can only be for one of its contract's sites (Birch's contract accepted an Elm Court invoice)", !r.ok, r);
const nextMonth = monthOf(addDays(monthOf(addDays(PP, 1)), 40));
r = await as(A, `insert into public.partner_invoice (agreement_id,kind,site_id,month,number,bill_to,lines,total) values ('${AG2}','site','${S2}','${nextMonth}','IMP-SUM','x','[{"description":"Programs","amount":121}]',999)`);
check("[fixed B8, migration 20261208] a stored invoice's total equals the sum of its lines (a $999 total over $121 of lines was accepted)", !r.ok, r);

// ============================================================================
// 12. Custom invoices (v0.23): admins only; draft → sent (frozen) → paid
// ============================================================================
const lines = [{ description: "Holiday concert", quantity: 2, unit_amount: 150, amount: 300 }, { description: "Travel", quantity: null, unit_amount: null, amount: 40 }];
const cust = (who, total, ls = lines, state = null) => as(who, `insert into public.custom_invoice (residency_id,title,number,bill_to,lines,total${state ? ",state" : ""}) values ('${RES}','Holiday concert','IMP-C1','Friends of the Library\n2 Oak Ave','${JSON.stringify(ls)}'::jsonb,${total}${state ? `,'${state}'` : ""}) returning id`);
for (const [who, name] of [[P, "point person"], [L, "admin lead"], [M1, "musician"], [O, "outsider"]]) { r = await cust(who, 340); check(`${name} can't create a custom invoice`, !r.ok, r); }
r = await cust(A, customLinesTotal(lines), lines, "sent"); check("a custom invoice starts as a draft", !r.ok, r);
r = await cust(A, customLinesTotal(lines)); check("admin types a custom invoice: 2 × $150 + $40 = $340", r.ok && customLinesTotal(lines) === 340, r); const CU = r.rows?.[0]?.id;
r = await as(A, `update public.custom_invoice set title='Holiday concerts', lines='${JSON.stringify([...lines, { description: "Music stands", quantity: 1, unit_amount: 20, amount: 20 }])}'::jsonb, total=360 where id='${CU}'`); check("a draft can change", r.ok && r.n === 1, r);
r = await cust(A, 1); const CU_BAD = r.rows?.[0]?.id;
check("[fixed B8, migration 20261208] a custom invoice's total equals the sum of its lines (CustomInvoice.total 'Sum of lines'; $1 over $340 of lines was accepted)", !r.ok, r);
if (CU_BAD) await as(A, `delete from public.custom_invoice where id='${CU_BAD}'`);
r = await cust(A, -50, [{ description: "Credit", quantity: null, unit_amount: null, amount: -50 }]); const CU_NEG = r.rows?.[0]?.id;
question("Q7", "custom invoice totals can't go below zero (or are credits allowed?)", !r.ok, r);
if (CU_NEG) await as(A, `delete from public.custom_invoice where id='${CU_NEG}'`);
r = await cust(A, 340); const CU_DEL = r.rows?.[0]?.id;
r = await as(A, `delete from public.custom_invoice where id='${CU_DEL}'`); check("a draft can be deleted", r.ok && r.n === 1, r);
r = await as(A, `update public.custom_invoice set state='sent' where id='${CU}' returning sent_at`); check("admin sends it; sent_at stamped", r.ok && r.rows[0].sent_at !== null, r);
r = await as(A, `update public.custom_invoice set total=1 where id='${CU}'`); check("a sent custom invoice is frozen", !r.ok, r);
r = await as(A, `update public.custom_invoice set state='draft' where id='${CU}'`); check("a sent custom invoice can't go back to draft", !r.ok, r);
r = await as(A, `delete from public.custom_invoice where id='${CU}'`); check("a sent custom invoice can't be deleted", denied(r), r);
r = await as(A, `update public.custom_invoice set state='paid' where id='${CU}' returning paid_at`); check("…and is marked paid", r.ok && r.rows[0].paid_at !== null, r);
for (const [who, name] of [[P, "point person"], [L, "admin lead"], [M1, "musician"], [X, "deactivated"], [O, "outsider"]]) {
  r = await as(who, `select * from public.custom_invoice`); check(`${name} sees no custom invoices`, none(r), r);
}
r = await as(null, `select * from public.custom_invoice`); check("anon sees no custom invoices", none(r), r);

// ============================================================================
// 13. Approved weeks are final (v0.29, migration 20261213; was QUESTION Q2)
// ============================================================================
// Weeks approved above: L, M1 (W1, W2), M2 (RES W1, RES2 W1), X (W1), W (W1).
const before = (await minutes(AG2)).get(S2, "relationship_building", "approved_minutes");
r = await as(M1, `update public.relationship_activity set minutes=300 where id='${ACT_M1b}'`);
const after = (await minutes(AG2)).get(S2, "relationship_building", "approved_minutes");
check("a musician can't change an activity's minutes in their approved week", !r.ok && after === before, { r, before, after });
r = await logAct(M1, RES, S2, addDays(W2, 2), "one_to_one", 40);
check("…or log a new activity into it", !r.ok && /approved/.test(r.err), r);
r = await as(M1, `delete from public.relationship_activity where id='${ACT_M1b}'`); check("…or delete one", !r.ok, r);
r = await as(L, `insert into public.relationship_activity_musician values ('${ACT_L}','${M1}')`); check("…or share one with another musician", !r.ok, r);
r = await as(M1, `update public.relationship_activity set occurred_on='${addDays(W2, 3)}' where id='${ACT_M1a}'`); check("…or move one into another approved week", !r.ok, r);
r = await as(L, `update public.session_report set actual_minutes=120 where session_id='${s1}'`);
check("the leader can't change the length of a program in an approved week", !r.ok, r);
r = await as(L, `update public.session_report set attendance=20 where session_id='${s1}'`); check("…or anything else in its report", !r.ok, r);
const r2 = await as(P, `update public.session_assignment set status='absent' where session_id='${s1}' and person_id='${M2}'`);
check("who played a program in an approved week can't change (point person included)", !r2.ok, r2);
r = await as(P, `update public.session set billable=false where id='${s1}'`); check("…nor its billable flag", !r.ok, r);
r = await as(P, `update public.session set starts_at=starts_at + interval '1 hour' where id='${s1}'`); check("…nor its date or time", !r.ok, r);
r = await as(P, `update public.session set schedule_state='canceled', cancellation_reason='other' where id='${s5}'`);
check("a documented program in an approved week can't be made No Program", !r.ok, r);
r = await as(P, `update public.session set internal_note='Ran well' where id='${s1}'`); check("notes stay editable", r.ok && r.n === 1, r);
r = await as(A, `update public.session_report set actual_minutes=55 where session_id='${s1}'`); check("an admin can still correct an approved week", r.ok && r.n === 1, r);
r = await su(`select count(*)::int as n from public.audit_log where table_name='session_report' and after->>'actual_minutes'='55'`); check("…and the correction is logged", r[0].n === 1, r);
await su(`update public.session_report set actual_minutes=60 where session_id='${s1}'`);
check("approved billable time didn't move", (await minutes(AG2)).get(S2, "relationship_building", "approved_minutes") === before, null);

// ============================================================================
// 14. Point people and pay (QUESTION Q1)
// ============================================================================
// D5: "core team = admins"; StaffAssignment.person_id "must have admin or be explicitly granted";
// the seed's point people are admins. But section 2/5: "the point person never sees pay" and
// community invoices are "admins only". An admin point person sees everything.
await must(A, `update public.person set system_roles='{admin}' where id='${Q}'`);
r = await as(Q, `select * from public.contract where person_id='${M2}'`);
question("Q1", "a point person who is also an admin (D5 'core team = admins') still never sees pay", none(r), { rows: r.rows?.length });
await must(A, `update public.person set system_roles='{}' where id='${Q}'`);

// Final sweep: nothing protected was deleted along the way.
r = await su(`select (select count(*) from public.time_entry)::int te, (select count(*) from public.session_report)::int sr, (select count(*) from public.contract)::int c, (select count(*) from public.resident)::int res, (select count(*) from public.partner_invoice)::int pi`);
check("no hours, reports, contracts, residents or sent invoices were deleted", r[0].te === 9 * 3 && // 9 submitted weeks × 3 categories
   r[0].sr === 5 && r[0].c === 5 && r[0].res === 5 && r[0].pi >= 3, r);

process.exit(T.summary("money-scenarios") ? 1 : 0);
