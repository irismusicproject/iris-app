import { expect, test } from "@playwright/test";
import { confirmLink, signInCode, waitForEmail } from "./helpers/mail";
import { createPerson, logIn, logOut, open } from "./helpers/people";
import { createClient } from "@supabase/supabase-js";
import { SECRET_KEY, SUPABASE_URL } from "./helpers/env";

test.describe("signed out", () => {
  for (const path of ["/dashboard", "/admin/people", "/account/profile", "/account/password"]) {
    test(`${path} redirects to log-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

test("@phone logs in with email and password", async ({ page }) => {
  const me = await createPerson({ label: "pw", name: "Pat Password" });
  await logIn(page, me.email, me.password);
  await expect(page.getByRole("heading", { name: "Hi, Pat" })).toBeVisible();
});

test("wrong password is rejected without saying whether the account exists", async ({ page }) => {
  const me = await createPerson({ label: "wrongpw", name: "Wes Wrong" });
  for (const email of [me.email, "nobody-here@example.com"]) {
    await open(page, "/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("not the right password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("don't match");
  }
});

test("@phone logs in with an emailed code", async ({ page }) => {
  const me = await createPerson({ label: "code", name: "Cora Code" });
  await open(page, "/login");
  await page.getByRole("link", { name: "Email me a code instead" }).click();
  await page.waitForURL(/\/login\/code$/);
  await page.waitForLoadState("networkidle");
  const since = Date.now();
  await page.locator('input[name="email"]').fill(me.email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(me.email);

  const code = signInCode(await waitForEmail(me.email, since));
  await page.locator('input[name="code"]').fill(code);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("resets a forgotten password", async ({ page }) => {
  const me = await createPerson({ label: "reset", name: "Rae Reset" });
  const newPassword = "viola thursday 77 new";

  await open(page, "/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.waitForURL(/\/forgot-password$/);
  await page.waitForLoadState("networkidle");
  const since = Date.now();
  await page.locator('input[name="email"]').fill(me.email);
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("Check your email");

  await open(page, confirmLink(await waitForEmail(me.email, since)));
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await page.locator('input[name="password"]').fill(newPassword);
  await page.locator('input[name="confirm"]').fill(newPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("Your password is saved");

  await logOut(page);
  await open(page, "/login");
  await page.locator('input[name="email"]').fill(me.email);
  await page.locator('input[name="password"]').fill(me.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("don't match");
  await logIn(page, me.email, newPassword);
});

test("rejects a password shorter than 12 characters", async ({ page }) => {
  const me = await createPerson({ label: "short", name: "Sam Short" });
  await logIn(page, me.email, me.password);
  await open(page, "/account/password");
  // Bypass the browser's own minlength check to test the server's rule.
  await page.locator("form").evaluate((f) => f.setAttribute("novalidate", ""));
  await page.locator('input[name="password"]').fill("too short");
  await page.locator('input[name="confirm"]').fill("too short");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("at least 12");
});

test("a deactivated person is told so at log-in", async ({ page }) => {
  const me = await createPerson({ label: "banned", name: "Dee Activated" });
  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  await db.from("person").update({ active: false }).eq("id", me.id);
  await db.auth.admin.updateUserById(me.id, { ban_duration: "876000h" });

  await open(page, "/login");
  await page.locator('input[name="email"]').fill(me.email);
  await page.locator('input[name="password"]').fill(me.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("deactivated");
});
