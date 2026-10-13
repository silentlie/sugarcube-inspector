import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
  [npm, ["run", "build:benchmark"]],
  [process.execPath, ["tests/browser/prepare-story.mjs"]],
  [npm, ["exec", "--", "playwright", "test", "benchmark.spec.ts"]],
];
for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && command === npm,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
