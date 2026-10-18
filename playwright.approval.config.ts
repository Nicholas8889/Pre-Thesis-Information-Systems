import { defineConfig } from "@playwright/test";

const out = process.env.SIT_UMKM_OUTPUT_DIR || "outputs/approval-regression";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "approval-outstanding.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  outputDir: `${out}/browser-artifacts`,
  reporter: [["list"], ["json", { outputFile: `${out}/browser-results.json` }]],
  use: {
    baseURL: "http://127.0.0.1:3137",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
