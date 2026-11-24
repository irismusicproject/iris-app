// Gets STAGING ready for Gus's journey (docs/PERSONAS.md: phone only, fast,
// new, other gigs, wants to lead more), and cleans up after it.
//
//   node prepare-gus.mjs            prints KEY=value lines for gus-edges.yaml
//   node prepare-gus.mjs --cleanup  afterwards: checks and repairs staging
//
// Prepare: finds three draft dates Gus plays (not leads) in one month at
// Mather, next month or the one after, opens that month for the team if it
// isn't open (the point person's click), and works out the exact "Marked. N
// dates you can't play this season." lines the phone should show.
// Cleanup: reports and repairs anything the journey left behind (a date
// still marked "can't play", an open leader-swap request; no app has a
// Withdraw button yet, so the request is withdrawn here, as Gus), and checks
// the double tap made exactly one request.
// Needs EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// STAGING_TEST_PASSWORD; cleanup also MAESTRO_GUS_DATES. Staging only.
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, STAGING_TEST_PASSWORD: password } = process.env;
if (!url.includes("njdxogunlmhllzqhswkv")) throw new Error("prepare-gus only runs against the staging project");
if (!key || !password) throw new Error("missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or STAGING_TEST_PASSWORD");
const email = "gus.guitar@example.com";
const client = async (who) => {
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: who, password });
  if (error) throw new Error(`sign-in as ${who}: ${error.message}`);
  return c;
};

if (process.argv.includes("--cleanup")) {
  const gus = await client(email);
  const ids = (process.env.MAESTRO_GUS_DATES ?? "").split(",").filter(Boolean);
  const problems = [];
  const { data: me } = await gus.from("person").select("id").eq("email", email).single();
  for (const id of ids) {
    const { data: a } = await gus.from("session_assignment").select("status").eq("session_id", id).eq("person_id", me.id).single();
    if (a?.status === "absent") {
      problems.push(`date ${id} was still marked "can't play"; undone`);
      await gus.rpc("set_unavailable", { p_session: id, p_unavailable: false });
    }
  }
  const { data: reqs } = await gus.from("change_request").select("id, session_id, status").eq("requested_by", me.id).in("session_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).eq("status", "open");
  const swaps = reqs ?? [];
  if (swaps.length > 1) problems.push(`${swaps.length} open swap requests for one tap; there should be one`);
  for (const r of swaps) {
    const { error } = await gus.rpc("withdraw_change_request", { p_request: r.id });
    console.log(error ? `note: couldn't withdraw request ${r.id}: ${error.message}` : `withdrew Gus's swap request ${r.id} (no Withdraw button in the apps yet)`);
  }
  if (problems.length) { console.error(problems.map((p) => `x ${p}`).join("\n")); process.exit(1); }
  console.log(`✓ staging is as it was: no "can't play" marks left; ${swaps.length} swap request withdrawn`);
  process.exit(0);
}

const admin = await client("persona+admin@example.com");
const { data: gusRow } = await admin.from("person").select("id").eq("email", email).single();
const firstOfMonth = (ahead) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + ahead); return d.toISOString().slice(0, 10); };

for (const ahead of [1, 2]) {
  const from = firstOfMonth(ahead), to = firstOfMonth(ahead + 1);
  const { data, error } = await admin
    .from("session")
    .select("id, title, starts_at, residency_id, location(site_id, site(timezone)), session_assignment!inner(person_id, role, status)")
    .eq("schedule_state", "draft").eq("kind", "group_session")
    .eq("session_assignment.person_id", gusRow.id).eq("session_assignment.role", "participant").eq("session_assignment.status", "assigned")
    .gte("starts_at", from).lt("starts_at", to).order("starts_at");
  if (error) throw new Error(`reading Gus's dates: ${error.message}`);
  // Three dates on different days at one building.
  const bySite = new Map();
  for (const s of data ?? []) {
    const k = `${s.residency_id}|${s.location.site_id}`;
    if (!bySite.has(k)) bySite.set(k, []);
    const tz = s.location.site?.timezone ?? "America/New_York";
    const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(s.starts_at));
    if (!bySite.get(k).some((x) => x.day === day)) bySite.get(k).push({ ...s, day });
  }
  for (const [k, dates] of bySite) {
    if (dates.length < 3) continue;
    const [res, site] = k.split("|");
    const { data: sm } = await admin.from("schedule_month").select("stage").eq("residency_id", res).eq("site_id", site).eq("month", from).maybeSingle();
    if (sm && sm.stage !== "team_editing") continue;
    if (!sm) {
      const r = await admin.rpc("open_schedule_month", { p_residency: res, p_site: site, p_month: from });
      if (r.error) throw new Error(`opening ${from}: ${r.error.message}`);
    }
    // His "can't play" marks this season so far, so the counts are exact.
    const { data: season } = await admin.from("season").select("id, starts_on, ends_on").eq("residency_id", res).lte("starts_on", from).gte("ends_on", from).single();
    const { count } = await admin.from("session_assignment").select("session_id, session!inner(residency_id, starts_at)", { count: "exact", head: true })
      .eq("person_id", gusRow.id).eq("status", "absent").eq("session.residency_id", res)
      .gte("session.starts_at", season.starts_on).lte("session.starts_at", `${season.ends_on}T23:59:59Z`);
    const line = (n) => `Marked. ${n} date${n === 1 ? "" : "s"} you can't play this season.`;
    const [a, b, c] = dates;
    console.log(`MAESTRO_GUS_EMAIL=${email}`);
    console.log(`MAESTRO_GUS_MONTHS_AHEAD=${ahead}`);
    console.log(`MAESTRO_GUS_DAY1=${a.day}`);
    console.log(`MAESTRO_GUS_DAY2=${b.day}`);
    console.log(`MAESTRO_GUS_DAY3=${c.day}`);
    console.log(`MAESTRO_GUS_MARKED1=${line((count ?? 0) + 1)}`);
    console.log(`MAESTRO_GUS_MARKED2=${line((count ?? 0) + 2)}`);
    console.log(`MAESTRO_GUS_DATES=${[a.id, b.id, c.id].join(",")}`);
    process.exit(0);
  }
}
console.log("MAESTRO_GUS_DAY1=");
console.error("note: no month with three draft dates Gus plays at one building; his journey is skipped this run");
