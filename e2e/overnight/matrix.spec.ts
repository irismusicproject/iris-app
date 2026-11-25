import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  PASSWORD,
  PERSONAS,
  RESULTS,
  ROUTE_MAP_FILE,
  emailFor,
  logIn,
  redact,
  safeScreenshot,
  slug,
  test,
  type RouteMap,
} from "./lib";

// Step 2 of the overnight test: every page x every persona, on desktop and
// phone. For each visit it records where the persona ended up (allowed,
// redirected, not found, error), a screenshot, an accessibility scan, browser
// console errors, failed network requests and load time. Read-only: it only
// opens pages. scripts/overnight-report.mjs turns the results into the report.

export type Visit = {
  pattern: string;
  url: string | null;
  outcome: "allowed" | "redirected" | "not-found" | "error" | "skipped";
  status: number | null;
  final_path: string | null;
  heading: string | null;
  load_ms: number | null;
  dom_ms: number | null;
  screenshot: string | null;
  console_errors: string[];
  failed_requests: string[];
  a11y: { id: string; impact: string | null; help: string; help_url: string; nodes: number; targets: string[] }[];
  note?: string;
};
export type PersonaResult = {
  project: string;
  persona: string;
  label: string;
  login: "ok" | "blocked" | "failed" | "signed-out";
  visits: Visit[];
};

const SIGNED_OUT = { key: "signed-out", label: "Signed out", active: true };
const ERROR_TEXT = /Application error|Internal Server Error|Something went wrong|This page could not be found|unexpected error/i;

for (const persona of [SIGNED_OUT, ...PERSONAS]) {
  test(`${persona.label}: every page`, async ({ page }, info) => {
    test.skip(!PASSWORD, "STAGING_TEST_PASSWORD is not set");
    const map: RouteMap = JSON.parse(fs.readFileSync(ROUTE_MAP_FILE, "utf8"));
    const result: PersonaResult = {
      project: info.project.name,
      persona: persona.key,
      label: persona.label,
      login: "signed-out",
      visits: [],
    };

    if (persona.key !== SIGNED_OUT.key) {
      result.login = await logIn(page, emailFor(persona.key));
    }

    // A persona that can't log in is only checked for that. The deactivated
    // persona SHOULD land here; anyone else here is a finding.
    const loggedInOrPublic = result.login === "ok" || result.login === "signed-out";
    if (loggedInOrPublic) {
      // Collect console errors and failed requests for the page being visited.
      let consoleErrors: string[] = [];
      let failed: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(redact(m.text()).slice(0, 300));
      });
      page.on("pageerror", (e) => consoleErrors.push(redact(`Uncaught: ${e.message}`).slice(0, 300)));
      page.on("requestfailed", (r) => {
        const why = r.failure()?.errorText ?? "failed";
        if (why.includes("ERR_ABORTED")) return; // navigations away, cancelled prefetches
        failed.push(redact(`${r.method()} ${new URL(r.url()).pathname} (${why})`).slice(0, 300));
      });
      page.on("response", (r) => {
        if (r.status() >= 400) failed.push(redact(`${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`).slice(0, 300));
      });

      for (const route of map.routes) {
        const base: Visit = {
          pattern: route.pattern,
          url: route.url,
          outcome: "skipped",
          status: null,
          final_path: null,
          heading: null,
          load_ms: null,
          dom_ms: null,
          screenshot: null,
          console_errors: [],
          failed_requests: [],
          a11y: [],
        };
        if (!route.url) {
          result.visits.push({ ...base, note: "no example address found (nobody could reach a link to it)" });
          continue;
        }
        consoleErrors = [];
        failed = [];
        const visit = { ...base };
        try {
          const started = Date.now();
          const response = await page.goto(route.url, { waitUntil: "load" });
          visit.load_ms = Date.now() - started;
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          visit.status = response?.status() ?? null;
          const timing = await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
            return nav ? { dom: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) } : null;
          });
          if (timing?.load) visit.load_ms = timing.load;
          if (timing?.dom) visit.dom_ms = timing.dom;
          const finalPath = new URL(page.url()).pathname.replace(/\/+$/, "") || "/";
          visit.final_path = finalPath;
          visit.heading = redact(((await page.locator("h1").first().textContent({ timeout: 2_000 }).catch(() => null)) ?? "").trim()).slice(0, 120) || null;
          const bodyText = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")) ?? "";

          if ((visit.status ?? 0) >= 500 || (ERROR_TEXT.test(bodyText) && visit.status !== 404)) visit.outcome = "error";
          else if (visit.status === 404 || /could not be found/i.test(bodyText)) visit.outcome = "not-found";
          else if (finalPath !== route.url.replace(/\/+$/, "") && !(route.url === "/" && finalPath === "/")) visit.outcome = "redirected";
          else visit.outcome = "allowed";

          const shot = path.join(RESULTS, "screenshots", info.project.name, persona.key, `${slug(route.url)}.png`);
          await safeScreenshot(page, shot).then(
            () => (visit.screenshot = path.relative(RESULTS, shot)),
            () => {},
          );

          // Accessibility: WCAG 2.1 A and AA rules, on pages the persona sees.
          if (visit.outcome === "allowed" || visit.outcome === "not-found") {
            const axe = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
              .analyze()
              .catch((e: Error) => {
                visit.note = `accessibility scan failed: ${e.message.slice(0, 120)}`;
                return null;
              });
            visit.a11y = (axe?.violations ?? []).map((v) => ({
              id: v.id,
              impact: v.impact ?? null,
              help: v.help,
              help_url: v.helpUrl,
              nodes: v.nodes.length,
              targets: v.nodes.slice(0, 3).map((n) => redact(n.target.join(" ")).slice(0, 120)),
            }));
          }
        } catch (e) {
          visit.outcome = "error";
          visit.note = redact((e as Error).message.split("\n")[0]).slice(0, 200);
        }
        // A visit that ends on "not found" already shows as 🚫 404 in the
        // matrix (e.g. staff opening a contractor's invoice address). The
        // page's own 404 isn't a second problem: drop the document request
        // and the browser's generic "Failed to load resource ... 404" for it.
        if (visit.outcome === "not-found") {
          const own = new URL(route.url, "http://x").pathname;
          failed = failed.filter((f) => !(f.includes(` ${own} -> 404`)));
          consoleErrors = consoleErrors.filter((c) => !/Failed to load resource: the server responded with a status of 404/.test(c));
        }
        visit.console_errors = [...new Set(consoleErrors)];
        visit.failed_requests = [...new Set(failed)];
        result.visits.push(visit);
      }
    }

    const out = path.join(RESULTS, "raw", `${info.project.name}-${persona.key}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
  });
}
