import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:3107",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run start -- --port 3107",
    url: "http://127.0.0.1:3107/login",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
