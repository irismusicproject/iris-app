import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SECRET_KEY, SUPABASE_URL } from "./helpers/env";
import { createPerson, logIn, open } from "./helpers/people";

// The monthly cycle's first steps on the website (docs/ACCEPTANCE.md M1, C1,
// C2, C4, C7; DOMAIN-MODEL v0.41–v0.46). The same promises are checked on the
// phone by mobile/.maestro/cant-play.yaml. Made-up data only.

const db = () => createClient(SUPABASE_URL, SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
function must<T>(r: { data: T; error: { message: string } | null }, step: string): NonNullable<T> {
  if (r.error || r.data == null) throw new Error(`setup "${step}" failed: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
}
async function as(browser: import("@playwright/test").Browser, who: { email: string; password: string }, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await logIn(page, who.email, who.password);
  await open(page, path);
  return page;
}

test("The month opens by itself; a musician marks 'I can't play'; the Iris Supervisor sees it and is emailed", async ({ browser }) => {
  test.setTimeout(180_000);
  const run = Date.now() % 100000;
  const year = new Date().getFullYear() + 1;
  const month = `${year}-03`;
  const lead = await createPerson({ label: "lead", name: `Lena Lead ${run}` });
  const mus = await createPerson({ label: "mus", name: `Mira Musician ${run}` });
  const point = await createPerson({ label: "point", name: `Paz Point ${run}` });

  // A building, a program, a season and two draft dates in March: Lena leads, Mira plays.
  const d = db();
  const partner = must(await d.from("partner").insert({ legal_name: `Cedar Living ${run} Inc.`, display_name: `Cedar Living ${run}` }).select("id").single(), "partner");
  const site = must(await d.from("site").insert({ partner_id: partner.id, name: `Cedar House ${run}`, display_name: `Cedar House ${run}`, timezone: "America/New_York" }).select("id").single(), "site");
  const room = must(await d.from("location").insert({ site_id: site.id, name: "Library", display_name: "Library" }).select("id").single(), "room");
  const res = must(await d.from("residency").insert({ partner_id: partner.id, name: `Cedar ${run}`, display_name: `Iris at Cedar ${run}`, status: "active" }).select("id").single(), "residency");
  must(await d.from("residency_site").insert({ residency_id: res.id, site_id: site.id }).select(), "residency site");
  const season = must(await d.from("season").insert({ residency_id: res.id, name: `Spring ${year}`, starts_on: `${year}-01-01`, ends_on: `${year}-06-30`, kind: "semester" }).select("id").single(), "season");
  must(await d.from("roster_member").insert([{ season_id: season.id, person_id: lead.id, is_admin_lead: true }, { season_id: season.id, person_id: mus.id, is_admin_lead: false }]).select(), "roster");
  must(await d.from("staff_assignment").insert({ residency_id: res.id, person_id: point.id, role: "point_person", starts_on: "2020-01-01" }).select(), "Iris Supervisor");
  const dates = must(await d.from("session").insert([
    { residency_id: res.id, title: "Music Café", location_id: room.id, starts_at: `${year}-03-10T18:00:00Z`, scheduled_minutes: 60 },
    { residency_id: res.id, title: "Sing-along", location_id: room.id, starts_at: `${year}-03-17T18:00:00Z`, scheduled_minutes: 60 },
  ]).select("id"), "dates");
  for (const s of dates)
    must(await d.from("session_assignment").insert([{ session_id: s.id, person_id: lead.id, role: "leader" }, { session_id: s.id, person_id: mus.id, role: "participant" }]).select(), "who plays");

  const path = `/residencies/${res.id}/month/${month}`;
  const cantPlay = (p: Page) => p.getByRole("button", { name: "I can't play this date" });

  // D20 (Nov 27, 2026): the month opened for the team by itself when its first
  // dates were added; there is no "Open" button any more.
  await expect.poll(async () => (await d.from("schedule_month").select("stage").eq("residency_id", res.id).maybeSingle()).data?.stage, { timeout: 10_000 }).toBe("team_editing");
  const musPage = await as(browser, mus, path);
  const pointPage = await as(browser, point, path);
  await expect(pointPage.getByRole("button", { name: /^Open .* for the team/ })).toHaveCount(0);

  // C1: Mira marks the first date "I can't play". No approval; it counts at once.
  await musPage.reload();
  await expect(musPage.getByText(/Team editing/)).toBeVisible();
  await musPage.getByRole("button", { name: "More" }).first().click();
  await cantPlay(musPage).click();
  await expect(musPage.getByRole("button", { name: /Marked: I can't play/ })).toBeVisible();
  await expect.poll(async () => (await d.from("session_assignment").select("status").eq("session_id", dates[0].id).eq("person_id", mus.id).single()).data?.status, { timeout: 10_000 }).toBe("absent");

  // C4: the Iris Supervisor sees Mira as not playing that date (struck through) and is emailed.
  await pointPage.reload();
  await pointPage.getByRole("button", { name: "More" }).first().click();
  await expect(pointPage.locator(".line-through", { hasText: "Mira" }).first()).toBeVisible();
  await expect.poll(async () => (await d.from("notification").select("id", { count: "exact", head: true }).eq("kind", "absence_marked").eq("person_id", point.id)).count, { timeout: 10_000 }).toBe(1);

  // C7: Mira undoes it while the month is still open.
  await musPage.getByRole("button", { name: /Marked: I can't play/ }).click();
  await expect(cantPlay(musPage)).toBeVisible();
  await expect.poll(async () => (await d.from("session_assignment").select("status").eq("session_id", dates[0].id).eq("person_id", mus.id).single()).data?.status, { timeout: 10_000 }).toBe("assigned");

  // D20: no confirm step. The Lead Musician sends it to the partner; after
  // that, "I can't play" is no longer offered (musicians ask the Iris Supervisor).
  const leadPage = await as(browser, lead, path);
  await expect(pointPage.getByRole("button", { name: /^Confirm the team's/ })).toHaveCount(0);
  await leadPage.getByRole("button", { name: "Send calendar to partner" }).click();
  await leadPage.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(async () => (await d.from("schedule_month").select("stage").eq("residency_id", res.id).maybeSingle()).data?.stage, { timeout: 15_000 }).toBe("sent_to_partner");
  await musPage.reload();
  await musPage.getByRole("button", { name: "More" }).first().click();
  await expect(cantPlay(musPage)).toHaveCount(0);
});
