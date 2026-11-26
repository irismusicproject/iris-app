// Gets STAGING ready for Dex's journey (docs/PERSONAS.md: phone in the field,
// computer for paperwork): dex-phone.yaml changes a report on the phone, then
// e2e/staging-journeys/dex-web.spec.ts checks the website shows the change
// and puts the original number back through the website's own form.
//
// Finds a date Dex led in the week My week opens on (on Monday or Tuesday
// last week, otherwise this week, on the phone's clock), that has already
// started, is already documented, and whose week isn't approved yet (approved
// weeks are final). Updating a report, rather than writing a new one, lets the
// journey repeat forever: nobody can delete a report.
//
// Prints KEY=value lines: MAESTRO_DEX_EMAIL, MAESTRO_DEX_DAY (as the phone
// shows it), MAESTRO_DEX_WEEK, MAESTRO_DEX_ATTENDANCE (this run's number),
// DEX_ORIGINAL_ATTENDANCE. MAESTRO_DEX_DAY is empty when no such date exists;
// both halves then skip. Needs EXPO_PUBLIC_SUPABASE_URL,
// EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, STAGING_TEST_PASSWORD, MAESTRO_RUN,
// and PHONE_TIME_ZONE (the emulator's). Staging only.
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, STAGING_TEST_PASSWORD: password, MAESTRO_RUN: run = "local" } = process.env;
const phoneTz = process.env.PHONE_TIME_ZONE ?? "America/Phoenix";
if (!url.includes("njdxogunlmhllzqhswkv")) throw new Error("prepare-dex only runs against the staging project");
if (!key || !password) throw new Error("missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or STAGING_TEST_PASSWORD");
const email = "dex.drums@example.com";

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: signInError } = await admin.auth.signInWithPassword({ email: "persona+admin@example.com", password });
if (signInError) throw new Error(`sign-in as the fake admin: ${signInError.message}`);

// The week My week opens on, by the phone's clock (mobile/src/lib/week.ts).
const ymd = (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = ymd(new Date(), phoneTz);
const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
const thisMonday = addDays(today, -((dow + 6) % 7));
const week = dow === 1 || dow === 2 ? addDays(thisMonday, -7) : thisMonday;

const { data: dex } = await admin.from("person").select("id").eq("email", email).single();
const { data: led, error } = await admin
  .from("session")
  .select("id, residency_id, title, starts_at, location(site(timezone)), session_report(attendance), session_assignment!inner(person_id, role, status)")
  .eq("kind", "group_session").eq("schedule_state", "published")
  .eq("session_assignment.person_id", dex.id).eq("session_assignment.role", "leader").neq("session_assignment.status", "absent")
  .gte("starts_at", `${addDays(week, -1)}T00:00:00Z`).lt("starts_at", `${addDays(week, 8)}T00:00:00Z`)
  .lte("starts_at", new Date().toISOString())
  .order("starts_at");
if (error) throw new Error(`reading Dex's dates: ${error.message}`);

const { data: approved } = await admin.from("time_entry").select("residency_id").eq("person_id", dex.id).eq("week_starting", week).eq("state", "approved");
const done = new Set((approved ?? []).map((a) => a.residency_id));
const pick = (led ?? []).find((s) => {
  const tz = s.location?.site?.timezone ?? "America/New_York";
  const local = ymd(new Date(s.starts_at), tz);
  const report = Array.isArray(s.session_report) ? s.session_report[0] : s.session_report;
  return local >= week && local <= addDays(week, 6) && report && !done.has(s.residency_id);
});

if (!pick) {
  console.log("MAESTRO_DEX_DAY=");
  console.error(`note: Dex has no documented, unapproved date in the week of ${week}; his journey is skipped this run`);
  process.exit(0);
}
const tz = pick.location?.site?.timezone ?? "America/New_York";
const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(pick.starts_at));
const report = Array.isArray(pick.session_report) ? pick.session_report[0] : pick.session_report;
// A number no real report would have, different on every run.
const digits = String(run).replace(/\D/g, "") || String(Date.now());
const attendance = 200 + (Number(digits.slice(-6)) % 700);

console.log(`MAESTRO_DEX_EMAIL=${email}`);
console.log(`MAESTRO_DEX_DAY=${day}`);
console.log(`MAESTRO_DEX_WEEK=${week}`);
console.log(`MAESTRO_DEX_ATTENDANCE=${attendance}`);
console.log(`DEX_ORIGINAL_ATTENDANCE=${report.attendance}`);
