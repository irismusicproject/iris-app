import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SECRET_KEY, SUPABASE_URL } from "./helpers/env";
import { createPerson, logIn, open } from "./helpers/people";

// Harper (docs/PERSONAS.md): both devices, long detailed notes, a strained
// relationship with a co-leader over titles. On the website:
//   1. At a detailed-notes building (v0.36) she logs a visit with a long
//      note pasted with line breaks; it's stored exactly, and the "No health
//      information" reminder is right where she writes.
//   2. She and the Iris Supervisor change the same date's title from two open
//      pages. The test records what happens today (the later save wins,
//      with no warning to either) as a question for Lauren, not a failure.
// Made-up data only.

const db = () => createClient(SUPABASE_URL, SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
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

test("Harper: a long detailed note is kept exactly; two people retitle one date", async ({ browser }) => {
  test.setTimeout(180_000);
  const run = Date.now() % 100000;
  const d = db();
  const harper = await createPerson({ label: "harper", name: `Harper Harp ${run}` });
  const point = await createPerson({ label: "point", name: `Pia Point ${run}` });

  const partner = must(await d.from("partner").insert({ legal_name: `Willow Living ${run} Inc.`, display_name: `Willow Living ${run}` }).select("id").single(), "partner");
  const site = must(await d.from("site").insert({ partner_id: partner.id, name: `Willow House ${run}`, display_name: `Willow House ${run}`, timezone: "America/New_York", detailed_relationship_notes: true }).select("id").single(), "site");
  const room = must(await d.from("location").insert({ site_id: site.id, name: "Sunroom", display_name: "Sunroom" }).select("id").single(), "room");
  const res = must(await d.from("residency").insert({ partner_id: partner.id, name: `Willow ${run}`, display_name: `Iris at Willow ${run}`, status: "active" }).select("id").single(), "residency");
  must(await d.from("residency_site").insert({ residency_id: res.id, site_id: site.id }).select(), "residency site");
  const year = new Date().getFullYear();
  const season = must(await d.from("season").insert({ residency_id: res.id, name: `Season ${run}`, starts_on: `${year - 1}-08-01`, ends_on: `${year + 1}-07-31`, kind: "season" }).select("id").single(), "season");
  must(await d.from("roster_member").insert({ season_id: season.id, person_id: harper.id, is_admin_lead: false }).select(), "roster");
  must(await d.from("staff_assignment").insert({ residency_id: res.id, person_id: point.id, role: "point_person", starts_on: "2020-01-01" }).select(), "Iris Supervisor");

  // ---------------------------------------------------------------------
  // 1. A long, detailed note with line breaks
  // ---------------------------------------------------------------------
  const paragraph = (n: number) =>
    `Visit ${n} (${run}): we sang three folk songs together, then she chose a hymn and hummed the harmony while I played. ` +
    "She asked for the same song next week and told me about the choir she sang in. We ended with a slow waltz on the harp.";
  const note = Array.from({ length: 12 }, (_, i) => paragraph(i + 1)).join("\n\n");
  expect(note.length).toBeGreaterThan(2500);
  expect(note.length).toBeLessThanOrEqual(3000);

  const page = await as(browser, harper, "/documentation");
  const noteBox = page.locator('textarea[name="note"]');
  await expect(noteBox).toBeVisible();
  // The reminder sits with the box she writes in.
  await expect(page.getByText(/goes in the day's document for this site\. No health information\./)).toBeVisible();
  await page.locator('input[name="start_time"]').fill("10:00");
  await page.locator('input[name="end_time"]').fill("10:45");
  await page.locator('input[name="new_residents"]').fill("Ruth K.");
  await page.locator('input[name="new_room_0"]').fill("214");
  await noteBox.fill(note);
  await page.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Logged." })).toBeVisible();

  const saved = must(await d.from("relationship_activity").select("note, minutes").eq("person_id", harper.id).single(), "her visit");
  expect(saved.note, "the note is stored exactly, line breaks and all").toBe(note);
  expect(saved.minutes, "minutes come from the times").toBe(45);
  await page.reload();
  await expect(page.getByText(`Visit 1 (${run}): we sang three folk songs`, { exact: false }).first()).toBeVisible();

  // ---------------------------------------------------------------------
  // 2. Two people retitle the same date from two open pages
  // ---------------------------------------------------------------------
  const next = new Date(); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
  const month = next.toISOString().slice(0, 7);
  const date = must(await d.from("session").insert({ residency_id: res.id, title: "Music Café", location_id: room.id, starts_at: `${month}-15T18:00:00Z`, scheduled_minutes: 60 }).select("id").single(), "date");
  must(await d.from("session_assignment").insert({ session_id: date.id, person_id: harper.id, role: "leader" }).select(), "Harper leads");
  const pp = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await pp.auth.signInWithPassword({ email: point.email, password: point.password });
  const opened = await pp.rpc("open_schedule_month", { p_residency: res.id, p_site: site.id, p_month: `${month}-01` });
  expect(opened.error, "the Iris Supervisor opens the month for the team").toBeNull();

  const path = `/residencies/${res.id}/month/${month}`;
  const harperMonth = await as(browser, harper, path);
  const pointMonth = await as(browser, point, path); // both pages now show "Music Café"
  const titleBox = (p: Page) => p.getByRole("textbox", { name: /^Title for / }).first();
  await expect(titleBox(harperMonth)).toHaveValue("Music Café");
  await expect(titleBox(pointMonth)).toHaveValue("Music Café");

  await titleBox(harperMonth).fill("Harp and Song");
  await titleBox(harperMonth).press("Tab");
  await expect(harperMonth.getByText("Title saved.")).toBeVisible();

  // The Iris Supervisor's page still shows the old title; she types over it.
  await titleBox(pointMonth).fill("Café Strings");
  await titleBox(pointMonth).press("Tab");
  await expect(pointMonth.getByText("Title saved.")).toBeVisible();

  const final = must(await d.from("session").select("title").eq("id", date.id).single(), "final title");
  test.info().annotations.push({
    type: "question for Lauren (Harper, docs/PERSONAS.md)",
    description: `Two open pages, two title changes: the later save won ("${final.title}") and neither person was told the title had changed since their page loaded. Should the second save warn instead?`,
  });
  expect(final.title, "today: the later save wins").toBe("Café Strings");
  await harperMonth.reload();
  await expect(titleBox(harperMonth), "Harper sees her title replaced when she reloads").toHaveValue("Café Strings");
});
