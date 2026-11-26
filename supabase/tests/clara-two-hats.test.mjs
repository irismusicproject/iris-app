// Clara (docs/PERSONAS.md): one musician, two hats in the same month.
// She is the Admin Lead at Elm Court (RES2) and a substitute (not core) at
// Maple House (RES). Each role's powers must stay at its own building: the
// Admin Lead's send / partner changes / final at Elm, and a sub's narrow
// rights at Maple (D5: subs edit only dates they play; v0.41-v0.44: only the
// Admin Lead, point person or an admin sends; only the leader titles a date
// while the team edits). Website and phone call these same functions, so
// these checks cover both. Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, id } from "./money-harness.mjs";

const T = reporter();
const { check } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const { L, M1, M2, P, Q } = P_;
const w = await buildPlaces(env, `${TODAY.slice(0, 4)}-01-01`, `${Number(TODAY.slice(0, 4)) + 1}-12-31`);

// Clara: Admin Lead at Elm (RES2), substitute at Maple (RES).
const C = id("c7");
await su(`insert into auth.users values ('${C}','clara@example.org')`);
await su(`insert into public.person (id,name,email,employment_type,system_roles) values ('${C}','Clara Clarinet','clara@example.org','contractor_1099','{}')`);
await su(`insert into public.roster_member (season_id,person_id,is_core,is_admin_lead) values ('${w.SEA2}','${C}',true,true),('${w.SEA}','${C}',false,false)`);

const next = new Date(`${TODAY}T12:00:00Z`); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
const MONTH = next.toISOString().slice(0, 10);
const day = (n) => `${MONTH.slice(0, 8)}${String(n).padStart(2, "0")}`;
const mk = async (res, room, title, d, people) => {
  const s = (await su(`insert into public.session (residency_id, title, location_id, starts_at, scheduled_minutes)
    values ('${res}','${title}','${room}', '${d} 14:00 America/New_York', 60) returning id`))[0].id;
  await su(`insert into public.session_assignment (session_id, person_id, role) values ${people.map(([p, role]) => `('${s}','${p}','${role}')`).join(",")}`);
  return s;
};
// Maple (where Clara subs): she plays one date, not the other.
const mapleHers = await mk(w.RES, w.R1, "Music Café", day(9), [[L, "leader"], [C, "participant"]]);
const mapleNot = await mk(w.RES, w.R1, "Sing-along", day(16), [[L, "leader"], [M1, "participant"]]);
// Elm (where Clara is Admin Lead): she plays one date, not the other.
const elmHers = await mk(w.RES2, w.R3, "Elm Strings", day(10), [[M2, "leader"], [C, "participant"]]);
const elmNot = await mk(w.RES2, w.R3, "Elm Choir", day(17), [[M2, "leader"]]);

const stage = async (res, site) => (await su(`select stage::text as s from public.schedule_month where residency_id='${res}' and site_id='${site}' and month='${MONTH}'`))[0]?.s ?? null;
const monthFn = (who, name, res, site) => as(who, `select public.${name}('${res}','${site}','${MONTH}') as r`);
const tasks = async () => ((await as(C, `select kind, residency_id from public.my_tasks()`)).rows ?? []);

// Both point people open their month for the team.
let r = await monthFn(P, "open_schedule_month", w.RES, w.S1); check("Maple's point person opens the month", r.ok, r);
r = await monthFn(Q, "open_schedule_month", w.RES2, w.T1); check("Elm's point person opens the month", r.ok, r);

// ---------------------------------------------------------------------------
// 1. What she sees: both buildings' stages; tasks only for her Admin Lead building
// ---------------------------------------------------------------------------
r = await as(C, `select residency_id from public.schedule_month where month='${MONTH}'`);
check("she sees the month's stage at both buildings", r.ok && r.rows.length === 2, r);
let t = await tasks();
check("To do: 'Send' for Elm, where she's Admin Lead", t.some((x) => x.kind === "send" && x.residency_id === w.RES2), t);
check("To do: no 'Send' for Maple, where she's a sub", !t.some((x) => x.kind === "send" && x.residency_id === w.RES), t);

// ---------------------------------------------------------------------------
// 2. At Maple, a sub: only dates she plays
// ---------------------------------------------------------------------------
r = await as(C, `select public.set_unavailable('${mapleHers}', true) as r`);
check("Maple: she marks 'I can't play' on a date she plays", r.ok, r);
r = await as(C, `select public.set_unavailable('${mapleHers}', false) as r`);
check("Maple: …and undoes it", r.ok, r);
r = await as(C, `select public.set_unavailable('${mapleNot}', true) as r`);
check("Maple: not on a date she doesn't play", !r.ok, r);
r = await as(C, `update public.session set location_id='${w.R2}' where id='${mapleNot}'`);
check("Maple: she can't move a date she doesn't play (D5, subs)", !r.ok || r.n === 0, r);
r = await as(C, `update public.session set title='Clara''s Café' where id='${mapleHers}'`);
check("Maple: only the leader titles a date while the team edits", !r.ok || r.n === 0, r);
r = await monthFn(C, "confirm_schedule_month", w.RES, w.S1); check("Maple: she can't confirm the month", !r.ok, r);
r = await monthFn(C, "send_schedule_month", w.RES, w.S1); check("Maple: she can't send the calendar (not Admin Lead here)", !r.ok, r);
check("Maple: still team editing", (await stage(w.RES, w.S1)) === "team_editing");

// ---------------------------------------------------------------------------
// 3. At Elm, the Admin Lead: send, partner changes, final
// ---------------------------------------------------------------------------
r = await as(C, `select public.set_unavailable('${elmHers}', true) as r`);
check("Elm: as a musician playing, she can mark 'I can't play' too", r.ok, r);
await as(C, `select public.set_unavailable('${elmHers}', false)`);
r = await monthFn(C, "send_schedule_month", w.RES2, w.T1);
check("Elm: she sends the calendar (sending also confirms)", r.ok && (await stage(w.RES2, w.T1)) === "sent_to_partner", r);
r = await monthFn(C, "schedule_month_send_info", w.RES2, w.T1); check("Elm: she reads who the calendar went to", r.ok, r);
r = await as(C, `update public.session set internal_note='Partner moved it to the Hall' where id='${elmNot}'`);
check("Elm: she enters a partner change on a date she doesn't play", r.ok && r.n === 1 && (await stage(w.RES2, w.T1)) === "partner_changes", r);
t = await tasks();
check("To do now: partner changes for Elm", t.some((x) => x.kind === "partner_changes" && x.residency_id === w.RES2), t);
r = await monthFn(C, "finalize_schedule_month", w.RES2, w.T1);
check("Elm: she marks the month final", r.ok && (await stage(w.RES2, w.T1)) === "final", r);

// ---------------------------------------------------------------------------
// 4. Nothing from Elm leaks to Maple
// ---------------------------------------------------------------------------
r = await monthFn(C, "send_schedule_month", w.RES, w.S1); check("after sending Elm, she still can't send Maple", !r.ok, r);
r = await as(C, `update public.session set internal_note='x' where id='${mapleNot}'`);
check("…or change a Maple date she doesn't play", !r.ok || r.n === 0, r);
r = await as(C, `insert into public.session_assignment (session_id, person_id) values ('${mapleNot}','${M2}')`);
check("…or add a musician to a Maple date", !r.ok, r);
check("Maple is untouched: still team editing", (await stage(w.RES, w.S1)) === "team_editing");
check("Maple's dates are still drafts", (await su(`select count(*)::int as n from public.session where id in ('${mapleHers}','${mapleNot}') and schedule_state='draft'`))[0].n === 2);

// Maple's own Admin Lead (Lee) sends Maple. Now Maple sits at the stage where
// Clara has Admin Lead powers at Elm; they still mustn't reach Maple.
r = await monthFn(L, "send_schedule_month", w.RES, w.S1);
check("Lee, Maple's Admin Lead, sends Maple", r.ok && (await stage(w.RES, w.S1)) === "sent_to_partner", r);
r = await monthFn(C, "schedule_month_send_info", w.RES, w.S1); check("Clara can't read who Maple's calendar went to", !r.ok, r);
r = await as(C, `update public.session set internal_note='Partner moved it' where id='${mapleNot}'`);
check("Clara can't enter a Maple partner change", !r.ok || r.n === 0, r);
r = await as(C, `update public.session set internal_note='Partner moved it' where id='${mapleHers}'`);
check("…not even on a Maple date she plays", !r.ok || r.n === 0, r);
check("…so Maple stays at 'sent to partner'", (await stage(w.RES, w.S1)) === "sent_to_partner");
r = await monthFn(C, "finalize_schedule_month", w.RES, w.S1); check("Clara can't mark Maple final", !r.ok, r);
t = await tasks();
check("To do: no partner-changes task for Maple", !t.some((x) => x.kind === "partner_changes" && x.residency_id === w.RES), t);

process.exit(T.summary("clara-two-hats") ? 1 : 0);
