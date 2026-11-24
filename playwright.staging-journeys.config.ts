import { defineConfig, devices } from "@playwright/test";

// The website halves of the two-device persona journeys (docs/PERSONAS.md),
// run against STAGING by .github/workflows/phone-journeys.yml right after the
// phone halves. Separate from playwright.config.ts (a throwaway local copy)
// and from the overnight test. Needs STAGING_URL (or the main-branch staging
// site), STAGING_TEST_PASSWORD and VERCEL_AUTOMATION_BYPASS_SECRET.

const STAGING_URL = (
  process.env.STAGING_URL || "https://iris-app-git-main-rhearty1-5601s-projects.vercel.app"
).replace(/\/+$/, "");

export default defineConfig({
  testDir: "./e2e/staging-journeys",
  outputDir: "mobile/shots/web-test-output",
  workers: 1,
  retries: 0,
  timeout: 3 * 60_000,
  reporter: [["list"]],
  use: {
    baseURL: STAGING_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
    ...devices["Desktop Chrome"],
  },
});
