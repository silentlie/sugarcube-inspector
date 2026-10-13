import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/cost-benchmark.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 240_000,
  globalTimeout: 720_000,
  reporter: "list",
  use: {trace: "retain-on-failure"},
});
