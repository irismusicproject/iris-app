import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SECRET_KEY, SUPABASE_URL } from "./helpers/env";
import { createPerson, logIn, open } from "./helpers/people";

// A month's schedule (DOMAIN-MODEL v0.12): the admin lead fills in the month,
// any roster musician edits titles and rooms, the point person assigns
// leaders, the admin lead marks a date "No Program". Made-up data only.

const db = () => createClient(SUPABASE_URL, SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

/** Fails the test with the database's reason if a setup step didn't work. */
function must<T>(r: { data: T; error: { message: string } | null }, step: string): NonNullable<T> {
  if (r.error || r.data == null) throw new Error(`setup "${step}" failed: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
}

async function as(browser: import("@playwright/test").Browser, who: { email: string; password: string }, path: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await logIn(page, who.email, who.password);
  await open(page, path);
  return page;
}

test("fill a month, musicians edit drafts, point person sets leaders, lead marks No Program", async ({ browser }) => {
  const run = Date.now() % 100000;
  const year = new Date().getFullYear() + 1;
  const month = `${year}-02`;
  const lead = await createPerson({ label: "lead", name: `Lena Lead ${run}` });
  const mus = await createPerson({ label: "mus", name: `Mira Musician ${run}` });
  const point = await createPerson({ label: "point", name: `Paz Point ${run}` });

  const d = db();
  const partner = must(await d.from("partner").insert({ legal_name: `Birch Living ${run} Inc.`, display_name: `Birch Living ${run}` }).select("id").single(), "partner");
  const site = must(await d.from("site").insert({ partner_id: partner.id, name: `Birch House ${run}`, display_name: `Birch House ${run}`, timezone: "America/New_York" }).select("id").single(), "site");
  const rooms = must(await d.from("location").insert([
    { site_id: site.id, name: "Library", display_name: "Library" },
    { site_id: site.id, name: "Lounge", display_name: "Lounge" },
  ]).select("id, name"), "rooms");
  const library = rooms.find((r) => r.name === "Library")!.id;
  const res = must(await d.from("residency").insert({ partner_id: partner.id, name: `Birch ${run}`, display_name: `Iris at Birch ${run}`, status: "active" }).select("id").single(), "residency");
  must(await d.from("residency_site").insert({ residency_id: res.id, site_id: site.id }).select(), "residency site");
  const season = must(await d.from("season").insert({ residency_id: res.id, name: `Spring ${year}`, starts_on: `${year}-01-01`, ends_on: `${year}-06-30`, kind: "semester" }).select("id").single(), "season");
  must(await d.from("roster_member").insert([
    { season_id: season.id, person_id: lead.id, is_admin_lead: true },
    { season_id: season.id, person_id: mus.id, is_admin_lead: false },
  ]).select(), "roster");
  must(await d.from("staff_assignment").insert({ residency_id: res.id, person_id: point.id, role: "point_person", starts_on: "2020-01-01" }).select(), "point person");
  const jam = must(await d.from("series").insert({ residency_id: res.id, title: "Jam Band", default_location_id: library, weekdays: [2], start_time: "15:00", minutes: 45, active_from: `${year}-01-01` }).select("id").single(), "Jam Band series");
  must(await d.from("series_default_person").insert([{ series_id: jam.id, person_id: lead.id }, { series_id: jam.id, person_id: mus.id }]).select(), "usual musicians");
  must(await d.from("series").insert({ residency_id: res.id, kind: "relationship_building", title: "Lessons", default_location_id: library, weekdays: [2], active_from: `${year}-01-01` }).select(), "Lessons series");

  const path = `/residencies/${res.id}/month/${month}`;

  // 1. The admin lead fills in February.
  const leadPage = await as(browser, lead, path);
  const fill = leadPage.getByRole("button", { name: /^Fill in February/ });
  if (!(await fill.isVisible())) throw new Error(`No fill button. Page shows: ${(await leadPage.locator("main").innerText()).slice(0, 600)}`);
  await fill.click();
  await expect(leadPage.getByRole("status")).toContainText(/Added \d+ programs/);
  await leadPage.reload();
  await expect(leadPage.getByRole("heading", { name: "Jam Band" })).toBeVisible();
  await expect(leadPage.getByRole("heading", { name: "Lessons" })).toBeVisible();
  await expect(leadPage.getByText("3:00 PM").first()).toBeVisible();

  // 2. A roster musician edits a draft's title and room, but can't set
  //    leaders, cancel or fill the month.
  const musPage = await as(browser, mus, path);
  await expect(musPage.getByRole("button", { name: /^Fill in/ })).toHaveCount(0);
  await expect(musPage.getByLabel(/^Leader for/)).toHaveCount(0);
  await expect(musPage.getByRole("button", { name: /No Program/ })).toHaveCount(0);
  const firstTitle = musPage.getByLabel(/^Title for Tuesday/).first();
  await firstTitle.fill("Jam Band: Motown");
  await musPage.getByRole("button", { name: "Save title" }).click();
  await expect(musPage.getByText("Title saved.")).toBeVisible();
  await musPage.getByLabel(/^Room for Tuesday/).first().selectOption({ label: "Lounge" });
  await expect(musPage.getByText("Room saved.")).toBeVisible();
  await musPage.reload();
  await expect(musPage.getByLabel(/^Title for Tuesday/).first()).toHaveValue("Jam Band: Motown");

  // 3. The point person assigns the first date's leader.
  const pointPage = await as(browser, point, path);
  await pointPage.getByLabel(/^Leader for Tuesday/).first().selectOption({ label: "Mira" });
  await expect(pointPage.getByText("Leader set.")).toBeVisible();
  await pointPage.reload();
  await expect(pointPage.getByText("(leader)").first()).toBeVisible();

  // 4. The admin lead marks the last Jam Band date "No Program".
  await leadPage.reload();
  await leadPage.waitForLoadState("networkidle");
  const jamBlock = leadPage.locator("div", { has: leadPage.getByRole("heading", { name: "Jam Band" }) }).last();
  leadPage.once("dialog", (dlg) => dlg.accept());
  await jamBlock.getByRole("button", { name: /No Program/ }).last().click();
  await expect(leadPage.getByText(/^Canceled ·/)).toHaveCount(1);
  const { count } = await d.from("session").select("id", { count: "exact", head: true }).eq("residency_id", res.id).eq("schedule_state", "canceled");
  expect(count).toBe(1);
});
