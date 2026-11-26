import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a real (throwaway) Supabase started by the
// Supabase CLI, and a production build of the app. See README, "Automated tests".
export default defineConfig({
  testDir: "./e2e",
  // Staging-only journeys run from phone-journeys.yml with their own config.
  testIgnore: ["**/staging-journeys/**"],
  fullyParallel: false,
  workers: 1, // tests share one database
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    // localhost, not 127.0.0.1: Next builds redirect addresses from its own
    // hostname, and a cookie set on one name is invisible on the other.
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    command: "npm run start -- -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
