import fs from "node:fs";
import path from "node:path";
import {
  PASSWORD,
  PERSONAS,
  PUBLIC_ROUTES,
  RESULTS,
  ROUTE_MAP_FILE,
  appRoutes,
  emailFor,
  logIn,
  test,
  type RouteMap,
} from "./lib";

// Step 1 of the overnight test: find a real address for every page.
// Pages like /residencies/[id] need an ID, so each persona opens the pages it
// can reach and collects links. Only links that match a page in src/app are
// followed, so nothing but ordinary page views happens (no downloads, no
// form posts, no sign-out).

const MAX_PAGES_PER_PERSONA = 40;
// Prefer addresses a musician can reach, so everyone is tested on the
// residency the personas are rostered on; the admin finds the admin pages.
const PREFERENCE = ["musician", "admin-lead", "substitute", "point-person", "admin"];

test("discover page addresses", async ({ page, context, baseURL }) => {
  test.skip(!PASSWORD, "STAGING_TEST_PASSWORD is not set");
  test.setTimeout(20 * 60_000);

  // Start clean, so a report never mixes two runs.
  for (const p of ["raw", "screenshots", "routes.json"]) fs.rmSync(path.join(RESULTS, p), { recursive: true, force: true });
  fs.mkdirSync(RESULTS, { recursive: true });

  const routes = appRoutes();
  const origin = new URL(baseURL!).origin;
  const foundBy = new Map<string, Map<string, string>>(); // pattern -> persona -> url
  const logins: RouteMap["logins"] = {};

  for (const persona of PERSONAS) {
    // Same browser for everyone; forgetting the cookies signs the last persona out.
    await context.clearCookies();
    logins[persona.key] = await logIn(page, emailFor(persona.key));
    if (logins[persona.key] !== "ok") continue;

    const queue = ["/dashboard", ...routes.filter((r) => !r.dynamic && !PUBLIC_ROUTES.includes(r.pattern)).map((r) => r.pattern)];
    const seen = new Set<string>();
    while (queue.length && seen.size < MAX_PAGES_PER_PERSONA) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      } catch {
        continue;
      }
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const href of hrefs) {
        let u: URL;
        try {
          u = new URL(href);
        } catch {
          continue;
        }
        if (u.origin !== origin) continue;
        const p = u.pathname.replace(/\/+$/, "") || "/";
        const route = routes.find((r) => !r.dynamic && r.regex.test(p)) ?? routes.find((r) => r.regex.test(p));
        if (!route) continue; // not a page (API route, download, sign-in link…)
        if (route.dynamic) {
          const byPersona = foundBy.get(route.pattern) ?? new Map();
          if (!byPersona.has(persona.key)) byPersona.set(persona.key, p);
          foundBy.set(route.pattern, byPersona);
        }
        if (!seen.has(p) && !PUBLIC_ROUTES.includes(p)) queue.push(p);
      }
    }
  }

  const map: RouteMap = {
    generated_at: new Date().toISOString(),
    logins,
    routes: routes.map((r) => {
      if (!r.dynamic) return { pattern: r.pattern, url: r.pattern, found_by: null };
      const byPersona = foundBy.get(r.pattern);
      const who = PREFERENCE.find((k) => byPersona?.has(k)) ?? null;
      return { pattern: r.pattern, url: who ? byPersona!.get(who)! : null, found_by: who };
    }),
  };
  fs.writeFileSync(ROUTE_MAP_FILE, JSON.stringify(map, null, 2));
  console.log(
    map.routes.map((r) => `${r.url ? "✓" : "?"} ${r.pattern}${r.url && r.url !== r.pattern ? ` -> ${r.url}` : ""}`).join("\n"),
  );
});
