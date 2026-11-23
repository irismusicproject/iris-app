// Writes supabase/seed.sql: realistic test data for STAGING, local and CI.
// Never production (the Release workflow never applies the seed).
//
//   node scripts/generate-seed.mjs        # rewrite supabase/seed.sql
//   node scripts/check-seed.mjs           # load it in an in-memory database
//
// What's real: Iris's partner organizations and their site names, which are
// already public on Iris's website. Names, city and state only: no street
// addresses, and care levels left empty because we haven't confirmed them.
//
// What's fake: everything else. Every person is invented and named
// "... (fake)"; residents are invented first names + last initials with no
// health details; rates, hours and contract terms are made up.
//
// The random choices use a fixed seed, so running this twice writes the same
// file. Dates are relative to the day the seed runs (current_date), so the
// screens always show the last month and the next one.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let state = 20261121; // fixed seed: same output every run
function rand() {
  // mulberry32
  state |= 0; state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rand() * a.length)];
function sample(a, n) {
  const c = [...a]; const out = [];
  while (out.length < n && c.length) out.push(c.splice(Math.floor(rand() * c.length), 1)[0]);
  return out;
}
// Fixed, readable-key UUIDs: the same key always gives the same id.
function uuid(key) {
  const h = crypto.createHash("sha1").update("iris-seed:" + key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => q(`{${a.join(",")}}`);

// ---------------------------------------------------------------------------
// REAL: partners and sites (names, city, state, time zone only)
// ---------------------------------------------------------------------------
const ET = "America/New_York", CT = "America/Chicago", AZ = "America/Phoenix";
const partners = [
  { key: "ceslc", legal: "Charles E. Smith Life Communities", display: "Charles E. Smith Life Communities", sites: [
    { name: "Ring House", city: "Rockville", state: "MD", tz: ET },
    { name: "Landow House", city: "Rockville", state: "MD", tz: ET },
    { name: "Smith-Kogod", display: "Hebrew Home – Smith-Kogod", city: "Rockville", state: "MD", tz: ET, memory: true },
    { name: "Wasserman", display: "Hebrew Home – Wasserman", city: "Rockville", state: "MD", tz: ET, memory: true },
    { name: "Revitz House", city: "Rockville", state: "MD", tz: ET },
    { name: "Cohen-Rosen House", city: "Rockville", state: "MD", tz: ET },
  ] },
  { key: "chai", legal: "Comprehensive Housing Assistance", display: "Comprehensive Housing Assistance", sites: [
    { name: "Weinberg Manors", state: "MD", tz: ET },
    { name: "Weinberg Villages", state: "MD", tz: ET },
  ] },
  { key: "mather", legal: "Mather", display: "Mather", sites: [
    { name: "The Mather", city: "Evanston", state: "IL", tz: CT },
    { name: "Mather Place", city: "Wilmette", state: "IL", tz: CT },
    { name: "The Mather Tysons", city: "Tysons", state: "VA", tz: ET },
  ] },
  { key: "asbury", legal: "Asbury Methodist Village", display: "Asbury Methodist Village", installments: true, sites: [
    { name: "Asbury Methodist Village", city: "Gaithersburg", state: "MD", tz: ET, memory: true },
  ] },
  { key: "wintergrowth", legal: "Winter Growth", display: "Winter Growth", sites: [
    { name: "Winter Growth Columbia", city: "Columbia", state: "MD", tz: ET },
    { name: "Winter Growth Olney", city: "Olney", state: "MD", tz: ET },
  ] },
  { key: "splendido", legal: "Splendido at Rancho Vistoso", display: "Splendido at Rancho Vistoso", sites: [
    { name: "Splendido at Rancho Vistoso", display: "Splendido", city: "Oro Valley", state: "AZ", tz: AZ },
  ] },
  { key: "arbor", legal: "Arbor Place", display: "Arbor Place", sites: [
    { name: "Arbor Place", state: "MD", tz: ET },
  ] },
  { key: "stmarys", legal: "Saint Mary's Communities", display: "Saint Mary's Communities", sites: [
    { name: "Evergreen House", state: "VA", tz: ET },
  ] },
];
// Room names are invented (generic).
for (const p of partners) {
  p.id = uuid(`partner:${p.key}`);
  for (const s of p.sites) {
    s.id = uuid(`site:${p.key}:${s.name}`);
    const rooms = ["Auditorium", ...sample(["Activity Room", "Lounge"], 1 + Math.floor(rand() * 2))];
    if (s.memory) rooms.push("Memory Care Lounge");
    s.rooms = rooms.slice(0, 3).map((r) => ({ name: r, id: uuid(`location:${s.id}:${r}`) }));
  }
}

// ---------------------------------------------------------------------------
// FAKE: people. The first five keep the ids and emails the old seed used, so
// staging (which already has them) doesn't hit duplicate emails.
// ---------------------------------------------------------------------------
const musicians = [
  ["b0000000-0000-4000-8000-000000000001", "Violet Viola", "viola"],
  ["b0000000-0000-4000-8000-000000000002", "Cal Cello", "cello"],
  ["b0000000-0000-4000-8000-000000000003", "Fern Flute", "flute"],
  ["b0000000-0000-4000-8000-000000000004", "Piers Piano", "piano"],
  [null, "Vince Violin", "violin"],
  [null, "Clara Clarinet", "clarinet"],
  [null, "Gus Guitar", "guitar"],
  [null, "Vera Voice", "voice"],
  [null, "Ollie Oboe", "oboe"],
  [null, "Bea Bass", "double bass"],
  [null, "Harper Harp", "harp"],
  [null, "Percy Percussion", "percussion"],
  [null, "Hollis Horn", "horn"],
  [null, "Bastian Bassoon", "bassoon"],
  [null, "Sasha Sax", "saxophone"],
  // v0.38 demo size (Lauren, Nov 22, 2026): 24 musicians across every building.
  [null, "Mina Mandolin", "mandolin"],
  [null, "Theo Trumpet", "trumpet"],
  [null, "Uma Ukulele", "ukulele"],
  [null, "Rhea Recorder", "recorder"],
  [null, "Dex Drums", "drums"],
  [null, "Tara Trombone", "trombone"],
  [null, "Nico Banjo", "banjo"],
  [null, "Ivy Accordion", "accordion"],
  [null, "Felix Fiddle", "fiddle"],
].map(([id, name, instrument]) => ({
  id: id ?? uuid(`person:${name}`), name: `${name} (fake)`,
  email: name.toLowerCase().replace(/ /g, ".") + "@example.com",
  employment: "contractor_1099", instruments: [instrument, ...(rand() < 0.3 ? ["voice"] : [])].filter((v, i, a) => a.indexOf(v) === i),
}));
const staff = [
  { id: "b0000000-0000-4000-8000-000000000005", name: "Stella Staff (fake)", email: "stella.staff@example.com" },
  { id: uuid("person:Paz Planner"), name: "Paz Planner (fake)", email: "paz.planner@example.com" },
  { id: uuid("person:Owen Organizer"), name: "Owen Organizer (fake)", email: "owen.organizer@example.com" },
].map((s) => ({ ...s, employment: "employee_w2", instruments: [], admin: true }));
const people = [...musicians, ...staff];

// ---------------------------------------------------------------------------
// FAKE: residencies, seasons, rosters, weekly programs
// ---------------------------------------------------------------------------
// Series titles follow the 2026 documentation list (DOMAIN-MODEL D2).
const programTitles = [
  ["Music Café", "Performance"],
  ["Open Rehearsal", "Open Rehearsal"],
  ["Lecture/Discussion", "Lecture/Discussion"],
  ["Music Instructional", "Music Instructional Program"],
  ["Interdisciplinary", "Interdisciplinary Program"],
];
const times = ["10:00", "10:30", "11:00", "13:30", "14:00", "14:30", "15:00", "15:30", "19:00"];
// Rosters: every musician plays for at least one program, most for two or
// three; bigger partners get bigger ensembles. The last one listed is a sub.
const rosterPeople = new Map(partners.map((p) => [p.key, []]));
const rosterSize = (p) => Math.min(10, 4 + p.sites.length);
for (const [i, m] of sample(musicians, musicians.length).entries()) rosterPeople.get(partners[i % partners.length].key).push(m);
for (const p of partners) {
  const list = rosterPeople.get(p.key);
  for (const m of sample(musicians.filter((x) => !list.includes(x)), Math.max(0, rosterSize(p) - list.length))) list.push(m);
}
const residencies = [];
for (const [i, p] of partners.entries()) {
  const r = {
    id: uuid(`residency:${p.key}`), season: uuid(`season:${p.key}`), partner: p,
    name: p.display, display: `Iris Music Project at ${p.display}`,
    pointPerson: staff[i % staff.length],
  };
  r.roster = (rosterPeople.get(p.key) ?? []).map((m, j, all) => ({ person: m, core: j < all.length - 1 }));
  r.adminLead = r.roster[0].person; // exactly one per season
  r.series = [];
  for (const s of p.sites) {
    const n = 2;
    for (const [title, itype] of sample(programTitles, n)) {
      const room = s.rooms.find((x) => x.name === "Memory Care Lounge" && title === "Music Café") ?? pick(s.rooms);
      const core = r.roster.filter((x) => x.core).map((x) => x.person);
      const players = sample(core, 2 + Math.floor(rand() * 2));
      r.series.push({
        id: uuid(`series:${s.id}:${title}`), title, itype, location: room.id, site: s,
        weekday: 1 + Math.floor(rand() * 5), time: pick(times), minutes: pick([45, 60, 60, 60, 75, 90]),
        leader: players[0], participants: players.slice(1),
      });
    }
  }
  // Relationship building with no set time (prints without a time, D2).
  if (["ceslc", "mather"].includes(p.key)) {
    const s = p.sites[0];
    r.series.push({ id: uuid(`series:${s.id}:Lessons`), title: "Lessons", kind: "relationship_building",
      location: s.rooms[0].id, site: s, weekday: 3, time: null, minutes: null, leader: null,
      participants: [r.roster[1].person] });
  }
  residencies.push(r);
}

// Fake residents: first name + last initial (D14). Never health details.
const firsts = ["Ruth", "Harold", "Esther", "Walter", "Dorothy", "Irving", "Marion", "Bernard", "Sylvia", "Leon",
  "Gloria", "Morris", "Edith", "Herbert", "Rosalind", "Stanley", "Bea", "Milton", "Frances", "Arthur",
  "Lillian", "Saul", "Helen", "Norman", "Thelma", "Eugene", "Pearl", "Howard", "June", "Sidney"];
const initials = "ABCDEFGHJKLMNPRSTW".split("");
const residents = [];
for (const p of partners) for (const s of p.sites) {
  const names = new Set();
  const n = 6 + Math.floor(rand() * 5);
  while (names.size < n) names.add(`${pick(firsts)} ${pick(initials)}.`);
  for (const name of names) residents.push({ id: uuid(`resident:${s.id}:${name}`), site: s.id, name });
}

const reportNotes = [
  "Residents asked for more Gershwin next week.",
  "Two residents sang along on the second half; one requested a polka.",
  "Good conversation after the program about favorite radio shows.",
  "Room was set up late; started ten minutes behind.",
  "A resident played the hand drum with us for the last piece.",
  "Several family members joined today.",
  "Residents voted on next month's theme: Broadway.",
  "Quiet group today; the call-and-response piece went well.",
  null, null,
];
const activityNotes = [
  "Listened to big-band records together and talked about dance halls.",
  "Short violin lesson; wants to try again next week.",
  "Played requests at the piano in the lounge.",
  "Talked about the songs from the Tuesday program.",
  "Learned a new folk tune together.",
  "Shared photos of the ensemble's instruments and answered questions.",
];

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
const out = [];
const w = (s) => out.push(s);
const resIds = `array[${residencies.map((r) => q(r.id) + "::uuid").join(", ")}]`;
const seasonIds = `array[${residencies.map((r) => q(r.season) + "::uuid").join(", ")}]`;

w(`-- GENERATED by scripts/generate-seed.mjs. Edit that script, not this file.
--
-- Test data for STAGING, local Supabase and CI only. Never run on production
-- (the Release workflow never applies the seed).
--
-- REAL: Iris's partner organizations and site names (public on Iris's website),
--   with city and state only. No street addresses; care levels left empty.
-- FAKE: everything else. People are invented and named "(fake)"; residents are
--   invented first names + last initials with no health details; rooms, rates,
--   hours and contract terms are made up.
--
-- Safe to run more than once (fixed ids, "on conflict do nothing"). Each part
-- is skipped until its tables exist, so this runs on main and after the
-- scheduling/documentation/hours/invoice migrations land. Dates are relative
-- to the day it runs. The fake people have no password here; on staging, the
-- "Staging test accounts" action gives them the shared test password.
`);

// --- Places ---------------------------------------------------------------
w(`-- Partners, sites and rooms --------------------------------------------------
do $$
begin
  if to_regclass('public.partner') is null then
    raise notice 'partner table not created yet; skipping places';
    return;
  end if;

  insert into public.partner (id, legal_name, display_name) values
${partners.map((p) => `    (${q(p.id)}, ${q(p.legal)}, ${q(p.display)})`).join(",\n")}
  on conflict do nothing;

  insert into public.site (id, partner_id, name, display_name, care_levels, city, state, timezone) values
${partners.flatMap((p) => p.sites.map((s) => `    (${q(s.id)}, ${q(p.id)}, ${q(s.name)}, ${q(s.display ?? s.name)}, '{}', ${q(s.city)}, ${q(s.state)}, ${q(s.tz)})`)).join(",\n")}
  on conflict do nothing;

  insert into public.location (id, site_id, name, display_name) values
${partners.flatMap((p) => p.sites.flatMap((s) => s.rooms.map((r) => `    (${q(r.id)}, ${q(s.id)}, ${q(r.name)}, ${q(r.name === "Memory Care Lounge" ? "Lounge" : r.name)})`))).join(",\n")}
  on conflict do nothing;

  -- Retire the made-up places earlier versions of this seed created.
  update public.site set active = false
   where partner_id in (select id from public.partner
                         where lower(legal_name) in ('example life communities, inc.', 'sample senior living llc'));
  update public.partner set active = false
   where lower(legal_name) in ('example life communities, inc.', 'sample senior living llc');
end $$;
`);

// --- People ---------------------------------------------------------------
w(`-- Fake people: a sign-in record (no password) plus a person record ----------
do $$
begin
  if to_regclass('public.person') is null then
    raise notice 'person table not created yet; skipping people';
    return;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email, '',
         now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from (values
${people.map((p) => `    (${q(p.id)}, ${q(p.email)})`).join(",\n")}
  ) v(id, email)
  on conflict do nothing;

  insert into public.person (id, name, email, employment_type, instruments, system_roles) values
${people.map((p) => `    (${q(p.id)}, ${q(p.name)}, ${q(p.email)}, ${q(p.employment)}, ${arr(p.instruments.map((i) => (i.includes(" ") ? `"${i}"` : i)))}, ${p.admin ? "'{admin}'" : "'{}'"})`).join(",\n")}
  on conflict do nothing;
end $$;
`);

// --- Residencies, seasons, rosters, series ----------------------------------
const allSeries = residencies.flatMap((r) => r.series.map((s) => ({ ...s, r })));
w(`-- Residencies, seasons, rosters, point persons, weekly programs -------------
-- One residency per partner; seasons run from three months ago to four months ahead.
do $$
declare
  season_start date := (date_trunc('month', current_date) - interval '3 months')::date;
  season_end   date := (date_trunc('month', current_date) + interval '5 months - 1 day')::date;
begin
  if to_regclass('public.residency') is null then
    raise notice 'scheduling tables not created yet; skipping residencies';
    return;
  end if;

  insert into public.residency (id, partner_id, name, display_name, status, started_on) values
${residencies.map((r) => `    (${q(r.id)}, ${q(r.partner.id)}, ${q(r.name)}, ${q(r.display)}, 'active', season_start)`).join(",\n")}
  on conflict do nothing;

  insert into public.residency_site (residency_id, site_id) values
${residencies.flatMap((r) => r.partner.sites.map((s) => `    (${q(r.id)}, ${q(s.id)})`)).join(",\n")}
  on conflict do nothing;

  insert into public.season (id, residency_id, name, starts_on, ends_on, kind)
  select v.id::uuid, v.residency_id::uuid,
         to_char(season_start, 'FMMonth YYYY') || ' – ' || to_char(season_end, 'FMMonth YYYY'),
         season_start, season_end, 'season'
  from (values
${residencies.map((r) => `    (${q(r.season)}, ${q(r.id)})`).join(",\n")}
  ) v(id, residency_id)
  on conflict do nothing;

  -- Exactly one Admin Lead per season; the last musician listed is a sub (non-core).
  insert into public.roster_member (id, season_id, person_id, is_core, is_admin_lead, joined_on) values
${residencies.flatMap((r) => r.roster.map((m) => `    (${q(uuid(`roster:${r.season}:${m.person.id}`))}, ${q(r.season)}, ${q(m.person.id)}, ${m.core}, ${m.person === r.adminLead}, season_start)`)).join(",\n")}
  on conflict do nothing;

  insert into public.staff_assignment (id, residency_id, person_id, role, starts_on) values
${residencies.map((r) => `    (${q(uuid(`staff:${r.id}`))}, ${q(r.id)}, ${q(r.pointPerson.id)}, 'point_person', season_start)`).join(",\n")}
  on conflict do nothing;

  insert into public.series (id, residency_id, kind, title, default_location_id, weekdays, start_time, minutes, active_from) values
${allSeries.map((s) => `    (${q(s.id)}, ${q(s.r.id)}, ${q(s.kind ?? "group_session")}, ${q(s.title)}, ${q(s.location)}, '{${s.weekday}}', ${s.time ? q(s.time) : "null"}, ${s.minutes ?? "null"}, season_start)`).join(",\n")}
  on conflict do nothing;

  insert into public.series_default_person (series_id, person_id) values
${allSeries.flatMap((s) => s.participants.map((p) => `    (${q(s.id)}, ${q(p.id)})`)).join(",\n")}
  on conflict do nothing;
end $$;

-- Usual leader and interaction type on each program (columns added later).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'series' and column_name = 'default_leader_id') then
    update public.series s set default_leader_id = v.leader::uuid
      from (values
${allSeries.filter((s) => s.leader).map((s) => `        (${q(s.id)}, ${q(s.leader.id)})`).join(",\n")}
      ) v(id, leader)
     where s.id = v.id::uuid and s.default_leader_id is null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'series' and column_name = 'default_interaction_type_id') then
    update public.series s set default_interaction_type_id = it.id
      from (values
${allSeries.filter((s) => s.itype).map((s) => `        (${q(s.id)}, ${q(s.itype)})`).join(",\n")}
      ) v(id, itype)
      join public.interaction_type it on it.name = v.itype
     where s.id = v.id::uuid and s.default_interaction_type_id is null;
  end if;
end $$;
`);

// --- Sessions ---------------------------------------------------------------
const leaderCase = `case s.id::text\n${allSeries.filter((s) => s.leader).map((s) => `          when ${q(s.id)} then ${q(s.leader.id)}`).join("\n")}\n        end::uuid`;
w(`-- Sessions: every program date from about thirteen weeks ago to the end of
-- next month, each group session with one leader (the usual leader most weeks;
-- about one date in three another musician on it leads). Past and this month's dates are
-- published (with a sent calendar); next month stays a draft for review. A few
-- past dates were canceled.
do $$
declare
  s record;
  d date;
  sid uuid;
  leader uuid;
  first_day date := (current_date - 91);
  rot uuid;
  last_day  date := (date_trunc('month', current_date) + interval '2 months - 1 day')::date;
  next_month date := (date_trunc('month', current_date) + interval '1 month')::date;
begin
  if to_regclass('public.session') is null then
    raise notice 'session table not created yet; skipping sessions';
    return;
  end if;

  for s in
    select se.*, st.timezone as tz, sn.starts_on as sn_start, sn.ends_on as sn_end
    from public.series se
    join public.location l on l.id = se.default_location_id
    join public.site st on st.id = l.site_id
    join public.season sn on sn.residency_id = se.residency_id and sn.id = any (${seasonIds})
    where se.residency_id = any (${resIds})
  loop
    leader := ${leaderCase};
    for d in select g::date from generate_series(greatest(first_day, s.sn_start, s.active_from),
                                                 least(last_day, s.sn_end), interval '1 day') g
    loop
      continue when extract(isodow from d)::smallint <> all (s.weekdays);
      sid := null;
      insert into public.session (residency_id, series_id, kind, title, location_id, starts_at, has_set_time, scheduled_minutes)
      values (s.residency_id, s.id, s.kind, s.title, s.default_location_id,
              (d + coalesce(s.start_time, time '00:00')) at time zone s.tz, s.start_time is not null, s.minutes)
      on conflict (series_id, starts_at) where series_id is not null do nothing
      returning id into sid;
      continue when sid is null;
      -- Leaders rotate (handbook): about one date in three, another musician leads.
      rot := null;
      if leader is not null and abs(hashtext(sid::text || 'rotate')) % 3 = 0 then
        select sdp.person_id into rot from public.series_default_person sdp
         where sdp.series_id = s.id and sdp.person_id <> leader
         order by md5(sdp.person_id::text || sid::text) limit 1;
      end if;
      if leader is not null then
        insert into public.session_assignment (session_id, person_id, role)
        values (sid, coalesce(rot, leader), 'leader') on conflict do nothing;
      end if;
      insert into public.session_assignment (session_id, person_id, role)
      select sid, x.person_id, 'participant'
        from (select sdp.person_id from public.series_default_person sdp where sdp.series_id = s.id
              union select leader where leader is not null) x
       where x.person_id is distinct from coalesce(rot, leader)
      on conflict do nothing;
    end loop;
  end loop;

  -- Special events (concerts): two in the past and one next month per program,
  -- each with three core musicians, the first leading.
  insert into public.session (id, residency_id, kind, title, location_id, starts_at, has_set_time, scheduled_minutes, is_special_event, call_time)
  select md5('event:' || r.id::text || e.n)::uuid, r.id, 'group_session', e.title,
         (select l.id from public.location l join public.residency_site rs on rs.site_id = l.site_id
           where rs.residency_id = r.id order by l.name = 'Auditorium' desc, l.id limit 1),
         ((current_date + e.days) + time '19:00') at time zone (select st.timezone from public.residency_site rs join public.site st on st.id = rs.site_id where rs.residency_id = r.id limit 1),
         true, 75, true, time '18:15'
  from public.residency r
  cross join (values (1, 'Autumn Concert', -60), (2, 'Holiday Sing-along', -20), (3, 'Winter Showcase Concert', 40)) e(n, title, days)
  where r.id = any (${resIds})
  on conflict do nothing;
  insert into public.session_assignment (session_id, person_id, role)
  select md5('event:' || r.id::text || e.n)::uuid, m.person_id, case when m.k = 1 then 'leader' else 'participant' end::public.assignment_role
  from public.residency r
  cross join (values (1), (2), (3)) e(n)
  cross join lateral (select rm.person_id, row_number() over (order by md5(rm.person_id::text || e.n::text)) as k
                        from public.roster_member rm join public.season sn on sn.id = rm.season_id
                       where sn.residency_id = r.id and rm.is_core) m
  where r.id = any (${resIds}) and m.k <= 3
  on conflict do nothing;

  -- Publish past and current months (the same switch publish_month() uses).
  perform set_config('iris.publishing', 'on', true);
  update public.session se set schedule_state = 'published'
    from public.location l join public.site st on st.id = l.site_id
   where l.id = se.location_id and se.residency_id = any (${resIds})
     and se.schedule_state = 'draft'
     and (se.starts_at at time zone st.timezone)::date < next_month;
  perform set_config('iris.publishing', 'off', true);

  -- About one in twelve past dates canceled (never one already documented).
  -- Quietly: no "No Program" emails to the fake point people (v0.34 switch).
  perform set_config('iris.auto_no_program', 'on', true);
  update public.session se
     set schedule_state = 'canceled',
         cancellation_reason = (array['partner', 'weather', 'musician', 'other'])[1 + abs(hashtext(se.id::text || 'why')) % 4]::public.cancellation_reason
   where se.residency_id = any (${resIds})
     and se.schedule_state = 'published' and se.starts_at < now()
     and abs(hashtext(se.id::text)) % 12 = 0
     and (to_regclass('public.session_report') is null
          or not exists (select 1 from public.session_report r where r.session_id = se.id));
  perform set_config('iris.auto_no_program', '', true);

  -- Calendar versions: reviewed by the point person and sent, for each
  -- published month.
  insert into public.calendar_export (residency_id, site_id, month, version, state, reviewed_by, reviewed_at,
                                      generated_at, sent_at)
  select rs.residency_id, rs.site_id, m.month, 1, 'sent', sa.person_id, now(), now(), now()
  from public.residency_site rs
  join public.staff_assignment sa on sa.residency_id = rs.residency_id and sa.role = 'point_person'
  cross join (select g::date as month from generate_series(date_trunc('month', first_day),
              date_trunc('month', current_date), interval '1 month') g) m
  where rs.residency_id = any (${resIds})
  on conflict do nothing;
end $$;
`);

// --- Documentation ----------------------------------------------------------
const itypeCase = `case se.title\n${programTitles.map(([t, it]) => `           when ${q(t)} then ${q(it)}`).join("\n")}\n           else 'Other' end`;
w(`-- Documentation: residents, session reports, relationship building, monthly
-- reflections. The leader documents (D3). Sessions in the last two days of
-- this week are left undocumented so the reminders have something to show.
do $$
declare
  rm record;
  d date;
  h integer;
  aid uuid;
  st uuid;
  k text;
  notes constant text[] := array[${reportNotes.map(q).join(", ")}];
  anotes constant text[] := array[${activityNotes.map(q).join(", ")}];
begin
  if to_regclass('public.session_report') is null or to_regclass('public.session') is null then
    raise notice 'documentation tables not created yet; skipping documentation';
    return;
  end if;

  insert into public.resident (id, site_id, display_name, created_by)
  select v.id::uuid, v.site::uuid, v.name,
         (select lead.person_id from public.roster_member lead
            join public.season sn on sn.id = lead.season_id
            join public.residency_site rs on rs.residency_id = sn.residency_id
           where rs.site_id = v.site::uuid and lead.is_admin_lead limit 1)
  from (values
${residents.map((r) => `    (${q(r.id)}, ${q(r.site)}, ${q(r.name)})`).join(",\n")}
  ) v(id, site, name)
  on conflict do nothing;

  insert into public.session_report (session_id, author_id, attendance, interaction_type_id,
                                     resident_involvement, actual_minutes, notes)
  select se.id, a.person_id, 6 + abs(hashtext(se.id::text || 'n')) % 30, it.id,
         (case abs(hashtext(se.id::text || 'inv')) % 10 when 0 then 'co_led' when 1 then 'co_facilitated'
               when 2 then 'co_facilitated' else 'none' end)::public.resident_involvement,
         greatest(15, se.scheduled_minutes + (abs(hashtext(se.id::text || 'm')) % 3 - 1) * 5),
         notes[1 + abs(hashtext(se.id::text || 'note')) % array_length(notes, 1)]
  from public.session se
  join public.session_assignment a on a.session_id = se.id and a.role = 'leader' and a.status <> 'absent'
  join public.interaction_type it on it.name = ${itypeCase}
  where se.residency_id = any (${resIds})
    and se.kind = 'group_session' and se.schedule_state = 'published'
    and se.starts_at <= now()
    and not (se.starts_at > now() - interval '2 days' and se.starts_at >= date_trunc('week', now()))
    -- The last two weeks are mixed: about one program in four still waits for its leader.
    and not (se.starts_at > now() - interval '14 days' and abs(hashtext(se.id::text || 'late')) % 4 = 0)
  on conflict do nothing;

  -- Relationship building: about two activities a week per musician, at one of
  -- the residency's sites, with one to three residents.
  for rm in
    select r.person_id, sn.residency_id, sn.starts_on
    from public.roster_member r join public.season sn on sn.id = r.season_id
    where sn.id = any (${seasonIds})
  loop
    for d in select g::date from generate_series(greatest(current_date - 91, rm.starts_on), current_date - 1, interval '1 day') g loop
      h := abs(hashtext(rm.person_id::text || rm.residency_id::text || d::text));
      continue when h % 7 > 1;
      select rs.site_id into st from public.residency_site rs
       where rs.residency_id = rm.residency_id
       order by md5(rs.site_id::text || h::text) limit 1;
      k := case when h % 11 = 0 then 'mini_group' when h % 13 = 0 then 'hallway_concert' else 'one_to_one' end;
      aid := md5('activity:' || rm.person_id::text || rm.residency_id::text || d::text)::uuid;
      insert into public.relationship_activity (id, person_id, residency_id, site_id, occurred_on, kind, minutes, collaborative, note)
      values (aid, rm.person_id, rm.residency_id, st, d, k::public.activity_kind,
              case k when 'one_to_one' then 15 + (h % 2) * 15 else 30 end,
              h % 9 = 0, anotes[1 + h % array_length(anotes, 1)])
      on conflict do nothing;
      if found then
        insert into public.relationship_activity_resident (activity_id, resident_id)
        select aid, r.id from public.resident r where r.site_id = st
         order by md5(r.id::text || h::text) limit (case k when 'one_to_one' then 1 else 3 end)
        on conflict do nothing;
      end if;
    end loop;
  end loop;

  -- Reflections for the last two months from each core musician.
  insert into public.monthly_reflection (person_id, residency_id, month, highlights, challenges)
  select r.person_id, sn.residency_id, (date_trunc('month', current_date) - make_interval(months => m))::date,
         (array['Residents are joining in more on the sing-alongs. (fake)', 'Two residents asked to co-lead next month. (fake)'])[m],
         (array['Room set-up sometimes runs late. (fake)', 'Hard to find a quiet room for one-to-ones. (fake)'])[m]
  from public.roster_member r join public.season sn on sn.id = r.season_id
  cross join (values (1), (2)) mm(m)
  where sn.id = any (${seasonIds}) and r.is_core
  on conflict do nothing;
end $$;
`);

// --- Hours, contracts, stipends ---------------------------------------------
w(`-- Hours worked (from the sessions each musician played and their relationship
-- building), plus fake contracts. Older weeks approved by the point person,
-- last week submitted, this week a prefilled draft (D3: pay comes from hours).
do $$
declare
  this_week date := date_trunc('week', current_date)::date;
begin
  if to_regclass('public.time_entry') is null or to_regclass('public.relationship_activity') is null then
    raise notice 'hours tables not created yet; skipping hours';
    return;
  end if;

  insert into public.contract (person_id, season_id, hourly_rate, estimated_weekly_hours)
  select r.person_id, r.season_id, 40 + (abs(hashtext(r.person_id::text)) % 4) * 5, 3 + abs(hashtext(r.id::text)) % 4
  from public.roster_member r where r.season_id = any (${seasonIds})
  on conflict do nothing;

  -- The Admin Lead's monthly stipend (fake amount), due on the 15th.
  insert into public.stipend_installment (id, contract_id, kind, due_on, amount)
  select md5('stipend:' || c.id::text || m::text)::uuid, c.id, 'admin_lead', m + 14, 150
  from public.contract c
  join public.roster_member r on r.season_id = c.season_id and r.person_id = c.person_id and r.is_admin_lead
  join public.season sn on sn.id = c.season_id
  cross join lateral (select g::date as m from generate_series(sn.starts_on, sn.ends_on, interval '1 month') g) months
  where c.season_id = any (${seasonIds})
  on conflict do nothing;

  -- Hours follow the documentation (v0.24): Programs and Concerts are the
  -- documented length of each date played (not absent), Relationship Building
  -- the minutes logged. Weeks before the last two are approved; the last two
  -- are mixed (submitted, sent back with a note, not submitted yet); this week
  -- is a draft.
  with played as (
    select a.person_id, se.residency_id,
           date_trunc('week', (se.starts_at at time zone st.timezone))::date as wk,
           case when se.is_special_event then 'Concerts' else 'Programs' end as category,
           r.actual_minutes as minutes
    from public.session se
    join public.session_report r on r.session_id = se.id
    join public.session_assignment a on a.session_id = se.id and a.status <> 'absent'
    join public.location l on l.id = se.location_id
    join public.site st on st.id = l.site_id
    where se.residency_id = any (${resIds}) and se.kind = 'group_session'
      and se.schedule_state = 'published' and se.starts_at <= now()
  ),
  totals as (
    select person_id, residency_id, wk, category, sum(minutes) as minutes from played group by 1, 2, 3, 4
    union all
    select person_id, residency_id, date_trunc('week', occurred_on)::date, 'Relationship Building', sum(minutes)
    from public.relationship_activity where residency_id = any (${resIds}) group by 1, 2, 3
  ),
  weeks as (
    select t.*, case
      when t.wk = this_week then 'draft'
      when t.wk < this_week - 14 then 'approved'
      else (array['submitted','submitted','submitted','submitted','submitted','submitted','returned','draft','draft','draft'])[1 + abs(hashtext(t.person_id::text || t.residency_id::text || t.wk::text)) % 10]
    end as st
    from totals t
  )
  insert into public.time_entry (person_id, residency_id, week_starting, time_category_id, hours, source, state,
                                 submitted_at, approved_by, approved_at, returned_note)
  select t.person_id, t.residency_id, t.wk, tc.id, round(t.minutes / 60.0 * 4) / 4, 'prefilled',
         (case t.st when 'returned' then 'draft' else t.st end)::public.time_state,
         case when t.st in ('submitted', 'approved') then (t.wk + 7)::timestamptz + interval '10 hours' end,
         case when t.st = 'approved' then sa.person_id end,
         case when t.st = 'approved' then (t.wk + 9)::timestamptz + interval '12 hours' end,
         case when t.st = 'returned' then 'Please add the Thursday program before I approve. (fake)' end
  from weeks t
  join public.time_category tc on tc.name = t.category
  join public.staff_assignment sa on sa.residency_id = t.residency_id and sa.role = 'point_person'
  where t.wk <= this_week and t.minutes > 0
  on conflict do nothing;
end $$;
`);

// --- Partner agreements -----------------------------------------------------
w(`-- Partner contracts with MADE-UP terms, so the invoice screens have something
-- to work from. These are not Iris's real rates or terms.
do $$
begin
  if to_regclass('public.partner_agreement') is null then
    raise notice 'partner invoice tables not created yet; skipping partner contracts';
    return;
  end if;

  insert into public.partner_agreement (id, residency_id, season_id, name, billing_basis, hourly_rate,
                                        contracted_hours, bill_stipends, overhead_percent) values
${residencies.map((r) => r.partner.installments
    ? `    (${q(uuid(`agreement:${r.id}`))}, ${q(r.id)}, ${q(r.season)}, 'Test contract (fake terms)', 'installments', null, 120, false, null)`
    : `    (${q(uuid(`agreement:${r.id}`))}, ${q(r.id)}, ${q(r.season)}, 'Test contract (fake terms)', 'per_hour', 100, null, ${r.partner.key === "ceslc"}, 10)`).join(",\n")}
  on conflict do nothing;

  insert into public.partner_agreement_site (agreement_id, site_id) values
${residencies.flatMap((r) => r.partner.sites.map((s) => `    (${q(uuid(`agreement:${r.id}`))}, ${q(s.id)})`)).join(",\n")}
  on conflict do nothing;

  -- Monthly installments (fake amounts) for the installment contract.
  insert into public.partner_installment (id, agreement_id, due_on, amount)
  select md5('installment:' || pa.id::text || m::text)::uuid, pa.id, m, 1500
  from public.partner_agreement pa
  join public.season sn on sn.id = pa.season_id
  cross join lateral (select g::date as m from generate_series(sn.starts_on, sn.ends_on, interval '1 month') g) months
  where pa.billing_basis = 'installments' and pa.residency_id = any (${resIds})
  on conflict do nothing;
end $$;
`);

// --- Newer features ------------------------------------------------------------
const ringHouse = partners[0].sites.find((x) => x.name === "Ring House");
w(`-- Newer features, each skipped until its tables exist:
--  - Ring House gets detailed one-to-one notes (v0.21/v0.36): every visit there
--    has a start and end time, and its residents have (made-up) room numbers.
--  - Next month's drafts: about half of the musicians playing each building
--    have marked their dates "Done reviewing" (v0.35).
do $$
declare
  next_month date := (date_trunc('month', current_date) + interval '1 month')::date;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
               and table_name = 'resident' and column_name = 'room') then
    update public.site set detailed_relationship_notes = true where id = ${q(ringHouse.id)};
    update public.resident set room = (100 + abs(hashtext(id::text)) % 300)::text
     where site_id = ${q(ringHouse.id)} and room is null;
    update public.relationship_activity ra
       set start_time = time '09:30' + make_interval(mins => (abs(hashtext(ra.id::text)) % 24) * 15),
           end_time = time '09:30' + make_interval(mins => (abs(hashtext(ra.id::text)) % 24) * 15 + ra.minutes),
           note = coalesce(ra.note, '') || ' Spent time on favorite songs from their youth and planned what to play next visit. (fake)'
     where ra.site_id = ${q(ringHouse.id)} and ra.start_time is null;
    update public.relationship_activity_resident ar set room = r.room
      from public.resident r, public.relationship_activity ra
     where r.id = ar.resident_id and ra.id = ar.activity_id and ra.site_id = ${q(ringHouse.id)} and ar.room is null;
  end if;

  if to_regclass('public.schedule_check') is not null then
    insert into public.schedule_check (residency_id, site_id, month, person_id)
    select distinct se.residency_id, l.site_id, next_month, a.person_id
      from public.session se
      join public.location l on l.id = se.location_id
      join public.site st on st.id = l.site_id
      join public.session_assignment a on a.session_id = se.id and a.status <> 'absent'
     where se.residency_id = any (${resIds}) and se.schedule_state = 'draft'
       and date_trunc('month', se.starts_at at time zone st.timezone)::date = next_month
       and abs(hashtext(a.person_id::text || l.site_id::text)) % 2 = 0
    on conflict do nothing;
  end if;
end $$;
`);

fs.writeFileSync(path.join(root, "supabase", "seed.sql"), out.join("\n"));
console.log(`wrote supabase/seed.sql: ${partners.length} partners, ${partners.reduce((n, p) => n + p.sites.length, 0)} sites, ` +
  `${people.length} people, ${allSeries.length} programs, ${residents.length} residents`);
