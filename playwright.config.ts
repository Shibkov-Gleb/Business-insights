import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  webServer:
    process.env.BANK_UI_PREVIEW === "1"
      ? {
          command: "node scripts/bank-ui-preview.mjs",
          url: "http://127.0.0.1:3012",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        }
      : undefined,
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: "list",
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || "chromium",
    baseURL:
      process.env.BANK_UI_PREVIEW === "1"
        ? "http://127.0.0.1:3012"
        : process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "tablet", use: { viewport: { width: 1024, height: 900 } } },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
});
