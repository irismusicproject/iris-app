// Gets STAGING ready for the phone's "I can't play" journey
// (mobile/.maestro/cant-play.yaml; docs/ACCEPTANCE.md C1, C3, C7).
//
// Signed in as the fake point person (persona+point-person@example.com), with
// the public key only, it finds a draft date the fake musician
// (persona+musician@example.com) plays next month or the month after, and
// opens that month for the team if it isn't open yet: the same click the
// point person makes in the app. Staging holds fake data only.
//
// Prints KEY=value lines for the flow: MAESTRO_DATE_TITLE, MAESTRO_MONTHS_AHEAD.
// Needs EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
// STAGING_TEST_PASSWORD. Refuses to run against anything but staging.
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const password = process.env.STAGING_TEST_PASSWORD ?? "";
if (!url.includes("njdxogunlmhllzqhswkv")) throw new Error("prepare-staging only runs against the staging project");
if (!key || !password) throw new Error("missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or STAGING_TEST_PASSWORD");

const signIn = async (email) => {
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in as ${email}: ${error.message}`);
  return c;
};
const musician = await signIn("persona+musician@example.com");
const point = await signIn("persona+point-person@example.com");
const me = (await musician.auth.getUser()).data.user.id;

const firstOfMonth = (ahead) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + ahead); return d.toISOString().slice(0, 10); };

for (const ahead of [1, 2]) {
  const from = firstOfMonth(ahead), to = firstOfMonth(ahead + 1);
  const { data: dates, error } = await musician
    .from("session")
    .select("id, title, residency_id, starts_at, schedule_state, location(site_id), session_assignment!inner(person_id, status)")
    .eq("session_assignment.person_id", me).eq("schedule_state", "draft").eq("kind", "group_session")
    .gte("starts_at", from).lt("starts_at", to).order("starts_at");
  if (error) throw new Error(`reading the musician's dates: ${error.message}`);
  const date = (dates ?? []).find((d) => d.session_assignment[0]?.status === "assigned");
  if (!date) continue;

  const { data: sm } = await point.from("schedule_month").select("stage").eq("residency_id", date.residency_id).eq("site_id", date.location.site_id).eq("month", from).maybeSingle();
  if (!sm) {
    const r = await point.rpc("open_schedule_month", { p_residency: date.residency_id, p_site: date.location.site_id, p_month: from });
    if (r.error) throw new Error(`opening ${from}: ${r.error.message}`);
  } else if (sm.stage !== "team_editing") {
    continue; // past team editing: "I can't play" isn't offered there; try the next month
  }
  console.log(`MAESTRO_DATE_TITLE=${date.title}`);
  console.log(`MAESTRO_MONTHS_AHEAD=${ahead}`);
  process.exit(0);
}
throw new Error("no draft date for the fake musician in an open-able month; refill staging's next month (README, Staging database)");
