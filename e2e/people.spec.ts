import { expect, test } from "@playwright/test";
import { confirmLink, waitForEmail } from "./helpers/mail";
import { createPerson, logIn, TEST_PASSWORD, uniqueEmail } from "./helpers/people";

test("admin invites a musician, who sets a password and sees only their own screens", async ({ browser }) => {
  const adminUser = await createPerson({ label: "admin", name: "Ada Admin", isAdmin: true });
  const musicianEmail = uniqueEmail("musician");

  // Admin adds the musician.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await logIn(admin, adminUser.email, adminUser.password);
  await admin.getByRole("link", { name: "People" }).first().click();
  await expect(admin.getByText(adminUser.email)).toBeVisible();

  const since = Date.now();
  await admin.locator('input[name="name"]').fill("Milo Musician");
  await admin.locator('input[name="email"]').fill(musicianEmail);
  await admin.locator('select[name="employment_type"]').selectOption("contractor_1099");
  await admin.locator('input[name="instruments"]').fill("cello, piano");
  await admin.getByRole("button", { name: "Add and send invite" }).click();
  await expect(admin.getByRole("status")).toContainText(`Invite sent to ${musicianEmail}`);
  await expect(admin.getByText("Milo Musician")).toBeVisible();

  // The musician accepts the invite in their own browser.
  const musicianCtx = await browser.newContext();
  const musician = await musicianCtx.newPage();
  await musician.goto(confirmLink(await waitForEmail(musicianEmail, since)));
  await expect(musician.getByRole("heading", { name: "Welcome to Iris" })).toBeVisible();
  await musician.locator('input[name="password"]').fill(TEST_PASSWORD);
  await musician.locator('input[name="confirm"]').fill(TEST_PASSWORD);
  await musician.getByRole("button", { name: "Save password" }).click();
  await expect(musician.getByRole("heading", { name: "Hi, Milo" })).toBeVisible();

  // Musicians get no admin screens.
  await expect(musician.getByRole("link", { name: "People" })).toHaveCount(0);
  await musician.goto("/admin/people");
  await expect(musician).toHaveURL(/\/dashboard$/);

  // Musicians can edit their own phone and instruments.
  await musician.goto("/account/profile");
  await expect(musician.locator('input[name="instruments"]')).toHaveValue("cello, piano");
  await musician.locator('input[name="phone"]').fill("555-0100");
  await musician.getByRole("button", { name: "Save" }).click();
  await expect(musician.getByRole("status")).toContainText("Saved");
  await musician.reload();
  await expect(musician.locator('input[name="phone"]')).toHaveValue("555-0100");

  // Admin deactivates the musician: they lose access at once.
  await admin.goto("/admin/people");
  await admin.getByRole("link", { name: /Milo Musician/ }).click();
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Deactivate Milo Musician" }).click();
  await expect(admin.getByRole("status")).toContainText("is deactivated");

  await musician.goto("/dashboard");
  await expect(musician.getByRole("heading", { name: "Your account isn't active" })).toBeVisible();
  await musician.getByRole("button", { name: "Log out" }).click();
  await musician.goto("/login");
  await musician.locator('input[name="email"]').fill(musicianEmail);
  await musician.locator('input[name="password"]').fill(TEST_PASSWORD);
  await musician.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(musician.getByRole("alert")).toContainText("deactivated");

  // Admin reactivates: the musician can log in again.
  await admin.goto("/admin/people");
  await admin.getByRole("link", { name: /Milo Musician/ }).click();
  await admin.getByRole("button", { name: "Reactivate Milo Musician" }).click();
  await expect(admin.getByRole("status")).toContainText("is active again");
  await logIn(musician, musicianEmail, TEST_PASSWORD);

  await adminCtx.close();
  await musicianCtx.close();
});

test("an admin cannot deactivate themselves", async ({ page }) => {
  const me = await createPerson({ label: "selfadmin", name: "Sol Self", isAdmin: true });
  await logIn(page, me.email, me.password);
  await page.goto("/admin/people");
  await page.getByRole("link", { name: /Sol Self/ }).click();
  await expect(page.getByText("You can't deactivate yourself")).toBeVisible();
  await expect(page.getByRole("button", { name: /Deactivate/ })).toHaveCount(0);
});
