import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  globalTimeout: 120_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: { trace: "retain-on-failure" },
});
