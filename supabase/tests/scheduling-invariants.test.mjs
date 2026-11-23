// Seeded-random property test for scheduling and publishing, database only.
//
// Builds a small world (two programs, two sites with different time zones,
// planners, an Admin Lead, roster musicians, would-be subs, an outsider, a
// deactivated person, someone who left the roster), then runs PROP_STEPS
// random actions by random personas, allowed and forbidden alike. Before each
// action it works out from docs/DOMAIN-MODEL.md (v0.23 §3 "Who does what",
// §7) whether the docs FORBID it; a forbidden action that takes effect is a
// failure. After every step it checks invariants against the whole database:
//
//   I1  every published, non-canceled group session has exactly one playing leader
//   I2  only planners (point person, admins) and the Admin Lead changed a
//       published or "No Program" session; only planners (or a musician
//       recording their own sub) changed who plays on one
//   I3  draft sessions and their musicians were changed only by planners,
//       musicians playing that date, or the publishing functions
//   I4  no session moved to another residency; nothing protected was deleted
//       (sessions, calendar versions, musicians of non-draft dates)
//   I5  drafts become published only through publish_month/new_calendar_version
//       for that site and month; published never goes back to draft
//   I6  calendar versions per site and month are exactly 1..n, only increase,
//       version 1 was reviewed first, later versions are "sent"
//   I7  every insert and update of session / session_assignment /
//       calendar_export is in audit_log, with the acting person
//   I8  everyone playing a date is on a roster covering that date
//   I9  outsiders, deactivated people, people who left the roster, other
//       programs' staff and anon read zero rows of the program (every 10 steps)
//
// Known bugs and open questions (see FINDINGS in scheduling-harness.mjs) are
// reported, not failed, and the session involved is set aside so the run can
// keep looking for new problems.
//
// Run:  node supabase/tests/scheduling-invariants.test.mjs
//       PROP_SEED=7 PROP_STEPS=20000 node supabase/tests/scheduling-invariants.test.mjs
//       PROP_SEED=1..5 PROP_STEPS=5000 node supabase/tests/scheduling-invariants.test.mjs   (each seed in a fresh database)
//
// Repeatable: the same seed on the same day gives the same run. Every list the
// test picks from is sorted by fixed facts (date, series, room, person), never
// by the random ids the database invents. Dates are counted from today, so a
// run can differ from one day to the next.
import { createDb, runner, checker, addMonths, addDays, lastDay, rng } from "./scheduling-harness.mjs";

const seedArg = process.env.PROP_SEED ?? "1";
const STEPS = Number(process.env.PROP_STEPS ?? 300);
const seeds = seedArg.includes("..") ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(seedArg.split("..").map(Number)) : [Number(seedArg)];
const { check, flag, summary } = checker();
let totalFail = 0;

for (const SEED of seeds) {
  const t0 = Date.now();
  const R = rng(SEED);
  const db = await createDb();
  const { as, su } = runner(db);
  const log = [];
  let failedThisSeed = 0;
  const fail = (name, detail) => { failedThisSeed++; check(`[seed ${SEED}, step ${log.length}] ${name}`, false, detail); };
  const reported = new Set();
  const report = (tag, name, detail) => { if (!reported.has(tag)) { reported.add(tag); flag(tag, `[seed ${SEED}, step ${log.length}] ${name}`, detail); } };

  // ---------------------------------------------------------------------------
  // The world
  // ---------------------------------------------------------------------------
  const TODAY = (await su(`select current_date::text as d`))[0].d;
  const THIS = TODAY.slice(0, 8) + "01";
  const PREV = addMonths(THIS, -1), B = addMonths(THIS, 2), END = lastDay(addMonths(B, 3));
  const MONTHS = [B, addMonths(B, 1), addMonths(B, 2)];
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const A = id(1), P = id(2), Q = id(3), L = id(4), M1 = id(5), M2 = id(6), M3 = id(7), M4 = id(8),
    S1 = id(9), S2 = id(10), O = id(11), X = id(12), LF = id(13), N = id(14);
  const NAMES = { [A]: "admin", [P]: "point person", [Q]: "other point person", [L]: "Admin Lead", [M1]: "M1", [M2]: "M2", [M3]: "M3", [M4]: "M4",
    [S1]: "S1 (sub pool)", [S2]: "S2 (sub pool)", [O]: "outsider", [X]: "deactivated", [LF]: "left roster", [N]: "other program's musician", null: "anon" };
  const everyone = [A, P, Q, L, M1, M2, M3, M4, S1, S2, O, X, LF, N];
  await su(`insert into auth.users select x, 'p'||n||'@example.org' from unnest(array[${everyone.map((u) => `'${u}'::uuid`).join(",")}]) with ordinality t(x,n);
  insert into public.person (id,name,email,employment_type,system_roles)
  select x, 'Person '||n, 'p'||n||'@example.org', 'contractor_1099', case when x='${A}' then '{admin}'::public.system_role[] else '{}' end
  from unnest(array[${everyone.map((u) => `'${u}'::uuid`).join(",")}]) with ordinality t(x,n);`);
  const ins = async (sql) => (await su(sql))[0].id;
  const PT = await ins(`insert into public.partner (legal_name,display_name) values ('Prop Partner Inc.','Prop Partner') returning id`);
  const SA = await ins(`insert into public.site (partner_id,name,display_name,timezone) values ('${PT}','North','North','America/New_York') returning id`);
  const SB = await ins(`insert into public.site (partner_id,name,display_name,timezone) values ('${PT}','Desert','Desert','America/Phoenix') returning id`);
  const RA1 = await ins(`insert into public.location (site_id,name,display_name) values ('${SA}','Hall','Hall') returning id`);
  const RA2 = await ins(`insert into public.location (site_id,name,display_name) values ('${SA}','Den','Den') returning id`);
  const RB1 = await ins(`insert into public.location (site_id,name,display_name) values ('${SB}','Patio','Patio') returning id`);
  const PT2 = await ins(`insert into public.partner (legal_name,display_name) values ('Elsewhere LLC','Elsewhere') returning id`);
  const SC = await ins(`insert into public.site (partner_id,name,display_name,timezone) values ('${PT2}','Elm','Elm','America/Chicago') returning id`);
  const RC1 = await ins(`insert into public.location (site_id,name,display_name) values ('${SC}','Room','Room') returning id`);
  const RES = await ins(`insert into public.residency (partner_id,name,display_name,status) values ('${PT}','Prop','Prop','active') returning id`);
  const RES2 = await ins(`insert into public.residency (partner_id,name,display_name,status) values ('${PT2}','Other','Other','active') returning id`);
  await su(`insert into public.residency_site values ('${RES}','${SA}'),('${RES}','${SB}'),('${RES2}','${SC}')`);
  const SEA = await ins(`insert into public.season (residency_id,name,starts_on,ends_on) values ('${RES}','S','${PREV}','${END}') returning id`);
  const SEA2 = await ins(`insert into public.season (residency_id,name,starts_on,ends_on) values ('${RES2}','S2','${PREV}','${END}') returning id`);
  await su(`insert into public.roster_member (season_id,person_id,is_core,is_admin_lead,joined_on) values
    ('${SEA}','${L}',true,true,'${PREV}'),('${SEA}','${M1}',true,false,'${PREV}'),('${SEA}','${M2}',true,false,'${PREV}'),
    ('${SEA}','${M3}',true,false,'${PREV}'),('${SEA}','${M4}',true,false,'${PREV}'),('${SEA}','${X}',true,false,'${PREV}'),
    ('${SEA2}','${N}',true,false,'${PREV}');
    insert into public.roster_member (season_id,person_id,joined_on,left_on) values ('${SEA}','${LF}','${PREV}','${addDays(TODAY, -1)}');
    insert into public.staff_assignment (residency_id,person_id,role,starts_on) values ('${RES}','${P}','point_person','${PREV}'),('${RES2}','${Q}','point_person','${PREV}');
    update public.person set active=false where id='${X}';`);
  const mk = async (res, title, loc, wd, time, mins, extra = {}) => ins(`insert into public.series (residency_id,kind,title,default_location_id,weekdays,start_time,minutes,active_from,recurrence,week_of_month,default_leader_id)
    values ('${res}','${extra.kind ?? "group_session"}','${title}','${loc}','${wd}',${time ? `'${time}'` : "null"},${mins ?? "null"},'${PREV}','${extra.monthly ? "monthly" : "weekly"}',${extra.monthly ?? "null"},${extra.leader ? `'${extra.leader}'` : "null"}) returning id`);
  const SERIES = {
    [RES]: [await mk(RES, "Café", RA1, "{2,4}", "14:00", 45, { leader: M1 }), await mk(RES, "Rehearsal", RA2, "{3}", "10:00", 60),
      await mk(RES, "Desert Sing", RB1, "{1}", "13:30", 60, { monthly: 2, leader: M3 }), await mk(RES, "Lessons", RA2, "{5}", null, null, { kind: "relationship_building" })],
    [RES2]: [await mk(RES2, "Elm Tunes", RC1, "{2}", "11:00", 45, { leader: N })],
  };
  await su(`insert into public.series_default_person values ('${SERIES[RES][0]}','${M1}'),('${SERIES[RES][0]}','${M2}'),('${SERIES[RES][1]}','${M2}'),('${SERIES[RES][1]}','${M4}'),
    ('${SERIES[RES][2]}','${M3}'),('${SERIES[RES][3]}','${M1}'),('${SERIES[RES][3]}','${M4}'),('${SERIES[RES2][0]}','${N}')`);
  const SITES = { [RES]: [SA, SB], [RES2]: [SC] };
  const ROOMS = { [RES]: [RA1, RA2, RB1], [RES2]: [RC1] };
  const TZ = { [SA]: "America/New_York", [SB]: "America/Phoenix", [SC]: "America/Chicago" };
  const SEASON = { [RES]: SEA, [RES2]: SEA2 };
  // Start with one month filled, as the point person would.
  await as(P, `select public.generate_residency_month('${RES}','${B}')`);

  // ---------------------------------------------------------------------------
  // Facts from the database (ground truth, as the owner)
  // ---------------------------------------------------------------------------
  const activeSet = new Set(everyone.filter((u) => u !== X));
  const isPlanner = (p, res) => p === A || (p === P && res === RES) || (p === Q && res === RES2);
  const isAL = (p, res) => p === L && res === RES;
  async function onRoster(p, res) {
    if (!p || !activeSet.has(p)) return false;
    return (await su(`select 1 from public.roster_member rm join public.season s on s.id=rm.season_id where s.residency_id='${res}' and rm.person_id='${p}'
      and s.ends_on>=current_date and (rm.left_on is null or rm.left_on>=current_date)`)).length > 0;
  }
  // v0.35 (Lauren): once a building's month is reviewed, its drafts lock for
  // musicians; planners and the Admin Lead keep working on it.
  const locked = (p, f) => f.reviewed && !isAL(p, f.residency_id);
  async function facts(session) {
    const f = (await su(`select s.id, s.residency_id, s.schedule_state as st, s.kind, s.is_special_event as special, s.series_id,
      coalesce((select array_agg(person_id) from public.session_assignment a where a.session_id=s.id and a.status<>'absent'), '{}') as playing,
      coalesce((select array_agg(person_id) from public.session_assignment a where a.session_id=s.id and a.status='assigned'), '{}') as assigned,
      coalesce((select array_agg(person_id) from public.session_assignment a where a.session_id=s.id and a.role='leader' and a.status<>'absent'), '{}') as leaders,
      (select count(*)::int from public.session_assignment a where a.session_id=s.id) as n,
      public.is_session_month_reviewed(s.id) as reviewed
      from public.session s where s.id='${session}'`))[0];
    return f;
  }
  const snapshot = async () => ({
    sessions: new Map((await su(`select id, residency_id, schedule_state, kind, (to_jsonb(s) - 'updated_at')::text as j from public.session s`)).map((x) => [x.id, x])),
    asg: new Map((await su(`select id, session_id, person_id, role, status, (to_jsonb(a) - 'updated_at')::text as j from public.session_assignment a`)).map((x) => [x.id, x])),
    cal: new Map((await su(`select id, residency_id, site_id, month::text as month, version, state, reviewed_by, reviewed_at, to_jsonb(c)::text as j from public.calendar_export c`)).map((x) => [x.id, x])),
    auditMax: (await su(`select coalesce(max(id),0)::int as m from public.audit_log`))[0].m,
  });
  const pickSession = async (res = R.chance(0.9) ? RES : RES2, filter = "true") => (await su(`select id from public.session where residency_id='${res}' and ${filter} order by starts_at, series_id nulls first, location_id, title, scheduled_minutes, is_special_event, id`)).map((x) => x.id);

  // ---------------------------------------------------------------------------
  // Personas and actions. Each action returns { label, sql, kind, forbid, tag }:
  //   forbid true  = the docs forbid it (it must not take effect)
  //   forbid false = the docs allow it (it may still fail for a state reason)
  //   forbid null  = the docs are ambiguous here (tag says which QUESTION)
  // ---------------------------------------------------------------------------
  const PERSONAS = [[A, 4], [P, 22], [Q, 3], [L, 18], [M1, 9], [M2, 9], [M3, 8], [M4, 6], [S1, 3], [S2, 2], [O, 3], [X, 2], [LF, 2], [N, 2], [null, 2]];
  const persona = () => { let t = PERSONAS.reduce((s, [, w]) => s + w, 0) * R.next(); for (const [p, w] of PERSONAS) { if ((t -= w) < 0) return p; } return P; };
  const resOf = () => (R.chance(0.88) ? RES : RES2);
  const lit = (v) => (v === null ? "null" : `'${v}'`);

  const actions = [
    [6, async (p) => { // fill a month / all programs / the season
      const res = resOf(), k = R.int(3), m = R.pick(MONTHS);
      const sql = k === 0 ? `select public.generate_series_month('${R.pick(SERIES[res])}','${m}') as n`
        : k === 1 ? `select public.generate_residency_month('${res}','${m}') as n` : `select public.generate_season('${SEASON[res]}') as n`;
      return { label: ["fill program month", "fill month", "fill season"][k], sql, kind: "fn", forbid: !isPlanner(p, res), res };
    }],
    [3, async (p) => { // season leader
      const res = resOf(), who = R.pick([M1, M2, M3, M4, L, S1, null]);
      return { label: `set season leader ${NAMES[who] ?? "none"}`, sql: `select public.set_series_leader('${R.pick(SERIES[res])}',${lit(who)}) as n`, kind: "fn", forbid: !isPlanner(p, res), res };
    }],
    [2, async (p) => { // program length (cascades to undocumented dates, published included: v0.20)
      const res = resOf();
      return { label: "change program length", sql: `update public.series set minutes=${R.pick([30, 45, 60, 90])} where id='${R.pick(SERIES[res].slice(0, 3))}' and kind='group_session'`, kind: "upd", forbid: !isPlanner(p, res), res, cascades: true };
    }],
    [22, async (p) => { // edit a session field
      const ss = await pickSession(); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s);
      const fields = [["title", `'T${R.int(99)}'`], ["location_id", `'${R.chance(0.9) ? R.pick(ROOMS[f.residency_id]) : R.pick(ROOMS[RES2])}'`], ["internal_note", `'n${R.int(9)}'`],
        ["public_note", `'p${R.int(9)}'`], ["billable", R.pick(["true", "false"])], ["starts_at", R.pick(["starts_at + interval '1 hour'", "starts_at - interval '1 day'", "starts_at + interval '3 days'", "starts_at + interval '2 years'"])],
        ["scheduled_minutes", R.pick(["30", "75"])], ["is_special_event", "not is_special_event"], ["call_time", "'18:00'"], ["is_extra", "not is_extra"]];
      const [col, val] = R.pick(fields);
      let forbid;
      if (isPlanner(p, f.residency_id)) forbid = false;
      else if (f.st === "draft") {
        const ok = !locked(p, f) && (await onRoster(p, f.residency_id)) && f.playing.includes(p) &&
          (["title", "location_id", "internal_note"].includes(col) || (f.special && ["starts_at", "scheduled_minutes", "call_time"].includes(col)));
        forbid = !ok;
      } else forbid = !(isAL(p, f.residency_id) && activeSet.has(p) && ["title", "location_id", "internal_note", "public_note", "starts_at", "scheduled_minutes", "call_time"].includes(col));
      return { label: `edit ${col} (${f.st}${f.special ? ", special" : ""})`, sql: `update public.session set ${col}=${val} where id='${s}'`, kind: "upd", forbid, res: f.residency_id, session: s, moves: col === "starts_at" };
    }],
    [7, async (p) => { // No Program
      const ss = await pickSession(undefined, "schedule_state<>'canceled'"); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s), reason = R.chance(0.9) ? R.pick(["partner", "weather", "musician", "other"]) : null;
      const backdate = R.chance(0.25);
      let forbid = true, tag;
      if (isPlanner(p, f.residency_id)) forbid = false;
      else if (f.st === "draft") {
        // v0.35 (Lauren): any musician playing the draft date, the Admin Lead too
        // (only on dates they play; answers Q3), until the month is reviewed.
        if (!locked(p, f) && (await onRoster(p, f.residency_id)) && f.playing.includes(p)) forbid = false;
      } else if (isAL(p, f.residency_id)) forbid = false;
      return { label: `No Program (${f.st})${backdate ? " typing canceled_at" : ""}`, sql: `update public.session set schedule_state='canceled', cancellation_reason=${lit(reason)}${backdate ? ", canceled_at='2001-01-01'" : ""} where id='${s}'`, kind: "upd", forbid, tag, res: f.residency_id, session: s, backdate };
    }],
    [4, async (p) => { // restore
      const ss = await pickSession(undefined, "schedule_state='canceled'"); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s);
      return { label: "restore No Program", sql: `update public.session set schedule_state='draft' where id='${s}'`, kind: "upd", forbid: !(isPlanner(p, f.residency_id) || isAL(p, f.residency_id)), res: f.residency_id, session: s };
    }],
    [2, async (p) => { // the Admin Lead's (or anyone's) attempt to rewrite canceled_at on a canceled date
      const ss = await pickSession(undefined, "schedule_state='canceled'"); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s);
      // Docs: canceled_at is "when the cancellation was recorded". A planner may
      // correct records; anyone else changing it is known bug K3.
      return { label: "rewrite canceled_at", sql: `update public.session set canceled_at='2001-01-01' where id='${s}'`, kind: "upd",
        forbid: isPlanner(p, f.residency_id) ? false : isAL(p, f.residency_id) ? null : true, known: "K3", res: f.residency_id, session: s, backdate: true };
    }],
    [9, async (p) => { // add a musician
      const ss = await pickSession(); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s), who = R.pick([M1, M2, M3, M4, L, S1, O, N, p ?? M1]), role = R.chance(0.25) ? "leader" : "participant";
      let forbid = true, tag;
      if (isPlanner(p, f.residency_id)) forbid = false;
      else if (f.st === "draft" && !locked(p, f) && (await onRoster(p, f.residency_id))) {
        if (f.playing.includes(p)) { if (role === "leader" && f.leaders.length === 0) { forbid = null; tag = "Q1"; } else forbid = false; }
        else if (f.n === 0) { forbid = null; tag = "Q2"; }
      } else if (f.st !== "draft" && isAL(p, f.residency_id)) { forbid = null; tag = "Q4"; }
      return { label: `add ${NAMES[who]} as ${role} (${f.st})`, sql: `insert into public.session_assignment (session_id,person_id,role) values ('${s}','${who}','${role}')`, kind: "ins", forbid, tag, res: f.residency_id, session: s };
    }],
    [5, async (p) => { // remove a musician
      const ss = await pickSession(); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s);
      const a = (await su(`select id, person_id, role from public.session_assignment where session_id='${s}' order by person_id`)); if (!a.length) return null;
      const t = R.pick(a);
      let forbid = true;
      if (f.st === "draft") forbid = !(isPlanner(p, f.residency_id) || (!locked(p, f) && (await onRoster(p, f.residency_id)) && f.playing.includes(p) && t.role === "participant"));
      else if (isPlanner(p, f.residency_id)) forbid = null; // docs silent: planners "edit" published dates
      return { label: `remove ${NAMES[t.person_id] ?? "someone"} (${t.role}, ${f.st})`, sql: `delete from public.session_assignment where id='${t.id}'`, kind: "upd", forbid, res: f.residency_id, session: s };
    }],
    [10, async (p) => { // promote / demote (pick or swap the leader)
      const ss = await pickSession(); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s);
      const a = (await su(`select id, person_id, role from public.session_assignment where session_id='${s}' and status<>'absent' order by person_id`)); if (!a.length) return null;
      const t = R.pick(a), to = t.role === "leader" ? "participant" : "leader";
      let forbid = true, tag;
      if (isPlanner(p, f.residency_id)) forbid = false;
      else if (f.st === "draft" && !locked(p, f) && (await onRoster(p, f.residency_id)) && f.playing.includes(p)) {
        if (to === "leader" && f.leaders.length === 0) { forbid = null; tag = "Q1"; } else forbid = false;
      } else if (f.st !== "draft" && isAL(p, f.residency_id)) { forbid = null; tag = "Q4"; }
      return { label: `${to === "leader" ? "promote" : "demote"} ${NAMES[t.person_id] ?? "someone"} (${f.st})`, sql: `update public.session_assignment set role='${to}' where id='${t.id}'`, kind: "upd", forbid, tag, res: f.residency_id, session: s, roleChange: true };
    }],
    [3, async (p) => { // change a status directly (subs go through the function)
      const ss = await pickSession(); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s);
      const a = (await su(`select id from public.session_assignment where session_id='${s}' and status='assigned' order by person_id`)); if (!a.length) return null;
      return { label: `set status absent directly (${f.st})`, sql: `update public.session_assignment set status='absent' where id='${R.pick(a).id}'`, kind: "upd", forbid: !isPlanner(p, f.residency_id), res: f.residency_id, session: s, roleChange: true };
    }],
    [4, async (p) => { // one-time event
      const res = resOf(), m = R.pick(MONTHS), day = addDays(m, R.int(28)), room = R.pick(ROOMS[res]), special = R.chance(0.5);
      return { label: `add one-time ${special ? "special event" : "date"}`, sql: `insert into public.session (residency_id,title,location_id,starts_at,scheduled_minutes,is_special_event)
        values ('${res}','Event','${room}',timestamp '${day} ${R.pick(["10:00", "19:00", "23:30"])}' at time zone (select st.timezone from public.location l join public.site st on st.id=l.site_id where l.id='${room}'),60,${special})`,
        kind: "ins", forbid: !(isPlanner(p, res) || isAL(p, res)), res };
    }],
    [4, async (p) => { // mark reviewed
      const res = resOf();
      return { label: "mark month reviewed", sql: `select public.mark_month_reviewed('${res}','${R.pick(SITES[res])}','${R.pick(MONTHS)}') as id`, kind: "fn", forbid: !isPlanner(p, res), res };
    }],
    [5, async (p) => { // publish
      const res = resOf(), site = R.pick(SITES[res]), m = R.pick(MONTHS);
      return { label: "publish month", sql: `select public.publish_month('${res}','${site}','${m}') as id`, kind: "fn", forbid: !(isPlanner(p, res) || isAL(p, res)), res, publishes: { res, site, m } };
    }],
    [4, async (p) => { // updated calendar
      const res = resOf(), site = R.pick(SITES[res]), m = R.pick(MONTHS);
      return { label: "new calendar version", sql: `select public.new_calendar_version('${res}','${site}','${m}','feedback') as id`, kind: "fn", forbid: !(isPlanner(p, res) || isAL(p, res)), res, publishes: { res, site, m }, newVersion: true };
    }],
    [5, async (p) => { // substitute
      const ss = await pickSession(undefined, R.chance(0.8) ? "schedule_state='published'" : "true"); if (!ss.length) return null;
      const s = R.pick(ss), f = await facts(s), sub = R.pick([S1, S2, M1, M2, M3, M4, X, O, N]);
      const allowed = f.st === "published" && p && activeSet.has(p) && f.assigned.includes(p);
      return { label: `sub ${NAMES[sub]} for ${NAMES[p]} (${f.st})`, sql: `select public.mark_absent_with_substitute('${s}','${sub}') as id`, kind: "fn", forbid: !allowed, res: f.residency_id, session: s, sub: true };
    }],
    [6, async () => { // the point person gives every leaderless date of a month a leader (as in the season view)
      const res = resOf(), m = R.pick(MONTHS), who = res === RES ? (R.chance(0.85) ? P : A) : Q;
      const inMonth = `se.residency_id='${res}' and se.kind='group_session' and se.schedule_state<>'canceled' and date_trunc('month', se.starts_at at time zone (select st.timezone from public.location l join public.site st on st.id=l.site_id where l.id=se.location_id))::date='${m}'
        and not exists (select 1 from public.session_assignment x where x.session_id=se.id and x.role='leader' and x.status<>'absent')`;
      return { label: "set missing leaders for a month", who, kind: "upd", forbid: false, res, roleChange: true, sql: [
        `update public.session_assignment a set role='leader' where a.id in (select distinct on (se.id) y.id from public.session se join public.session_assignment y on y.session_id=se.id and y.status<>'absent' where ${inMonth} order by se.id, y.person_id)`,
        `insert into public.session_assignment (session_id,person_id,role) select se.id, '${res === RES ? M1 : N}', 'leader' from public.session se where ${inMonth} and not exists (select 1 from public.session_assignment z where z.session_id=se.id and z.person_id='${res === RES ? M1 : N}')`] };
    }],
    [3, async (p) => { // always forbidden
      const ss = await pickSession(); if (!ss.length) return null;
      const s = R.pick(ss), k = R.int(7);
      const sql = [`delete from public.session where id='${s}'`, `delete from public.calendar_export`, `update public.session set residency_id='${RES2}' where id='${s}'`,
        `update public.session set schedule_state='published' where id='${s}' and schedule_state='draft'`,
        `insert into public.calendar_export (residency_id,site_id,month,version,state,generated_at) values ('${RES}','${SA}','${MONTHS[0]}',99,'sent',now())`,
        `update public.session set schedule_state='draft' where id='${s}' and schedule_state='published'`, `update public.calendar_export set version=version+10`][k];
      return { label: ["delete a session", "delete calendar versions", "move a session to another residency", "publish one date directly", "write a calendar version", "published back to draft", "renumber calendar versions"][k], sql, kind: "upd", forbid: true };
    }],
  ];
  const weighted = () => { let t = actions.reduce((s, [w]) => s + w, 0) * R.next(); for (const [w, fn] of actions) { if ((t -= w) < 0) return fn; } return actions[0][1]; };

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  const tolerated = { leaderless: new Set(), offRoster: new Set() };
  const counts = { ok: 0, refused: 0, byLabel: {} };

  async function invariants(before, after, step, act, actor, took) {
    const newAudit = await su(`select table_name, row_id, action, actor_id from public.audit_log where id > ${before.auditMax}`);
    const audited = new Set(newAudit.map((x) => `${x.table_name}:${x.row_id}:${x.action}`));
    const res = (sid) => (after.sessions.get(sid) ?? before.sessions.get(sid))?.residency_id;
    const playingBefore = (sid, who) => [...before.asg.values()].some((a) => a.session_id === sid && a.person_id === who && a.status !== "absent");
    const wasEmpty = (sid) => ![...before.asg.values()].some((a) => a.session_id === sid);

    // I7: audit log, with the actor
    for (const [tbl, b, a] of [["session", before.sessions, after.sessions], ["session_assignment", before.asg, after.asg], ["calendar_export", before.cal, after.cal]]) {
      for (const [k, row] of a) {
        if (!b.has(k)) { if (!audited.has(`${tbl}:${k}:insert`)) fail(`I7 ${tbl} insert not in audit_log`, { act: act?.label, k }); }
        else if (b.get(k).j !== row.j && !audited.has(`${tbl}:${k}:update`)) fail(`I7 ${tbl} update not in audit_log`, { act: act?.label, k });
      }
    }
    for (const x of newAudit) if (x.actor_id !== (actor ?? null)) fail("I7 audit_log actor is not the person who acted", { act: act?.label, x, actor });

    // I4: nothing protected deleted; residency fixed
    for (const [k, s] of before.sessions) {
      if (!after.sessions.has(k)) fail("I4 a session was deleted", { act: act?.label, k });
      else if (after.sessions.get(k).residency_id !== s.residency_id) fail("I4 a session moved to another residency", { act: act?.label, k });
    }
    for (const [k] of before.cal) if (!after.cal.has(k)) fail("I4 a calendar version was deleted", { act: act?.label, k });
    for (const [k, a] of before.asg) if (!after.asg.has(k)) {
      const st = before.sessions.get(a.session_id)?.schedule_state;
      if (st !== "draft") fail("I4 a musician was removed from a non-draft date", { act: act?.label, st, a });
      else report("Q6", "a draft assignment was deleted with no audit entry", { act: act?.label });
    }

    // I5: state transitions
    for (const [k, s] of after.sessions) {
      const b = before.sessions.get(k); if (!b) { if (s.schedule_state !== "draft") fail("I5 a new session didn't start as a draft", { k, s: s.schedule_state }); continue; }
      if (b.schedule_state === "published" && s.schedule_state === "draft") fail("I5 a published session went back to draft", { act: act?.label, k });
      if (b.schedule_state === "draft" && s.schedule_state === "published") {
        const pub = act?.publishes;
        const where = (await su(`select st.id as site, date_trunc('month', se.starts_at at time zone st.timezone)::date::text as m from public.session se join public.location l on l.id=se.location_id join public.site st on st.id=l.site_id where se.id='${k}'`))[0];
        if (!took || !pub || pub.res !== s.residency_id || pub.site !== where.site || pub.m !== where.m) fail("I5 a draft was published other than by publishing its own site and month", { act: act?.label, k, where });
      }
    }

    // I2 / I3: who changed sessions
    for (const [k, s] of after.sessions) {
      const b = before.sessions.get(k); if (!b || b.j === s.j) continue;
      const r = s.residency_id, planner = isPlanner(actor, r), al = isAL(actor, r);
      if (b.schedule_state !== "draft") {
        if (!(planner || al)) fail("I2 someone other than a planner or the Admin Lead changed a published/No Program date", { act: act?.label, actor: NAMES[actor], k });
      } else {
        const viaPublish = act?.publishes && (planner || al) && s.schedule_state === "published";
        if (!(planner || viaPublish || playingBefore(k, actor))) fail("I3 a draft was changed by someone not planning it or playing it", { act: act?.label, actor: NAMES[actor], k });
        if (b.schedule_state === "draft" && s.schedule_state === "canceled" && !planner &&
            !playingBefore(k, actor)) fail("I3 a draft was made No Program by someone not playing it (v0.35)", { act: act?.label, actor: NAMES[actor], k });
      }
    }
    // canceled_at must be the recording time
    if (act?.backdate && took && act.session) {
      const ca = (await su(`select canceled_at < now() - interval '1 hour' as old from public.session where id='${act.session}'`))[0];
      if (ca?.old && !isPlanner(actor, act.res)) report("K3", "canceled_at typed in by a non-planner", { act: act.label, actor: NAMES[actor] });
    }
    // I2 / I3: who changed who plays
    const changedAsg = [];
    for (const [k, a] of after.asg) { const b = before.asg.get(k); if (!b || b.j !== a.j) changedAsg.push(a); }
    for (const [k, a] of before.asg) if (!after.asg.has(k)) changedAsg.push(a);
    for (const a of changedAsg) {
      const st = before.sessions.get(a.session_id)?.schedule_state ?? "draft", r = res(a.session_id), planner = isPlanner(actor, r);
      if (planner) continue;
      if (act?.sub && took && st === "published") continue; // recording one's own sub (checked by forbid above)
      if (st !== "draft") { fail("I2 someone other than a planner changed who plays on a published/No Program date", { act: act?.label, actor: NAMES[actor], a }); continue; }
      if (playingBefore(a.session_id, actor)) continue;
      if (wasEmpty(a.session_id) && (await onRoster(actor, r))) { report("Q2", "a roster musician staffed an empty draft they don't play in", { act: act?.label }); continue; }
      fail("I3 who plays on a draft was changed by someone not planning or playing it", { act: act?.label, actor: NAMES[actor], a });
    }

    // I6: calendar versions
    const groups = new Map();
    for (const c of after.cal.values()) { const g = `${c.residency_id}|${c.site_id}|${c.month}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
    for (const [g, cs] of groups) {
      cs.sort((x, y) => x.version - y.version);
      if (!cs.every((c, i) => c.version === i + 1)) fail("I6 calendar versions aren't exactly 1..n", { g, v: cs.map((c) => c.version) });
      if (!cs[0].reviewed_by || !cs[0].reviewed_at) fail("I6 version 1 has no review", { g });
      if (cs.length > 1 && cs[0].state !== "sent") fail("I6 a later version exists while version 1 isn't sent", { g });
      if (cs.slice(1).some((c) => c.state !== "sent")) fail("I6 a later version isn't 'sent'", { g });
    }
    for (const [k, c] of before.cal) {
      const a = after.cal.get(k); if (!a) continue;
      if (a.version !== c.version || a.residency_id !== c.residency_id || a.site_id !== c.site_id || a.month !== c.month) fail("I6 a calendar version was renumbered or moved", { k });
      if (c.state === "sent" && a.state !== "sent") fail("I6 a sent version went back to reviewed", { k });
    }

    // I1: one playing leader on every published, non-canceled group session
    const bad = await su(`select s.id from public.session s where s.schedule_state='published' and s.kind='group_session'
      and (select count(*) from public.session_assignment a where a.session_id=s.id and a.role='leader' and a.status<>'absent') <> 1`);
    for (const t of [...tolerated.leaderless]) if (!bad.some((x) => x.id === t)) tolerated.leaderless.delete(t);
    for (const { id: sid } of bad) {
      if (tolerated.leaderless.has(sid)) {
        if (act?.newVersion && took) {
          const f = act.publishes;
          const inMonth = (await su(`select 1 from public.month_sessions('${f.res}','${f.site}','${f.m}') x(id) where x.id='${sid}'`)).length > 0;
          if (inMonth) report("K4", "an updated calendar went out with a leaderless published group session", { act: act.label });
        }
        continue;
      }
      if (act?.roleChange && took && isPlanner(actor, res(sid)) && act.session === sid) { tolerated.leaderless.add(sid); report("Q7", "a planner left a published date without a leader", { act: act.label }); continue; }
      fail("I1 a published group session doesn't have exactly one playing leader", { act: act?.label, actor: NAMES[actor], sid });
    }

    // I8: everyone playing a date is on a roster for that date
    const off = await su(`select a.session_id as sid, a.person_id from public.session_assignment a join public.session se on se.id=a.session_id
      where a.status<>'absent' and not exists (select 1 from public.roster_member rm join public.season s on s.id=rm.season_id
        where s.residency_id=se.residency_id and rm.person_id=a.person_id and public.session_local_date(se.id) between s.starts_on and s.ends_on
          and (rm.left_on is null or rm.left_on >= public.session_local_date(se.id)))`);
    for (const o of off) {
      if (tolerated.offRoster.has(o.sid)) continue;
      if (act?.moves && took && act.session === o.sid) { tolerated.offRoster.add(o.sid); report("K5", "a date moved outside its musicians' season", { act: act.label, actor: NAMES[actor] }); continue; }
      fail("I8 someone plays on a date no roster of theirs covers", { act: act?.label, o });
    }

    // I9: reads (every 10 steps and at the end)
    if (step % 10 === 0 || step === STEPS) {
      // Anyone can be named a sub and join the roster (D11), so outsiders are
      // checked against the programs they still aren't part of.
      const joined = async (who) => (await su(`select distinct s.residency_id as r from public.roster_member rm join public.season s on s.id=rm.season_id where rm.person_id='${who}'
        union select residency_id from public.staff_assignment where person_id='${who}'`)).map((x) => x.r);
      for (const who of [X, LF, null, ...(((await joined(O)).length) ? [] : [O])]) {
        for (const t of ["residency", "season", "roster_member", "staff_assignment", "series", "series_default_person", "session", "session_assignment", "calendar_export", "residency_site"]) {
          const x = await as(who, `select count(*)::int as n from public.${t}`);
          if (x.ok && x.rows[0].n !== 0) fail(`I9 ${NAMES[who]} reads ${t}`, x.rows[0]);
        }
      }
      for (const who of [Q, N, O]) {
        if ((await joined(who)).includes(RES)) continue;
        const x = await as(who, `select (select count(*) from public.session where residency_id='${RES}') + (select count(*) from public.calendar_export where residency_id='${RES}') + (select count(*) from public.series where residency_id='${RES}') as n`);
        if (!x.ok || Number(x.rows[0].n) !== 0) fail(`I9 ${NAMES[who]} reads the other program`, x);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------
  for (let step = 1; step <= STEPS; step++) {
    let p = persona();
    const act = await weighted()(p);
    if (!act) { log.push(`${step}: (no target)`); continue; }
    if (act.who !== undefined) p = act.who;
    const before = await snapshot();
    let r = { ok: false, err: "nothing ran" }, took = false;
    let ranOk = false;
    for (const q of [].concat(act.sql)) {
      const x = await as(p, q);
      if (x.ok) ranOk = true;
      if (!r.ok) r = x;
    }
    // "Took effect" = a function call succeeded, or some row really changed
    // (setting a column to the value it already has is not a change).
    const after = await snapshot();
    const changed = (b, a) => b.size !== a.size || [...a].some(([k, v]) => b.get(k)?.j !== v.j);
    took = (act.kind === "fn" && ranOk) || changed(before.sessions, after.sessions) || changed(before.asg, after.asg) || changed(before.cal, after.cal);
    // A change made through a series (program length) may touch nothing; that's fine.
    log.push(`${step}: ${NAMES[p]} → ${act.label}: ${took ? "took effect" : r.ok ? "0 rows" : "refused (" + r.err.slice(0, 80) + ")"}`);
    counts[took ? "ok" : "refused"]++;
    const key = `${act.label.replace(/\(.*\)|[A-Z]\w* ?\d?|M\d/g, "").trim()}`; counts.byLabel[key] = (counts.byLabel[key] ?? 0) + (took ? 1 : 0);
    if (took && act.forbid === true) fail(`the docs forbid "${act.label}" by ${NAMES[p]}, but it took effect`, { sql: act.sql.slice(0, 300) });
    if (took && act.forbid === null && act.known) report(act.known, `${NAMES[p]} → ${act.label}`, null);
    if (took && act.forbid === null && act.tag) report(act.tag, `ambiguous case happened: ${NAMES[p]} → ${act.label}`, null);
    await invariants(before, after, step, act, p, took);
    if (failedThisSeed) break;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`seed ${SEED}: ${log.length} steps in ${secs}s; ${counts.ok} took effect, ${counts.refused} refused or no-op`);
  const pub = (await su(`select schedule_state, count(*)::int as n from public.session group by 1 order by 1`));
  const cal = (await su(`select max(version)::int as v, count(*)::int as n from public.calendar_export`))[0];
  console.log(`  world at the end: ${pub.map((x) => `${x.n} ${x.schedule_state}`).join(", ")}; ${cal.n} calendar versions (highest v${cal.v ?? 0})`);
  if (failedThisSeed) {
    totalFail += failedThisSeed;
    console.log(`\nReproduce with: PROP_SEED=${SEED} PROP_STEPS=${log.length} node supabase/tests/scheduling-invariants.test.mjs`);
    console.log("Last steps:\n  " + log.slice(-20).join("\n  "));
  } else {
    check(`seed ${SEED}: ${log.length} random steps keep every invariant`, true);
  }
  await db.close();
}

const res = summary(` (seeds ${seedArg}, ${STEPS} steps each)`);
process.exit(res.fail ? 1 : 0);
