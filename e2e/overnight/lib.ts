import fs from "node:fs";
import path from "node:path";
import { test as base, type BrowserContext, type Page } from "@playwright/test";
import personaFile from "./personas.json";

// Shared helpers for the overnight test of the STAGING site.
// Read-only: these helpers only log in, navigate and look.

export const RESULTS = "overnight-results";
export const PASSWORD = process.env.STAGING_TEST_PASSWORD ?? "";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

export type Persona = (typeof personaFile.personas)[number];
export const PERSONAS: Persona[] = personaFile.personas;
export const emailFor = (key: string) => `persona+${key}@example.com`;

/** Routes anyone may open without logging in. */
export const PUBLIC_ROUTES = ["/", "/login", "/login/code", "/forgot-password"];

// --- Vercel's login wall -------------------------------------------------------
// The staging site sits behind Vercel Deployment Protection. Requests to the
// site itself carry the "Protection Bypass for Automation" secret. Only
// same-origin requests get it, so it never leaks to Supabase or anyone else.
export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ context, baseURL }, provide) => {
    if (BYPASS && baseURL) {
      const origin = new URL(baseURL).origin;
      await context.route(
        (url) => url.origin === origin,
        (route) =>
          route.continue({
            headers: {
              ...route.request().headers(),
              "x-vercel-protection-bypass": BYPASS,
              "x-vercel-set-bypass-cookie": "true",
            },
          }),
      );
    }
    await provide(context);
  },
});
export { expect } from "@playwright/test";

// --- Routes ----------------------------------------------------------------------
export type RoutePattern = { pattern: string; regex: RegExp; dynamic: boolean; depth: number };

/** Every page in the app, read from src/app/**\/page.tsx on the checked-out code. */
export function appRoutes(appDir = path.join("src", "app")): RoutePattern[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) found.push(path.relative(appDir, dir));
    }
  };
  walk(appDir);
  return found
    .map((rel) => {
      const segs = rel
        .split(path.sep)
        .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@")); // route groups, parallel routes
      const pattern = "/" + segs.join("/");
      const regex = new RegExp(
        "^" +
          segs
            .map((s) => (/^\[.*\]$/.test(s) ? "/[^/]+" : "/" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
            .join("") +
          "/?$",
      );
      return { pattern: pattern === "/" ? "/" : pattern, regex: pattern === "/" ? /^\/?$/ : regex, dynamic: /\[/.test(rel), depth: segs.length };
    })
    .sort((a, b) => a.depth - b.depth || a.pattern.localeCompare(b.pattern));
}

/** Saved by discover.setup.ts: the concrete address used for each route. */
export type RouteMap = {
  generated_at: string;
  routes: { pattern: string; url: string | null; found_by: string | null }[];
  logins: Record<string, "ok" | "blocked" | "failed">;
};
export const ROUTE_MAP_FILE = path.join(RESULTS, "routes.json");

// --- Logging in -------------------------------------------------------------------
/**
 * Logs in through the normal form. Returns "ok" when the dashboard appears,
 * "blocked" when the form shows an error (expected for the deactivated
 * persona), or "failed" for anything else.
 */
export async function logIn(page: Page, email: string): Promise<"ok" | "blocked" | "failed"> {
  try {
    await page.goto("/login");
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.locator('input[name="email"]').fill(email, { timeout: 15_000 });
    await page.locator('input[name="password"]').fill(PASSWORD, { timeout: 5_000 });
    await page.getByRole("button", { name: "Log in", exact: true }).click({ timeout: 5_000 });
  } catch {
    return "failed"; // no log-in form: site down, or Vercel's login wall
  }
  return Promise.race([
    page.waitForURL(/\/(dashboard|account\/password)/, { timeout: 30_000 }).then(() => "ok" as const),
    page
      .locator("main")
      .getByRole("alert")
      .waitFor({ timeout: 30_000 })
      .then(() => "blocked" as const),
  ]).catch(() => "failed" as const);
}

// --- Privacy -------------------------------------------------------------------------
// This repository is public, so the report and screenshots are too. Staging
// holds fake data, but also the real staff accounts used to log in there.
const EMAIL = /[\w.+-]+@(?!example\.(?:com|org)\b)[\w-]+(?:\.[\w-]+)+/gi;
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
export const redact = (text: string) => text.replace(EMAIL, "[email]").replace(PHONE, "[phone]");

/** Screenshot with real email addresses and phone numbers blacked out. */
export async function safeScreenshot(page: Page, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({
    path: file,
    fullPage: true,
    mask: [page.getByText(new RegExp(EMAIL.source, "i")), page.getByText(new RegExp(PHONE.source))],
    maskColor: "#000",
    timeout: 30_000,
  });
}

export const slug = (url: string) =>
  url.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 120) || "home";
