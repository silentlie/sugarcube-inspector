/* global SugarCube */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselineSha = "f98ecf6c438598954ecef0af6316bed96e94c70a";
const currentSha = process.env.GITHUB_SHA || "HEAD";
const tmp = await mkdtemp(join(tmpdir(), "sc-tree-e2e-"));
const sizes = (process.env.BENCH_SIZES || "200,2000,10000").split(",").map(Number);
const repeats = Number(process.env.BENCH_REPEATS || 5);
const samples = [];
const variants = ["legacy", "shared"];
const cases = ["root-add", "nested-add", "replace-expanded"];

function command(bin, args, cwd = repo) {
  execFileSync(bin, args, { cwd, stdio: "inherit", env: { ...process.env, CI: "true" } });
}
function replaceOnce(text, needle, replacement, file) {
  if (!text.includes(needle)) throw new Error("Instrumentation anchor missing in " + file + ": " + needle);
  return text.replace(needle, replacement);
}
async function instrument(stage) {
  const treePath = join(stage, "src/inspector/VariableTree.tsx");
  let tree = await readFile(treePath, "utf8");
  tree = replaceOnce(tree, "useCallback, useEffect, useMemo, useState", "useCallback, useEffect, useLayoutEffect, useMemo, useState, Profiler", treePath);
  tree = replaceOnce(tree, "  const [expandedKeys, setExpandedKeys]", "  useLayoutEffect(() => { (globalThis).__scBench?.treeCommitted(); }, [items]);\n  const [expandedKeys, setExpandedKeys]", treePath);
  tree = replaceOnce(tree, "{height > 0 && <Tree", '{height > 0 && <Profiler id="variable-tree" onRender={(_, __, actualDuration) => { (globalThis).__scBench?.reactRendered(actualDuration); }}><Tree', treePath);
  tree = replaceOnce(tree, "      const item = data as Item;\n      return <LiveVariableLabel", "      (globalThis).__scBench?.rowRendered();\n      const item = data as Item;\n      return <LiveVariableLabel", treePath);
  tree = replaceOnce(tree, "  />}\n  </div>;", "  /></Profiler>}\n  </div>;", treePath);
  await writeFile(treePath, tree);
  const watcherPath = join(stage, "src/inspection/variableWatcher.ts");
  let watcher = await readFile(watcherPath, "utf8");
  watcher = replaceOnce(watcher, "    let current = read();", "    (globalThis).__scBench?.watchCreated();\n    let current = read();", watcherPath);
  watcher = replaceOnce(watcher, "      check: () => {", "      check: () => {\n        (globalThis).__scBench?.watchChecked();", watcherPath);
  watcher = replaceOnce(watcher, "        listeners.add(callback);", "        (globalThis).__scBench?.watchSubscribed();\n        listeners.add(callback);", watcherPath);
  watcher = replaceOnce(watcher, "          listeners.delete(callback);", "          (globalThis).__scBench?.watchUnsubscribed();\n          listeners.delete(callback);", watcherPath);
  watcher += "\nif (typeof globalThis !== 'undefined') (globalThis).__scBenchRefresh = () => variableWatcher.refresh();\n";
  await writeFile(watcherPath, watcher);
}
const median = (arr) => {
  const v = arr.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? Math.round(v[Math.floor(v.length / 2)] * 1000) / 1000 : null;
};
const metrics = r => Object.fromEntries(r.metrics.map(({ name, value }) => [name, value]));
const delta = (a, b, name) => Math.round(((b[name] ?? 0) - (a[name] ?? 0)) * 100000) / 100;

async function setup(context, size) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__scBench = {
      watchers: 0, subscriptions: 0, unsubscriptions: 0, checks: 0,
      rows: 0, commits: 0, reactCommits: 0, reactDuration: 0,
      start: 0, committedAt: 0, intervals: [], rafHandle: 0, rafLast: 0,
      watchCreated() { this.watchers++; },
      watchSubscribed() { this.subscriptions++; },
      watchUnsubscribed() { this.unsubscriptions++; },
      watchChecked() { this.checks++; },
      rowRendered() { this.rows++; },
      treeCommitted() { this.commits++; this.committedAt = performance.now(); },
      reactRendered(duration) { this.reactCommits++; this.reactDuration += duration; },
      reset() {
        this.watchers = this.subscriptions = this.unsubscriptions = this.checks = 0;
        this.rows = this.commits = this.reactCommits = this.reactDuration = 0;
        this.start = this.committedAt = this.rafLast = 0;
        this.intervals = [];
      },
      begin() {
        this.reset();
        const tick = now => {
          if (this.rafLast) this.intervals.push(now - this.rafLast);
          this.rafLast = now;
          this.rafHandle = requestAnimationFrame(tick);
        };
        this.rafHandle = requestAnimationFrame(tick);
        this.start = performance.now();
      },
      end() {
        cancelAnimationFrame(this.rafHandle);
        const frames = [...this.intervals].sort((a, b) => a - b);
        return {
          elapsedToCommitMs: this.commits ? this.committedAt - this.start : null,
          watchersCreated: this.watchers, subscriptions: this.subscriptions,
          unsubscriptions: this.unsubscriptions, watcherChecks: this.checks,
          rowRenders: this.rows, treeCommits: this.commits,
          reactCommits: this.reactCommits, reactDurationMs: this.reactDuration,
          frames: frames.length, framesOver25Ms: frames.filter(ms => ms > 25).length,
          worstFrameMs: frames.at(-1) ?? 0,
          p95FrameMs: frames[Math.max(0, Math.ceil(frames.length * 0.95) - 1)] ?? 0,
        };
      },
    };
  });
  await page.goto(pathToFileURL(join(repo, "tests/browser/.generated/story.html")).href);
  await page.evaluate((count) => {
    const vars = SugarCube.State.variables;
    vars.benchValue = 0;
    for (let i = 0; i < 5; i++) vars["benchBranch" + i] = Object.fromEntries(
      Array.from({ length: 8 }, (_, j) => ["property" + j, j]));
    for (let i = 0; i < count; i++) vars["bench" + String(i).padStart(5, "0")] = i;
  }, size);
  const drawer = page.locator("sugarcube-inspector");
  await drawer.getByRole("button", { name: "Resize SugarCube Inspector" }).press("Enter");
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  const branch = drawer.getByRole("treeitem", { name: /^benchBranch0/ });
  await branch.waitFor({ state: "visible", timeout: 20000 });
  await branch.locator(".ant-tree-switcher").click();
  await drawer.getByRole("treeitem", { name: /^property0/ }).waitFor({ state: "visible" });
  await page.waitForTimeout(150);
  const client = await context.newCDPSession(page);
  await client.send("Performance.enable");
  return { page, client };
}
async function measure({page, client}, variant, size, round, scenario) {
  const before = metrics(await client.send("Performance.getMetrics"));
  await page.evaluate(async (testCase) => {
    const p = window.__scBench;
    p.begin();
    // Establish the previous rAF timestamp before blocking the next frame.
    await new Promise(requestAnimationFrame);
    p.start = performance.now();
    const vars = SugarCube.State.variables;
    if (testCase === "root-add") vars.benchAdded = "new";
    if (testCase === "nested-add") vars.benchBranch0.newProperty = 47;
    if (testCase === "replace-expanded") vars.benchBranch0 = { ...vars.benchBranch0, replacement: 71 };
    window.__scBenchRefresh();
  }, scenario);
  await page.waitForFunction(() => window.__scBench.commits > 0, null, { timeout: 7000 });
  await page.waitForTimeout(150);
  const result = await page.evaluate(() => window.__scBench.end());
  const after = metrics(await client.send("Performance.getMetrics"));
  const row = {
    variant, size, round, scenario, ...result,
    taskMs: delta(before, after, "TaskDuration"),
    scriptMs: delta(before, after, "ScriptDuration"),
    layoutMs: delta(before, after, "LayoutDuration"),
    recalcStyleMs: delta(before, after, "RecalcStyleDuration"),
  };
  if (result.treeCommits < 1) throw new Error("Missing commit " + JSON.stringify(row));
  console.log("TREE_E2E_SAMPLE=" + JSON.stringify(row));
  samples.push(row);
}
async function measureTabReturn({page, client}, variant, size, round) {
  const drawer = page.locator("sugarcube-inspector");
  await drawer.getByRole("tab", { name: "Overview" }).click();
  await page.waitForTimeout(200);
  const before = metrics(await client.send("Performance.getMetrics"));
  await page.evaluate(async () => {
    const p = window.__scBench;
    p.begin();
    await new Promise(requestAnimationFrame);
    p.start = performance.now();
  });
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  await drawer.getByRole("treeitem", { name: /^benchBranch0/ })
    .waitFor({state:"visible", timeout:7000});
  const elapsedToVisibleMs = await page.evaluate(() => performance.now() - window.__scBench.start);
  await page.waitForTimeout(150);
  const result = await page.evaluate(() => window.__scBench.end());
  const after = metrics(await client.send("Performance.getMetrics"));
  const row = {
    variant, size, round, scenario: "tab-return", ...result, elapsedToVisibleMs,
    taskMs: delta(before, after, "TaskDuration"),
    scriptMs: delta(before, after, "ScriptDuration"),
    layoutMs: delta(before, after, "LayoutDuration"),
    recalcStyleMs: delta(before, after, "RecalcStyleDuration"),
  };
  if (row.frames < 3) throw new Error("Tab frame sample too short: " + JSON.stringify(row));
  console.log("TREE_E2E_SAMPLE=" + JSON.stringify(row));
  samples.push(row);
}
async function run(variant, size, round, stages) {
  const extension = join(stages[variant], ".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(join(tmp, ["profile", variant, size, round].join("-")), {
    headless: true, channel: "chromium",
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension],
  });
  try {
    const session = await setup(context, size);
    try {
      for (const scenario of cases) await measure(session, variant, size, round, scenario);
      await measureTabReturn(session, variant, size, round);
    } finally {
      await session.client.detach();
      await session.page.close();
    }
  } finally {
    await context.close();
  }
}
try {
  command("node", ["tests/browser/prepare-story.mjs"]);
  const stages = {};
  for (const [variant, sha] of [["legacy", baselineSha], ["shared", currentSha]]) {
    const stage = join(tmp, variant);
    command("git", ["worktree", "add", "--detach", stage, sha]);
    await symlink(join(repo, "node_modules"), join(stage, "node_modules"), "dir");
    await instrument(stage);
    command("npm", ["run", "build"], stage);
    stages[variant] = stage;
  }
  for (const size of sizes) for (let round = 0; round < repeats; round++) {
    for (const variant of (round % 2 ? [...variants].reverse() : variants))
      await run(variant, size, round, stages);
  }
  const summary = [];
  for (const size of sizes) for (const scenario of [...cases, "tab-return"]) {
    const outcome = { size, scenario };
    for (const variant of variants) {
      const rows = samples.filter(r => r.size === size && r.scenario === scenario && r.variant === variant);
      outcome[variant] = {
        runs: rows.length,
        medianTaskMs: median(rows.map(r => r.taskMs)),
        medianScriptMs: median(rows.map(r => r.scriptMs)),
        medianCommitMs: median(rows.map(r => r.elapsedToCommitMs)),
        medianVisibleMs: median(rows.map(r => r.elapsedToVisibleMs)),
        medianRowRenders: median(rows.map(r => r.rowRenders)),
        medianWatcherCreates: median(rows.map(r => r.watchersCreated)),
        medianSubscriptions: median(rows.map(r => r.subscriptions)),
        medianReactDurationMs: median(rows.map(r => r.reactDurationMs)),
        medianFrameP95Ms: median(rows.map(r => r.p95FrameMs)),
        medianWorstFrameMs: median(rows.map(r => r.worstFrameMs)),
        over25Ms: rows.reduce((n, r) => n + r.framesOver25Ms, 0),
        frames: rows.reduce((n, r) => n + r.frames, 0),
      };
    }
    console.log("TREE_E2E_SUMMARY=" + JSON.stringify(outcome));
    summary.push(outcome);
  }
  await mkdir(join(repo, "benchmark-results"), { recursive: true });
  await writeFile(join(repo, "benchmark-results/tree-e2e.json"), JSON.stringify({
    baselineSha, currentSha, repeats, sizes, summary, samples, node: process.version,
  }, null, 2));
} finally {
  for (const variant of variants)
    try { command("git", ["worktree", "remove", "--force", join(tmp, variant)]); } catch (error) { console.warn("Cannot remove benchmark worktree", variant, error.message); }
  await rm(tmp, { recursive: true, force: true });
}
