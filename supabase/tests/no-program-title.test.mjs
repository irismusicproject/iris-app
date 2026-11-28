// D20 part 3 (Ryan, Nov 27, 2026): typing "No Program" as a date's title makes
// it No Program, exactly as the old button did (canceled, reason "other": not
// paid, not billed); typing another title brings it back as a draft (migration
// 20261231130000). Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays } from "./money-harness.mjs";

const T = reporter();
const { check } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const w = await buildPlaces(env, addDays(TODAY, -60), addDays(TODAY, 150));
const { P, L, M1, O } = P_;

const next = new Date(`${TODAY}T12:00:00Z`); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
const MONTH = next.toISOString().slice(0, 10);
const day = (n) => `${MONTH.slice(0, 8)}${String(n).padStart(2, "0")}`;
const mk = async (d) => (await su(`insert into public.session (residency_id, title, location_id, starts_at, scheduled_minutes)
  values ('${w.RES}','Music Café','${w.R1}', '${d} 14:00 America/New_York', 60) returning id`))[0].id;
const s1 = await mk(day(9));
const s2 = await mk(day(16));
for (const s of [s1, s2]) await su(`insert into public.session_assignment (session_id, person_id, role) values ('${s}','${L}','leader'),('${s}','${M1}','participant')`);
const row = async (s) => (await su(`select title, schedule_state::text as st, cancellation_reason::text as why from public.session where id='${s}'`))[0];
const setTitle = (who, s, t) => as(who, `update public.session set title='${t}' where id='${s}'`);

check("(setup) the month is open for the team", (await su(`select stage::text as s from public.schedule_month where month='${MONTH}' and site_id='${w.S1}'`))[0]?.s === "team_editing");

// Who can
let r = await setTitle(M1, s1, "No Program");
check("a musician who doesn't lead the date can't (titles are the leader's)", (await row(s1)).st === "draft", { r, row: await row(s1) });
r = await setTitle(O, s1, "No Program");
check("an outsider can't", (await row(s1)).st === "draft", r);

// The leader types it
r = await setTitle(L, s1, "  no  PROGRAM. ");
let x = await row(s1);
check("the leader types it (any capitals and spacing): the date is No Program", r.ok && x.st === "canceled" && x.title === "No Program", { r, x });
check("…with reason 'other', so it isn't billed", x.why === "other", x);
check("…and the Iris Supervisor is emailed, as with the button",
  (await su(`select count(*)::int as n from public.notification where kind='no_program' and person_id='${P}'`))[0].n >= 1);

// Undo: whoever typed it can type a title back (the database already let a
// date's musicians restore a canceled draft; the website's "Restore" button is
// only shown to the Lead Musician, Iris Supervisor and admins).
r = await setTitle(L, s1, "Sing-along");
x = await row(s1);
check("the leader types a title back: a draft again", r.ok && x.st === "draft" && x.title === "Sing-along" && x.why === null, { r, x });
await setTitle(L, s1, "No Program");
r = await setTitle(P, s1, "Sing-along");
x = await row(s1);
check("the Iris Supervisor can too", r.ok && x.st === "draft" && x.title === "Sing-along", { r, x });

// Other titles leave the date alone
r = await setTitle(L, s2, "Program notes");
check("an ordinary title doesn't cancel anything", r.ok && (await row(s2)).st === "draft", r);

process.exit(T.summary("no-program-title") ? 1 : 0);
