import { createClient } from "@supabase/supabase-js";
import { expect } from "@playwright/test";
import { logIn, test } from "../overnight/lib";

// Dex (docs/PERSONAS.md), part 2 of 2: at his computer, after changing a
// program's attendance on his phone (mobile/.maestro/dex-phone.yaml).
//   1. Phone to website: My week shows the number he typed on the phone.
//   2. Website to the database: he puts the original number back with the
//      website's form, and the database has it (staging is left as it was).
// Runs in .github/workflows/phone-journeys.yml against STAGING, right after
// the phone half, with the values from mobile/.maestro/prepare-dex.mjs.

const day = process.env.MAESTRO_DEX_DAY ?? "";
const week = process.env.MAESTRO_DEX_WEEK ?? "";
const email = process.env.MAESTRO_DEX_EMAIL ?? "";
const changed = process.env.MAESTRO_DEX_ATTENDANCE ?? "";
const original = process.env.DEX_ORIGINAL_ATTENDANCE ?? "";

test("Dex: the number typed on the phone is on the website; the website puts it back", async ({ page }) => {
  test.skip(!day, "no documented, unapproved date for Dex this week (prepare-dex.mjs)");

  expect(await logIn(page, email), "Dex logs in on the staging website").toBe("ok");
  await page.goto(`/documentation?week=${week}`);
  await page.waitForLoadState("networkidle");

  // 1. The date he led, with the number from the phone.
  const card = page.locator("li").filter({ hasText: day }).filter({ has: page.locator('input[inputmode="numeric"]') }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText("Documented", { exact: true })).toBeVisible();
  const box = card.locator('input[inputmode="numeric"]').first();
  await expect(box, "attendance typed on the phone shows on the website").toHaveValue(changed);
  await page.screenshot({ path: "mobile/shots/dex-web-0-from-phone.png", fullPage: true });

  // 2. Back to the original, through the website's form.
  await box.fill(original);
  await card.getByRole("button", { name: "Update" }).click();
  await expect(card.getByRole("status")).toHaveText("Saved.");

  // The database agrees (read as Dex, with the public key only).
  const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "", process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email, password: process.env.STAGING_TEST_PASSWORD ?? "" });
  expect(error).toBeNull();
  const { data } = await db.from("session_report").select("attendance").eq("attendance", Number(changed));
  expect(data ?? [], "no report still has this run's number").toHaveLength(0);
});
