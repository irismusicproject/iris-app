// Tests for the phone app's offline log (migration 20261225120000_offline_logging,
// docs/OFFLINE-SPEC.md). The phone saves a relationship-building log in its
// outbox and later sends it, once, through log_relationship_activity(). These
// checks pin down what that one function must guarantee (Ryan's side, Nov 24):
//   - the same rules as the website's log form (roster, dates, sites,
//     residents, sharing, active people, approved weeks);
//   - safe to send twice: a resend changes nothing;
//   - all or nothing: a refused log leaves no new resident or link behind.
// Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays, weekStart } from "./money-harness.mjs";
import { randomUUID } from "node:crypto";

const T = reporter();
const { check, question } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const w = await buildPlaces(env, addDays(TODAY, -120), addDays(TODAY, 120));
const { A, P, M1, M2, X, O } = P_;

const YESTERDAY = addDays(TODAY, -1);
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const json = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const uuids = (a) => `'{${a.join(",")}}'::uuid[]`;

// One call, exactly as the phone sends it.
function send(who, x) {
  return as(who, `select public.log_relationship_activity(
    ${lit(x.id)}, ${lit(x.residency ?? w.RES)}, ${lit(x.site ?? w.S1)}, ${lit(x.day ?? YESTERDAY)},
    ${lit(x.kind ?? "one_to_one")}, ${x.minutes ?? 30}, ${x.collab ?? false}, ${lit(x.note ?? null)},
    ${lit(x.start ?? null)}, ${lit(x.end ?? null)},
    ${json(x.residents ?? [])}, ${json(x.newResidents ?? [])}, ${uuids(x.shared ?? [])}) as result`);
}
const result = (r) => (r.ok ? r.rows[0].result : `error: ${r.err}`);
const count = async (table, where = "true") => (await su(`select count(*)::int as n from public.${table} where ${where}`))[0].n;

// An existing resident at Maple House (added online by M2).
const RUTH = randomUUID();
let r = await as(M2, `insert into public.resident (id, site_id, display_name, created_by) values ('${RUTH}','${w.S1}','Ruth K.','${M2}')`);
check("setup: M2 adds Ruth K. at Maple House", r.ok, r);

// ---------------------------------------------------------------------------
// 1. A normal offline log, with a new resident, an existing one and a shared musician
// ---------------------------------------------------------------------------
const LOG1 = randomUUID();
const NEW1 = randomUUID();
const log1 = { id: LOG1, residents: [{ id: RUTH }], newResidents: [{ id: NEW1, name: "  Sam   P. ", disambiguator: "" }], shared: [M2], note: "Sang together." };
r = await send(M1, log1);
check("M1's offline log arrives: 'logged'", result(r) === "logged", r);
let row = (await su(`select person_id, minutes, note, occurred_on::text as d from public.relationship_activity where id='${LOG1}'`))[0];
check("…it's M1's log, with the phone's id, date, minutes and note", row?.person_id === M1 && row.minutes === 30 && row.note === "Sang together." && row.d === YESTERDAY, row);
row = (await su(`select display_name, created_by, site_id from public.resident where id='${NEW1}'`))[0];
check("…the new resident is created with the phone's id, tidied name, by M1, at that site", row?.display_name === "Sam P." && row.created_by === M1 && row.site_id === w.S1, row);
check("…both residents are on the log", (await count("relationship_activity_resident", `activity_id='${LOG1}'`)) === 2);
check("…shared with M2 (credited, v0.24)", (await count("relationship_activity_musician", `activity_id='${LOG1}' and person_id='${M2}'`)) === 1);

// ---------------------------------------------------------------------------
// 2. Safe to send twice
// ---------------------------------------------------------------------------
const before = { a: await count("relationship_activity"), res: await count("resident"), links: await count("relationship_activity_resident"), shares: await count("relationship_activity_musician") };
r = await send(M1, log1);
check("a resend (the first answer was lost) says 'already_logged'", result(r) === "already_logged", r);
const after = { a: await count("relationship_activity"), res: await count("resident"), links: await count("relationship_activity_resident"), shares: await count("relationship_activity_musician") };
check("…and changes nothing", JSON.stringify(before) === JSON.stringify(after), { before, after });
r = await send(M1, { ...log1, minutes: 90, note: "Different" });
question("OQ1", "the same id with different contents is refused (OFFLINE-SPEC 4.3), not answered 'already_logged'", result(r) !== "already_logged", r);

// ---------------------------------------------------------------------------
// 3. Same rules as the website's form
// ---------------------------------------------------------------------------
const refused = async (name, who, x) => {
  const res0 = await count("resident"), act0 = await count("relationship_activity");
  const r2 = await send(who, x);
  const nothingLeft = (await count("resident")) === res0 && (await count("relationship_activity")) === act0;
  check(`${name} (and nothing is left behind)`, !r2.ok && nothingLeft, { r: r2, nothingLeft });
  return r2;
};
const fresh = (extra = {}) => ({ id: randomUUID(), newResidents: [{ id: randomUUID(), name: `New ${Math.random().toString(36).slice(2, 6)}.` }], ...extra });

await refused("someone on no roster can't log offline", O, fresh());
await refused("the point person (not on the roster) can't log for the program", P, fresh());
await refused("a log dated tomorrow at the site is refused (logged after it happens)", M1, fresh({ day: addDays(TODAY, 1) }));
await refused("a site that isn't the program's is refused", M1, fresh({ site: w.T1 }));
await refused("a resident from another site can't be put on the log", M1, { id: randomUUID(), site: w.S2, residents: [{ id: RUTH }] });
await refused("it can't be shared with someone who isn't on the roster", M1, fresh({ shared: [O] }));
r = await as(null, `select public.log_relationship_activity('${randomUUID()}','${w.RES}','${w.S1}','${YESTERDAY}','one_to_one',30,false,null,null,null,'[]'::jsonb,'[]'::jsonb,'{}'::uuid[])`);
check("signed-out callers can't use it at all", !r.ok, r);

// O5: someone else added the same name while the phone was offline.
const TOM = randomUUID();
await as(M2, `insert into public.resident (id, site_id, display_name, created_by) values ('${TOM}','${w.S1}','Tom B.','${M2}')`);
const r5 = await refused("a new resident whose name was just added by someone else is refused", M1, { id: randomUUID(), newResidents: [{ id: randomUUID(), name: "tom b." }] });
check("…with 'resident_exists', so the phone can ask whether it's the same person", /resident_exists/.test(r5.err ?? ""), r5);

// Deactivated people (R9.5): the database refuses, so the phone wipes (O9).
await su(`update public.person set active=false where id='${X}'`);
await refused("a deactivated musician's queued log is refused", X, fresh());
await su(`update public.person set active=true where id='${X}'`);

// Approved weeks are final (v0.29): a log that arrives after approval is refused.
const wk = weekStart(addDays(TODAY, -14));
await su(`insert into public.time_entry (person_id, residency_id, week_starting, time_category_id, hours, state, approved_by, approved_at)
          values ('${M1}','${w.RES}','${wk}','${w.CAT_RB}',0,'approved','${P}',now())`);
check("setup: M1's week two weeks ago is approved", (await count("time_entry", `person_id='${M1}' and week_starting='${wk}' and state='approved'`)) === 1);
const rA = await refused("a log that arrives after its week was approved is refused (O4)", M1, fresh({ day: addDays(wk, 2) }));
check("…by the approved-weeks rule, with its plain message", /has been approved/.test(rA.err ?? ""), rA);
check("…but the same musician can still log in a week that isn't approved", result(await send(M1, fresh())) === "logged");

// Admins aren't on rosters either; the website's rules don't let them log for a musician here.
await refused("an admin can't send a log as if they were on the roster", A, fresh());

process.exit(T.summary("offline") ? 1 : 0);
