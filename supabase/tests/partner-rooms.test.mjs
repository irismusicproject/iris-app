// Rooms on the partner (Ryan, Nov 27, 2026; migration 20261231160000):
// rooms added from the partner's page, a hidden building made when there is
// none, new programs getting a one-building partner's building, and the Iris
// Supervisor adding and renaming rooms at their program's buildings.
// Made-up people and places only.
import { boot, reporter, buildPeople, buildPlaces, P_, TODAY, addDays } from "./money-harness.mjs";

const T = reporter();
const { check } = T;
const env = await boot();
const { as, su } = env;
await buildPeople(env);
const w = await buildPlaces(env, addDays(TODAY, -30), addDays(TODAY, 120));
const { A, P, Q, M1 } = P_;

// A new partner with a program and no building yet.
const PT3 = (await su(`insert into public.partner (legal_name, display_name) values ('Willow Grove Inc.','Willow Grove') returning id`))[0].id;
const RES3 = (await su(`insert into public.residency (partner_id,name,display_name,status) values ('${PT3}','Willow','Iris at Willow Grove','active') returning id`))[0].id;
const sitesOf = async (pt) => su(`select id, name from public.site where partner_id='${pt}'`);
const roomsAt = async (site) => (await su(`select name from public.location where site_id='${site}' order by name`)).map((r) => r.name);

// Who may add from the partner's page
let r = await as(P, `select public.add_partner_room('${PT3}', 'Lounge')`);
check("only admins add rooms from the partner's page", !r.ok, r);

// The first room makes the building
r = await as(A, `select public.add_partner_room('${PT3}', 'Lounge')`);
let sites = await sitesOf(PT3);
check("the first room makes one building, named after the partner", r.ok && sites.length === 1 && sites[0].name === "Willow Grove", { r, sites });
const S3 = sites[0]?.id;
check("…and links it to the partner's program", (await su(`select count(*)::int n from public.residency_site where residency_id='${RES3}' and site_id='${S3}'`))[0].n === 1);
r = await as(A, `select public.add_partner_room('${PT3}', 'Chapel', 'The Chapel')`);
check("the next room goes in the same building", r.ok && (await sitesOf(PT3)).length === 1 && (await roomsAt(S3)).join() === "Chapel,Lounge", { r, rooms: await roomsAt(S3) });
r = await as(A, `select public.add_partner_room('${PT3}', 'lounge')`);
check("the same room name twice is refused", !r.ok, r);

// Several buildings: pick one
r = await as(A, `select public.add_partner_room('${w.PT}', 'Studio')`);
check("a partner with several buildings: the room needs a building picked", !r.ok && /pick one/.test(r.err), r);
r = await as(A, `select public.add_partner_room('${w.PT}', 'Studio', null, '${w.S2}')`);
check("…and goes in the one picked", r.ok && (await roomsAt(w.S2)).includes("Studio"), r);
r = await as(A, `select public.add_partner_room('${PT3}', 'Studio', null, '${w.S2}')`);
check("another partner's building is refused", !r.ok, r);

// The Iris Supervisor at their program's buildings
r = await as(P, `insert into public.location (site_id, name, display_name) values ('${w.S1}','Garden Room','Garden Room')`);
check("the Iris Supervisor adds a room at their program's building", r.ok, r);
r = await as(P, `update public.location set display_name='Garden' where site_id='${w.S1}' and name='Garden Room'`);
check("…and renames it", r.ok && r.n === 1, r);
r = await as(Q, `insert into public.location (site_id, name, display_name) values ('${w.S1}','Attic','Attic')`);
check("another program's Iris Supervisor can't", !r.ok, r);
r = await as(M1, `insert into public.location (site_id, name, display_name) values ('${w.S1}','Den','Den')`);
check("a musician can't", !r.ok, r);
r = await as(P, `insert into public.site (partner_id, name, display_name) values ('${w.PT}','Annex','Annex')`);
check("the Iris Supervisor still can't add buildings", !r.ok, r);

process.exit(T.summary("partner-rooms") ? 1 : 0);
