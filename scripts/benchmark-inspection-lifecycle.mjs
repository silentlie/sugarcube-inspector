/* global SugarCube */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sizes = (process.env.COST_SIZES || "200,2000,10000").split(",").map(Number);
const repeats = Number(process.env.COST_REPEATS || 4);
const temporary = await mkdtemp(join(tmpdir(), "sc-inspection-lifecycle-"));
const stage = join(temporary, "instrumented");
const samples = [];
const scenarios = ["cold-open", "expand", "idle-poll", "root-add", "nested-add", "replace-object", "tab-return", "scope-switch"];

function run(bin, args, cwd = root) {
  execFileSync(bin, args, { cwd, stdio: "inherit", env: { ...process.env, CI: "true" } });
}
function replace(text, anchor, replacement, filename) {
  if (!text.includes(anchor)) throw new Error("Missing instrumentation anchor in " + filename + ": " + anchor);
  return text.replace(anchor, replacement);
}
const hook = 'const __costEnter = (name: string) => (globalThis as typeof globalThis & { __scCost?: { enter: (name: string) => () => void } }).__scCost?.enter(name);\n';
function instrumentFunction(text, name, filename) {
  const match = new RegExp("\\bfunction\\s+" + name + "\\s*\\(").exec(text);
  if (!match) throw new Error("Cannot locate " + name + " in " + filename);
  // Multiline TypeScript parameter types also contain ': {\\n'. Skip those.
  let open = text.indexOf(" {\n", match.index);
  while (open > 0 && text[open - 1] === ":") {
    open = text.indexOf(" {\n", open + 3);
  }
  const close = text.indexOf("\n}", open + 3);
  if (open < 0 || close < 0) throw new Error("Function block invalid: " + name);
  return text.slice(0, open + 3) +
    '  const __endCost = __costEnter("' + name + '");\n  try {\n' +
    text.slice(open + 3, close) +
    '\n  } finally { __endCost?.(); }' +
    text.slice(close);
}
async function instrument(filename, names, transform) {
  const path = join(stage, filename);
  let source = await readFile(path, "utf8");
  source = hook + source;
  for (const name of names) source = instrumentFunction(source, name, filename);
  if (transform) source = transform(source, filename);
  await writeFile(path, source);
}
async function build() {
  run("git", ["worktree", "add", "--detach", stage, "HEAD"]);
  await symlink(join(root, "node_modules"), join(stage, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await instrument("src/inspection/variableStructure.ts", [
    "readStructure", "sameStructure", "listChildren", "getLocationId", "getLocationName",
  ]);
  await instrument("src/inspection/variableLocation.ts", ["snapshot", "readVariable", "sameVariable"]);
  await instrument("src/inspection/valuePreview.ts", ["preview", "boxedPrimitive"]);
  await instrument("src/inspection/variableTree.ts", ["getVariableChildren"]);
  await instrument("src/inspection/isExpandableNode.ts", ["isExpandableNode"]);
  await instrument("src/inspector/variableTreeItems.ts", [
    "reconcileChildren", "refreshItem", "updateTreeItem", "valueAt",
  ]);
  await instrument("src/inspector/valueSyntax.tsx", ["TypeSyntax", "ValueSyntax", "inlinePreview"]);
  await instrument("src/inspector/LiveVariableLabel.tsx", [
    "LiveVariableLabel", "ValueTokens", "MapKeyPreview", "ExpandedStructureWatcher",
  ]);
  await instrument("src/inspector/DirectInspector.tsx", ["DirectInspector", "InspectorSections"]);
  await instrument("src/inspector/VariableTree.tsx", [
    "VariableTree", "VariableTreeContent", "RichVariableTree",
  ], (s, filename) => {
    s = replace(s, "useCallback, useEffect, useMemo, useState",
      "useCallback, useEffect, useLayoutEffect, useMemo, useState", filename);
    s = replace(s, "  const [expandedKeys, setExpandedKeys]",
      '  useLayoutEffect(() => { (globalThis as typeof globalThis & { __scCost?: { commit: () => void } }).__scCost?.commit(); }, [items]);\n  const [expandedKeys, setExpandedKeys]', filename);
    s = replace(s, '      const item = data as Item;\n      return <LiveVariableLabel',
      '      const __exitTitleCost = __costEnter("titleRender");\n      try {\n      const item = data as Item;\n      return <LiveVariableLabel', filename);
    s = replace(s, '    }}\n  />}', '      } finally { __exitTitleCost?.(); }\n    }}\n  />}', filename);
    return s;
  });
  const path = join(stage, "src/inspection/variableWatcher.ts");
  let watcher = await readFile(path, "utf8");
  watcher = hook + watcher;
  watcher = replace(watcher, "      check: () => {",
    '      check: () => {\n        const __endCost = __costEnter("watchCheck");\n        try {', path);
  watcher = replace(watcher, "      },\n    };",
    '        } finally { __endCost?.(); }\n      },\n    };', path);
  watcher = replace(watcher, "    let current = read();",
    '    (globalThis as typeof globalThis & { __scCost?: { hit: (name: string) => void } }).__scCost?.hit("watchCreate");\n    let current = read();', path);
  watcher = replace(watcher, "        listeners.add(callback);",
    '        (globalThis as typeof globalThis & { __scCost?: { hit: (name: string) => void } }).__scCost?.hit("watchSubscribe");\n        listeners.add(callback);', path);
  watcher = replace(watcher, "          listeners.delete(callback);",
    '          (globalThis as typeof globalThis & { __scCost?: { hit: (name: string) => void } }).__scCost?.hit("watchUnsubscribe");\n          listeners.delete(callback);', path);
  watcher += '\n(globalThis as typeof globalThis & { __scCostRefresh?: () => void }).__scCostRefresh = () => variableWatcher.refresh();\n';
  await writeFile(path, watcher);
  run("npm", ["run", "build"], stage);
}
function metrics(response) { return Object.fromEntries(response.metrics.map(m => [m.name, m.value])); }
const round3 = n => Math.round(n * 1000) / 1000;
function delta(before, after, name, factor = 1000) {
  return round3(((after[name] ?? 0) - (before[name] ?? 0)) * factor);
}
function median(arr) {
  const sorted = arr.filter(v => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? round3(sorted[Math.floor(sorted.length / 2)]) : null;
}

async function setup(context, size) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    const profiler = {
      active: false, stack: [], costs: {}, counts: {}, commits: 0,
      committedAt: 0, beganAt: 0, intervals: [], rafLast: 0, handle: 0,
      enter(name) {
        if (!this.active) return undefined;
        const frame = { name, began: performance.now(), children: 0 };
        this.stack.push(frame);
        return () => {
          const elapsed = performance.now() - frame.began;
          this.stack.pop();
          const parent = this.stack.at(-1);
          if (parent) parent.children += elapsed;
          const item = this.costs[name] ??= { calls: 0, exclusiveMs: 0, inclusiveMs: 0 };
          item.calls++;
          item.inclusiveMs += elapsed;
          item.exclusiveMs += Math.max(0, elapsed - frame.children);
        };
      },
      hit(name) {
        if (this.active) this.counts[name] = (this.counts[name] ?? 0) + 1;
      },
      commit() {
        if (!this.active) return;
        this.commits++;
        this.committedAt = performance.now();
      },
      begin() {
        if (this.handle) cancelAnimationFrame(this.handle);
        this.active = true; this.stack = []; this.costs = {}; this.counts = {};
        this.commits = 0; this.committedAt = 0; this.intervals = []; this.rafLast = 0;
        const tick = now => {
          if (this.rafLast) this.intervals.push(now - this.rafLast);
          this.rafLast = now;
          this.handle = requestAnimationFrame(tick);
        };
        this.handle = requestAnimationFrame(tick);
        this.beganAt = performance.now();
      },
      markStart() { this.beganAt = performance.now(); },
      end() {
        this.active = false;
        cancelAnimationFrame(this.handle);
        this.handle = 0;
        const frames = [...this.intervals].sort((a, b) => a - b);
        const own = Object.values(this.costs).reduce((sum, c) => sum + c.exclusiveMs, 0);
        return {
          costs: this.costs, counts: this.counts, commits: this.commits,
          namedExclusiveMs: Math.round(own * 1000) / 1000,
          firstCommitMs: this.commits ? Math.round((this.committedAt - this.beganAt) * 1000) / 1000 : null,
          frames: frames.length,
          dropped25: frames.filter(x => x > 25).length,
          p95FrameMs: frames[Math.max(0, Math.ceil(frames.length * 0.95) - 1)] ?? null,
          worstFrameMs: frames.at(-1) ?? null,
        };
      },
    };
    window.__scCost = profiler;
  });
  await page.goto(pathToFileURL(join(root, "tests/browser/.generated/story.html")).href);
  await page.evaluate((count) => {
    const store = SugarCube.State.variables;
    for (let i = 0; i < 5; i++) {
      store["costBranch" + i] = Object.fromEntries(
        Array.from({ length: 8 }, (_, j) => ["property" + j, j]),
      );
    }
    for (let i = 0; i < count; i++) store["cost" + String(i).padStart(5, "0")] = i;
  }, size);
  const drawer = page.locator("sugarcube-inspector");
  await drawer.getByRole("button", { name: "Resize SugarCube Inspector" }).press("Enter");
  const client = await context.newCDPSession(page);
  await client.send("Performance.enable");
  return {page, drawer, client};
}
async function start(session) {
  const before = metrics(await session.client.send("Performance.getMetrics"));
  await session.page.evaluate(async () => {
    window.__scCost.begin();
    await new Promise(requestAnimationFrame);
    window.__scCost.markStart();
  });
  return before;
}
async function finish(session, size, round, scenario, before, visibleMs = null) {
  await session.page.waitForTimeout(scenario === "idle-poll" ? 0 : 150);
  const result = await session.page.evaluate(() => window.__scCost.end());
  const after = metrics(await session.client.send("Performance.getMetrics"));
  const item = {
    size, round, scenario, ...result, visibleMs,
    taskMs: delta(before, after, "TaskDuration"),
    scriptMs: delta(before, after, "ScriptDuration"),
    layoutMs: delta(before, after, "LayoutDuration"),
    styleMs: delta(before, after, "RecalcStyleDuration"),
    layoutCount: delta(before, after, "LayoutCount", 1),
    styleCount: delta(before, after, "RecalcStyleCount", 1),
    heapDeltaMb: delta(before, after, "JSHeapUsedSize", 1 / (1024 * 1024)),
  };
  samples.push(item);
  console.log("INSPECTION_LIFECYCLE_SAMPLE=" + JSON.stringify(item));
}
async function action(session, size, round, scenario) {
  const {page, drawer} = session;
  const before = await start(session);
  let visibleMs = null;
  if (scenario === "cold-open") {
    await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
    await drawer.getByRole("treeitem", { name: /^costBranch0/ })
      .waitFor({state:"visible",timeout:15000});
    visibleMs = await page.evaluate(() => performance.now() - window.__scCost.beganAt);
  } else if (scenario === "expand") {
    await drawer.getByRole("treeitem", { name: /^costBranch0/ }).locator(".ant-tree-switcher").click();
    await drawer.getByRole("treeitem", { name: /^property0/ })
      .waitFor({state:"visible",timeout:10000});
    visibleMs = await page.evaluate(() => performance.now() - window.__scCost.beganAt);
  } else if (scenario === "idle-poll") {
    await page.waitForTimeout(1050);
  } else if (scenario === "tab-return") {
    await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
    await drawer.getByRole("treeitem", { name: /^costBranch0/ })
      .waitFor({state:"visible",timeout:10000});
    visibleMs = await page.evaluate(() => performance.now() - window.__scCost.beganAt);
  } else if (scenario === "scope-switch") {
    await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
    await drawer.getByRole("tree", { name: "Temporary variables tree" })
      .waitFor({state:"visible",timeout:10000});
    visibleMs = await page.evaluate(() => performance.now() - window.__scCost.beganAt);
  } else {
    await page.evaluate(testCase => {
      const store = SugarCube.State.variables;
      if (testCase === "root-add") store.costAdded = "new";
      else if (testCase === "nested-add") store.costBranch0.newProperty = 47;
      else if (testCase === "replace-object")
        store.costBranch0 = {...store.costBranch0, replacement: 71};
      window.__scCostRefresh();
    }, scenario);
    await page.waitForFunction(() => window.__scCost.commits > 0, null, {timeout:8000});
  }
  await finish(session, size, round, scenario, before, visibleMs);
  if (scenario === "cold-open" || scenario === "expand" || scenario === "root-add" ||
      scenario === "nested-add" || scenario === "replace-object") {
    const last = samples.at(-1);
    if (!last?.commits) throw new Error("Expected committed tree for " + scenario);
  }
}
async function one(size, round) {
  const profile = join(temporary, "profile-" + size + "-" + round);
  const extension = join(stage, ".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, channel: "chromium",
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension],
  });
  try {
    const session = await setup(context, size);
    try {
      for (const scenario of scenarios.slice(0, 6)) await action(session, size, round, scenario);
      await session.drawer.getByRole("tab", {name:"Overview"}).click();
      await session.page.waitForTimeout(200);
      await action(session, size, round, "tab-return");
      await action(session, size, round, "scope-switch");
    } finally {
      await session.client.detach();
      await session.page.close();
    }
  } finally {
    await context.close();
  }
}
function stageCosts(costs) {
  const groups = {
    "Structure scan/compare": ["readStructure", "sameStructure"],
    "Value inspection": ["readVariable", "sameVariable", "snapshot", "preview", "boxedPrimitive"],
    "Child discovery / ID": ["getVariableChildren", "listChildren", "getLocationId", "getLocationName"],
    "Tree reconciliation": ["reconcileChildren", "refreshItem", "updateTreeItem", "valueAt", "isExpandableNode"],
    "Watcher callback": ["watchCheck"],
    "Inspector React components": ["VariableTree", "VariableTreeContent", "RichVariableTree",
      "DirectInspector", "InspectorSections", "LiveVariableLabel", "ValueTokens",
      "MapKeyPreview", "ExpandedStructureWatcher", "ValueSyntax", "TypeSyntax", "inlinePreview"],
    "Ant titleRender callback": ["titleRender"],
  };
  return Object.fromEntries(Object.entries(groups).map(([group, names]) => [group,
    round3(names.reduce((total, name) => total + (costs?.[name]?.exclusiveMs ?? 0), 0))]));
}
try {
  run("node", ["tests/browser/prepare-story.mjs"]);
  await build();
  for (const size of sizes) for (let round = 0; round < repeats; round++) await one(size, round);
  const summary = [];
  for (const size of sizes) for (const scenario of scenarios) {
    const rows = samples.filter(x => x.size === size && x.scenario === scenario);
    const groups = Object.keys(stageCosts({}));
    const item = {
      size, scenario, runs: rows.length,
      medianTaskMs: median(rows.map(r => r.taskMs)),
      medianScriptMs: median(rows.map(r => r.scriptMs)),
      medianLayoutMs: median(rows.map(r => r.layoutMs)),
      medianStyleMs: median(rows.map(r => r.styleMs)),
      medianVisibleMs: median(rows.map(r => r.visibleMs)),
      medianFirstCommitMs: median(rows.map(r => r.firstCommitMs)),
      medianWorstFrameMs: median(rows.map(r => r.worstFrameMs)),
      medianP95FrameMs: median(rows.map(r => r.p95FrameMs)),
      framesOver25: rows.reduce((sum, r) => sum + r.dropped25, 0),
      totalFrames: rows.reduce((sum, r) => sum + r.frames, 0),
      medianWatcherCreates: median(rows.map(r => r.counts.watchCreate ?? 0)),
      medianWatcherChecks: median(rows.map(r => r.costs.watchCheck?.calls ?? 0)),
      medianNamedExclusiveMs: median(rows.map(r => r.namedExclusiveMs)),
      stages: Object.fromEntries(groups.map(g => [g, median(rows.map(r => stageCosts(r.costs)[g]))])),
    };
    summary.push(item);
    console.log("INSPECTION_LIFECYCLE_SUMMARY=" + JSON.stringify(item));
  }
  await mkdir(join(root, "benchmark-results"), {recursive:true});
  await writeFile(join(root, "benchmark-results/lifecycle.json"), JSON.stringify({
    commit: process.env.GITHUB_SHA ?? "local", node: process.version,
    repeats, sizes, notes: [
      "All named source timings are exclusive JavaScript times; do not add inclusive calls or CDP totals.",
      "CDP task/script/layout/style durations cover a sampling window and may overlap; do not sum them.",
      "Unattributed JavaScript includes React, Ant Design, Prism, other game code, and probe overhead.",
      "Headless Chromium at approximately 60Hz is not a desktop FPS assessment.",
    ],
    summary, samples,
  }, null, 2));
} finally {
  try { run("git", ["worktree", "remove", "--force", stage]); }
  catch (error) { console.warn("Worktree cleanup:", error.message); }
  await rm(temporary, {recursive:true,force:true});
}
