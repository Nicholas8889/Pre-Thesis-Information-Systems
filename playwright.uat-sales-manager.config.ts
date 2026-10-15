import { defineConfig } from "@playwright/test";
const out = process.env.SIT_UMKM_OUTPUT_DIR || "outputs/uat-sales-manager-2026-10-15";
export default defineConfig({
  testDir: "./e2e", testMatch: "uat-sales-manager.spec.ts", workers: 1, retries: 0,
  timeout: 240_000, expect: { timeout: 20_000 }, outputDir: `${out}/browser-artifacts`,
  reporter: [["list"], ["json", { outputFile: `${out}/browser-results.json` }]],
  use: { baseURL: "http://127.0.0.1:3137", browserName: "chromium", channel: "chrome", headless: true,
    viewport: { width: 1440, height: 1000 }, actionTimeout: 30_000, navigationTimeout: 60_000,
    trace: "retain-on-failure", screenshot: "only-on-failure" }
});
