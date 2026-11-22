import { defineConfig, devices } from "@playwright/test";

// The overnight test of the STAGING site (.github/workflows/nightly.yml).
// Separate from playwright.config.ts, which tests a throwaway local copy in CI.
// Read-only: it logs in as each staging persona, opens every page, takes
// screenshots and runs checks. See README, "Overnight testing".
//
//   STAGING_URL=https://... STAGING_TEST_PASSWORD=... VERCEL_AUTOMATION_BYPASS_SECRET=... \
//     npx playwright test -c playwright.overnight.config.ts

const STAGING_URL = (
  process.env.STAGING_URL || "https://iris-app-git-main-rhearty1-5601s-projects.vercel.app"
).replace(/\/+$/, "");

export default defineConfig({
  testDir: "./e2e/overnight",
  outputDir: "overnight-results/test-output",
  // Each persona is its own test, so personas run side by side.
  fullyParallel: true,
  workers: 3,
  retries: 0,
  // One test visits every page for one persona.
  timeout: 30 * 60_000,
  reporter: [["list"], ["json", { outputFile: "overnight-results/playwright.json" }]],
  use: {
    baseURL: STAGING_URL,
    trace: "off",
    screenshot: "off",
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
  },
  projects: [
    // Finds the real address of every page (e.g. /residencies/<id>) first.
    { name: "discover", testMatch: /discover\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "desktop",
      testMatch: /matrix\.spec\.ts/,
      dependencies: ["discover"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "phone",
      testMatch: /matrix\.spec\.ts/,
      dependencies: ["discover"],
      use: { ...devices["Pixel 7"] },
    },
  ],
});
