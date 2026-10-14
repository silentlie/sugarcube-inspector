import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const extensionPath = join(projectRoot, ".output/chrome-mv3");
const storyUrl = new URL(".generated/story.html", import.meta.url).href;
const resultsDirectory = fileURLToPath(new URL(".results/", import.meta.url));
const cases = [
  { width: 200, depth: 0 },
  { width: 2_000, depth: 0 },
  { width: 10_000, depth: 0 },
  { width: 2_000, depth: 6 },
];
const trials = 12;

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} ${args.join(" ")} failed: ${result.status}`);
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const quantile = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return {
    median: Number(quantile(0.5).toFixed(2)),
    p95: Number(quantile(0.95).toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

async function prepareScenario(page, { width, depth }) {
  await page.goto(storyUrl);
  await page.evaluate(({ width, depth }) => {
    const vars = globalThis.SugarCube.State.variables;
    for (let i = 0; i < width - 1; i++) {
      vars[`spacer_${String(i).padStart(5, "0")}`] = i;
    }
    let leaf = { tickA: 1 };
    for (let i = 0; i < depth; i++) leaf = { nested: leaf };
    vars.target = leaf;
  }, { width, depth });
  const drawer = page.locator("sugarcube-inspector");
  await drawer.waitFor({ state: "attached" });
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await handle.hover();
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  const tree = drawer.getByRole("tree", { name: "Story variables tree" });
  const holder = tree.locator(".ant-tree-list-holder");
  await holder.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const target = tree.getByRole("treeitem", { name: /^target/ });
  await target.waitFor({ state: "visible", timeout: 20_000 });
  await target.locator(".ant-tree-switcher").click();
  await target.getAttribute("aria-expanded").then((value) => {
    if (value !== "true") throw Error("Target failed to expand");
  });
  for (let level = 0; level < depth; level++) {
    await holder.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const nested = tree.getByRole("treeitem", { name: /^nested/ }).last();
    await nested.waitFor({ state: "visible" });
    await nested.locator(".ant-tree-switcher").click();
  }
  await holder.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await tree.getByRole("treeitem", { name: /^tickA/ }).waitFor({ state: "visible" });
  await page.waitForTimeout(300); // all effect subscriptions become active
}

async function measureOne(page, { depth, nextName, useForcedTick }) {
  return page.evaluate(async ({ depth, nextName, useForcedTick }) => {
    const inspector = document.querySelector("sugarcube-inspector")?.shadowRoot;
    const tree = inspector?.querySelector('[aria-label="Story variables tree"]');
    if (!tree) throw Error("Inspector tree missing");
    const hasExpected = () => [...tree.querySelectorAll(".ant-tree-title")]
      .some((element) => element.textContent?.trim().startsWith(nextName));
    if (hasExpected()) throw Error(`Expected node ${nextName} is already visible`);
    let maxFrameGap = 0;
    let framesOver50 = 0;
    let previousFrame = 0;
    let raf = 0;
    let running = true;
    function onFrame(now) {
      if (!running) return;
      if (previousFrame > 0) {
        const gap = now - previousFrame;
        maxFrameGap = Math.max(maxFrameGap, gap);
        if (gap > 50) framesOver50++;
      }
      previousFrame = now;
      raf = requestAnimationFrame(onFrame);
    }
    // Prime a real frame timestamp before the update. Without this the
    // first delayed frame is ignored and the maximum can misleadingly be zero.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    previousFrame = performance.now();
    raf = requestAnimationFrame(onFrame);
    const longTasks = [];
    const perfObserver = typeof PerformanceObserver !== "undefined"
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push(entry.duration);
        })
      : null;
    try { perfObserver?.observe({ entryTypes: ["longtask"] }); } catch { /* unsupported */ }
    const start = performance.now();
    let timer;
    let observer;
    const visible = new Promise((resolve, reject) => {
      const done = () => {
        if (!hasExpected()) return;
        clearTimeout(timer);
        observer.disconnect();
        requestAnimationFrame(() => {
          running = false;
          cancelAnimationFrame(raf);
          perfObserver?.disconnect();
          resolve({
            latencyMs: performance.now() - start,
            maxFrameGapMs: maxFrameGap,
            framesOver50,
            longTaskMs: longTasks.reduce((sum, duration) => sum + duration, 0),
          });
        });
      };
      observer = new MutationObserver(done);
      observer.observe(tree, { childList: true, subtree: true, characterData: true });
      timer = setTimeout(() => {
        observer.disconnect();
        running = false;
        cancelAnimationFrame(raf);
        perfObserver?.disconnect();
        reject(new Error(`Timed out waiting for ${nextName}`));
      }, 5_000);
    });

    const vars = globalThis.SugarCube.State.variables;
    let leaf = vars.target;
    for (let i = 0; i < depth; i++) leaf = leaf.nested;
    delete leaf[nextName === "tickA" ? "tickB" : "tickA"];
    leaf[nextName] = 1;
    if (useForcedTick) {
      if (typeof globalThis.__sugarcubeInspectorBenchmarkTick !== "function") {
        throw Error("Benchmark-only watcher trigger missing");
      }
      globalThis.__sugarcubeInspectorBenchmarkTick();
    }
    return visible;
  }, { depth, nextName, useForcedTick });
}

async function measureVariant(variant) {
  const browser = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const output = [];
  try {
    for (const scenario of cases) {
      await prepareScenario(page, scenario);
      const samples = [];
      for (let i = 0; i < trials; i++) {
        const nextName = i % 2 === 0 ? "tickB" : "tickA";
        const result = await measureOne(page, {
          depth: scenario.depth, nextName, useForcedTick: true,
        });
        samples.push(result);
      }
      // Polling-inclusive latency, same fixture but never force-refresh.
      const natural = [];
      for (let i = 0; i < 3; i++) {
        const nextName = i % 2 === 0 ? "tickB" : "tickA";
        // 12 forced updates end at tickA, so first natural update is tickB.
        natural.push(await measureOne(page, {
          depth: scenario.depth, nextName, useForcedTick: false,
        }));
      }
      const measured = {
        variant, ...scenario,
        forced: {
          latencyMs: summarize(samples.map((x) => x.latencyMs)),
          maxFrameGapMs: summarize(samples.map((x) => x.maxFrameGapMs)),
          longTaskMs: summarize(samples.map((x) => x.longTaskMs)),
          stalledFrames: samples.reduce((sum, x) => sum + x.framesOver50, 0),
          samples,
        },
        polling: {
          latencyMs: summarize(natural.map((x) => x.latencyMs)),
          samples: natural,
        },
      };
      output.push(measured);
      console.log(`TREE_E2E strategy=${variant} width=${scenario.width} depth=${scenario.depth} ` +
        `forced_median_ms=${measured.forced.latencyMs.median} ` +
        `forced_p95_ms=${measured.forced.latencyMs.p95} ` +
        `poll_median_ms=${measured.polling.latencyMs.median} ` +
        `frame_gap_p95_ms=${measured.forced.maxFrameGapMs.p95}`);
    }
  } finally {
    await browser.close();
  }
  return output;
}

await mkdir(resultsDirectory, { recursive: true });
const results = [];
const startTime = performance.now();
run(process.execPath, ["tests/browser/prepare-story.mjs"]);
const reverse = process.env.TREE_AB_REVERSE === "1";
for (const variant of (reverse ? ["mutable", "immutable"] : ["immutable", "mutable"])) {
  console.log(`Building real extension for ${variant} strategy...`);
  run("npm", ["run", "build"], {
    VITE_TREE_UPDATE_STRATEGY: variant,
    VITE_TREE_UPDATE_BENCHMARK: "true",
  });
  results.push(...await measureVariant(variant));
}
const all = {
  created: new Date().toISOString(),
  elapsedSeconds: Number(((performance.now() - startTime) / 1000).toFixed(1)),
  chromium: "Playwright Chromium, headless",
  measurement: "SugarCube write -> watcher -> React -> Ant tree -> DOM -> next animation frame",
  trials, results,
};
const resultFile = join(resultsDirectory,
  reverse ? "tree-update-ab-reversed.json" : "tree-update-ab.json");
await writeFile(resultFile, JSON.stringify(all, null, 2));
console.log(`TREE_E2E_RESULTS ${resultFile}`);
for (const scenario of cases) {
  const a = results.find((x) => x.variant === "immutable" &&
    x.width === scenario.width && x.depth === scenario.depth);
  const b = results.find((x) => x.variant === "mutable" &&
    x.width === scenario.width && x.depth === scenario.depth);
  console.log(`TREE_E2E_COMPARE width=${scenario.width} depth=${scenario.depth} ` +
    `immutable=${a.forced.latencyMs.median}ms mutable=${b.forced.latencyMs.median}ms ` +
    `ratio=${(a.forced.latencyMs.median / b.forced.latencyMs.median).toFixed(2)}x`);
}
