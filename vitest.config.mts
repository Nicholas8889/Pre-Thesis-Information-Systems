import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "server-only": resolve(import.meta.dirname, "tests/shims/server-only.ts")
    }
  }
});
