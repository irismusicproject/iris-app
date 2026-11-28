import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { addDays, dueLabel, weekStart } from "../src/shared/domain/documentation";
import { weekDeadline } from "../src/shared/domain/metrics";
import { zonedToUtc } from "../src/shared/domain/time";
import { SECRET_KEY, SUPABASE_URL } from "./helpers/env";
import { signInCode, waitForEmail } from "./helpers/mail";
import { createPerson, logIn, open } from "./helpers/people";

// Hollis (docs/PERSONAS.md): computer only, browser zoomed to 200%, signs in
// with an emailed code, and does his whole week on Tuesday evening, right
// around the 5 pm deadline (DOMAIN-MODEL D7, the Notification table, v0.24
// metrics). Proves both places that know the deadline agree on which side of
// 5 pm a moment falls:
//   - the database's reminders (queue_deadline_reminders, given the time);
//   - the website's on-time count on the Iris Supervisor's Follow-up page.
// Week A he submits at 4:59 pm (on time); week B at 5:01 pm (late), after the
// "missed deadline" email has gone out. Made-up data only.

const TZ = "America/New_York";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// 200% browser zoom on a 1280 x 720 screen leaves 640 x 360 page pixels.
test.use({ viewport: { width: 640, height: 360 } });

const db = () => createClient(SUPABASE_URL, SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
async function signedIn(email: string, password: string) {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in as ${email}: ${error.message}`);
  return c;
}
function must<T>(r: { data: T; error: { message: string } | null }, step: string): NonNullable<T> {
  if (r.error || r.data == null) throw new Error(`setup "${step}" failed: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
}
function ok(r: { error: { message: string } | null }, step: string) {
  if (r.error) throw new Error(`setup "${step}" failed: ${r.error.message}`);
}
const minutesFrom = (iso: string, mins: number) => new Date(Date.parse(iso) + mins * 60_000).toISOString();

/** Hollis's way in: no password, an emailed code. */
async function codeLogIn(page: Page, email: string) {
  await open(page, "/login");
  await page.getByRole("link", { name: "Email me a code instead" }).click();
  await page.waitForURL(/\/login\/code$/);
  await page.waitForLoadState("networkidle");
  const since = Date.now();
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  const code = signInCode(await waitForEmail(email, since));
  await page.locator('input[name="code"]').fill(code);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** At 200% zoom nothing should run off the right edge. */
async function expectNoSideways(page: Page, where: string) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra, `${where} scrolls sideways at 200% zoom`).toBeLessThanOrEqual(1);
}

test("Hollis: whole week on Tuesday evening, 4:59 pm is on time and 5:01 pm is late", async ({ browser }) => {
  test.setTimeout(240_000);
  const run = Date.now() % 100000;
  const d = db();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const thisMonday = weekStart(today);
  const A = addDays(thisMonday, -21); // submitted at 4:59 pm on its Tuesday
  const B = addDays(thisMonday, -14); // submitted at 5:01 pm on its Tuesday

  const lead = await createPerson({ label: "lead", name: `Lena Lead ${run}` });
  const hollis = await createPerson({ label: "hollis", name: `Hollis Horn ${run}` });
  const point = await createPerson({ label: "point", name: `Paz Point ${run}` });

  // A building, a program, a season; Lena leads a Wednesday date each week, Hollis plays.
  const partner = must(await d.from("partner").insert({ legal_name: `Juniper Living ${run} Inc.`, display_name: `Juniper Living ${run}` }).select("id").single(), "partner");
  const site = must(await d.from("site").insert({ partner_id: partner.id, name: `Juniper House ${run}`, display_name: `Juniper House ${run}`, timezone: TZ }).select("id").single(), "site");
  const room = must(await d.from("location").insert({ site_id: site.id, name: "Parlor", display_name: "Parlor" }).select("id").single(), "room");
  const res = must(await d.from("residency").insert({ partner_id: partner.id, name: `Juniper ${run}`, display_name: `Iris at Juniper ${run}`, status: "active" }).select("id").single(), "residency");
  must(await d.from("residency_site").insert({ residency_id: res.id, site_id: site.id }).select(), "residency site");
  const season = must(await d.from("season").insert({ residency_id: res.id, name: `Season ${run}`, starts_on: addDays(A, -7), ends_on: addDays(thisMonday, 90), kind: "season" }).select("id").single(), "season");
  must(await d.from("roster_member").insert([{ season_id: season.id, person_id: lead.id, is_admin_lead: true }, { season_id: season.id, person_id: hollis.id, is_admin_lead: false }]).select(), "roster");
  must(await d.from("staff_assignment").insert({ residency_id: res.id, person_id: point.id, role: "point_person", starts_on: "2020-01-01" }).select(), "Iris Supervisor");
  const dates = must(await d.from("session").insert([A, B].map((w) => ({ residency_id: res.id, title: "Brass Hour", location_id: room.id, starts_at: zonedToUtc(addDays(w, 2), "14:00", TZ), scheduled_minutes: 60 }))).select("id, starts_at"), "dates");
  for (const s of dates)
    must(await d.from("session_assignment").insert([{ session_id: s.id, person_id: lead.id, role: "leader" }, { session_id: s.id, person_id: hollis.id, role: "participant" }]).select(), "who plays");

  // The Iris Supervisor reviews and publishes those months, as in the app.
  const pp = await signedIn(point.email, point.password);
  for (const month of new Set([A, B].map((w) => `${addDays(w, 2).slice(0, 7)}-01`))) {
    ok(await pp.rpc("mark_month_reviewed", { p_residency: res.id, p_site: site.id, p_month: month }), `review ${month}`);
    ok(await pp.rpc("publish_month", { p_residency: res.id, p_site: site.id, p_month: month }), `publish ${month}`);
  }
  // Lena documents both dates, so Hollis has hours to submit each week.
  const type = must(await d.from("interaction_type").select("id").eq("active", true).order("sort_order").limit(1).single(), "interaction type");
  const lena = await signedIn(lead.email, lead.password);
  for (const s of dates)
    must(await lena.from("session_report").upsert({ session_id: s.id, author_id: lead.id, attendance: 14, interaction_type_id: type.id, resident_involvement: "none", actual_minutes: 60, notes: "[e2e] Hollis test", site_id: site.id }, { onConflict: "session_id" }).select(), "Lena documents");

  // The database's clock, set by hand: what goes out at a given moment.
  const queueAt = async (date: string, time: string) => ok(await d.rpc("queue_deadline_reminders", { p_now: zonedToUtc(date, time, TZ) }), `reminders at ${date} ${time}`);
  const sent = async (kind: string, personId: string, week: string) =>
    ((await d.from("notification").select("dedupe_key, body").eq("kind", kind).eq("person_id", personId)).data ?? []).filter((n) => n.dedupe_key.includes(`:${res.id}:${week}`));
  const backdate = async (week: string, iso: string) =>
    must(await d.from("time_entry").update({ submitted_at: iso }).eq("person_id", hollis.id).eq("residency_id", res.id).eq("week_starting", week).select("id"), `backdate ${week}`);

  // Hollis signs in with an emailed code, at 200% zoom.
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await codeLogIn(page, hollis.email);

  async function submitWeek(week: string) {
    await open(page, `/documentation?week=${week}`);
    await expect(page.getByText(`Due ${dueLabel(week)}`)).toBeVisible();
    await expectNoSideways(page, `My week (${week})`);
    await page.getByRole("button", { name: "Submit my week" }).click();
    await page.getByRole("button", { name: "Yes, submit" }).click();
    await expect(page.getByText("Your week is submitted to the Iris Supervisor.")).toBeVisible();
  }

  // Week A: submitted at 4:59 pm on its Tuesday.
  await submitWeek(A);
  await backdate(A, minutesFrom(weekDeadline(A, TZ), -1));

  // Week B, Monday 12:30 pm: the reminder goes out.
  await queueAt(addDays(B, 7), "12:30");
  expect(await sent("deadline_reminder", hollis.id, B), "Monday reminder for week B").toHaveLength(1);

  // Tuesday 4:59 pm: still on time, nothing "missed" yet.
  await queueAt(addDays(B, 8), "16:59");
  expect(await sent("deadline_missed", hollis.id, B), "no 'missed' email at 4:59 pm").toHaveLength(0);
  expect(await sent("deadline_missed_summary", point.id, B), "no summary to the Iris Supervisor at 4:59 pm").toHaveLength(0);

  // 5:01 pm: the missed-deadline email to Hollis, the summary to the Iris Supervisor.
  await queueAt(addDays(B, 8), "17:01");
  expect(await sent("deadline_missed", hollis.id, B), "'missed' email at 5:01 pm").toHaveLength(1);
  const summary = await sent("deadline_missed_summary", point.id, B);
  expect(summary, "summary to the Iris Supervisor at 5:01 pm").toHaveLength(1);
  expect(summary[0].body).toContain(hollis.name);

  // The scheduler runs every few minutes: nothing goes out twice.
  await queueAt(addDays(B, 8), "17:06");
  expect(await sent("deadline_missed", hollis.id, B), "still one 'missed' email at 5:06 pm").toHaveLength(1);

  // Hollis submits week B at 5:01 pm.
  await submitWeek(B);
  await backdate(B, minutesFrom(weekDeadline(B, TZ), 1));

  // Thursday 8:30 am: he's submitted, so no "still needed" nudge.
  await queueAt(addDays(B, 10), "08:30");
  expect(await sent("deadline_nudge", hollis.id, B), "no nudge after he submitted").toHaveLength(0);

  // The Iris Supervisor's Follow-up page: one week on time, one late.
  const pointPage = await (await browser.newContext()).newPage();
  await logIn(pointPage, point.email, point.password);
  await open(pointPage, `/residencies/${res.id}/follow-up`);
  const row = pointPage.getByRole("row", { name: new RegExp(hollis.name) });
  await expect(row).toContainText("1 on time");
  await expect(row).toContainText("1 late");
});
