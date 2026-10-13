import { spawnSync } from "node:child_process";

// Cross-platform (including Windows PowerShell) opt-in profiling build.
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, ["run", "build"], {
  env: { ...process.env, VITE_SC_INSPECTOR_BENCHMARK: "1" },
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
