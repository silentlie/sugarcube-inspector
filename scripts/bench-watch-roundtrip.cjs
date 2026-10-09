#!/usr/bin/env node
/* Benchmark WatchService strategies over async Node worker_threads messages.
 * Simulates MAIN-world processing, structured-clone RPC in both directions,
 * and inspector cache updates. Not a real Chromium custom-event RPC test.
 * Run: npm run bench:watch:roundtrip
 */
const { Worker, isMainThread, workerData, parentPort } = require("node:worker_threads");
const { performance } = require("node:perf_hooks");
const { serialize } = require("node:v8");
const { isDeepStrictEqual } = require("node:util");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(js, filename);
};

const { WatchService, deepEqual } = require("../src/sugarcube/watchService.ts");
const { minimizeWatchTargets, watchKey } = require("../src/sugarcube/watch.ts");
const { applyWatchPatches } = require("../src/sugarcube/applyWatchPatches.ts");

const target = (key) => ({
  scope: "story",
  path: [{ type: "property", key }],
});

function fixture(kind, size) {
  const stores = { story: {}, temporary: {} };
  let targets = [target("watched")];
  let mutate;

  if (kind === "flat") {
    stores.story.watched = Object.fromEntries(
      Array.from({ length: size }, (_, i) => ["k" + i, i]),
    );
    mutate = (i) => { stores.story.watched["k" + (i % size)]++; };
  } else if (kind === "nested") {
    const groups = Math.ceil(size / 100);
    stores.story.watched = Object.fromEntries(
      Array.from({ length: groups }, (_, g) => [
        "g" + g,
        Object.fromEntries(Array.from({ length: 100 }, (_, i) => ["p" + i, i])),
      ]),
    );
    mutate = (i) => {
      stores.story.watched["g" + (i % groups)]["p" + (i % 100)]++;
    };
  } else if (kind === "array") {
    stores.story.watched = Array.from(
      { length: size }, (_, i) => ({ id: i, score: i, flag: true }),
    );
    mutate = (i) => { stores.story.watched[i % size].score++; };
  } else if (kind === "map") {
    stores.story.watched = new Map(
      Array.from({ length: size }, (_, i) => ["k" + i, { score: i }]),
    );
    mutate = (i) => { stores.story.watched.get("k" + (i % size)).score++; };
  } else if (kind === "leaves") {
    stores.story = Object.fromEntries(
      Array.from({ length: size }, (_, i) => ["k" + i, i]),
    );
    targets = Array.from({ length: size }, (_, i) => target("k" + i));
    mutate = (i) => { stores.story["k" + (i % size)]++; };
  } else {
    throw new Error("Unknown benchmark scenario: " + kind);
  }

  return { stores, targets, mutate };
}

function resolve(stores, watch) {
  let value = stores[watch.scope];
  for (const part of watch.path) {
    const key = part.key ?? part.index;
    if (value == null || !Object.hasOwn(value, key)) return { exists: false };
    value = value[key];
  }
  return { exists: true, value };
}

function applyFull(cache, updates) {
  for (const { target: watch, exists, value } of updates) {
    // Benchmarked targets are independent top-level properties.
    const key = watch.path[0].key;
    if (exists) cache[watch.scope][key] = value;
    else delete cache[watch.scope][key];
  }
  return cache;
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
    p95: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(3),
    mean: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(3),
  };
}

if (!isMainThread) {
  const { mode, scenario, size } = workerData;
  const { stores, mutate } = fixture(scenario, size);
  const service = new WatchService();
  const baselines = new Map();
  let revision = 0;

  parentPort.on("message", (message) => {
    if (message.type === "done") {
      parentPort.postMessage({ type: "final", stores });
      return;
    }

    // Simulated game mutation is excluded from measured inspector work.
    if (message.mutate) mutate(message.index);

    const started = performance.now();
    let result;
    if (mode === "patch") {
      result = service.poll({
        session: "bench", revision, targets: message.targets,
      }, stores);
      revision = result.revision;
    } else {
      const updates = [];
      for (const watch of minimizeWatchTargets(message.targets)) {
        const key = watchKey(watch);
        const now = resolve(stores, watch);
        if (mode === "always-full") {
          updates.push({
            target: watch, exists: now.exists,
            value: now.exists ? structuredClone(now.value) : undefined,
          });
        } else {
          const before = baselines.get(key);
          if (!before || before.exists !== now.exists ||
              (now.exists && !deepEqual(before.value, now.value))) {
            const next = now.exists
              ? { exists: true, value: structuredClone(now.value) }
              : { exists: false };
            baselines.set(key, next);
            updates.push({ target: watch, ...next });
          }
        }
      }
      result = { updates };
    }
    const mainMs = performance.now() - started;
    // postMessage performs a real asynchronous structured-clone transfer.
    parentPort.postMessage({ type: "poll", mainMs, result });
  });
  parentPort.postMessage({ ready: true });
} else {
  async function run(mode, scenario, size, changeEvery, rounds) {
    const worker = new Worker(__filename, {
      workerData: { mode, scenario, size },
    });
    let pending;
    const ready = new Promise((resolve, reject) => {
      worker.on("message", (message) => {
        if (message.ready) { resolve(); return; }
        if (pending) {
          const current = pending;
          pending = null;
          current.resolve(message);
        }
      });
      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0 && pending) pending.reject(new Error("Worker exit: " + code));
      });
    });
    await ready;

    const seed = fixture(scenario, size);
    const targets = seed.targets;
    let cache = structuredClone(seed.stores);
    const timings = {
      roundTrip: [], main: [], apply: [], overhead: [], bytes: [],
    };
    async function call(index, mutate, record) {
      const started = performance.now();
      const message = await new Promise((resolve, reject) => {
        if (pending) throw new Error("Overlapping watch requests");
        pending = { resolve, reject };
        worker.postMessage({ type: "poll", index, mutate, targets });
      });
      const beforeApply = performance.now();
      if (mode === "patch") {
        cache = applyWatchPatches(cache, message.result.patches);
      } else {
        cache = applyFull(cache, message.result.updates);
      }
      const finished = performance.now();

      if (record) {
        const applyMs = finished - beforeApply;
        const totalMs = finished - started;
        timings.roundTrip.push(totalMs);
        timings.main.push(message.mainMs);
        timings.apply.push(applyMs);
        timings.overhead.push(totalMs - message.mainMs - applyMs);
        // Measure wire size after latency measurement (doesn't distort timings).
        timings.bytes.push(serialize(message.result).byteLength);
      }
    }

    for (let i = 0; i < 25; i++) await call(i, false, false);
    for (let i = 0; i < rounds; i++) {
      await call(i + 1, changeEvery > 0 && (i + 1) % changeEvery === 0, true);
    }
    const final = await new Promise((resolve, reject) => {
      pending = { resolve, reject };
      worker.postMessage({ type: "done" });
    });
    if (final.type !== "final" || !isDeepStrictEqual(cache, final.stores)) {
      throw new Error("Inspector cache differs from MAIN: " + mode + "/" + scenario);
    }
    await worker.terminate();

    return {
      strategy: mode, scenario, size, mutationEvery: changeEvery, rounds,
      roundTripMs: stats(timings.roundTrip),
      mainMs: stats(timings.main),
      applyMs: stats(timings.apply),
      transportAndSchedulingMs: stats(timings.overhead),
      responseBytes: stats(timings.bytes),
      averageResponseBytes: Math.round(
        timings.bytes.reduce((sum, n) => sum + n, 0) / rounds,
      ),
      correct: true,
    };
  }

  async function main() {
    const scenarios = [
      ["flat", 1000, 0, 120],
      ["flat", 10000, 0, 70],
      ["flat", 10000, 1, 70],
      ["nested", 10000, 0, 90],
      ["nested", 10000, 1, 90],
      ["array", 10000, 1, 65],
      ["map", 3000, 1, 75],
      ["leaves", 100, 1, 90],
    ];
    const results = [];
    for (const [scenario, size, changeEvery, rounds] of scenarios) {
      for (const strategy of ["patch", "changed-full", "always-full"]) {
        results.push(await run(strategy, scenario, size, changeEvery, rounds));
      }
      console.log(scenario, size, changeEvery ? "changed" : "unchanged",
        results.slice(-3).map((r) =>
          r.strategy + ": " + r.roundTripMs.median + " ms"
        ).join(" | "));
    }
    console.log("All " + results.length + " cases passed cache-consistency checks.");
    if (process.argv[2]) {
      fs.writeFileSync(process.argv[2], JSON.stringify({
        node: process.version, platform: process.platform,
        transport: "async Node worker_threads postMessage/structured clone",
        warning: "Simulation, not actual Chromium extension RPC.",
        results,
      }, null, 2) + "\n");
    }
  }

  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
