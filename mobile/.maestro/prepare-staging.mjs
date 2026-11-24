// Gets STAGING ready for the phone's "I can't play" journey
// (mobile/.maestro/cant-play.yaml; docs/ACCEPTANCE.md C1, C3, C7).
//
// Signed in as the fake admin (persona+admin@example.com) with the public key
// only, it finds a draft date next month (or the month after) that a seeded
// fake musician (an @example.com address) plays, and opens that building's
// month for the team if it isn't open yet: the same click a point person
// makes in the app. Every seeded fake person signs in with
// STAGING_TEST_PASSWORD (scripts/staging-accounts.mjs). Staging holds fake
// data only.
//
// Prints KEY=value lines for the flow: MAESTRO_EMAIL, MAESTRO_DATE_TITLE,
// MAESTRO_MONTHS_AHEAD. Needs EXPO_PUBLIC_SUPABASE_URL,
// EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY and STAGING_TEST_PASSWORD. Refuses to
// run against anything but staging.
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const password = process.env.STAGING_TEST_PASSWORD ?? "";
if (!url.includes("njdxogunlmhllzqhswkv")) throw new Error("prepare-staging only runs against the staging project");
if (!key || !password) throw new Error("missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or STAGING_TEST_PASSWORD");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: signInError } = await admin.auth.signInWithPassword({ email: "persona+admin@example.com", password });
if (signInError) throw new Error(`sign-in as the fake admin: ${signInError.message}`);

const firstOfMonth = (ahead) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + ahead); return d.toISOString().slice(0, 10); };

for (const ahead of [1, 2]) {
  const from = firstOfMonth(ahead), to = firstOfMonth(ahead + 1);
  const { data: dates, error } = await admin
    .from("session")
    .select("id, title, residency_id, location(site_id), session_assignment(status, role, person!session_assignment_person_id_fkey(email, active))")
    .eq("schedule_state", "draft").eq("kind", "group_session")
    .gte("starts_at", from).lt("starts_at", to).order("starts_at").limit(200);
  if (error) throw new Error(`reading next month's dates: ${error.message}`);

  for (const d of dates ?? []) {
    // A seeded fake musician who plays it (not the leader, so the leader keeps the date).
    const a = d.session_assignment.find((x) => x.status === "assigned" && x.role === "participant"
      && x.person?.active && /@example\.com$/.test(x.person.email) && !x.person.email.startsWith("persona+"));
    if (!a || !d.title?.trim()) continue;
    const { data: sm } = await admin.from("schedule_month").select("stage")
      .eq("residency_id", d.residency_id).eq("site_id", d.location.site_id).eq("month", from).maybeSingle();
    if (sm && sm.stage !== "team_editing") continue; // past team editing: "I can't play" isn't offered there
    if (!sm) {
      const r = await admin.rpc("open_schedule_month", { p_residency: d.residency_id, p_site: d.location.site_id, p_month: from });
      if (r.error) throw new Error(`opening ${from}: ${r.error.message}`);
    }
    console.log(`MAESTRO_EMAIL=${a.person.email}`);
    console.log(`MAESTRO_DATE_TITLE=${d.title.trim()}`);
    console.log(`MAESTRO_MONTHS_AHEAD=${ahead}`);
    process.exit(0);
  }
}
throw new Error("no draft date next month played by a seeded fake musician; refill staging's next month (README, Staging database)");
