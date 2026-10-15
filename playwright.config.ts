import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  // Temporary CI scroll benchmark needs more than the regular smoke-suite timeout.
  globalTimeout: process.env.CI || process.env.SCROLL_BENCH ? 480_000 : 120_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: { trace: "retain-on-failure" },
});
