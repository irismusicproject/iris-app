import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SECRET_KEY, SUPABASE_URL } from "./env";

// Test accounts are created directly with the local secret key. Every email
// is unique per run and uses example.com, which can never be a real inbox.

const admin = () =>
  createClient(SUPABASE_URL, SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const TEST_PASSWORD = "cello tuesday 42 test";

export async function createPerson(opts: {
  label: string;
  name: string;
  isAdmin?: boolean;
  password?: string;
}): Promise<{ id: string; email: string; password: string; name: string }> {
  const email = uniqueEmail(opts.label);
  const password = opts.password ?? TEST_PASSWORD;
  const db = admin();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const { error: insertError } = await db.from("person").insert({
    id: data.user.id,
    name: opts.name,
    email,
    employment_type: opts.isAdmin ? "employee_w2" : "contractor_1099",
    system_roles: opts.isAdmin ? ["admin"] : [],
  });
  if (insertError) throw new Error(`insert person failed: ${insertError.message}`);
  return { id: data.user.id, email, password, name: opts.name };
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function logOut(page: Page) {
  await page.getByRole("button", { name: "Log out" }).first().click();
  await expect(page).toHaveURL(/\/$/);
}
