import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SECRET_KEY, SUPABASE_URL } from "./helpers/env";
import { createPerson, logIn, open } from "./helpers/people";

// A month's schedule (DOMAIN-MODEL v0.18): the Iris Supervisor fills in the month
// and sets leaders, a roster musician edits titles and rooms of drafts they
// play in, the Iris Supervisor marks a draft date "No Program". The Lead Musician
// no longer fills months (v0.18). Made-up data only.

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

test("Weekly programs fill the month; the Iris Supervisor sets leaders, musicians edit drafts, Iris Supervisor marks No Program", async ({ browser }) => {
  // Three people log in and the month is filled twice over; give it more than the default 60 s.
  test.setTimeout(180_000);
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
  must(await d.from("staff_assignment").insert({ residency_id: res.id, person_id: point.id, role: "point_person", starts_on: "2020-01-01" }).select(), "Iris Supervisor");
  const jam = must(await d.from("series").insert({ residency_id: res.id, title: "Jam Band", default_location_id: library, weekdays: [2], start_time: "15:00", minutes: 45, active_from: `${year}-01-01` }).select("id").single(), "Jam Band series");
  must(await d.from("series_default_person").insert([{ series_id: jam.id, person_id: lead.id }, { series_id: jam.id, person_id: mus.id }]).select(), "usual musicians");
  must(await d.from("series").insert({ residency_id: res.id, kind: "relationship_building", title: "Lessons", default_location_id: library, weekdays: [2], active_from: `${year}-01-01` }).select(), "Lessons series");

  const path = `/residencies/${res.id}/month/${month}`;

  // 1. Nobody fills months by hand any more (D20).
  const leadPage = await as(browser, lead, path);
  await expect(leadPage.getByRole("button", { name: /^Fill in/ })).toHaveCount(0);
  const pointPage = await as(browser, point, path);
  // D20: no Fill buttons. Saving a weekly program makes its dates; here the
  // programs were added straight to the database, so make them as saving would.
  await expect(pointPage.getByRole("button", { name: /^Fill in/ })).toHaveCount(0);
  for (const sr of must(await d.from("series").select("id").eq("residency_id", res.id), "series"))
    must(await d.rpc("generate_series_dates", { p_series: sr.id }), "dates");
  await pointPage.reload();
  await expect(pointPage.getByRole("heading", { name: "Jam Band" })).toBeVisible();
  await expect(pointPage.getByRole("heading", { name: "Lessons" })).toBeVisible();
  await expect(pointPage.getByText("3:00 PM").first()).toBeVisible();

  // 2. A roster musician changes a draft's room. They can't fill the month,
  //    and (not being the date's leader) can't make it No Program.
  const musPage = await as(browser, mus, path);
  await expect(musPage.getByRole("button", { name: /^Fill in/ })).toHaveCount(0);
  await expect(musPage.getByRole("button", { name: /No Program/ })).toHaveCount(0); // no button for anyone since D20
  // The room menu sits under each date's "More" (workbook layout, #35).
  await musPage.getByRole("button", { name: "More" }).first().click();
  await musPage.getByLabel(/^Room for Tuesday/).first().selectOption({ label: "Lounge" });
  await expect(musPage.getByText("Room saved.")).toBeVisible();

  // 3. The Iris Supervisor assigns the first date's leader.
  await pointPage.reload();
  const leaderSelect = pointPage.getByLabel(/^Leader for Tuesday/).first();
  if (!(await leaderSelect.isVisible()))
    throw new Error(`No leader menu for the Iris Supervisor. Page shows: ${(await pointPage.locator("main").innerText()).slice(0, 800)}`);
  const options = await leaderSelect.locator("option").allInnerTexts();
  if (!options.includes("Mira")) throw new Error(`Leader options: ${JSON.stringify(options)}, disabled: ${await leaderSelect.isDisabled()}`);
  await leaderSelect.selectOption({ label: "Mira" });
  await expect(pointPage.getByText("Leader set.")).toBeVisible();
  await pointPage.reload();
  // The Leader column keeps the choice after a reload (workbook layout, #35).
  await expect(pointPage.getByLabel(/^Leader for Tuesday/).first().locator("option:checked")).toHaveText("Mira");
  // Back to no leader ("Pick…") works too: it failed on staging, Nov 25, 2026.
  await pointPage.getByLabel(/^Leader for Tuesday/).first().selectOption({ value: "" });
  await expect(pointPage.getByText("Leader set.")).toBeVisible();
  await pointPage.reload();
  await expect(pointPage.getByLabel(/^Leader for Tuesday/).first().locator("option:checked")).toHaveText("Pick…");
  await pointPage.getByLabel(/^Leader for Tuesday/).first().selectOption({ label: "Mira" });
  await expect(pointPage.getByText("Leader set.")).toBeVisible();

  // 3b. v0.41 (Lauren, Nov 23, 2026): while the team edits, the date's leader
  //     adds its title. Mira now leads the first Tuesday.
  await musPage.reload();
  const firstTitle = musPage.getByLabel(/^Title for Tuesday/).first();
  await firstTitle.fill("Jam Band: Motown");
  // Workbook-style cells (#35): a title saves on Enter or when you click away.
  await firstTitle.press("Enter");
  await expect(musPage.getByText("Title saved.")).toBeVisible();
  await musPage.reload();
  await expect(musPage.getByLabel(/^Title for Tuesday/).first()).toHaveValue("Jam Band: Motown");

  // 4. The Iris Supervisor marks the last Jam Band date "No Program" (on drafts
  //    that's the Iris Supervisor or the date's leader; the Lead Musician handles
  //    published dates).
  await pointPage.reload();
  await pointPage.waitForLoadState("networkidle");
  const jamBlock = pointPage.locator("div", { has: pointPage.getByRole("heading", { name: "Jam Band" }) }).last();
  // D20: there is no button; typing "No Program" as the title does it.
  const lastTitle = jamBlock.getByLabel(/^Title for /).last();
  await lastTitle.fill("No Program");
  await lastTitle.press("Enter");
  // What matters is the record: wait for the database to show one canceled date.
  await expect.poll(async () => (await d.from("session").select("id", { count: "exact", head: true }).eq("residency_id", res.id).eq("schedule_state", "canceled")).count, { timeout: 10_000 }).toBe(1);
  const { count } = await d.from("session").select("id", { count: "exact", head: true }).eq("residency_id", res.id).eq("schedule_state", "canceled");
  expect(count).toBe(1);
});
