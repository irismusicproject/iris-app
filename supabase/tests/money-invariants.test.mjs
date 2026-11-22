// Money invariants: a seeded random property test. Random people do random
// things (log relationship building, document sessions, enter and submit
// hours, approve or send back weeks, change rates, add stipends, send and pay
// invoices, poke at things they shouldn't), and after every step the
// database must still keep the money rules of DOMAIN-MODEL v0.23:
//
//   I1  a musician invoice's total = the sum of its lines = approved hours ×
//       the rate in force (+ stipends due in the period); contractors only
//   I2  billable partner minutes per site follow D9 (per musician; documented
//       length; relationship-building minutes at the site; late partner
//       cancellations) and nothing counts before the point person approves
//       that musician's week; nothing is ever negative
//   I3  a sent invoice (community or custom) never changes
//   I4  non-admins never read a rate, stipend, community contract, community
//       or custom invoice, or the audit log; point people never see pay; a
//       musician never reads another musician's hours or invoice; outsiders
//       and deactivated people see nothing
//   I5  approved hours never change; no hours, report, contract, resident,
//       person or sent invoice is ever deleted
//   I6  every attempted action is allowed exactly when section 7 says so
//
// Run with: node supabase/tests/money-invariants.test.mjs
// Seed and length from the environment: PROP_SEED (default 1), PROP_STEPS
// (default 300). Overnight: PROP_STEPS=20000. The seed is printed on failure.
// Made-up data only. Known bugs (see money-scenarios.test.mjs) are reported
// as KNOWN BUG and don't fail the run.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays, weekStart, payPeriodStart, monthOf, round2 } from "./money-harness.mjs";
import { buildPartnerInvoices, monthEnd, customLinesTotal } from "../../src/shared/domain/partner-invoice.ts";

const SEED = Number(process.env.PROP_SEED ?? 1), STEPS = Number(process.env.PROP_STEPS ?? 300);
console.log(`money invariants: PROP_SEED=${SEED} PROP_STEPS=${STEPS}`);
const { db, as, su } = await boot();
const T = reporter();
const { A, P, Q, L, M1, M2, W, X, O } = P_;
const NAME = { [A]: "A", [P]: "P", [Q]: "Q", [L]: "L", [M1]: "M1", [M2]: "M2", [W]: "W", [X]: "X", [O]: "O" };

// ---- Random numbers (mulberry32), seeded ----
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p) => rnd() < p;

// ---- World: three past weeks, sessions in them, contracts, community contracts ----
const WEEKS = [addDays(weekStart(TODAY), -21), addDays(weekStart(TODAY), -14), addDays(weekStart(TODAY), -7)];
const SEASON_START = addDays(WEEKS[0], -60), SEASON_END = addDays(TODAY, 200);
await buildPeople({ db });
const w = await buildPlaces({ as }, SEASON_START, SEASON_END);
const { RES, RES2, S1, S2, T1, R1, R2, R3, SEA, SEA2, CAT_PROG, CAT_RB, CAT_CONC, IT_PERF } = w;
const must = async (who, sql) => { const x = await as(who, sql); if (!x.ok) throw new Error(`setup: ${x.err}\n${sql}`); return x.rows; };
const ROSTER = { [RES]: [L, M1, M2, W, X], [RES2]: [M2] };
const PP_OF = { [RES]: P, [RES2]: Q };
const SITES = { [RES]: [S1, S2], [RES2]: [T1] };
const LOC = { [S1]: [R1, "America/New_York"], [S2]: [R2, "America/Chicago"], [T1]: [R3, "America/New_York"] };
const SESSIONS = [];
for (const wk of WEEKS) {
  for (const [res, site, dow, minutes] of [[RES, S1, 1, 60], [RES, S1, 3, 90], [RES, S2, 2, 45], [RES2, T1, 2, 60]]) {
    const [loc, tz] = LOC[site];
    const sid = (await must(A, `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes) values ('${res}','Program','${loc}','${addDays(wk, dow)} 14:00:00 ${tz}',${minutes}) returning id`))[0].id;
    const players = ROSTER[res].filter(() => chance(0.6));
    const leader = pick(ROSTER[res]);
    if (!players.includes(leader)) players.push(leader);
    await must(A, `insert into public.session_assignment (session_id,person_id,role) values ${players.map((p) => `('${sid}','${p}','${p === leader ? "leader" : "participant"}')`).join(",")}`);
    SESSIONS.push({ id: sid, res, site, day: addDays(wk, dow) });
  }
}
const pubs = new Set(SESSIONS.map((x) => `${x.res}|${x.site}|${monthOf(x.day)}`));
for (const k of pubs) {
  const [res, site, m] = k.split("|");
  await must(PP_OF[res], `select public.mark_month_reviewed('${res}','${site}','${m}')`);
  await must(PP_OF[res], `select public.publish_month('${res}','${site}','${m}')`);
}
const CONTRACTS = {};
for (const [person, season, rate] of [[L, SEA, 40], [M1, SEA, 35], [M2, SEA, 30], [M2, SEA2, 45], [X, SEA, 33]])
  CONTRACTS[`${person}|${season}`] = (await must(A, `insert into public.contract (person_id,season_id,hourly_rate) values ('${person}','${season}',${rate}) returning id`))[0].id;
const contractIds = Object.values(CONTRACTS);
const AGS = [];
for (const [res, season, sites, rate, overhead, billing] of [[RES, SEA, [S1], 60, 15, "same_invoice"], [RES, SEA, [S2], 50, 10, "separate_invoice"], [RES2, SEA2, [T1], 55, null, "same_invoice"]]) {
  const ag = (await must(A, `insert into public.partner_agreement (residency_id,season_id,name,hourly_rate,contracted_hours,bill_stipends,overhead_percent,overhead_billing)
    values ('${res}','${season}','Contract ${AGS.length + 1}',${rate},50,${chance(0.5)},${overhead ?? "null"},'${billing}') returning id`))[0].id;
  await must(A, `insert into public.partner_agreement_site values ${sites.map((x) => `('${ag}','${x}')`).join(",")}`);
  AGS.push({ id: ag, res, sites });
}
const PERIODS = [...new Set(WEEKS.map((wk) => payPeriodStart(wk)))];
const MONTHS = [...new Set(SESSIONS.map((x) => monthOf(x.day)))];
const RANGE_FROM = WEEKS[0], RANGE_TO = addDays(WEEKS[2], 6);
const CONTRACTORS = [L, M1, M2, X];
const NON_ADMINS = [P, Q, L, M1, M2, W, X, O];
const EVERYONE = [A, ...NON_ADMINS];

// ---- Reporting, with a repro line ----
let step = 0, failingSteps = 0;
const history = [];
const seenKnown = new Set();
function fail(name, detail) {
  if (T.failures === 0 || failingSteps < 5) {
    T.check(`[step ${step}] ${name}`, false, detail);
    console.log(`  repro: PROP_SEED=${SEED} PROP_STEPS=${step} node supabase/tests/money-invariants.test.mjs`);
    console.log(`  last actions:\n    ${history.slice(-8).join("\n    ")}`);
  } else T.check(`[step ${step}] ${name}`, false, "(details above)");
}
function known(idk, name, detail) {
  const key = `${idk} ${name}`;
  if (!seenKnown.has(key)) { seenKnown.add(key); T.knownBug(idk, `${name} (first seen at step ${step})`, false, detail); }
}

// ---- Ground truth (read past RLS) ----
async function state() {
  const active = Object.fromEntries((await su(`select id, active from public.person`)).map((x) => [x.id, x.active]));
  const isAdmin = Object.fromEntries((await su(`select id, active and 'admin' = any(system_roles) as a from public.person`)).map((x) => [x.id, x.a]));
  return { active, isAdmin };
}
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

async function truthBillable(ag) {
  const sess = await su(`select se.id, se.kind, se.billable, se.schedule_state::text as st, se.cancellation_reason::text as reason, se.scheduled_minutes,
      l.site_id, (se.starts_at at time zone t.timezone)::date as day,
      (se.canceled_at at time zone t.timezone) >= ((se.starts_at at time zone t.timezone)::date + time '09:00') as late
    from public.session se join public.location l on l.id=se.location_id join public.site t on t.id=l.site_id where se.residency_id='${ag.res}'`);
  const reports = Object.fromEntries((await su(`select session_id, actual_minutes from public.session_report`)).map((x) => [x.session_id, x.actual_minutes]));
  const asg = await su(`select session_id, person_id, status::text as status from public.session_assignment`);
  const acts = await su(`select person_id, site_id, occurred_on, minutes from public.relationship_activity where residency_id='${ag.res}'`);
  const approved = new Set((await su(`select distinct person_id, week_starting from public.time_entry where residency_id='${ag.res}' and state='approved'`)).map((x) => `${x.person_id}|${iso(x.week_starting)}`));
  const out = {};
  for (const site of ag.sites) for (const cat of ["programs", "relationship_building", "late_cancellations"]) out[`${site}|${cat}`] = { a: 0, w: 0 };
  const inRange = (d) => d >= RANGE_FROM && d <= RANGE_TO;
  for (const se of sess) {
    const day = iso(se.day);
    if (!ag.sites.includes(se.site_id) || se.kind !== "group_session" || !se.billable || !inRange(day)) continue;
    const wk = weekStart(day);
    const players = asg.filter((a) => a.session_id === se.id && a.status !== "absent");
    if (se.st === "published" && reports[se.id] !== undefined)
      for (const a of players) out[`${se.site_id}|programs`][approved.has(`${a.person_id}|${wk}`) ? "a" : "w"] += reports[se.id];
    if (se.st === "canceled" && se.reason === "partner" && se.late) for (const a of players) out[`${se.site_id}|late_cancellations`].a += se.scheduled_minutes;
  }
  for (const x of acts) {
    const day = iso(x.occurred_on);
    if (!ag.sites.includes(x.site_id) || !inRange(day)) continue;
    out[`${x.site_id}|relationship_building`][approved.has(`${x.person_id}|${weekStart(day)}`) ? "a" : "w"] += x.minutes;
  }
  return out;
}
async function truthInvoice(person, start) {
  const emp = (await su(`select employment_type::text as e from public.person where id='${person}'`))[0].e;
  if (emp !== "contractor_1099") return [];
  const te = await su(`select te.residency_id, r.name as res, tc.name as cat, te.hours, c.hourly_rate
    from public.time_entry te join public.residency r on r.id=te.residency_id join public.time_category tc on tc.id=te.time_category_id
    left join public.season s on s.residency_id=te.residency_id left join public.contract c on c.season_id=s.id and c.person_id=te.person_id
    where te.person_id='${person}' and te.state='approved' and te.hours > 0 and te.week_starting in ('${start}','${addDays(start, 7)}')`);
  const g = {};
  for (const x of te) { const k = `${x.res}|${x.cat}`; g[k] ??= { q: 0, rate: x.hourly_rate === null ? null : Number(x.hourly_rate) }; g[k].q += Number(x.hours); }
  const lines = Object.entries(g).map(([k, v]) => ({ k: `h|${k}`, amount: round2(v.q * (v.rate ?? 0)) }));
  const st = await su(`select si.amount from public.stipend_installment si join public.contract c on c.id=si.contract_id where c.person_id='${person}' and si.due_on between '${start}' and '${addDays(start, 13)}'`);
  for (const x of st) lines.push({ k: "s", amount: Number(x.amount) });
  return lines;
}

// ---- Snapshots for I3 and I5 ----
const frozenPI = new Map(), frozenCI = new Map(), approvedHours = new Map();
const protectedIds = { time_entry: new Set(), session_report: new Set(), contract: new Set(contractIds), resident: new Set(), person: new Set(EVERYONE), partner_invoice: new Set(), custom_sent: new Set() };
async function snapshot() {
  for (const x of await su(`select id, hours from public.time_entry where state='approved'`)) if (!approvedHours.has(x.id)) approvedHours.set(x.id, x.hours);
  for (const x of await su(`select id from public.time_entry`)) protectedIds.time_entry.add(x.id);
  for (const x of await su(`select id from public.session_report`)) protectedIds.session_report.add(x.id);
  for (const x of await su(`select id from public.resident`)) protectedIds.resident.add(x.id);
  for (const x of await su(`select id, agreement_id, kind, site_id, month, number, bill_to, lines, summary, total from public.partner_invoice`)) {
    protectedIds.partner_invoice.add(x.id); if (!frozenPI.has(x.id)) frozenPI.set(x.id, JSON.stringify(x));
  }
  for (const x of await su(`select id, residency_id, title, invoice_date, number, bill_to, lines, total from public.custom_invoice where state <> 'draft'`)) {
    protectedIds.custom_sent.add(x.id); if (!frozenCI.has(x.id)) frozenCI.set(x.id, JSON.stringify(x));
  }
}

// ---- Invariants ----
async function invariants() {
  const st = await state();
  // I1 musician invoices
  for (const c of CONTRACTORS.concat([W])) for (const ps of PERIODS) {
    const got = (await as(A, `select * from public.musician_invoice_lines('${c}','${ps}')`)).rows ?? [];
    const amounts = got.map((l) => Number(l.amount)).sort((a, b) => a - b);
    const want = (await truthInvoice(c, ps)).map((l) => l.amount).sort((a, b) => a - b);
    if (JSON.stringify(amounts) !== JSON.stringify(want)) fail(`I1 ${NAME[c]}'s invoice for ${ps} = approved hours × rate + stipends`, { got, want });
    if (got.some((l) => Number(l.amount) < 0)) fail(`I1 ${NAME[c]}'s invoice has a negative line`, got);
    const total = round2(amounts.reduce((n, a) => n + a, 0));
    if (total < 0) fail("I1 invoice total is negative", total);
    if (st.active[c]) {
      const own = (await as(c, `select * from public.musician_invoice_lines('${c}','${ps}')`)).rows ?? [];
      if (JSON.stringify(own.map((l) => Number(l.amount)).sort((a, b) => a - b)) !== JSON.stringify(amounts)) fail(`I1 ${NAME[c]} sees the same invoice as the admin`, { own, got });
    }
  }
  // I2 billable minutes
  for (const ag of AGS) {
    const want = await truthBillable(ag);
    const got = (await as(A, `select * from public.partner_billable_minutes('${ag.id}','${RANGE_FROM}','${RANGE_TO}')`)).rows ?? [];
    for (const [k, v] of Object.entries(want)) {
      const [site, cat] = k.split("|");
      const g = got.find((x) => x.site_id === site && x.category === cat);
      if (!g || Number(g.approved_minutes) !== v.a || (cat !== "late_cancellations" && Number(g.waiting_minutes) !== v.w))
        fail(`I2 billable ${cat} at ${site === S1 ? "Maple" : site === S2 ? "Birch" : "Elm"}: approved only after the week's approval (D9)`, { got: g, want: v });
    }
    if (got.some((x) => Number(x.approved_minutes) < 0 || Number(x.waiting_minutes) < 0)) fail("I2 negative minutes", got);
  }
  // I3 sent invoices never change; stored totals = sum of stored lines
  for (const x of await su(`select id, agreement_id, kind, site_id, month, number, bill_to, lines, summary, total from public.partner_invoice`)) {
    if (frozenPI.has(x.id) && frozenPI.get(x.id) !== JSON.stringify(x)) fail("I3 a sent community invoice changed", { before: frozenPI.get(x.id), after: x });
    if (round2(x.lines.reduce((n, l) => n + Number(l.amount), 0)) !== Number(x.total)) fail("I3 a community invoice's total = sum of its lines", x);
    if (Number(x.total) < 0) fail("I3 negative community invoice", x);
  }
  for (const x of await su(`select id, residency_id, title, invoice_date, number, bill_to, lines, total from public.custom_invoice where state <> 'draft'`))
    if (frozenCI.has(x.id) && frozenCI.get(x.id) !== JSON.stringify(x)) fail("I3 a sent custom invoice changed", { before: frozenCI.get(x.id), after: x });
  // I4 visibility
  const contractOwner = Object.fromEntries((await su(`select id, person_id from public.contract`)).map((x) => [x.id, x.person_id]));
  for (const who of NON_ADMINS) {
    const act = st.active[who];
    const q = async (sql) => { const x = await as(who, sql); return x.ok ? x.rows : []; };
    const c = await q(`select id, person_id from public.contract`);
    if (c.some((x) => x.person_id !== who)) fail(`I4 ${NAME[who]} reads someone else's rate`, c);
    if (!act && c.length) fail(`I4 deactivated ${NAME[who]} reads a contract`, c);
    if ((who === P || who === Q) && c.length) fail(`I4 point person ${NAME[who]} sees pay`, c);
    const sp = await q(`select contract_id from public.stipend_installment`);
    if (sp.some((x) => contractOwner[x.contract_id] !== who)) fail(`I4 ${NAME[who]} reads someone else's stipend`, sp);
    for (const t of ["partner_agreement", "partner_agreement_site", "partner_installment", "partner_invoice", "partner_invoice_choice", "custom_invoice", "audit_log"]) {
      const rows = await q(`select 1 from public.${t} limit 1`);
      if (rows.length) fail(`I4 ${NAME[who]} reads ${t} (admins only)`, rows);
    }
    const bm = await q(`select * from public.partner_billable_minutes('${AGS[0].id}','${RANGE_FROM}','${RANGE_TO}')`);
    if (bm.length) fail(`I4 ${NAME[who]} reads billable partner minutes`, bm);
    for (const other of CONTRACTORS) if (other !== who) {
      const li = await q(`select * from public.musician_invoice_lines('${other}','${PERIODS[0]}')`);
      if (li.length) fail(`I4 ${NAME[who]} reads ${NAME[other]}'s invoice`, li);
    }
    const te = await q(`select person_id, residency_id from public.time_entry`);
    for (const x of te) {
      const isPP = act && PP_OF[x.residency_id] === who;
      if (x.person_id !== who && !isPP) fail(`I4 ${NAME[who]} reads ${NAME[x.person_id]}'s hours`, x);
      if (x.person_id === who && !act) known("B1", "a deactivated person still reads their own hours", x);
    }
    if (!act) {
      const ra = await q(`select id from public.relationship_activity`);
      if (ra.length) known("B1", "a deactivated person still reads their own relationship-building log", ra.length);
      const li = await q(`select * from public.musician_invoice_lines('${who}','${PERIODS[0]}')`);
      if (li.length) known("B1", "a deactivated person still reads their own invoice", li.length);
      for (const t of ["session_report", "resident", "session", "residency"]) { const rows = await q(`select 1 from public.${t} limit 1`); if (rows.length) fail(`I4 deactivated ${NAME[who]} reads ${t}`, rows); }
    }
    if (who === O) for (const t of ["relationship_activity", "resident", "session_report", "time_entry", "monthly_reflection"]) {
      const rows = await q(`select 1 from public.${t} limit 1`); if (rows.length) fail(`I4 outsider reads ${t}`, rows);
    }
  }
  for (const t of ["contract", "stipend_installment", "time_entry", "partner_invoice", "custom_invoice", "resident"]) {
    const x = await as(null, `select 1 from public.${t} limit 1`);
    if (x.ok && x.rows.length) fail(`I4 anon reads ${t}`, x.rows);
  }
  // I5 approved hours locked; nothing protected deleted
  const nowHours = Object.fromEntries((await su(`select id, hours, state::text as st from public.time_entry`)).map((x) => [x.id, x]));
  for (const [idh, h] of approvedHours) if (!nowHours[idh] || nowHours[idh].st !== "approved" || nowHours[idh].hours !== h) fail("I5 approved hours changed", { id: idh, before: h, after: nowHours[idh] });
  const present = async (table, ids, where = "") => {
    const have = new Set((await su(`select id from public.${table} ${where}`)).map((x) => x.id));
    for (const i of ids) if (!have.has(i)) fail(`I5 a ${table} row was deleted`, i);
  };
  await present("time_entry", protectedIds.time_entry); await present("session_report", protectedIds.session_report);
  await present("contract", protectedIds.contract); await present("resident", protectedIds.resident);
  await present("person", protectedIds.person); await present("partner_invoice", protectedIds.partner_invoice);
  await present("custom_invoice", protectedIds.custom_sent);
}

// ---- Actions ----
async function ctx() {
  const st = await state();
  return { ...st, rosterOk: (who, res) => st.active[who] && ROSTER[res].includes(who), ppOk: (who, res) => st.active[who] && PP_OF[res] === who };
}
const expect = (name, allowed, r, sql) => {
  const did = r.ok && (r.n === undefined || r.n > 0 || (r.rows && r.rows.length > 0));
  if (allowed !== did) fail(`I6 ${name}: expected ${allowed ? "allowed" : "refused"}`, { r, sql: sql?.slice(0, 300) });
};
const resOf = (who) => (who === M2 ? pick([RES, RES2]) : RES);
// Approved weeks are final (v0.29, migration 20261213): the test's own reading
// of the rule, written independently of the database's helper functions.
let lockedSeen = 0; // how often a random action met an approved week (so the rule is really exercised)
const approvedWeek = async (person, res, day) => {
  const yes = (await su(`select 1 from public.time_entry where person_id='${person}' and residency_id='${res}' and week_starting='${weekStart(day)}' and state='approved' limit 1`)).length > 0;
  if (yes) lockedSeen++; return yes;
};
const sessionLocked = async (sid) => {
  const rows = await su(`select a.person_id, se.residency_id, ((se.starts_at at time zone t.timezone)::date)::text as day from public.session se
    join public.session_assignment a on a.session_id=se.id join public.location l on l.id=se.location_id join public.site t on t.id=l.site_id where se.id='${sid}'`);
  for (const x of rows) if (await approvedWeek(x.person_id, x.residency_id, x.day)) return true;
  return false;
};
const activityLocked = async (aid) => {
  const rows = await su(`select ra.person_id, ra.residency_id, ra.occurred_on::text as day from public.relationship_activity ra where ra.id='${aid}'
    union all select m.person_id, ra.residency_id, ra.occurred_on::text from public.relationship_activity ra join public.relationship_activity_musician m on m.activity_id=ra.id where ra.id='${aid}'`);
  for (const x of rows) if (await approvedWeek(x.person_id, x.residency_id, x.day)) return true;
  return false;
};
// Programs the person played that week (not absent, not canceled, already happened) with no report yet.
const undocumentedPlayed = async (person, res, wk) => (await su(`select count(*)::int as n from public.session se
  join public.session_assignment a on a.session_id=se.id and a.person_id='${person}' and a.status<>'absent'
  join public.location l on l.id=se.location_id join public.site t on t.id=l.site_id
  where se.residency_id='${res}' and se.kind='group_session' and se.schedule_state<>'canceled' and se.starts_at<=now()
    and (se.starts_at at time zone t.timezone)::date between '${wk}' and '${addDays(wk, 6)}'
    and not exists (select 1 from public.session_report r where r.session_id=se.id)`))[0].n;

const ACTIONS = [
  [10, async function logActivity() {
    const c = await ctx(); const who = chance(0.85) ? pick([L, M1, M2, W, X]) : pick([P, Q, O, A]);
    const res = resOf(who), site = pick(SITES[res]);
    const day = addDays(pick(WEEKS), int(0, 6)), kind = pick(["one_to_one", "mini_group", "hallway_concert"]), minutes = int(5, 120);
    const sql = `insert into public.relationship_activity (person_id,residency_id,site_id,occurred_on,kind,minutes) values ('${who}','${res}','${site}','${day}','${kind}',${minutes}) returning id`;
    history.push(`${NAME[who]} logs ${minutes} min at ${day}`);
    const locked = await approvedWeek(who, res, day);
    expect(`${NAME[who]} logs relationship building${locked ? " (approved week)" : ""}`, c.rosterOk(who, res) && day < TODAY && (!locked || c.isAdmin[who]), await as(who, sql), sql);
  }],
  [5, async function editActivity() {
    const rows = await su(`select id, person_id from public.relationship_activity`); if (!rows.length) return;
    const c = await ctx(); const a = pick(rows); const who = chance(0.7) ? a.person_id : pick(EVERYONE); const del = chance(0.3);
    const sql = del ? `delete from public.relationship_activity where id='${a.id}'` : `update public.relationship_activity set minutes=${int(5, 120)} where id='${a.id}'`;
    history.push(`${NAME[who]} ${del ? "deletes" : "edits"} ${NAME[a.person_id]}'s activity`);
    const locked = await activityLocked(a.id);
    const r = await as(who, sql); const did = r.ok && r.n > 0;
    const allowedByDocs = ((who === a.person_id && c.active[who]) && !locked) || c.isAdmin[who];
    if (did && who === a.person_id && !c.active[who]) known("B1", "a deactivated person can still change or delete their own activity", sql);
    else if (did !== allowedByDocs) fail(`I6 ${NAME[who]} ${del ? "deletes" : "edits"} an activity`, { r, sql });
  }],
  [8, async function document() {
    const rows = await su(`select se.id, se.schedule_state::text as st, (select person_id from public.session_assignment a where a.session_id=se.id and a.role='leader' and a.status<>'absent') as leader,
      exists (select 1 from public.session_report r where r.session_id=se.id) as has from public.session se where se.starts_at < now()`);
    const c = await ctx(); const se = pick(rows); const who = chance(0.75) && se.leader ? se.leader : pick(EVERYONE);
    const sql = `insert into public.session_report (session_id,author_id,attendance,interaction_type_id,resident_involvement,actual_minutes) values ('${se.id}','${who}',${int(0, 40)},'${IT_PERF}','${pick(["none", "co_led"])}',${int(20, 150)})`;
    history.push(`${NAME[who]} documents a session`);
    const locked = await sessionLocked(se.id);
    const allowed = !se.has && se.st !== "canceled" && ((se.leader === who && c.active[who] && !locked) || c.isAdmin[who]);
    expect(`${NAME[who]} documents a session (${se.has ? "already documented" : se.st})`, allowed, await as(who, sql), sql);
  }],
  [4, async function editReport() {
    const rows = await su(`select r.session_id, (select schedule_state::text from public.session se where se.id=r.session_id) as st,
      (select person_id from public.session_assignment a where a.session_id=r.session_id and a.role='leader' and a.status<>'absent') as leader from public.session_report r`);
    if (!rows.length) return; const c = await ctx(); const x = pick(rows); const who = chance(0.7) && x.leader ? x.leader : pick(EVERYONE);
    const sql = `update public.session_report set actual_minutes=${int(20, 150)} where session_id='${x.session_id}'`;
    history.push(`${NAME[who]} edits a report's length`);
    // A report of a session canceled after it was documented is locked (reports exist only for sessions that happened).
    const locked = await sessionLocked(x.session_id);
    expect(`${NAME[who]} edits a report (${x.st}${locked ? ", approved week" : ""})`, x.st !== "canceled" && ((x.leader === who && c.active[who] && !locked) || c.isAdmin[who]), await as(who, sql), sql);
  }],
  [14, async function enterHours() {
    const c = await ctx(); const who = chance(0.9) ? pick([L, M1, M2, W, X]) : pick([P, Q, O]); const owner = chance(0.92) ? who : pick([L, M1, M2]);
    const res = resOf(owner), wk = pick(WEEKS), cat = pick([CAT_PROG, CAT_RB, CAT_CONC]), h = int(chance(0.1) ? 0 : 1, 24) / 4;
    const ex = (await su(`select id, state::text as st, hours from public.time_entry where person_id='${owner}' and residency_id='${res}' and week_starting='${wk}' and time_category_id='${cat}'`))[0];
    const sql = ex ? `update public.time_entry set hours=${h} where id='${ex.id}'` : `insert into public.time_entry (person_id,residency_id,week_starting,time_category_id,hours) values ('${owner}','${res}','${wk}','${cat}',${h})`;
    history.push(`${NAME[who]} ${ex ? `changes (${ex.st})` : "enters"} ${NAME[owner]}'s ${h} h for ${wk}`);
    const r = await as(who, sql); const did = r.ok && r.n > 0;
    // v0.24: hours are calculated from documentation; nobody but an admin types them (none of these people is one).
    if (did) fail(`I6 ${NAME[who]} typed hours for ${NAME[owner]} (${ex?.st ?? "new"}); hours are calculated, never typed (v0.24)`, { r, sql });
  }],
  [14, async function submitWeek() {
    const c = await ctx(); const who = pick([L, M1, M2, W, X]); const res = resOf(who), wk = pick(WEEKS);
    const approvedAlready = (await su(`select count(*)::int as n from public.time_entry where person_id='${who}' and residency_id='${res}' and week_starting='${wk}' and state='approved'`))[0].n > 0;
    const undoc = (await su(`select count(*)::int as n from public.session se join public.session_assignment a on a.session_id=se.id join public.location l on l.id=se.location_id join public.site t on t.id=l.site_id
      where se.residency_id='${res}' and se.kind='group_session' and se.schedule_state<>'canceled' and se.starts_at<=now() and a.person_id='${who}' and a.role='leader' and a.status<>'absent'
        and (se.starts_at at time zone t.timezone)::date between '${wk}' and '${addDays(wk, 6)}' and not exists (select 1 from public.session_report r where r.session_id=se.id)`))[0].n;
    const sql = `select public.submit_week('${res}','${wk}')`;
    history.push(`${NAME[who]} submits ${wk} (${undoc} undocumented${approvedAlready ? ", already approved" : ""})`);
    const r = await as(who, sql);
    const allowed = c.active[who] && c.rosterOk(who, res) && undoc === 0 && !approvedAlready;
    if (r.ok !== allowed) fail(`I6 ${NAME[who]} submits a week (Submit my week, v0.21/v0.24)`, { r, undoc, approvedAlready });
  }],
  [14, async function approveOrReturn() {
    const c = await ctx(); const ret = chance(0.3);
    const subs = await su(`select distinct person_id, residency_id, week_starting from public.time_entry where state='submitted'`);
    const x = subs.length && chance(0.9) ? pick(subs) : { person_id: pick([L, M1, M2]), residency_id: pick([RES, RES2]), week_starting: pick(WEEKS) };
    const wk = iso(x.week_starting); const who = chance(0.75) ? PP_OF[x.residency_id] : pick(EVERYONE);
    const sql = ret ? `select public.return_week('${x.person_id}','${x.residency_id}','${wk}','please check') as n` : `select public.approve_week('${x.person_id}','${x.residency_id}','${wk}') as n`;
    history.push(`${NAME[who]} ${ret ? "returns" : "approves"} ${NAME[x.person_id]}'s ${wk}`);
    const waiting = ret ? 0 : await undocumentedPlayed(x.person_id, x.residency_id, wk);
    const r = await as(who, sql);
    // Approval waits while a program the musician played that week is undocumented (v0.29).
    if (r.ok !== ((c.isAdmin[who] || c.ppOk(who, x.residency_id)) && waiting === 0)) fail(`I6 ${NAME[who]} ${ret ? "sends back" : "approves"} hours`, { r, sql, waiting });
  }],
  [3, async function changeRate() {
    const c = await ctx(); const who = chance(0.6) ? A : pick(NON_ADMINS); const cid = pick(contractIds); const rate = int(15, 90);
    const sql = `update public.contract set hourly_rate=${rate} where id='${cid}'`;
    history.push(`${NAME[who]} sets a rate to ${rate}`);
    expect(`${NAME[who]} changes a rate`, c.isAdmin[who], await as(who, sql), sql);
  }],
  [3, async function addStipend() {
    const c = await ctx(); const who = chance(0.6) ? A : pick(NON_ADMINS); const cid = pick(contractIds);
    const sql = `insert into public.stipend_installment (contract_id,kind,due_on,amount) values ('${cid}','${pick(["project_support", "admin_lead", "training", "other"])}','${addDays(WEEKS[0], int(0, 20))}',${int(0, 400)})`;
    history.push(`${NAME[who]} adds a stipend`);
    expect(`${NAME[who]} adds a stipend`, c.isAdmin[who], await as(who, sql), sql);
  }],
  [3, async function sendCommunityInvoices() {
    const ag = pick(AGS), month = pick(MONTHS), end = monthEnd(month);
    const a = (await as(A, `select * from public.partner_agreement where id='${ag.id}'`)).rows[0];
    const thisMonth = (await as(A, `select * from public.partner_billable_minutes('${ag.id}','${month}','${end}')`)).rows;
    const toDate = (await as(A, `select * from public.partner_billable_minutes('${ag.id}','${SEASON_START}','${end}')`)).rows;
    const stipends = (await as(A, `select * from public.partner_billable_stipends('${ag.id}','${month}','${end}')`)).rows;
    const drafts = buildPartnerInvoices({ agreement: { ...a, hourly_rate: Number(a.hourly_rate), contracted_hours: Number(a.contracted_hours), overhead_percent: a.overhead_percent === null ? null : Number(a.overhead_percent) },
      month, sites: ag.sites.map((x) => ({ id: x, name: x === S1 ? "Maple House" : x === S2 ? "Birch Hall" : "Elm Court" })), thisMonth, toDate, stipends, installmentsDue: [] });
    for (const d of drafts) {
      if (d.total < 0) fail("I2 a draft community invoice is negative", d);
      const who = chance(0.8) ? A : pick(NON_ADMINS);
      const exists = (await su(`select 1 from public.partner_invoice where agreement_id='${ag.id}' and kind='${d.kind}' and month='${month}' and site_id is not distinct from ${d.siteId ? `'${d.siteId}'::uuid` : "null"}`)).length > 0;
      const sql = `insert into public.partner_invoice (agreement_id,kind,site_id,month,number,bill_to,lines,summary,total) values ('${ag.id}','${d.kind}',${d.siteId ? `'${d.siteId}'` : "null"},'${month}','IMP-${month.slice(0, 7)}','Bill to','${JSON.stringify(d.lines).replace(/'/g, "''")}'::jsonb,'${JSON.stringify(d.summary)}'::jsonb,${d.total})`;
      history.push(`${NAME[who]} sends a ${d.kind} invoice for ${month} ($${d.total})`);
      expect(`${NAME[who]} marks a community invoice sent${exists ? " again" : ""}`, who === A && !exists, await as(who, sql), sql);
    }
  }],
  [3, async function payOrTamper() {
    const rows = await su(`select id, state::text as st from public.partner_invoice`); if (!rows.length) return;
    const x = pick(rows); const who = chance(0.7) ? A : pick(NON_ADMINS); const tamper = chance(0.4);
    const sql = tamper ? `update public.partner_invoice set ${pick(["total=total+1", "lines='[]'::jsonb", "bill_to='x'", "month=month + interval '1 month'"])} where id='${x.id}'` : `update public.partner_invoice set state='${x.st === "sent" ? "paid" : "sent"}' where id='${x.id}'`;
    history.push(`${NAME[who]} ${tamper ? "tampers with" : "pays/unpays"} a community invoice`);
    expect(`${NAME[who]} ${tamper ? "changes a sent invoice's lines or total" : "marks an invoice paid"}`, !tamper && who === A, await as(who, sql), sql);
  }],
  [4, async function customInvoice() {
    const who = chance(0.75) ? A : pick(NON_ADMINS);
    const rows = await su(`select id, state from public.custom_invoice`);
    const op = rows.length ? pick(["create", "edit", "send", "pay", "delete", "tamper"]) : "create";
    const x = rows.length ? pick(rows) : null;
    const lines = Array.from({ length: int(1, 3) }, () => { const q = int(1, 4), u = int(10, 300); return { description: "Concert", quantity: q, unit_amount: u, amount: q * u }; });
    let sql, allowed;
    if (op === "create") { sql = `insert into public.custom_invoice (title,number,bill_to,lines,total) values ('Concert','IMP-C','Friends','${JSON.stringify(lines)}'::jsonb,${customLinesTotal(lines)})`; allowed = who === A; }
    else if (op === "edit") { sql = `update public.custom_invoice set lines='${JSON.stringify(lines)}'::jsonb, total=${customLinesTotal(lines)} where id='${x.id}'`; allowed = who === A && x.state === "draft"; }
    // Sending, paying and un-paying (sent <-> paid) are an admin's to do in any order the guard allows.
    else if (op === "send") { sql = `update public.custom_invoice set state='sent' where id='${x.id}'`; allowed = who === A; }
    else if (op === "pay") { sql = `update public.custom_invoice set state='paid' where id='${x.id}'`; allowed = who === A; }
    else if (op === "delete") { sql = `delete from public.custom_invoice where id='${x.id}'`; allowed = who === A && x.state === "draft"; }
    // A total that no longer matches its lines is refused for everyone, drafts included (fix B8, migration 20261208).
    else { sql = `update public.custom_invoice set total=total+1 where id='${x.id}'`; allowed = false; }
    history.push(`${NAME[who]} ${op}s a custom invoice (${x?.state ?? "new"})`);
    expect(`${NAME[who]} ${op}s a custom invoice (${x?.state ?? "new"})`, allowed, await as(who, sql), sql);
  }],
  [6, async function poke() {
    // Someone (admins too) tries to delete or rewrite protected money records.
    const who = pick(EVERYONE);
    const sql = pick([
      `delete from public.time_entry where id in (select id from public.time_entry limit 1)`,
      `delete from public.session_report where id in (select id from public.session_report limit 1)`,
      `delete from public.contract where id='${pick(contractIds)}'`,
      `delete from public.resident where id in (select id from public.resident limit 1)`,
      `delete from public.partner_invoice where id in (select id from public.partner_invoice limit 1)`,
      `delete from public.person where id='${pick(EVERYONE)}'`,
      `delete from public.custom_invoice where state <> 'draft'`,
      `update public.time_entry set hours=hours+1 where state='approved'`,
      `update public.time_entry set state='approved' where state='submitted'`,
      `insert into public.time_entry (person_id,residency_id,week_starting,time_category_id,hours,state) values ('${who}','${RES}','${pick(WEEKS)}','${CAT_CONC}',5,'approved')`,
    ]);
    history.push(`${NAME[who]} pokes: ${sql.slice(0, 60)}`);
    const r = await as(who, sql);
    // Nothing here is allowed for anyone, except an admin approving submitted
    // rows directly (admins may approve, v0.19).
    const admin = (await state()).isAdmin[who];
    const adminApprove = /set state='approved' where state='submitted'/.test(sql) && admin;
    if (r.ok && r.n > 0 && admin && /hours=hours\+1 where state='approved'/.test(sql)) {
      // QUESTION Q8: "Approved hours are locked" (v0.19) -- but admins may still edit them.
      if (!seenKnown.has("Q8")) { seenKnown.add("Q8"); T.question("Q8", `approved hours are locked for admins too (an admin raised approved hours at step ${step}; locked for musicians only?)`, false, sql); }
      for (const x of await su(`select id, hours from public.time_entry where state='approved'`)) approvedHours.set(x.id, x.hours);
      return;
    }
    if (r.ok && r.n > 0 && !adminApprove) fail(`I6 ${NAME[who]} changed a protected record`, { sql, r });
  }],
  [3, async function resident() {
    const c = await ctx(); const who = pick(EVERYONE); const res = resOf(who); const site = pick(SITES[res]);
    const sql = `insert into public.resident (site_id,display_name,disambiguator,created_by) values ('${site}','R${int(1, 40)}.','${int(0, 9)}','${who}')`;
    history.push(`${NAME[who]} adds a resident`);
    const r = await as(who, sql);
    const allowed = (c.rosterOk(who, res) || c.isAdmin[who]);
    if (r.ok && !allowed) fail(`I6 ${NAME[who]} adds a resident`, { r, sql });
    if (!r.ok && allowed && !/duplicate|unique/.test(r.err)) fail(`I6 ${NAME[who]} should be able to add a resident`, { r, sql });
  }],
  [2, async function cancelSession() {
    const c = await ctx(); const rows = await su(`select id, residency_id from public.session where schedule_state='published'`); if (!rows.length) return;
    const se = pick(rows); const who = chance(0.6) ? PP_OF[se.residency_id] : pick(EVERYONE);
    const sd = SESSIONS.find((x) => x.id === se.id); const tz = LOC[sd.site][1];
    const sql = `update public.session set schedule_state='canceled', cancellation_reason='${pick(["partner", "partner", "weather", "musician"])}', canceled_at='${sd.day} ${pick(["08:00", "10:30", "13:00"])}:00 ${tz}' where id='${se.id}'`;
    history.push(`${NAME[who]} cancels a published session`);
    const lead = se.residency_id === RES && who === L && c.active[L];
    const locked = await sessionLocked(se.id);
    expect(`${NAME[who]} cancels a published session${locked ? " (approved week)" : ""}`, c.isAdmin[who] || ((c.ppOk(who, se.residency_id) || lead) && !locked), await as(who, sql), sql);
  }],
  [1, async function toggleX() {
    const on = (await state()).active[X];
    history.push(`A ${on ? "deactivates" : "reactivates"} X`);
    const r = await as(A, `update public.person set active=${!on} where id='${X}'`);
    if (!r.ok || r.n !== 1) fail("admin (de)activates X", r);
  }],
];
const total = ACTIONS.reduce((n, [wt]) => n + wt, 0);
const counts = {};
await snapshot(); await invariants();
const t0 = Date.now();
for (step = 1; step <= STEPS; step++) {
  let x = rnd() * total, act;
  for (const [wt, fn] of ACTIONS) { if ((x -= wt) < 0) { act = fn; break; } }
  counts[act.name] = (counts[act.name] ?? 0) + 1;
  const before = T.failures;
  await act();
  await invariants();
  await snapshot();
  if (T.failures > before) failingSteps++;
  if (failingSteps >= 5) { console.log(`stopping after 5 failing steps (PROP_SEED=${SEED})`); break; }
  if (step % 250 === 0) console.log(`  step ${step}/${STEPS} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
console.log(`approved-week rule checked against ${lockedSeen} locked situations`);
const totals = (await su(`select (select count(*) from public.time_entry)::int te, (select count(*) from public.time_entry where state='approved')::int approved, (select count(*) from public.session_report)::int reports,
  (select count(*) from public.relationship_activity)::int acts, (select count(*) from public.partner_invoice)::int sent, (select count(*) from public.custom_invoice)::int custom`))[0];
console.log("actions:", JSON.stringify(counts));
console.log("final state:", JSON.stringify(totals));
T.check(`${Math.min(step, STEPS)} random steps kept every money invariant`, T.failures === 0);
const failed = T.summary(`money-invariants (PROP_SEED=${SEED}, PROP_STEPS=${STEPS})`);
if (failed) console.log(`\nReproduce: PROP_SEED=${SEED} PROP_STEPS=${STEPS} node supabase/tests/money-invariants.test.mjs`);
process.exit(failed ? 1 : 0);
