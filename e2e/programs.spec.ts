import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SECRET_KEY, SUPABASE_URL } from "./helpers/env";
import { createPerson, logIn, open } from "./helpers/people";

// Program setup (residency, sites, season, roster, Iris Supervisor). Made-up data.

const db = () => createClient(SUPABASE_URL, SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

test("admin sets up a program; a musician on its roster sees it but can't change it", async ({ browser }) => {
  const run = Date.now() % 100000;
  const adminUser = await createPerson({ label: "admin", name: `Ada Admin ${run}`, isAdmin: true });
  const lead = await createPerson({ label: "lead", name: `Lee Lead ${run}` });
  const outsider = await createPerson({ label: "outsider", name: `Oli Outside ${run}` });

  // A made-up partner with one site and room.
  const { data: partner } = await db().from("partner").insert({ legal_name: `Maple Living ${run} Inc.`, display_name: `Maple Living ${run}` }).select("id").single();
  const { data: site } = await db().from("site").insert({ partner_id: partner!.id, name: `Maple House ${run}`, display_name: `Maple House ${run}` }).select("id").single();
  await db().from("location").insert({ site_id: site!.id, name: "Library", display_name: "Library" });

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await logIn(admin, adminUser.email, adminUser.password);
  await admin.getByRole("link", { name: "Programs" }).first().click();
  await admin.waitForURL(/\/residencies$/);
  await admin.waitForLoadState("networkidle");

  // Add the program.
  await admin.locator('select[name="partner_id"]').selectOption({ label: `Maple Living ${run}` });
  await admin.locator('input[name="name"]').fill(`Maple ${run}`);
  await admin.locator('select[name="status"]').selectOption("active");
  await admin.getByRole("button", { name: "Add program" }).click();
  await admin.waitForURL(/\/residencies\/[0-9a-f-]{36}$/);
  await admin.waitForLoadState("networkidle");
  await expect(admin.getByRole("heading", { name: `Maple ${run}` })).toBeVisible();

  // Site, season, roster, Iris Supervisor.
  await admin.locator('select[name="site_id"]').selectOption({ label: `Maple House ${run}` });
  await admin.getByRole("button", { name: "Add site" }).click();
  await expect(admin.getByText("Site added.")).toBeVisible();

  const year = new Date().getFullYear() + 1;
  await admin.locator('input[name="name"]').first().fill(`Spring ${year}`);
  await admin.locator('input[name="starts_on"]').fill(`${year}-01-01`);
  await admin.locator('input[name="ends_on"]').fill(`${year}-06-30`);
  await admin.getByRole("button", { name: "Add season" }).click();
  await expect(admin.getByRole("heading", { name: new RegExp(`Spring ${year}`) })).toBeVisible();

  await admin.locator('select[name="person_id"]').last().selectOption({ label: lead.name });
  await admin.locator('input[name="is_admin_lead"]').check();
  await admin.getByRole("button", { name: "Add to roster" }).click();
  await expect(admin.getByText("Added to the roster.")).toBeVisible();
  await expect(admin.locator("li", { hasText: lead.name }).getByText("Lead Musician", { exact: true })).toBeVisible();

  await admin.locator('select[name="person_id"]').first().selectOption({ label: adminUser.name });
  await admin.getByRole("button", { name: "Assign" }).click();
  await expect(admin.getByText("Assigned.")).toBeVisible();
  await expect(admin.locator("li", { hasText: adminUser.name }).getByText("Iris Supervisor")).toBeVisible();

  // The Lead Musician (a musician) sees the program, read-only.
  const leadCtx = await browser.newContext();
  const leadPage = await leadCtx.newPage();
  await logIn(leadPage, lead.email, lead.password);
  await open(leadPage, "/residencies");
  await leadPage.getByRole("link", { name: new RegExp(`Maple ${run}`) }).click();
  await expect(leadPage.getByRole("heading", { name: `Maple ${run}` })).toBeVisible();
  await expect(leadPage.getByText(`Maple House ${run}`)).toBeVisible();
  await expect(leadPage.getByRole("button", { name: "Add season" })).toHaveCount(0);
  await expect(leadPage.getByRole("button", { name: "Add program" })).toHaveCount(0);

  // Someone not on the roster doesn't see it.
  const outCtx = await browser.newContext();
  const outPage = await outCtx.newPage();
  await logIn(outPage, outsider.email, outsider.password);
  await open(outPage, "/residencies");
  await expect(outPage.getByRole("link", { name: new RegExp(`Maple ${run}`) })).toHaveCount(0);
  await open(outPage, admin.url().replace(/^https?:\/\/[^/]+/, ""));
  await expect(outPage.getByRole("heading", { name: `Maple ${run}` })).toHaveCount(0);

  await Promise.all([ctx.close(), leadCtx.close(), outCtx.close()]);
});
