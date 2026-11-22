import { expect, test, type Page } from "@playwright/test";
import { createPerson, logIn, open } from "./helpers/people";

// Partners, sites and locations: admin-only screens (DOMAIN-MODEL section 1).
// Names are unique per run so CI retries don't collide with earlier attempts.

function formWithButton(page: Page, button: string) {
  return page.locator("form", { has: page.getByRole("button", { name: button, exact: true }) });
}

test("admin builds a multi-building partner: partner, sites, rooms", async ({ page }) => {
  const run = Date.now() % 100000;
  const partner = `Example Life Communities ${run}`;
  const admin = await createPerson({ label: "partneradmin", name: "Pia Partners", isAdmin: true });
  await logIn(page, admin.email, admin.password);

  // Add a partner from the Partners page.
  await page.getByRole("link", { name: "Partners" }).first().click();
  await page.waitForURL(/\/admin\/partners$/);
  await page.waitForLoadState("networkidle");
  const addPartner = formWithButton(page, "Add partner");
  await addPartner.locator('input[name="legal_name"]').fill(`${partner}, Inc.`);
  await addPartner.locator('input[name="display_name"]').fill(partner);
  await addPartner.getByRole("button", { name: "Add partner" }).click();
  await expect(page.getByRole("heading", { name: partner, level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // A building shared by two care levels is one site with both.
  const addSite = formWithButton(page, "Add site");
  await addSite.locator('input[name="name"]').fill("Birch Hall");
  await addSite.locator('input[name="city"]').fill("Testville");
  await addSite.locator('input[name="state"]').fill("MD");
  await addSite.locator('input[value="assisted"]').check();
  await addSite.locator('input[value="memory_care"]').check();
  await addSite.getByRole("button", { name: "Add site" }).click();
  await expect(page.getByRole("heading", { name: "Birch Hall", level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Rooms: add two, and a duplicate name in the same building is refused.
  const addRoom = formWithButton(page, "Add location");
  for (const room of ["Auditorium", "Memory Care Lounge"]) {
    await addRoom.locator('input[name="name"]').fill(room);
    await addRoom.getByRole("button", { name: "Add location" }).click();
    await expect(page.locator(`input[name="name"][value="${room}"]`)).toBeVisible();
  }
  await addRoom.locator('input[name="name"]').fill("auditorium");
  await addRoom.getByRole("button", { name: "Add location" }).click();
  await expect(addRoom.getByRole("alert")).toContainText("already exists");

  // Retire the site: it stays listed, marked Retired.
  const siteDetails = formWithButton(page, "Save site");
  await siteDetails.locator('select[name="active"]').selectOption("off");
  await siteDetails.getByRole("button", { name: "Save site" }).click();
  await expect(siteDetails.getByRole("status")).toContainText("Saved");

  await page.getByRole("link", { name: partner }).click();
  await page.waitForURL(/\/admin\/partners\/[0-9a-f-]{36}$/);
  const row = page.getByRole("link", { name: /Birch Hall/ });
  await expect(row).toContainText("Retired");
  await expect(row).toContainText("Assisted living, Memory care");
});

test("musicians can't reach the partner screens", async ({ page }) => {
  const me = await createPerson({ label: "nopartners", name: "Nico Notadmin" });
  await logIn(page, me.email, me.password);
  await expect(page.getByRole("link", { name: "Partners" })).toHaveCount(0);
  await open(page, "/admin/partners");
  await expect(page).toHaveURL(/\/dashboard$/);
});
