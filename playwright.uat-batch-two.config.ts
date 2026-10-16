import { defineConfig } from "@playwright/test";
import base from "./playwright.uat-flow-a.config";

export default defineConfig({
  ...base,
  testMatch: "uat-batch-two.spec.ts",
  timeout: 240000,
  use: {...base.use, timezoneId: "Asia/Jakarta"}
});
