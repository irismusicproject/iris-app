import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { logIn, test } from "../overnight/lib";

// Every PDF the website makes, on the real staging deployment (Vercel), as
// the people who use them. Written after invoice PDFs and sending the
// calendar failed only on Vercel: a file the PDF library loads at run time
// wasn't deployed (PR #97). Locally everything worked, so only a test against
// the deployed site catches this kind of bug.

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PASSWORD = process.env.STAGING_TEST_PASSWORD ?? "";

async function expectPdf(page: Page, path: string, what: string) {
  const res = await page.goto(path);
  expect(res, `${what}: no response`).not.toBeNull();
  expect(res!.status(), `${what}: status`).toBe(200);
  expect(res!.headers()["content-type"], `${what}: content type`).toContain("application/pdf");
  const body = await res!.body();
  expect(body.subarray(0, 4).toString("latin1"), `${what}: a real PDF file`).toBe("%PDF");
  expect(body.length, `${what}: not empty`).toBeGreaterThan(2000);
}

test("the partner calendar PDF opens (admin)", async ({ page }) => {
  test.skip(!URL_ || !KEY || !PASSWORD, "staging settings missing");
  const db = createClient(URL_, KEY, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: "persona+admin@example.com", password: PASSWORD });
  const { data } = await db.from("residency_site").select("residency_id, site_id, residency!inner(status)").eq("residency.status", "active").limit(1).single();
  expect(data, "an active program on staging").not.toBeNull();
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()).slice(0, 7);

  expect(await logIn(page, "persona+admin@example.com")).toBe("ok");
  await expectPdf(page, `/residencies/${data!.residency_id}/month/${month}/calendar?site=${data!.site_id}&view=1`, "calendar PDF");
});

test("a musician's own invoice PDF opens", async ({ page }) => {
  test.skip(!PASSWORD, "staging settings missing");
  expect(await logIn(page, "bastian.bassoon@example.com")).toBe("ok");
  await page.goto("/invoices");
  const link = page.locator('a[href^="/invoices/20"]').first();
  await expect(link, "a pay period listed on Invoices").toBeVisible();
  const href = (await link.getAttribute("href"))!.replace(/\/pdf.*$/, "");
  await expectPdf(page, `${href}/pdf?view=1`, "invoice PDF");
});
