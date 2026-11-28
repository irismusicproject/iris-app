// D20 part 2 (Ryan, Nov 27, 2026): saving a weekly program makes its draft
// dates up to its Ends date (or the season's end), and a building's month
// opens for the team by itself when its first date exists (migration
// 20261231120000). Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays } from "./money-harness.mjs";

const T = reporter();
const { check } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const SEASON_END = addDays(TODAY, 100);
const w = await buildPlaces(env, addDays(TODAY, -30), SEASON_END);
const { P, L, M1, O } = P_;

const thisMonth = `${TODAY.slice(0, 8)}01`;
const ser = async (until) => (await su(`insert into public.series (residency_id,title,default_location_id,weekdays,start_time,minutes,active_from,active_until)
  values ('${w.RES}','Music Café','${w.R1}','{2}','14:00',60,'${addDays(TODAY, -30)}',${until ? `'${until}'` : "null"}) returning id`))[0].id;
const dates = async (s) => (await su(`select (starts_at at time zone 'America/New_York')::date::text as d from public.session where series_id='${s}' order by 1`)).map((r) => r.d);

// Who may run it
const S1 = await ser(addDays(TODAY, 40));
for (const [who, label] of [[M1, "a musician"], [L, "the Lead Musician"], [O, "an outsider"]]) {
  const r = await as(who, `select public.generate_series_dates('${S1}')`);
  check(`${label} can't make a program's dates`, !r.ok, r);
}

// Up to Ends
let r = await as(P, `select public.generate_series_dates('${S1}') as n`);
let d = await dates(S1);
check("the Iris Supervisor makes the dates", r.ok && r.rows[0].n === d.length && d.length > 0, r);
check("none after Ends", d.every((x) => x <= addDays(TODAY, 40)), d);
check("none before this month", d.every((x) => x >= thisMonth), d);
check("every date is a Tuesday", d.every((x) => new Date(`${x}T12:00:00Z`).getUTCDay() === 2), d);
r = await as(P, `select public.generate_series_dates('${S1}') as n`);
check("saving again adds nothing", r.ok && r.rows[0].n === 0, r);

// Moving Ends later adds the missing dates
await su(`update public.series set active_until='${addDays(TODAY, 70)}' where id='${S1}'`);
r = await as(P, `select public.generate_series_dates('${S1}') as n`);
const d2 = await dates(S1);
check("a later Ends adds the dates in between", r.ok && d2.length > d.length && d2.every((x) => x <= addDays(TODAY, 70)), { r, d2 });

// Blank Ends: to the season's end
const S2 = await ser(null);
await as(P, `select public.generate_series_dates('${S2}')`);
const d3 = await dates(S2);
check("blank Ends: dates up to the season's end", d3.length > 0 && d3.every((x) => x <= SEASON_END) && d3.at(-1) > addDays(SEASON_END, -8), d3);

// Months open themselves
const months = (await su(`select month::text as m, stage::text as s from public.schedule_month where residency_id='${w.RES}' and site_id='${w.S1}' order by 1`));
const expected = [...new Set(d3.map((x) => `${x.slice(0, 8)}01`))];
check("each month with dates is open for the team", expected.every((m) => months.some((x) => x.m === m && x.s === "team_editing")), { months, expected });
check("no email straight away (the scheduled run sends it)", (await su(`select count(*)::int as n from public.notification where kind='month_opened'`))[0].n === 0);

// A one-time date in a past month doesn't open that month
const past = addDays(thisMonth, -20);
await su(`insert into public.session (residency_id, title, location_id, starts_at, scheduled_minutes) values ('${w.RES}','Concert','${w.R1}','${past} 14:00 America/New_York',60)`);
check("a date in a past month doesn't open it", (await su(`select count(*)::int as n from public.schedule_month where month='${past.slice(0, 8)}01'`))[0].n === 0);

process.exit(T.summary("series-dates") ? 1 : 0);
