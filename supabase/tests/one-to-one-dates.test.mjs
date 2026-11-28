// One-to-ones on the calendar (Ryan, Nov 27, 2026): the Iris Supervisor adds a
// one-time relationship-building date (no leader; time and length optional).
// It prints on the calendar and the month can be sent with it leaderless;
// hours come only from what each musician logs. Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays } from "./money-harness.mjs";

const T = reporter();
const { check } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const w = await buildPlaces(env, addDays(TODAY, -30), addDays(TODAY, 150));
const { P, L, M1 } = P_;

const next = new Date(`${TODAY}T12:00:00Z`); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
const MONTH = next.toISOString().slice(0, 10);
const day = `${MONTH.slice(0, 8)}12`;

let r = await as(P, `insert into public.session (residency_id, kind, title, location_id, starts_at, has_set_time, scheduled_minutes)
  values ('${w.RES}','relationship_building','One-to-ones','${w.R1}', '${day} 00:00 America/New_York', false, null) returning id`);
check("the Iris Supervisor adds a one-to-ones date with no time, length or leader", r.ok, r);
const ID = r.rows?.[0]?.id;
await su(`insert into public.session_assignment (session_id, person_id, role) values ('${ID}','${M1}','participant')`);
// A group program the same month, with its leader, so the month has something to send.
const G = (await su(`insert into public.session (residency_id, title, location_id, starts_at, scheduled_minutes)
  values ('${w.RES}','Music Café','${w.R1}', '${MONTH.slice(0, 8)}09 14:00 America/New_York', 60) returning id`))[0].id;
await su(`insert into public.session_assignment (session_id, person_id, role) values ('${G}','${L}','leader')`);

r = await as(L, `select public.send_schedule_month('${w.RES}','${w.S1}','${MONTH}')`);
check("the Lead Musician sends the month with the one-to-ones date leaderless", r.ok, r);
check("…and it's on the published calendar", (await su(`select schedule_state::text s from public.session where id='${ID}'`))[0].s === "published");

process.exit(T.summary("one-to-one-dates") ? 1 : 0);
