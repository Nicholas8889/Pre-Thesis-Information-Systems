import { defineConfig } from "@playwright/test";
import base from "./playwright.uat-flow-a.config";

export default defineConfig({
  ...base,
  testMatch: "uat-batch-one.spec.ts",
  timeout: 240000,
  use: {...base.use, timezoneId: "Asia/Jakarta"}
});
