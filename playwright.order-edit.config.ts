import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "order-item-edit.spec.ts", workers: 1, timeout: 120000,
  expect: { timeout: 25000 }, reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3129", browserName: "chromium", channel: "chrome", headless: true, trace: "retain-on-failure" },
});
