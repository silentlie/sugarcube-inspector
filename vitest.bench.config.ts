import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// Keep the performance suite separate from the normal unit/integration run.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ["tests/benchmarks/*.bench.ts"],
  },
});
